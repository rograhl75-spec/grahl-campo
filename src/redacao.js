// ======================================================================
// Texto redigido pelo Claude, guardado no caso (registro "redacao"): permite aplicar as correções de uma
// auditoria sem redigir tudo de novo. O Claude devolve só as trocas (buscar → substituir) em JSON; o app as
// aplica no texto guardado, guarda a versão anterior (para desfazer) e monta o Word de novo.
// ======================================================================
import { db, createRecord, updateFields } from './db.js';
import { CONVENCOES_CLAUDE } from './docx/claudeDoc.js';

export async function ultimaRedacao(caseId) {
  const l = (await db.records.where('[caseId+kind]').equals([caseId, 'redacao']).toArray()).filter((r) => !r.deleted);
  return l.sort((a, b) => String(b.data.em || '').localeCompare(String(a.data.em || '')))[0] || null;
}

// guarda o texto (uma redação por caso; a anterior fica para desfazer)
export async function guardarRedacao(caseId, md, { origem = 'Claude', doc = '' } = {}) {
  const em = new Date().toISOString();
  const atual = await ultimaRedacao(caseId);
  if (atual) {
    if (atual.data.md === md) return atual.id;
    await updateFields(atual.id, { md, anterior: atual.data.md, em, origem, ...(doc ? { doc } : {}) });
    return atual.id;
  }
  const r = await createRecord('redacao', caseId, { md, em, origem, doc });
  return r.id;
}

export async function desfazerRedacao(caseId) {
  const atual = await ultimaRedacao(caseId);
  if (!atual || !atual.data.anterior) return false;
  await updateFields(atual.id, { md: atual.data.anterior, anterior: atual.data.md, em: new Date().toISOString(), origem: 'desfeito' });
  return true;
}

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
  const t = String(texto || '');
  const ini = t.indexOf('{'), fim = t.lastIndexOf('}');
  if (ini < 0 || fim < ini) throw new Error('A resposta do Claude não trouxe o JSON com as trocas.');
  const o = JSON.parse(t.slice(ini, fim + 1));
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
