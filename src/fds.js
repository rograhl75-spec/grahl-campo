// ======================================================================
// Produtos químicos do caso – ficha da FDS (Ficha com Dados de Segurança, ABNT NBR 14725)
//
// Cada produto é um registro do caso (kind "fds"): nome comercial, fabricante, revisão da FDS,
// de onde veio (fornecida pela empresa/contratante, pesquisada na internet, lida no rótulo de uma
// foto) e os dados das seções 2 (perigos), 3 (composição), 8 (controle de exposição) e 9
// (propriedades). Nos documentos, cada produto sai numa ficha própria (quadro "Item | Conteúdo").
// Os componentes da seção 3 ligam o produto ao banco de agentes químicos pelo CAS.
// ======================================================================

export const FONTES_FDS = ['Fornecida pela empresa', 'Fornecida pelo contratante / segurado', 'Pesquisada na internet', 'Rótulo do produto (foto)'];

export const CAMPOS_FDS = [
  ['nome', 'Produto (nome comercial)', 'text'],
  ['fabricante', 'Fabricante / fornecedor', 'text'],
  ['revisao', 'FDS – revisão / versão e data', 'text'],
  ['fonteFds', 'Origem da FDS', 'select', FONTES_FDS],
  ['url', 'Endereço da FDS (pesquisada)', 'text'],
  ['consultadoEm', 'Consultada em (AAAA-MM-DD)', 'text'],
  ['uso', 'Uso recomendado / uso no caso', 'text'],
  ['s2Classificacao', 'Seção 2 – classificação de perigo (GHS / NBR 14725)', 'area'],
  ['s2Advertencia', 'Seção 2 – palavra de advertência', 'text'],
  ['s2FrasesH', 'Seção 2 – frases de perigo (H)', 'area'],
  ['s2Outros', 'Seção 2 – outros perigos que não resultam em classificação', 'area'],
  ['s3Tipo', 'Seção 3 – substância ou mistura', 'select', ['Substância', 'Mistura']],
  ['s3Componentes', 'Seção 3 – componentes: um por linha "nome; CAS; concentração; classificação"', 'area'],
  ['s8Limites', 'Seção 8 – limites de exposição citados (NR-15, ACGIH, fabricante…)', 'area'],
  ['s8Engenharia', 'Seção 8 – controles de engenharia', 'area'],
  ['s8Epi', 'Seção 8 – EPI recomendado (respiratória, mãos, olhos, pele)', 'area'],
  ['s9Estado', 'Seção 9 – estado físico, cor e odor', 'text'],
  ['s9Ph', 'Seção 9 – pH', 'text'],
  ['s9Ebulicao', 'Seção 9 – ponto de ebulição / faixa', 'text'],
  ['s9Fulgor', 'Seção 9 – ponto de fulgor', 'text'],
  ['s9PressaoVapor', 'Seção 9 – pressão de vapor', 'text'],
  ['s9Densidade', 'Seção 9 – densidade relativa', 'text'],
  ['s9Solubilidade', 'Seção 9 – solubilidade em água', 'text'],
  ['s9Outros', 'Seção 9 – outros dados (viscosidade, LIE/LSE, autoignição…)', 'area'],
  ['observacoes', 'Observações (versão da época, equivalência com o produto usado…)', 'area'],
  ['situacao', 'Situação', 'select', ['A conferir', 'Conferido']],
];

const s = (x) => (x === undefined || x === null ? '' : String(x).trim());
const semAc = (t) => s(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const chaveProduto = (d = {}) => semAc(d.nome).replace(/[^a-z0-9]+/g, ' ').trim();

// componentes da seção 3: texto "nome; CAS; %; classificação" por linha → objetos (e o inverso)
export function componentesDoTexto(t) {
  return s(t).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [nome = '', cas = '', concentracao = '', ...cl] = l.split(';').map((x) => x.trim());
    return { nome, cas, concentracao, classificacao: cl.join('; ') };
  }).filter((c) => c.nome || c.cas);
}
export function textoDosComponentes(lista = []) {
  return lista.map((c) => [s(c.nome), s(c.cas), s(c.concentracao), s(c.classificacao)].join('; ').replace(/(;\s*)+$/, '')).filter(Boolean).join('\n');
}

const juntar = (v) => (Array.isArray(v) ? v.map(s).filter(Boolean).join('\n') : s(v));

// produto do JSON do Claude (formato da instrução) → dados planos do registro
export function produtoParaDados(p = {}) {
  const s2 = p.secao2 || {}, s3 = p.secao3 || {}, s8 = p.secao8 || {}, s9 = p.secao9 || {};
  const fonte = s(p.fonte || p.fonteFds);
  const d = {
    nome: s(p.nome), fabricante: s(p.fabricante), revisao: s(p.revisao),
    fonteFds: FONTES_FDS.find((f) => semAc(f).split(' ').slice(0, 2).join(' ') === semAc(fonte).split(' ').slice(0, 2).join(' '))
      || (/rotulo|foto/.test(semAc(fonte)) ? FONTES_FDS[3] : /pesquis|internet|site|url/.test(semAc(fonte)) ? FONTES_FDS[2] : /contratante|segurado|autor/.test(semAc(fonte)) ? FONTES_FDS[1] : /empresa|reclamada|empregador/.test(semAc(fonte)) ? FONTES_FDS[0] : ''),
    url: s(p.url), consultadoEm: s(p.consultadoEm), uso: s(p.uso),
    s2Classificacao: juntar(s2.classificacao), s2Advertencia: s(s2.advertencia), s2FrasesH: juntar(s2.frasesH), s2Outros: juntar(s2.outrosPerigos),
    s3Tipo: /mist/i.test(s(s3.tipo)) ? 'Mistura' : /subst/i.test(s(s3.tipo)) ? 'Substância' : '',
    s3Componentes: Array.isArray(s3.componentes) ? textoDosComponentes(s3.componentes.filter((c) => c && typeof c === 'object')) : juntar(s3.componentes),
    s8Limites: juntar(s8.limites), s8Engenharia: juntar(s8.controleEngenharia), s8Epi: juntar(s8.epi),
    s9Estado: s(s9.estado), s9Ph: s(s9.ph), s9Ebulicao: s(s9.pontoEbulicao), s9Fulgor: s(s9.pontoFulgor), s9PressaoVapor: s(s9.pressaoVapor),
    s9Densidade: s(s9.densidade), s9Solubilidade: s(s9.solubilidade), s9Outros: juntar(s9.outros),
    observacoes: s(p.observacoes),
  };
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== ''));
}

// lista de produtos de um JSON colado ({"produtos": [...]}, uma lista ou um produto)
export function lerJsonFds(texto) {
  let t = s(texto);
  const bloco = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (bloco) t = bloco[1];
  const i = t.search(/[[{]/), f = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (i < 0 || f < i) throw new Error('Não encontrei um JSON no texto colado.');
  const obj = JSON.parse(t.slice(i, f + 1));
  const lista = Array.isArray(obj) ? obj : Array.isArray(obj.produtos) ? obj.produtos : [obj];
  return lista.filter((p) => p && typeof p === 'object').map(produtoParaDados).filter((d) => d.nome);
}

// grava no caso sem duplicar (mesmo nome comercial): o que vier completa o vazio, ou corrige com "substituir"
export async function aplicarFds(caseId, produtos = [], { substituir = false } = {}) {
  const { createRecord, updateFields, caseChildren } = await import('./db.js');
  const existentes = await caseChildren(caseId, 'fds');
  const mapa = new Map(existentes.map((r) => [chaveProduto(r.data), r]));
  let ordem = existentes.reduce((m, r) => Math.max(m, r.data.ordem || 0), 0);
  const cont = { novos: 0, completados: 0 };
  for (const p of produtos) {
    const k = chaveProduto(p);
    if (!k) continue;
    const ja = mapa.get(k);
    if (ja) {
      const novos = Object.fromEntries(Object.entries(p).filter(([c, val]) => c !== 'nome' && c !== 'situacao' && s(val)
        && (substituir ? s(val) !== s(ja.data[c]) : !s(ja.data[c]))));
      if (Object.keys(novos).length) { await updateFields(ja.id, novos); cont.completados += 1; }
      continue;
    }
    ordem += 1;
    const rec = await createRecord('fds', caseId, { ...p, situacao: 'A conferir', ordem });
    mapa.set(k, rec);
    cont.novos += 1;
  }
  return cont;
}

// ---------------- ficha do produto nos documentos ----------------
const linha = (rotulo, ...partes) => {
  const t = partes.map(s).filter(Boolean).join('\n');
  return t ? [rotulo, t] : null;
};

// linhas "Item | Conteúdo" da ficha (sem os itens vazios)
export function linhasFichaFds(d = {}) {
  const comps = componentesDoTexto(d.s3Componentes);
  const origem = [d.fonteFds, d.url, d.consultadoEm && `consultada em ${d.consultadoEm.split('-').reverse().join('/')}`].filter(Boolean).join(' – ');
  const fisico = [
    d.s9Estado && `Aspecto: ${d.s9Estado}`, d.s9Ph && `pH: ${d.s9Ph}`, d.s9Ebulicao && `Ponto de ebulição: ${d.s9Ebulicao}`,
    d.s9Fulgor && `Ponto de fulgor: ${d.s9Fulgor}`, d.s9PressaoVapor && `Pressão de vapor: ${d.s9PressaoVapor}`,
    d.s9Densidade && `Densidade relativa: ${d.s9Densidade}`, d.s9Solubilidade && `Solubilidade em água: ${d.s9Solubilidade}`, d.s9Outros,
  ];
  return [
    linha('Produto', d.nome, d.fabricante && `Fabricante: ${d.fabricante}`, d.uso && `Uso: ${d.uso}`),
    linha('FDS', d.revisao && `Revisão: ${d.revisao}`, origem && `Origem: ${origem}`),
    linha('Seção 2 – Identificação de perigos', d.s2Classificacao, d.s2Advertencia && `Palavra de advertência: ${d.s2Advertencia}`, d.s2FrasesH, d.s2Outros && `Outros perigos: ${d.s2Outros}`),
    linha(`Seção 3 – Composição${d.s3Tipo ? ` (${d.s3Tipo.toLowerCase()})` : ''}`, comps.length
      ? comps.map((c) => [c.nome, c.cas && `CAS ${c.cas}`, c.concentracao, c.classificacao].filter(Boolean).join(' – ')).join('\n') : ''),
    linha('Seção 8 – Controle de exposição e proteção individual', d.s8Limites && `Limites: ${d.s8Limites}`, d.s8Engenharia && `Engenharia: ${d.s8Engenharia}`, d.s8Epi && `EPI: ${d.s8Epi}`),
    linha('Seção 9 – Propriedades físicas e químicas', ...fisico),
    linha('Observações', d.observacoes),
  ].filter(Boolean);
}

export const FONTE_FICHA_FDS = (d = {}) => `Elaborado pelo signatário com base na FDS do produto (ABNT NBR 14725 – seções 2, 3, 8 e 9)${d.fabricante ? `, ${d.fabricante}` : ''}${d.revisao ? `, ${d.revisao}` : ''}${d.fonteFds === 'Pesquisada na internet' ? ' – FDS obtida na internet: versão vigente na consulta, que pode diferir da utilizada no período avaliado' : ''}.`;

// ---------------- instrução ao Claude ----------------
export const FORMATO_PRODUTO = `{"nome": "nome comercial", "fabricante": "", "revisao": "revisão/versão e data da FDS", "fonte": "Fornecida pela empresa | Fornecida pelo contratante / segurado | Pesquisada na internet | Rótulo do produto (foto)", "url": "endereço da FDS, se pesquisada", "consultadoEm": "AAAA-MM-DD", "uso": "uso do produto no caso",
 "secao2": {"classificacao": "classes e categorias de perigo, uma por linha", "advertencia": "Perigo | Atenção | nenhuma", "frasesH": "H… – texto, uma por linha", "outrosPerigos": ""},
 "secao3": {"tipo": "Substância | Mistura", "componentes": [{"nome": "", "cas": "", "concentracao": "faixa em %", "classificacao": ""}]},
 "secao8": {"limites": "limites citados na FDS, com a fonte (NR-15, ACGIH, fabricante)", "controleEngenharia": "", "epi": "respiratória, mãos, olhos e pele"},
 "secao9": {"estado": "estado físico, cor e odor", "ph": "", "pontoEbulicao": "", "pontoFulgor": "", "pressaoVapor": "", "densidade": "", "solubilidade": "", "outros": ""},
 "observacoes": "divergências, versão da época, equivalência com o produto usado"}`;

export const REGRAS_FDS = `PRODUTOS QUÍMICOS – FICHA DA FDS (uma ficha por produto)
- Identifique cada produto químico citado nos documentos, nas anotações ou nos rótulos das fotos (nome comercial e fabricante).
- Use a FDS (FISPQ) anexada; se não houver, PESQUISE a FDS do fabricante na internet (site do fabricante ou distribuidor) e informe "url", a revisão e a data da consulta. Não preencha nada de memória: o que não estiver na FDS fica "".
- Traga somente: seção 2 (classificação, palavra de advertência, frases H), seção 3 (componentes com CAS e faixa de concentração), seção 8 (limites citados, controles de engenharia e EPI) e seção 9 (estado, pH, ponto de ebulição, ponto de fulgor, pressão de vapor, densidade e solubilidade). Valores com a unidade.
- Produto sem FDS encontrada: preencha nome e fabricante, deixe o resto vazio e explique em "observacoes".
- FDS de revisão posterior ao período avaliado: registre em "observacoes" que a formulação da época pode ser outra.`;

export function promptFds(nomes = []) {
  return `Preciso da ficha da FDS dos produtos químicos abaixo para um laudo técnico (engenharia de segurança do trabalho).

${REGRAS_FDS}

Responda SOMENTE com um bloco JSON:
{"produtos": [${FORMATO_PRODUTO}]}

Produtos:
${nomes.map((n) => `- ${n}`).join('\n')}`;
}
