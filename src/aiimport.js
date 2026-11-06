import { db, createRecord, updateFields, caseChildren } from './db.js';
import { ORIGEM_QUESITO } from './schema.js';

export const PROMPT_IA = `Você vai ler os autos anexados (petição inicial, contestação, despachos, laudos, PPP, LTCAT, fichas de EPI, petições de quesitos) e extrair os dados para o meu pré-relatório pericial.

REGRAS
1. Fidelidade aos autos: extraia apenas o que está nos documentos. Não invente, não deduza, não presuma. Se algo não estiver nos autos, deixe o campo vazio ("").
2. Foco técnico: ignore discussões puramente trabalhistas (verbas, horas extras comuns). Foque em riscos ocupacionais: agentes alegados, atividades descritas e como a defesa rebate.
3. EPIs: busque fichas/recibos de entrega e liste cada item (descrição, CA, data de entrega, observações sobre periodicidade, assinatura e validade do CA).
4. Quesitos: TRANSCREVA TODOS NA ÍNTEGRA, palavra por palavra, sem resumir. Um item por quesito, indicando a origem (Juízo, Autor / Reclamante, Réu / Reclamada, INSS ou Complementares) e o número.
5. Documentos técnicos (PPP, LTCAT, PGR, laudos): para cada um, indique identificação (ID/folhas/data) e o que consta de relevante (agentes, intensidades, EPI eficaz, responsável técnico, períodos).
6. Datas no formato AAAA-MM-DD. Não inclua nomes de advogados.
7. Responda SOMENTE com um bloco JSON válido, no formato abaixo, sem texto antes ou depois.

{
  "processo": {"numero": "", "juizo": "", "comarca": "", "justica": "", "materia": "", "dataAjuizamento": "", "valorCausa": "", "rito": ""},
  "partes": {"autorNome": "", "autorCpf": "", "autorNascimento": "", "reuNome": "", "reuCnpj": ""},
  "sintese": {
    "funcoes": "cargos, funções, admissão, demissão, períodos alegados",
    "atividadesAlegadas": "", "agentesAlegados": "", "pedidos": "",
    "defesa": "", "preliminares": "", "analiseEpi": ""
  },
  "periodos": [{"empresa": "", "cnpj": "", "inicio": "", "fim": "", "cargo": "", "setor": "", "atividades": "", "agentes": "", "fonte": ""}],
  "documentos": [{"tipo": "PPP | LTCAT | PGR / PPRA | Laudo pericial | Ficha de EPI | Outro", "identificacao": "", "analise": ""}],
  "epis": [{"descricao": "", "ca": "", "dataEntrega": "", "obs": ""}],
  "quesitos": [{"origem": "Juízo", "numero": "1", "texto": ""}]
}`;

const CAMPOS_CASO = {
  processo: ['numero', 'juizo', 'comarca', 'dataAjuizamento', 'valorCausa', 'rito'],
  partes: ['autorNome', 'autorCpf', 'autorNascimento', 'reuNome', 'reuCnpj'],
  sintese: ['funcoes', 'atividadesAlegadas', 'agentesAlegados', 'pedidos', 'defesa', 'preliminares', 'analiseEpi'],
};

export function lerJsonIA(texto) {
  let t = String(texto || '').trim();
  const bloco = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (bloco) t = bloco[1];
  const ini = t.indexOf('{'), fim = t.lastIndexOf('}');
  if (ini < 0 || fim < ini) throw new Error('Não encontrei um JSON no texto colado.');
  const obj = JSON.parse(t.slice(ini, fim + 1));
  const s = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const lista = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
  const caso = {};
  for (const [grupo, ks] of Object.entries(CAMPOS_CASO)) for (const k of ks) {
    const v = s((obj[grupo] || {})[k]);
    if (v) caso[k] = v;
  }
  const origem = (o) => ORIGEM_QUESITO.find((x) => x.toLowerCase().startsWith(s(o).toLowerCase().slice(0, 4))) || 'Outro';
  return {
    caso,
    periodos: lista(obj.periodos).map((x) => ({ empresa: s(x.empresa), cnpj: s(x.cnpj), inicio: s(x.inicio), fim: s(x.fim), cargo: s(x.cargo), setor: s(x.setor), atividades: s(x.atividades), agentes: s(x.agentes), fonte: s(x.fonte) })),
    documentos: lista(obj.documentos).map((x) => ({ tipo: s(x.tipo), identificacao: s(x.identificacao), analise: s(x.analise) })),
    epis: lista(obj.epis).map((x) => ({ descricao: s(x.descricao), ca: s(x.ca), dataEntrega: s(x.dataEntrega), obs: s(x.obs) })),
    quesitos: lista(obj.quesitos).map((x) => ({ origem: origem(x.origem), numero: s(x.numero), texto: s(x.texto) })).filter((q) => q.texto),
  };
}

// Campos preenchidos não são sobrescritos (a menos que "substituir" esteja marcado).
export async function aplicarIA(caseId, dados, { substituir = false } = {}) {
  const caso = await db.records.get(caseId);
  const mudancas = {};
  for (const [k, v] of Object.entries(dados.caso)) {
    if (substituir || !String(caso.data[k] || '').trim()) mudancas[k] = v;
  }
  if (Object.keys(mudancas).length) await updateFields(caseId, mudancas);
  const cont = { campos: Object.keys(mudancas).length, periodos: 0, documentos: 0, epis: 0, quesitos: 0 };
  const kinds = { periodos: 'periodo', documentos: 'documento', epis: 'epi', quesitos: 'quesito' };
  for (const [lista, kind] of Object.entries(kinds)) {
    const existentes = await caseChildren(caseId, kind);
    const chave = (d) => JSON.stringify(Object.values(d).map((v) => String(v).toLowerCase().replace(/\s+/g, ' ').trim()));
    const vistos = new Set(existentes.map((r) => chave(Object.fromEntries(Object.keys(dados[lista][0] || {}).map((k) => [k, r.data[k] ?? ''])))));
    let ordem = existentes.length;
    for (const item of dados[lista]) {
      if (vistos.has(chave(item))) continue;
      vistos.add(chave(item));
      ordem += 1;
      await createRecord(kind, caseId, { ...item, ordem });
      cont[lista] += 1;
    }
  }
  return cont;
}
