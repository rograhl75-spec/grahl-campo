// ======================================================================
// Texto redigido pelo Claude, guardado no caso (registro "redacao"): permite aplicar as correções de uma
// auditoria sem redigir tudo de novo. O Claude devolve só as trocas (buscar → substituir) em JSON; o app as
// aplica no texto guardado, guarda a versão anterior (para desfazer) e monta o Word de novo.
// ======================================================================
import { db, createRecord, updateFields } from './db.js';
import { CONVENCOES_CLAUDE } from './docx/claudeDoc.js';
import { extrairJson } from './basesUsuario.js';

const MAX_VERSOES = 30;

// Um texto guardado por documento (doc = id do cartão do documento, "peticao:<assunto>"…). Sem "doc", o mais
// recente de qualquer documento. Registros antigos sem "doc" valem para o documento pedido, se não houver o dele.
export async function redacoesDoCaso(caseId) {
  const l = (await db.records.where('[caseId+kind]').equals([caseId, 'redacao']).toArray()).filter((r) => !r.deleted);
  return l.sort((a, b) => String(b.data.em || '').localeCompare(String(a.data.em || '')));
}
export async function ultimaRedacao(caseId, doc) {
  const l = await redacoesDoCaso(caseId);
  if (doc === undefined) return l[0] || null;
  return l.find((r) => (r.data.doc || '') === doc) || (doc ? l.find((r) => !r.data.doc) : null) || null;
}

// guarda o texto; a versão anterior vai para o histórico (até 30), para voltar a qualquer uma
export async function guardarRedacao(caseId, md, { origem = 'Claude', doc = '', titulo = '' } = {}) {
  const em = new Date().toISOString();
  const atual = await ultimaRedacao(caseId, doc);
  if (atual) {
    if (atual.data.md === md) return atual.id;
    const versoes = [{ md: atual.data.md, em: atual.data.em, origem: atual.data.origem }, ...(atual.data.versoes || [])].slice(0, MAX_VERSOES);
    await updateFields(atual.id, { md, anterior: atual.data.md, em, origem, versoes, auditoria: null, ...(doc ? { doc } : {}), ...(titulo ? { titulo } : {}) });
    return atual.id;
  }
  const r = await createRecord('redacao', caseId, { md, em, origem, doc, titulo, versoes: [] });
  return r.id;
}

// Arquivo final de um documento, corrigido fora do app (à mão ou numa conversa com o Claude): o próprio .docx fica
// guardado no caso (anexo sincronizado como os demais arquivos), com a formatação, os anexos e as fotos.
// - "Importar o Word corrigido": o texto lido dele também vira nova versão da redação ("textoEm" marca essa versão,
//   para avisar quando o texto mudar depois);
// - "Guardar só o arquivo final": nada muda no texto (ex.: PPP em documento separado, que o app gera dos dados).
export const DESC_WORD_FINAL = 'wordFinal';
export async function guardarWordFinal(caseId, file, { doc = '', rotulo = '', comTexto = true } = {}) {
  const { guardarAnexo } = await import('./paradigmas.js');
  const mime = file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const arq = file.type ? file : new File([file], file.name, { type: mime });
  const id = await guardarAnexo(arq, DESC_WORD_FINAL, caseId);
  const red = comTexto ? await ultimaRedacao(caseId, doc) : null;
  await updateFields(id, { doc, rotulo, em: new Date().toISOString(), textoEm: red ? red.data.em : '' });
  return id;
}
export async function wordsFinais(caseId, doc = '') {
  return (await db.records.where('[caseId+kind]').equals([caseId, 'anexo']).toArray())
    .filter((r) => !r.deleted && r.data.descricao === DESC_WORD_FINAL && (r.data.doc || '') === doc)
    .sort((x, y) => String(y.data.em || '').localeCompare(String(x.data.em || '')));
}
// o Word final com texto ainda corresponde ao texto atual? (o texto mudou depois → gere de novo ou importe outro)
export function wordFinalDesatualizado(w, red) {
  return !!(w?.data.textoEm && red && String(red.data.em || '') > String(w.data.textoEm));
}

// volta à versão "i" do histórico (0 = a anterior); a atual entra no histórico, então dá para refazer
export async function restaurarVersao(caseId, doc, i = 0) {
  const atual = await ultimaRedacao(caseId, doc);
  const v = atual?.data.versoes?.[i];
  if (!v) return false;
  const resto = atual.data.versoes.filter((_, k) => k !== i);
  const versoes = [{ md: atual.data.md, em: atual.data.em, origem: atual.data.origem }, ...resto].slice(0, MAX_VERSOES);
  await updateFields(atual.id, { md: v.md, anterior: atual.data.md, em: new Date().toISOString(), origem: `restaurada a versão de ${new Date(v.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`, versoes, auditoria: null });
  return true;
}
export async function desfazerRedacao(caseId, doc) {
  const atual = await ultimaRedacao(caseId, doc);
  if (!atual) return false;
  if (atual.data.versoes?.length) return restaurarVersao(caseId, doc ?? (atual.data.doc || ''), 0);
  if (!atual.data.anterior) return false;
  await updateFields(atual.id, { md: atual.data.anterior, anterior: atual.data.md, em: new Date().toISOString(), origem: 'desfeito' });
  return true;
}

// auditoria guardada com o texto (sobrevive a recarregar a página; some quando o texto muda)
export async function guardarAuditoria(redId, itens) { await updateFields(redId, { auditoria: { em: new Date().toISOString(), itens } }); }

export function lerAuditoria(texto) {
  const o = extrairJson(texto);
  const itens = (Array.isArray(o.itens) ? o.itens : []).filter((x) => x && (x.problema || x.buscar)).map((x, k) => ({
    n: k + 1, onde: String(x.onde || ''), problema: String(x.problema || ''), gravidade: /alta/i.test(x.gravidade) ? 'alta' : /baixa/i.test(x.gravidade) ? 'baixa' : 'média',
    buscar: String(x.buscar || ''), substituir: String(x.substituir ?? ''), pergunta: String(x.pergunta || ''),
  }));
  return itens;
}

export const slugDoc = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

// Instrução: o Claude devolve só as trocas, não o texto inteiro (barato e sem mexer no resto do laudo)
export function promptAplicarCorrecoes(md, correcoes, textoCaso = '') {
  return `Sou o perito. Abaixo está o texto do meu documento (Markdown, nas convenções do app) e a lista de correções a aplicar.

TAREFA: aplique SOMENTE as correções da lista. Não reescreva, não melhore e não altere nenhum outro trecho.

RESPOSTA: apenas um JSON, sem comentários:
{"trocas": [{"buscar": "trecho EXATO do texto atual", "substituir": "trecho novo"}], "naoAplicadas": ["correção que não foi possível aplicar e por quê"]}

REGRAS DAS TROCAS
- "buscar" é copiado letra por letra do texto atual (inclusive pontuação, ** e |), curto mas único no texto: o app procura exatamente esse trecho. Se o mesmo trecho aparece em vários lugares e todos devem mudar, faça uma troca para cada ocorrência com contexto que a torne única.
- Para apagar um bloco (parágrafo, quadro inteiro com a linha "Quadro:" e a "Fonte:"), "buscar" é o bloco inteiro e "substituir" é "".
- Para acrescentar uma linha a um quadro, "buscar" é a linha anterior inteira e "substituir" é essa linha + quebra de linha + a linha nova.
- Mantenha as convenções do texto: títulos com #, quadros com "Quadro:", fórmulas entre $, [[pendência]] para o dado que eu ainda preciso completar.
- As trocas são aplicadas na ordem; uma troca não pode depender do resultado de outra.
- Se a correção pede um dado que está nos dados do caso abaixo, use-o; se não está, deixe-o como [[pendência]].

${CONVENCOES_CLAUDE}

---
CORREÇÕES A APLICAR
${correcoes}

---
TEXTO ATUAL DO DOCUMENTO
${md}
${textoCaso ? `\n---\nDADOS DO CASO (para completar o que a correção pedir)\n${textoCaso}` : ''}`;
}

export function lerTrocas(texto) {
  const o = extrairJson(texto);
  return { trocas: Array.isArray(o.trocas) ? o.trocas.filter((x) => x && typeof x.buscar === 'string') : [], naoAplicadas: Array.isArray(o.naoAplicadas) ? o.naoAplicadas : [] };
}

// aplica as trocas na ordem; trecho não encontrado (ou ambíguo) não é trocado e volta na lista de falhas
export function aplicarTrocas(md, trocas) {
  let s = String(md || '');
  const feitas = [], falhas = [];
  const norm = (x) => String(x).replace(/\r\n?/g, '\n');
  s = norm(s);
  for (const t of trocas) {
    const b = norm(t.buscar); const n = norm(t.substituir ?? '');
    if (!b) { falhas.push({ ...t, motivo: 'trecho vazio' }); continue; }
    let i = s.indexOf(b);
    // tolera diferença só de espaços nas pontas das linhas
    if (i < 0) {
      const re = new RegExp(b.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
      const m = s.match(re);
      if (m) { s = s.slice(0, m.index) + n + s.slice(m.index + m[0].length); feitas.push(t); continue; }
      falhas.push({ ...t, motivo: 'trecho não encontrado' }); continue;
    }
    if (s.indexOf(b, i + 1) >= 0) { falhas.push({ ...t, motivo: 'trecho aparece mais de uma vez' }); continue; }
    s = s.slice(0, i) + n + s.slice(i + b.length);
    feitas.push(t);
  }
  return { md: s.replace(/\n{3,}/g, '\n\n'), feitas, falhas };
}
