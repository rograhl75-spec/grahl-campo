// ======================================================================
// Bases técnicas alimentadas pelos casos concluídos ("Levar para a base técnica", etapa Laudo):
//  - veículo avaliado (motorista): um paradigma só, com ruído e VCI, já com os dados do veículo e da fonte;
//  - posto de trabalho medido (não motorista): base própria ("postoMedido"), referência para casos parecidos;
//  - profissões do signatário ("profissao"): fichas criadas pelo Claude a partir do caso, somadas ao banco fixo;
//  - notas normativas do signatário ("notaNormativa"): pesquisáveis na consulta normativa e enviadas ao Claude.
// ======================================================================
import { db, createRecord, updateFields, liveQuery } from './db.js';
import { PROFISSOES } from './data/profissoes.js';
import { proximoCodigo } from './paradigmas.js';
import { resumoMedicao } from './medicoes.js';

const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
const br = (iso) => v(iso).split('-').reverse().join('/');
const ativos = async (kind) => (await db.records.where('kind').equals(kind).toArray()).filter((r) => !r.deleted);
export const RE_MOTORISTA = /motorista|caminh|carreteir|cobrador|ônibus|onibus|carreta|bitrem|rodotrem|operador de (trator|escavadeira|retroescavadeira|p[áa] carregadeira|motoniveladora|empilhadeira|guindaste|rolo compactador|colheitadeira|m[áa]quinas? pesadas?)|tratorista/i;

// ---------- 1. veículo avaliado → paradigma (ruído e VCI juntos) ----------
function fonteDoCaso(c, m) {
  const extra = c.tipoAtuacao === 'Extrajudicial';
  const dataMedicao = br(m?.dataMedicao || c.vistoriaData || c.dataDiligencia);
  const processo = extra ? '' : v(c.numero), vara = extra ? '' : v(c.juizo);
  return { fonteTipo: extra ? 'Extrajudicial' : 'Judicial', processo, vara, dataMedicao,
    citacao: extra ? `Medição extrajudicial – ${dataMedicao}` : [processo && `Proc. ${processo}`, vara, dataMedicao].filter(Boolean).join(' – ') };
}
const equipTexto = (e) => (e ? `${v(e.data.nome)} ${v(e.data.fabricante)} ${v(e.data.modelo)}`.replace(/\s+/g, ' ').trim() : '');
export function veiculoParaParadigma(caso, posto, medicoes, equipamentos = []) {
  const c = caso.data, p = posto.data;
  const ruido = medicoes.find((m) => m.data.agente === 'Ruído');
  const vci = medicoes.find((m) => /corpo inteiro/i.test(m.data.agente || ''));
  const desc = v(p.veiculoAvaliado) || v(vci?.data.veiculo);
  const [primeira] = desc.split(/[,–(]/);
  const [marca, ...resto] = primeira.trim().split(/\s+/);
  const ano = (desc.match(/\b(19[5-9]\d|20[0-4]\d)\b/) || [])[1] || '';
  const eq = (m) => equipamentos.find((e) => e.id === m?.data.equipamentoId);
  const d = {
    tipo: /cavalo|4x2|6x2|6x4|carreta|semirreboque|T1\d\d|R ?\d{3}/i.test(`${desc} ${p.nome} ${p.descricao}`) ? 'Cavalo' : '',
    marca: marca || '', modelo: resto.join(' '), ano,
    anoFonte: ano ? (/CRLV/i.test(desc) ? 'CRLV / documento do veículo' : 'CRLV / documento do veículo') : '',
    arCondicionado: /sem ar/i.test(desc) ? 'Não' : /com ar/i.test(desc) ? 'Sim' : '',
    configuracao: [/semirreboque|carreta/i.test(desc) && 'cavalo com semirreboque', vci?.data.carga && `conjunto ${String(vci.data.carga).toLowerCase()} na medição`].filter(Boolean).join('; '),
    via: v(vci?.data.condicaoVia),
    situacao: 'Revisar', origemCaso: caso.id,
    observacoes: [v(p.placa) && `Placa ${p.placa}`, desc && `Veículo avaliado: ${desc}`].filter(Boolean).join('. '),
    ...fonteDoCaso(c, ruido || vci),
  };
  if (ruido) {
    const r = ruido.data, e = eq(ruido);
    Object.assign(d, { lavg: v(r.lavg), nenLaudo: v(r.nen), jornadaLaudo: v(r.jornada).replace(/:00(:00)?$/, '').replace(':', ','), duracaoRuidoMin: v(r.tempoAmostragem) });
    if (e) Object.assign(d, { ruidoEquip: equipTexto(e), ruidoSerie: v(e.data.serie), ruidoCert: v(e.data.certificado), ruidoCertData: br(e.data.dataCalibracao) });
  }
  if (vci) {
    const x = vci.data, e = eq(vci);
    Object.assign(d, { arenLaudo: v(x.aren), vdvrLaudo: v(x.vdv), eixoDominante: v(x.eixo), tempoVibracao: [v(x.horaInicio), v(x.horaFim)].filter(Boolean).join(' às ') });
    if (e) Object.assign(d, { vibEquip: equipTexto(e), vibSerie: v(e.data.serie), vibCert: v(e.data.certificado), vibCertData: br(e.data.dataCalibracao) });
  }
  return d;
}
export async function incluirVeiculoNaBase(caso, posto, medicoes, equipamentos) {
  const d = { codigo: await proximoCodigo(), ...veiculoParaParadigma(caso, posto, medicoes, equipamentos) };
  const r = await createRecord('paradigma', null, d);
  await updateFields(posto.id, { baseId: r.id, baseTipo: 'paradigma' });
  for (const m of medicoes) await updateFields(m.id, { paradigmaId: r.id });
  return r;
}

// ---------- 2. posto de trabalho medido (não motorista) ----------
export const CAMPOS_POSTO_MEDIDO = [
  ['funcao', 'Função / posto avaliado', 'text'],
  ['ramo', 'Ramo de atividade / CNAE', 'text'],
  ['local', 'Onde foi medido (empresa paradigma, cidade)', 'text'],
  ['descricao', 'Descrição do posto, do processo e do ciclo de trabalho', 'area'],
  ['fontes', 'Fontes geradoras', 'area'],
  ['ruido', 'Ruído (Lavg, NEN, jornada, dose)', 'area'],
  ['calor', 'Calor (IBUTG por ponto, médio ponderado, taxa metabólica, ciclo)', 'area'],
  ['outros', 'Outros agentes medidos', 'area'],
  ['condicoes', 'Condições da medição (data, horário, clima, produção)', 'area'],
  ['instrumentos', 'Instrumentos e certificados', 'area'],
  ['fonteTipo', 'Tipo de fonte', 'select', ['Judicial', 'Judicial trabalhista', 'Extrajudicial', 'Literatura']],
  ['processo', 'Processo', 'text'],
  ['dataMedicao', 'Data da medição', 'text'],
  ['citacao', 'Como citar (extrajudicial: "Medição extrajudicial – data")', 'text'],
  ['situacao', 'Situação', 'select', ['Revisar', 'OK', 'Ressalva', 'NÃO USAR']],
  ['observacoes', 'Observações', 'area'],
];
export function postoParaBase(caso, posto, medicoes, equipamentos = []) {
  const c = caso.data, p = posto.data;
  const por = (re) => medicoes.filter((m) => re.test(m.data.agente || '')).map((m) => resumoMedicao(m)).join('\n');
  const outros = medicoes.filter((m) => !/^Ru[íi]do|Calor/i.test(m.data.agente || '')).map((m) => `${m.data.agente}: ${resumoMedicao(m)}`).join('\n');
  const eqs = [...new Set(medicoes.map((m) => equipamentos.find((e) => e.id === m.data.equipamentoId)).filter(Boolean))]
    .map((e) => `${equipTexto(e)}${e.data.serie ? `, série ${e.data.serie}` : ''}${e.data.certificado ? `, certificado ${e.data.certificado}` : ''}${e.data.dataCalibracao ? ` de ${br(e.data.dataCalibracao)}` : ''}`).join('\n');
  const f = fonteDoCaso(c, medicoes[0]);
  return {
    funcao: v(p.nome), ramo: '', local: v(c.vistoriaLocal), descricao: [v(p.descricao), v(p.jornada) && `Jornada / tempo de exposição: ${p.jornada}`].filter(Boolean).join('\n'),
    fontes: v(p.fontes), ruido: por(/^Ru[íi]do/i), calor: por(/Calor/i), outros,
    condicoes: [f.dataMedicao && `Medição em ${f.dataMedicao}`, ...medicoes.map((m) => v(m.data.obs)).filter(Boolean)].join('\n'),
    instrumentos: eqs, ...f, situacao: 'Revisar', origemCaso: caso.id,
  };
}
export async function incluirPostoNaBase(caso, posto, medicoes, equipamentos) {
  const r = await createRecord('postoMedido', null, postoParaBase(caso, posto, medicoes, equipamentos));
  await updateFields(posto.id, { baseId: r.id, baseTipo: 'postoMedido' });
  return r;
}

// ---------- 3. profissões do signatário ----------
const escRe = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function profissaoDoRegistro(r) {
  const d = r.data || r;
  const chaves = (Array.isArray(d.palavrasChave) ? d.palavrasChave : String(d.palavrasChave || d.nome || '').split(/[,;|]/)).map((x) => x.trim()).filter(Boolean);
  return {
    id: r.id || d.id || d.nome, nome: v(d.nome), re: new RegExp(chaves.map(escRe).join('|') || '$^', 'i'), cbo: v(d.cbo), cboNome: v(d.cboNome),
    profissiografia: v(d.profissiografia), epi: v(d.epi), roteiro: lista(d.roteiro), documentos: lista(d.documentos),
    agentes: Array.isArray(d.agentes) ? d.agentes : [], usuario: true,
  };
}
const lista = (x) => (Array.isArray(x) ? x : String(x || '').split('\n')).map((t) => String(t).trim()).filter(Boolean);
// as profissões do signatário entram no mesmo banco usado pelo cadastro, pela etapa 1 e pela instrução do Claude
export function registrarProfissoes(recs) {
  for (let i = PROFISSOES.length - 1; i >= 0; i--) if (PROFISSOES[i].usuario) PROFISSOES.splice(i, 1);
  for (const r of recs) if (v(r.data.nome)) PROFISSOES.push(profissaoDoRegistro(r));
}
export const promptProfissao = (textoCaso, textoLaudo = '') => `Sou perito em segurança do trabalho. Com base no caso e no laudo abaixo, monte a FICHA DA PROFISSÃO para o meu banco de profissões, que servirá de ponto de partida para casos futuros da mesma atividade.

REGRAS
- Ficha genérica da profissão: sem nome do segurado, da empresa, do processo ou de pessoas (LGPD). Valores medidos entram como referência ("em paradigma similar, NEN de 86,1 dB(A)"), sem identificar o caso.
- Agentes: os avaliados no caso, com o código e o resultado de cada época (até 05/03/1997 e a partir de 06/03/1997), como o laudo concluiu; o que depender da entrevista fica "A confirmar".
- Roteiro de entrevista: perguntas objetivas que faltaram ou foram decisivas no caso (tempos, ciclos, fontes, mudanças de equipamento, jornada).
- Documentos a pedir: os que fizeram falta ou foram úteis.
- palavrasChave: termos que identificam a profissão no cargo ou nas atividades (ex.: padeiro, panificação, forneiro).
- Textos objetivos: fundamentação de cada agente com até 600 caracteres; profissiografia com até 800.
- JSON válido: dentro dos textos, NUNCA use aspas duplas (") – use aspas simples ou « »; sem comentários nem vírgula sobrando.

RESPOSTA: apenas um JSON:
{"nome": "", "palavrasChave": [], "cbo": "", "cboNome": "", "profissiografia": "", "epi": "", "roteiro": [], "documentos": [],
 "agentes": [{"nome": "", "tipo": "Físico | Químico | Biológico | Outro", "fonte": "", "codAte97": "", "resAte97": "", "codDesde97": "", "resDesde97": "", "epcEficaz": "", "epiEficaz": "", "fundamentacao": "", "circunstancias": "", "vias": "", "frequencia": ""}]}

---
DADOS DO CASO
${textoCaso}
${textoLaudo ? `\n---\nTEXTO DO LAUDO\n${textoLaudo}` : ''}`;
// JSON da resposta do Claude, tolerante a texto antes ou depois, cercas ``` e chaves soltas no texto
export function extrairJson(t) {
  const s = String(t || '');
  const cands = [];
  const cerca = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (cerca) cands.push(cerca[1].trim());
  for (let i = s.indexOf('{'); i >= 0; i = s.indexOf('{', i + 1)) {
    if (!/^\{\s*["}]/.test(s.slice(i, i + 50))) continue;
    // objeto balanceado a partir daqui (respeitando strings)
    let prof = 0, str = false, esc = false, fim = -1;
    for (let j = i; j < s.length; j++) {
      const ch = s[j];
      if (str) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') str = false; continue; }
      if (ch === '"') str = true; else if (ch === '{') prof++; else if (ch === '}') { prof--; if (!prof) { fim = j; break; } }
    }
    cands.push(fim > 0 ? s.slice(i, fim + 1) : s.slice(i));
  }
  for (const c of cands) { try { return JSON.parse(c); } catch (e) { /* próximo */ } }
  for (const c of cands) { try { return JSON.parse(c.replace(/,\s*([}\]])/g, '$1')); } catch (e) { /* próximo */ } }
  // aspas duplas sem escape dentro dos textos ("cód. "2.0.1""): fecha a string só quando o próximo sinal é , : } ]
  const conserta = (c) => {
    let out = '', str = false;
    for (let j = 0; j < c.length; j++) {
      const ch = c[j];
      if (str && ch === '\\') { out += ch + (c[j + 1] || ''); j++; continue; }
      if (ch === '"') {
        if (!str) { str = true; out += ch; continue; }
        const resto = c.slice(j + 1).match(/^\s*(.)/);
        if (!resto || /[,:}\]]/.test(resto[1])) { str = false; out += ch; } else out += '\\"';
        continue;
      }
      out += str && ch === '\n' ? '\\n' : ch;
    }
    return out.replace(/,\s*([}\]])/g, '$1');
  };
  for (const c of cands) { try { return JSON.parse(conserta(c)); } catch (e) { /* próximo */ } }
  throw new Error('A resposta do Claude não trouxe um JSON válido (pode ter sido cortada). Tente de novo.');
}
export function lerJsonProfissao(t) {
  const o = extrairJson(t);
  if (!v(o.nome)) throw new Error('A ficha veio sem o nome da profissão.');
  return o;
}
export async function salvarProfissao(o, caseId = '') {
  const existente = (await ativos('profissao')).find((r) => v(r.data.nome).toLowerCase() === v(o.nome).toLowerCase());
  const dados = { ...o, roteiro: lista(o.roteiro).join('\n'), documentos: lista(o.documentos).join('\n'), palavrasChave: Array.isArray(o.palavrasChave) ? o.palavrasChave.join(', ') : v(o.palavrasChave), origemCaso: caseId, em: new Date().toISOString() };
  if (existente) { await updateFields(existente.id, dados); return { id: existente.id, atualizada: true }; }
  const r = await createRecord('profissao', null, dados);
  return { id: r.id, atualizada: false };
}
export const CAMPOS_PROFISSAO = [
  ['nome', 'Profissão', 'text'], ['palavrasChave', 'Palavras que identificam a profissão (separadas por vírgula)', 'text'],
  ['cbo', 'CBO', 'text'], ['cboNome', 'Título da CBO', 'text'], ['profissiografia', 'Profissiografia padrão', 'area'], ['epi', 'EPI', 'area'],
  ['roteiro', 'Roteiro de entrevista (uma pergunta por linha)', 'area'], ['documentos', 'Documentos a pedir (um por linha)', 'area'],
];

// ---------- 4. notas normativas do signatário ----------
export const CAMPOS_NOTA = [
  ['titulo', 'Título', 'text'], ['tema', 'Tema (ruído, vibração, calor, químicos, enquadramento…)', 'text'],
  ['texto', 'Texto da nota (como o perito aplica a norma)', 'area'], ['fonte', 'Fonte (norma, item, edição)', 'text'],
  ['usarNoClaude', 'Enviar ao Claude como critério', 'select', ['Sim', 'Não']],
];
export const NOTAS_SUGERIDAS = [
  { titulo: 'NHO-09: faixas por grandeza (VCI)', tema: 'vibração', fonte: 'NHO-09 (FUNDACENTRO, 2013), quadro de critério de julgamento e tomada de decisão', usarNoClaude: 'Sim',
    texto: 'aren: até 0,5 m/s² aceitável; acima de 0,5 até 0,9 m/s² acima do nível de ação; acima de 0,9 até 1,1 m/s² região de incerteza; acima de 1,1 m/s² acima do limite de exposição. VDVR: até 9,1 m/s^1,75 aceitável; acima de 9,1 até 16,4 acima do nível de ação; acima de 16,4 até 21,0 região de incerteza; acima de 21,0 acima do limite. Cada grandeza tem a sua faixa: não atribuir ao VDVR a faixa do aren, nem o contrário.' },
  { titulo: 'Anexo IV: agentes exaustivos, atividades exemplificativas', tema: 'enquadramento', fonte: 'Decretos 2.172/1997 e 3.048/1999, Anexo IV, nota explicativa', usarNoClaude: 'Sim',
    texto: 'O rol de agentes nocivos do Anexo IV é exaustivo; as atividades listadas em cada código são exemplificativas. O enquadramento decorre da exposição ao agente acima do critério do período, não da atividade descrita no código.' },
  { titulo: 'Calor: hora mais desfavorável', tema: 'calor', fonte: 'NR-15, Anexo 3 (redação original), Quadros 1 a 3; NHO-06', usarNoClaude: 'Sim',
    texto: 'O IBUTG médio ponderado e a taxa metabólica média são calculados para os 60 minutos corridos mais desfavoráveis. Com tempos relatados em faixa, adota-se o maior tempo na fonte quente; a dependência do relato é registrada numa frase, sem tabela de hipóteses.' },
  { titulo: 'ISO 2631-1: zona de cautela (8 h)', tema: 'vibração', fonte: 'ISO 2631-1:1997, Anexo B, Figura B.1', usarNoClaude: 'Sim',
    texto: 'Fronteira superior da zona de cautela para 8 h: aren de 0,86 m/s² ou VDV de 17 m/s^1,75 (inferior: 0,43 m/s² e 8,5 m/s^1,75). Abaixo da zona, efeitos à saúde não documentados de forma clara; dentro, cautela quanto a riscos potenciais; acima, riscos à saúde prováveis. Com fator de crista acima de 9, o aren pode subestimar os efeitos e o VDV complementa a avaliação (item 6.3).' },
  { titulo: 'Resultado limítrofe e incerteza de medição', tema: 'medição', fonte: 'Certificados de calibração dos instrumentos; NR-15', usarNoClaude: 'Sim',
    texto: 'Quando a margem em relação ao limite é pequena, informar a incerteza expandida do instrumento (certificado de calibração) e as condições da medição em relação ao turno do segurado. A norma compara o valor medido com o limite, sem desconto da incerteza; o resultado é apresentado como limítrofe, sem chamá-lo de conclusão segura.' },
  { titulo: 'Ruído: NEN na jornada do segurado', tema: 'ruído', fonte: 'NHO-01 (FUNDACENTRO, 2001); Decreto 4.882/2003', usarNoClaude: 'Sim',
    texto: 'O NEN é normalizado para a jornada do segurado (relato ou documentos da empregadora), não para a do paradigma. Jornadas divergentes entre as fontes vão para um quadro de sensibilidade.' },
  { titulo: 'Período sem medição representativa', tema: 'enquadramento', fonte: 'Critério do signatário', usarNoClaude: 'Sim',
    texto: 'Período cuja fonte geradora não é representada pela medição (ex.: forno elétrico × forno a lenha do paradigma) é "não avaliado (sem medição representativa)", nunca "não caracteriza".' },
];
export async function incluirNotasSugeridas() {
  const ja = new Set((await ativos('notaNormativa')).map((r) => v(r.data.titulo).toLowerCase()));
  let n = 0;
  for (const nt of NOTAS_SUGERIDAS) if (!ja.has(nt.titulo.toLowerCase())) { await createRecord('notaNormativa', null, nt); n++; }
  return n;
}
// cache síncrono para a instrução do Claude (criteriosPara é síncrona)
let notasCache = [];
export const notasAtuais = () => notasCache;
export function textoNotasParaClaude(notas = notasCache) {
  const l = notas.filter((r) => (r.data?.usarNoClaude || 'Sim') !== 'Não' && v(r.data?.texto));
  if (!l.length) return '';
  return `NOTAS NORMATIVAS DO SIGNATÁRIO (como aplico as normas; siga-as)\n${l.map((r) => `- ${r.data.titulo}: ${r.data.texto}${r.data.fonte ? ` (${r.data.fonte})` : ''}`).join('\n')}`;
}
export const entradasDasNotas = (notas = notasCache) => notas.map((r) => ({ fonte: 'Notas do signatário', ref: v(r.data.fonte), titulo: v(r.data.titulo), texto: v(r.data.texto), tema: v(r.data.tema) }));

// mantém profissões e notas do signatário atualizadas (chamado ao abrir o app)
let iniciado = false;
export function iniciarBasesUsuario() {
  if (iniciado) return; iniciado = true;
  liveQuery(() => ativos('profissao')).subscribe({ next: registrarProfissoes, error: () => {} });
  liveQuery(() => ativos('notaNormativa')).subscribe({ next: (l) => { notasCache = l; }, error: () => {} });
}

// ---------- posto: fontes geradoras e via/periodicidade a partir dos agentes (do caso ou da ficha da profissão) ----------
const curto = (t, n = 260) => { const x = v(t).replace(/\s+/g, ' '); return x.length > n ? `${x.slice(0, n).replace(/[,;:\s]+\S*$/, '')}…` : x; };
const semEnquadre = (a) => /^n[ãa]o (caracteriza|enquadr)/i.test(v(a.resAte97)) && /^n[ãa]o (caracteriza|enquadr)/i.test(v(a.resDesde97));
export function fontesEViasDosAgentes(agentes = []) {
  const l = agentes.map((a) => a.data || a).filter((a) => v(a.nome) && !semEnquadre(a));
  const fontes = l.filter((a) => v(a.fonte)).map((a) => `- ${a.nome.replace(/\s*\(.*$/, '')}: ${curto(a.fonte)}`).join('\n');
  const vias = l.filter((a) => v(a.vias) || v(a.frequencia)).map((a) => `- ${a.nome.replace(/\s*\(.*$/, '')}: ${[curto(a.vias, 180), curto(a.frequencia, 160)].filter(Boolean).join(' ')}`).join('\n');
  return { fontes, viaPeriodicidade: vias };
}
