// ======================================================================
// Banco de agentes químicos
//
// Cada agente é um registro global (kind "quimico", sem caso), sincronizado
// como os paradigmas. A base inicial (public/bases/quimicos-base.json) vem de
// fontes abertas (PubChem, NIOSH Pocket Guide, NR-15 Anexo 11, LINACH, IARC)
// e entra com situação "A conferir". Valores da ACGIH só entram digitados por
// você, com a edição do livreto (protegidos por direito autoral).
//
// O relógio da base é a data do arquivo em segundos: uma base corrigida
// atualiza os campos vindos da base anterior, mas nunca passa por cima do que
// foi editado no app (mesma regra da base de paradigmas).
// ======================================================================
import { num as numCalc } from './calc.js';
import { slug, registro, gravarImportado, tsDaBase } from './paradigmas.js';

export const GRUPOS_QUIMICOS = [
  'Óleos e graxas', 'Defensivos agrícolas', 'Tintas e solventes', 'Fumos de soldagem', 'Combustíveis',
  'Odontológicos', 'Espuma de poliuretano', 'Mecânica de veículos e máquinas', 'Outros',
];

const SN = ['Sim', 'Não'];
export const CAMPOS_QUIMICO = {
  'Identificação': [
    ['nome', 'Nome', 'text'], ['sinonimos', 'Sinônimos e nomes comerciais (separados por ";")', 'text'],
    ['cas', 'Nº CAS', 'text'], ['tipo', 'Tipo', 'select', ['substância', 'mistura', 'grupo/fumos']],
    ['grupos', 'Grupos de uso (separados por ";")', 'text'], ['formula', 'Fórmula', 'text'], ['massaMolar', 'Massa molar (g/mol)', 'text'],
  ],
  'Propriedades físico-químicas': [
    ['estado', 'Estado físico / aspecto', 'text'], ['pontoEbulicao', 'Ponto de ebulição', 'text'], ['pontoFusao', 'Ponto de fusão', 'text'],
    ['pressaoVapor', 'Pressão de vapor', 'text'], ['densidadeRelativa', 'Densidade relativa', 'text'], ['densidadeVapor', 'Densidade de vapor', 'text'],
    ['solubilidadeAgua', 'Solubilidade em água', 'text'], ['pontoFulgor', 'Ponto de fulgor', 'text'], ['lie', 'LIE (limite inferior de explosividade)', 'text'],
    ['lse', 'LSE (limite superior de explosividade)', 'text'], ['autoignicao', 'Temperatura de autoignição', 'text'], ['limiarOdor', 'Limiar de odor', 'text'],
  ],
  'Legislação brasileira': [
    ['nr15Ppm', 'NR-15, Anexo 11 – LT (ppm)', 'text'], ['nr15Mgm3', 'NR-15, Anexo 11 – LT (mg/m³)', 'text'],
    ['nr15Grau', 'NR-15, Anexo 11 – grau de insalubridade', 'select', ['mínimo', 'médio', 'máximo']],
    ['nr15Pele', 'Absorção também pela pele', 'select', SN], ['nr15Teto', 'Valor teto', 'select', SN],
    ['nr15Obs', 'NR-15 – observação (Anexo 12, 13 ou 13-A; atividade e grau)', 'area'],
    ['linach', 'LINACH (Portaria Interministerial nº 9/2014)', 'select', ['Grupo 1', 'Grupo 2A', 'Grupo 2B']],
    ['codDecretos', 'Códigos nos decretos previdenciários (53.831/64, 83.080/79, 2.172/97, 3.048/99)', 'area'],
    ['nr7', 'NR-7 – indicador biológico (Anexo I, Quadro 1 – IBE/EE, ou Quadro 2 – IBE/SC)', 'area'],
  ],
  'Referências internacionais': [
    ['acgihTwa', 'ACGIH – TLV-TWA', 'text'], ['acgihStel', 'ACGIH – TLV-STEL / C', 'text'], ['acgihNotacoes', 'ACGIH – notações (Skin, DSEN, A1…)', 'text'],
    ['acgihBase', 'ACGIH – base do TLV (efeitos críticos)', 'text'], ['acgihBei', 'ACGIH – BEI', 'area'], ['acgihEdicao', 'ACGIH – edição do livreto', 'text'],
    ['rel', 'NIOSH – REL', 'area'], ['idlh', 'NIOSH – IDLH', 'text'], ['oshaPel', 'OSHA – PEL', 'text'], ['iarc', 'IARC – grupo', 'text'],
  ],
  'Toxicologia': [
    ['vias', 'Vias de absorção', 'text'], ['orgaosAlvo', 'Órgãos-alvo', 'area'], ['sintomas', 'Efeitos e sintomas', 'area'],
  ],
  'Avaliação e proteção': [
    ['metodos', 'Métodos de amostragem e análise', 'area'], ['protecao', 'Proteção (respirador, filtro, luva)', 'area'],
  ],
  'Fontes e conferência': [
    ['fontes', 'Fontes (uma por linha)', 'area'], ['nioshUrl', 'Página do NIOSH Pocket Guide', 'text'],
    ['situacao', 'Situação', 'select', ['A conferir', 'Conferido']], ['observacoes', 'Observações', 'area'],
  ],
};

const s = (x) => (x === undefined || x === null ? '' : String(x).trim());
// número de um texto com unidade ("78 ppm", "92,14") – vazio = NaN
export const num = (v) => (typeof v === 'number' ? v : numCalc(String(v ?? '').replace(/[^\d.,-]/g, '')));

// Agente do arquivo-base → dados planos do registro
export function agenteParaDados(a) {
  const f = a.fisico || {}, n = a.niosh || {}, nr = a.nr15 || {}, a11 = nr.anexo11 || null, ac = a.acgih || {};
  const d = {
    nome: s(a.nome), sinonimos: (a.sinonimos || []).map(s).filter(Boolean).join('; '), cas: s(a.cas), tipo: s(a.tipo),
    grupos: (a.grupos || []).map(s).filter(Boolean).join('; '), formula: s(a.formula), massaMolar: s(a.massaMolar),
    estado: s(f.estado), pontoEbulicao: s(f.pontoEbulicao), pontoFusao: s(f.pontoFusao), pressaoVapor: s(f.pressaoVapor),
    densidadeRelativa: s(f.densidadeRelativa), densidadeVapor: s(f.densidadeVapor), solubilidadeAgua: s(f.solubilidadeAgua),
    pontoFulgor: s(f.pontoFulgor), lie: s(f.lie), lse: s(f.lse), autoignicao: s(f.autoignicao), limiarOdor: s(f.limiarOdor),
    rel: s(n.rel), idlh: s(n.idlh), oshaPel: s(n.oshaPel), vias: s(n.vias), orgaosAlvo: s(n.orgaosAlvo), sintomas: s(n.sintomas),
    metodos: s(n.metodos), nioshUrl: s(n.url),
    nr15Obs: s(nr.observacao), linach: s(a.linach), iarc: s(a.iarc), codDecretos: s(a.codDecretos), observacoes: s(a.observacoes),
    acgihTwa: s(ac.twa), acgihStel: s(ac.stel), acgihNotacoes: s(ac.notacoes), acgihBase: s(ac.baseTlv), acgihBei: s(ac.bei),
    acgihEdicao: s(ac.edicao) || (Object.values(ac).some((x) => s(x)) ? s(a.acgihEdicao) : ''),
    fontes: (a.fontes || []).map((x) => [s(x.referencia), s(x.campos) && `(${s(x.campos)})`, s(x.url), s(x.consultadoEm) && `consultado em ${s(x.consultadoEm)}`].filter(Boolean).join(' – ')).join('\n'),
    situacao: s(a.situacao) || 'A conferir',
  };
  if (a11) Object.assign(d, { nr15Ppm: s(a11.ppm), nr15Mgm3: s(a11.mgm3), nr15Grau: s(a11.grau), nr15Pele: a11.pele ? 'Sim' : 'Não', nr15Teto: a11.teto ? 'Sim' : 'Não' });
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== ''));
}

export const idDoAgente = (a) => `qui-${slug(a.id || a.cas || a.nome)}`;

// Importa a base (idempotente). versao = data do arquivo (AAAA-MM-DD) → relógio em segundos.
export async function importarBaseQuimicos(obj) {
  if (!obj || !Array.isArray(obj.agentes)) throw new Error('Arquivo sem a lista "agentes".');
  const versao = tsDaBase(Date.parse(obj.versao || '') || Date.now());
  let n = 0;
  const falhas = [];
  for (const a of obj.agentes) {
    const d = agenteParaDados(a);
    if (!d.nome) continue;
    try { if (await gravarImportado(registro(idDoAgente(a), 'quimico', d, versao))) n += 1; } catch (e) { falhas.push(`${d.nome}: ${e.message || e}`); }
  }
  return { gravados: n, lidos: obj.agentes.length, falhas };
}

export async function carregarBaseQuimicos() {
  const r = await fetch(`${import.meta.env.BASE_URL}bases/quimicos-base.json`, { cache: 'no-cache' });
  if (!r.ok) throw new Error('Base de químicos não encontrada.');
  return r.json();
}

// Agentes colados (JSON do Claude ou arquivo de valores da ACGIH): mesmo formato do arquivo-base.
// Se o agente já existe no banco (mesmo id, CAS ou nome), atualiza só os campos que vieram,
// acrescenta as fontes às já registradas e mantém o nome e a situação da ficha.
export async function importarAgentesColados(texto, existentes = null) {
  let t = String(texto || '').trim();
  const bloco = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (bloco) t = bloco[1];
  const i = t.indexOf('{'), f = t.lastIndexOf('}');
  if (i < 0 || f < i) throw new Error('Não encontrei um JSON no texto colado.');
  const obj = JSON.parse(t.slice(i, f + 1));
  const lista = Array.isArray(obj.agentes) ? obj.agentes : [obj];
  const { db } = await import('./db.js');
  const banco = existentes || (await db.records.where('kind').equals('quimico').toArray()).filter((r) => !r.deleted);
  let n = 0;
  for (const a of lista) {
    const d = agenteParaDados({ ...a, situacao: '' });
    const ja = (a.id && banco.find((r) => r.id === idDoAgente(a))) || acharAgente(banco, a.cas) || acharAgente(banco, a.nome);
    if (!ja && !d.nome) continue;
    if (ja) {
      delete d.nome; delete d.situacao;
      const antigas = String(ja.data.fontes || '').split('\n').filter(Boolean);
      const novas = String(d.fontes || '').split('\n').filter((x) => x && !antigas.includes(x));
      if (novas.length) d.fontes = [...antigas, ...novas].join('\n'); else delete d.fontes;
    } else d.situacao = 'A conferir';
    // colado pelo usuário: relógio de agora (prevalece sobre a base)
    const id = ja ? ja.id : idDoAgente({ id: a.id || a.cas || a.nome });
    if (await gravarImportado(registro(id, 'quimico', d, Date.now()))) n += 1;
  }
  return n;
}

// Instrução para extrair os valores da ACGIH do livreto do usuário (uso privado: os valores ficam só no banco dele)
export function promptAcgih(agentes, edicao = '') {
  const lista = agentes.map((r) => `- ${r.data.nome}${r.data.cas ? ` (CAS ${r.data.cas})` : ''}`).join('\n');
  return `Anexei o meu livreto TLVs and BEIs da ACGIH${edicao ? ` (edição ${edicao})` : ''}, adquirido por mim, para uso no meu próprio banco de dados de perícias. Extraia, SOMENTE do livreto anexado, os valores dos agentes abaixo.
REGRAS:
- Use a tabela de valores adotados (Adopted Values). Procure pelo nº CAS e, se não achar, pelo nome em inglês. Para misturas ou grupos, use a entrada correspondente e diga qual em "observacao".
- Copie os valores exatamente como no livro, com as unidades. Agente sem TLV: campos "" e "observacao": "sem TLV nesta edição".
- Inclua o BEI quando houver (determinante – momento da coleta – valor).
- Não preencha nada de memória.
Devolva SOMENTE um bloco JSON:
{"agentes": [{"nome": "", "cas": "", "acgih": {"twa": "", "stel": "", "notacoes": "", "baseTlv": "", "bei": "", "edicao": "${edicao || 'AAAA'}", "entrada": "nome da entrada usada", "observacao": ""}, "fontes": [{"campos": "ACGIH", "referencia": "ACGIH. TLVs and BEIs ${edicao || 'AAAA'}. Cincinnati: ACGIH, ${edicao || 'AAAA'}.", "consultadoEm": "AAAA-MM-DD"}]}]}
Agentes:
${lista}`;
}

export const PROMPT_QUIMICOS = `Monte a ficha técnica do(s) agente(s) químico(s) abaixo para o meu banco de dados de perícias (engenharia de segurança do trabalho), usando SOMENTE as fontes que eu anexar ou que você consultar e citar (FISPQ/FDS do fabricante, NIOSH Pocket Guide, PubChem, NR-15, LINACH, IARC).
REGRAS:
- Não preencha nenhum valor de memória. O que não estiver na fonte fica "".
- Cite em "fontes" a referência de cada grupo de dados (ABNT ou nome + URL + data de consulta).
- Unidades sempre junto do valor (ex.: "110,6 °C", "22 mmHg", "1,2 %").
- Não inclua valores da ACGIH (eu digito do meu livreto).
Devolva SOMENTE um bloco JSON:
{"agentes": [{"nome": "", "sinonimos": [], "cas": "", "tipo": "substância | mistura | grupo/fumos", "grupos": ["Óleos e graxas | Defensivos agrícolas | Tintas e solventes | Fumos de soldagem | Combustíveis | Odontológicos | Espuma de poliuretano | Mecânica de veículos e máquinas | Outros"], "formula": "", "massaMolar": "",
 "fisico": {"estado": "", "pontoEbulicao": "", "pontoFusao": "", "pressaoVapor": "", "densidadeRelativa": "", "densidadeVapor": "", "solubilidadeAgua": "", "pontoFulgor": "", "lie": "", "lse": "", "autoignicao": "", "limiarOdor": ""},
 "niosh": {"rel": "", "idlh": "", "oshaPel": "", "vias": "", "orgaosAlvo": "", "sintomas": "", "metodos": "", "url": ""},
 "nr15": {"anexo11": null, "observacao": ""}, "linach": "", "iarc": "",
 "fontes": [{"campos": "", "referencia": "", "url": "", "consultadoEm": "AAAA-MM-DD"}]}]}
Em "nr15.anexo11", só quando o agente constar do Quadro 1 do Anexo 11: {"ppm": "", "mgm3": "", "grau": "mínimo | médio | máximo", "pele": true, "teto": false}.
Agente(s): `;

// ---------------- cálculos ----------------
// Volume molar a 25 °C e 1 atm (24,45 L/mol)
export const ppmParaMgm3 = (ppm, mm) => (isFinite(num(ppm)) && isFinite(num(mm)) ? (num(ppm) * num(mm)) / 24.45 : NaN);
export const mgm3ParaPpm = (mg, mm) => (isFinite(num(mg)) && isFinite(num(mm)) && num(mm) > 0 ? (num(mg) * 24.45) / num(mm) : NaN);

// NR-15, Anexo 11, Quadro 2: fator de desvio (valor máximo = LT × FD; acima dele, risco grave e iminente – item 7)
export function fatorDesvio(lt) {
  const x = num(lt);
  if (!isFinite(x)) return NaN;
  if (x <= 1) return 3;
  if (x <= 10) return 2;
  if (x <= 100) return 1.5;
  if (x <= 1000) return 1.25;
  return 1.1;
}

// Brief & Scala: critério técnico de redução do limite para jornadas longas. NÃO consta do Anexo 11
// (o item 10.1 remete ao art. 60 da CLT para jornadas acima de 48 h semanais); use como referência técnica.
export const fatorBriefScalaDiario = (h) => (isFinite(num(h)) && num(h) > 8 ? (8 / num(h)) * ((24 - num(h)) / 16) : 1);
export const fatorBriefScalaSemanal = (h) => (isFinite(num(h)) && num(h) > 40 ? (40 / num(h)) * ((168 - num(h)) / 128) : 1);

// Mistura com efeito aditivo: Σ Ci / LTi (> 1 = excede)
export function somaMistura(itens) {
  let soma = 0;
  for (const { c, lt } of itens) { const a = num(c), b = num(lt); if (isFinite(a) && isFinite(b) && b > 0) soma += a / b; }
  return soma;
}

// Limite do Anexo 11 na unidade da medição (converte ppm ↔ mg/m³ quando há massa molar)
export function limiteNaUnidade(ag, unidade = '') {
  if (!ag) return { lt: NaN, un: '' };
  const u = /ppm/i.test(unidade) ? 'ppm' : /mg/i.test(unidade) ? 'mg/m³' : '';
  const ppm = num(ag.nr15Ppm), mg = num(ag.nr15Mgm3);
  if (u === 'ppm') return { lt: isFinite(ppm) ? ppm : mgm3ParaPpm(mg, ag.massaMolar), un: 'ppm' };
  if (u === 'mg/m³') return { lt: isFinite(mg) ? mg : ppmParaMgm3(ppm, ag.massaMolar), un: 'mg/m³' };
  return isFinite(ppm) ? { lt: ppm, un: 'ppm' } : { lt: mg, un: isFinite(mg) ? 'mg/m³' : '' };
}

// Confronto de uma medição (média aritmética das amostras – item 8) com o Anexo 11
export function confrontoAnexo11(ag, valor, unidade, { maximo } = {}) {
  const { lt, un } = limiteNaUnidade(ag, unidade);
  const c = num(valor);
  if (!isFinite(lt) || !isFinite(c)) return null;
  const teto = ag.nr15Teto === 'Sim';
  const fd = fatorDesvio(lt);
  const vmax = lt * fd;
  const pico = isFinite(num(maximo)) ? num(maximo) : c;
  return {
    lt, un, c, pct: (c / lt) * 100, teto, grau: ag.nr15Grau || '', pele: ag.nr15Pele === 'Sim',
    supera: teto ? pico > lt : c > lt, fd, vmax, graveIminente: !teto && pico > vmax,
  };
}

// Procura o agente do banco pelo id, CAS ou nome/sinônimo
export function acharAgente(lista, texto) {
  const t = slug(texto);
  if (!t) return null;
  return lista.find((r) => r.id === texto) || lista.find((r) => slug(r.data.cas) === t)
    || lista.find((r) => slug(r.data.nome) === t)
    || lista.find((r) => String(r.data.sinonimos || '').split(';').some((x) => slug(x) === t)) || null;
}

export function filtrarAgentes(lista, busca = '', grupo = '') {
  const t = slug(busca);
  return lista.filter((r) => {
    const d = r.data;
    if (grupo && !String(d.grupos || '').includes(grupo)) return false;
    if (!t) return true;
    return [d.nome, d.sinonimos, d.cas, d.formula].some((x) => slug(x).includes(t));
  }).sort((a, b) => String(a.data.nome || '').localeCompare(String(b.data.nome || ''), 'pt-BR'));
}
