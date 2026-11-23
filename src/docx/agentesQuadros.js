import { efeitosDoBanco } from './efeitosQuimicos.js';
import { grupoHidrocarboneto, classificacaoDoGrupo } from '../hidrocarbonetos.js';
// Quadros dos agentes usados em qualquer documento:
//  - características dos agentes químicos (identificação, vias, órgãos-alvo, efeitos, limites e classificação),
//    independentemente da caracterização – dados do próprio cadastro do agente e, na falta, do banco de químicos;
//  - avaliação qualitativa nos termos do art. 68, § 2º, I a III, do Decreto 3.048/1999 (circunstâncias de
//    exposição, fontes e possibilidades de liberação, meios de contato, vias de absorção, intensidade, frequência
//    e duração do contato).

const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
const semAc = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// vocabulário do NIOSH Pocket Guide (vias e órgãos-alvo) em português; o que não estiver aqui não vai ao documento
const VIAS = [[/inhalation/i, 'inalação'], [/skin absorption/i, 'absorção pela pele'], [/ingestion/i, 'ingestão'], [/skin and\/or eye contact/i, 'contato com a pele e os olhos']];
const ORGAOS = { eyes: 'olhos', skin: 'pele', 'respiratory system': 'sistema respiratório', 'central nervous system': 'sistema nervoso central', kidneys: 'rins',
  liver: 'fígado', blood: 'sangue', teeth: 'dentes', 'peripheral nervous system': 'sistema nervoso periférico', cns: 'sistema nervoso central',
  'cardiovascular system': 'sistema cardiovascular', 'gastrointestinal tract': 'trato gastrointestinal', 'reproductive system': 'sistema reprodutor', bones: 'ossos', 'nervous system': 'sistema nervoso' };
export function viasEmPortugues(t) {
  const out = VIAS.filter(([re]) => re.test(t || '')).map(([, p]) => p);
  return out.join(', ');
}
export function orgaosEmPortugues(t) {
  const partes = String(t || '').split(/,\s*|;\s*|\s+and\s+/i).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const out = partes.map((x) => ORGAOS[x.replace(/\[.*?\]|\(.*?\)/g, '').trim()]).filter(Boolean);
  return out.join(', '); // só os termos conhecidos
}

// número CAS de verdade (2 a 7 dígitos-2 dígitos-1 dígito); "Óleo básico…" ou "mistura" não são CAS
export const ehCas = (t) => /^\d{2,7}-\d{2}-\d$/.test(v(t));
export const casValido = (t) => (String(t || '').match(/\b\d{2,7}-\d{2}-\d\b/g) || []).join(', ');

// agente físico: meio de exposição no lugar das vias de absorção (art. 68, § 2º, III)
export function viasPadrao(a) {
  const x = a.data || a;
  if ((x.tipo || 'Químico') !== 'Físico') return '';
  const n = semAc(x.nome);
  if (/eletric|tensao|energiz/.test(n)) return 'Exposição por proximidade de instalações ou equipamentos energizados, com risco de contato direto ou indireto e de arco elétrico; não há via de absorção (agente físico)';
  if (/ruido/.test(n)) return 'Exposição por via auditiva, pelo ar, no ambiente de trabalho; não há via de absorção (agente físico)';
  if (/vibra/.test(n)) return /maos|braco/.test(n) ? 'Transmissão às mãos e aos braços pelas ferramentas e empunhaduras; não há via de absorção (agente físico)' : 'Transmissão ao corpo inteiro pelo assento e pelo piso; não há via de absorção (agente físico)';
  if (/calor/.test(n)) return 'Exposição ao ambiente térmico (convecção e radiação); não há via de absorção (agente físico)';
  if (/radia/.test(n)) return 'Exposição externa à radiação no ambiente de trabalho';
  if (/press/.test(n)) return 'Exposição do organismo à pressão do ambiente; não há via de absorção (agente físico)';
  if (/frio/.test(n)) return 'Exposição ao ambiente frio (condução e convecção); não há via de absorção (agente físico)';
  return 'Agente físico: exposição no ambiente de trabalho; não há via de absorção';
}

// agente avaliado → registro do banco de químicos (pelo nome, sinônimos ou CAS); o que está entre parênteses no
// nome do agente é descrição ("Mesamoll (éster … de fenol)") e não entra na busca pelo nome
export function bancoDoAgente(a, quimicos = []) {
  const x = a.data || a;
  const cas = (casValido(x.cas) || casValido(x.nome)).split(', ')[0];
  if (cas) { const r = quimicos.find((q) => v(q.data.cas) === cas); if (r) return r; }
  const norm = (n) => semAc(n).replace(/[^a-z0-9]+/g, ' ').trim();
  const nomesDe = (q) => [String(q.data.nome || '').replace(/\s*\(.*$/, ''), ...String(q.data.sinonimos || '').split(';'),
    ...((String(q.data.nome || '').match(/\(([^)]*)\)/) || [])[1] || '').split(/[;,]/)].map(norm).filter(Boolean);
  // 1) o nome fora dos parênteses, por palavra inteira
  const alvo = ` ${norm(String(x.nome || '').replace(/\([^)]*\)/g, ' '))} `;
  let melhor = null; let tam = 0;
  for (const q of quimicos) for (const n of nomesDe(q).filter((k) => k.length >= 4)) if (alvo.includes(` ${n} `) && n.length > tam) { melhor = q; tam = n.length; }
  if (melhor) return melhor;
  // 2) o que está entre parênteses só vale como item inteiro ("Isocianatos (TDI)" → TDI); "(éster … de fenol)" não é fenol
  const itens = ((String(x.nome || '').match(/\(([^)]*)\)/) || [])[1] || '').split(/[;,]|\s+[–-]\s+/).map(norm).filter((k) => k.length >= 3);
  for (const q of quimicos) if (nomesDe(q).some((n) => itens.includes(n))) return q;
  return null;
}

// linhas do quadro de características
// citações de documento dentro da célula ("(FISPQ Shell…, seção 2 e 11)", "(Literatura técnica – conferir…)"):
// saem do texto e vão para a fonte do quadro, que fica com as referências numa frase só
const RE_CITA = /\s*\(([^()]*\b(?:FISPQ|FDS|ficha t[ée]cnica|ficha|Literatura|PGR|PCMSO|LTCAT)\b[^()]*)\)/gi;
export function separarCitacoes(t, refs) {
  return v(t).replace(RE_CITA, (m, ref) => { refs.add(ref.replace(/\s+/g, ' ').trim()); return ''; }).replace(/\s+([.;,])/g, '$1').trim();
}
function linhaQuimico(nome, x = {}, q = null, refs = null, fdsEfeitos = '') {
  const b = q ? q.data : {};
  const cas = casValido(x.cas) || casValido(b.cas);
  const vias = (v(x.vias) || viasEmPortugues(b.vias)).replace(/^\p{Lu}(?=\p{Ll})/u, (c) => c.toLowerCase()).replace(/\.$/, '');
  const orgaos = orgaosEmPortugues(b.orgaosAlvo);
  const efeitos = refs ? separarCitacoes(v(x.efeitos), refs) || efeitosDoBanco(q) || separarCitacoes(fdsEfeitos, refs) : v(x.efeitos) || efeitosDoBanco(q) || fdsEfeitos;
  const lim = [
    v(b.nr15Mgm3) || v(b.nr15Ppm) ? `NR-15, Anexo 11: ${[v(b.nr15Ppm) && `${b.nr15Ppm} ppm`, v(b.nr15Mgm3) && `${b.nr15Mgm3} mg/m³`].filter(Boolean).join(' – ')}${b.nr15Teto === 'Sim' ? ' (valor teto)' : ''}${b.nr15Grau ? `, grau ${b.nr15Grau}` : ''}` : '',
    !/^Nenhum/i.test(v(b.nr15Anexos)) && /Anexo 13(?!-)/.test(v(b.nr15Anexos)) ? 'NR-15, Anexo 13' : '',
    !/^Nenhum/i.test(v(b.nr15Anexos)) && /Anexo 13-A/.test(v(b.nr15Anexos)) ? 'NR-15, Anexo 13-A' : '',
    v(b.linach) && `LINACH ${b.linach}`, v(b.iarc) && `IARC ${b.iarc}`,
    classificacaoDoGrupo(grupoHidrocarboneto(nome, x.cas), v(x.ip346)),
  ].filter(Boolean).join('; ');
  return [`${nome}${cas ? `\nCAS ${cas}` : ''}`, [vias && `Vias: ${vias}`, orgaos && `Órgãos-alvo: ${orgaos}`].filter(Boolean).join('\n') || '[[vias de absorção]]',
    efeitos || '[[efeitos à saúde]]', (refs ? separarCitacoes(x.limites, refs) : v(x.limites)) || lim || 'Sem limite de tolerância na NR-15'];
}

// itens: [{ nome, dados (campos do agente avaliado ou da medição), banco }]
export function quadroCaracteristicasQuimicos(d, itens) {
  if (!itens.length) return false;
  const refs = new Set();
  const linhas = itens.map((i) => linhaQuimico(i.nome, i.dados, i.banco, refs, i.fds || ''));
  const docs = [...refs].map((r) => r.replace(/^./, (c) => c.toUpperCase()));
  d.quadro('Características dos agentes químicos', [['Agente / CAS', 'Vias de absorção e órgãos-alvo', 'Efeitos à saúde', 'Limites e classificação'], ...linhas],
  { larguras: [0.22, 0.26, 0.3, 0.22], tam: 8.5, alinhar: 'left',
    fonte: `Elaborado pelo signatário com base nas fichas com dados de segurança dos produtos, no banco de agentes químicos do signatário (NIOSH Pocket Guide, NR-15, LINACH e IARC)${docs.length ? ` e nos documentos: ${docs.join('; ')}` : ''}. Características informadas independentemente da caracterização da exposição.` });
  return true;
}

// art. 68, § 2º, do Decreto 3.048/1999 (redação do Decreto 10.410/2020)
export const TXT_ART68 = 'Nos termos do art. 68, § 2º, do Decreto nº 3.048/1999, a avaliação qualitativa é comprovada pela descrição (I) das circunstâncias de exposição ocupacional ao agente presente no ambiente de trabalho durante toda a jornada; (II) de todas as fontes e possibilidades de liberação do agente; e (III) dos meios de contato ou exposição, das vias de absorção, da intensidade da exposição, da frequência e da duração do contato. O quadro a seguir reúne esses elementos para cada agente avaliado.';
export function quadroArt68(d, agentes) {
  if (!agentes.length) return false;
  d.texto(TXT_ART68);
  d.quadro('Avaliação qualitativa – art. 68, § 2º, do Decreto 3.048/1999', [['Agente', 'I – Circunstâncias da exposição', 'II – Fontes e possibilidades de liberação', 'III – Meios de contato, vias, intensidade, frequência e duração'],
    ...agentes.map((a) => {
      const x = a.data;
      return [x.nome, v(x.circunstancias) || '[[circunstâncias da exposição]]', v(x.fonte) || '[[fontes de liberação]]',
        [v(x.vias) || viasPadrao(a), v(x.frequencia)].filter(Boolean).map((t) => t.replace(/\.$/, '')).join('. ').replace(/(.)$/, '$1.').replace(/^\.$/, '') || '[[meios de contato, vias, frequência e duração]]'];
    })],
  { larguras: [0.2, 0.27, 0.25, 0.28], tam: 8.5, alinhar: 'left', fonte: 'Elaborado pelo signatário com base na vistoria e nas declarações do item 2.3.' });
  return true;
}

// agente com limite de tolerância nos Anexos 11 ou 12 da NR-15 (pelo banco de químicos): "Anexo 11" | "Anexo 12" | ''
export function anexoQuantitativo(a, quimicos = []) {
  const x = a.data || a;
  if (x.tipo && x.tipo !== 'Químico') return '';
  // óleo mineral e derivados de petróleo: avaliação qualitativa (NR-15, Anexo 13), ainda que o banco traga limite de névoa
  if (['oleoMineral', 'derivadoPetroleo', 'sintetico'].includes(grupoHidrocarboneto(x.nome, x.cas))) return '';
  const q = bancoDoAgente(a, quimicos);
  if (!q) return '';
  if (v(q.data.nr15Mgm3) || v(q.data.nr15Ppm)) return 'Anexo 11';
  if (/Anexo 12/.test(v(q.data.nr15Anexos)) && !/^Nenhum/i.test(v(q.data.nr15Anexos))) return 'Anexo 12';
  return '';
}

// agentes do quadro do art. 68: os que caracterizam em alguma época ou ainda estão "a confirmar"
export const agentesDoArt68 = (ags) => ags.filter((a) => [a.data.resAte97, a.data.resDesde97].some((r) => r === 'Caracteriza' || r === 'A confirmar' || !r) || a.data.resDesde2014 === 'Caracteriza');

// Perigos que pedem medidas de controle mesmo sem caracterização previdenciária: sensibilizante, cancerígeno e
// tóxico à reprodução – pelo texto dos efeitos do agente, pelo banco de químicos (LINACH, IARC) e pelas frases H
// da FDS dos produtos que contêm o agente
// siglas usuais → nome do componente na FDS
const SIGLAS = { mdi: ['difenilmetano'], pmdi: ['difenilmetano'], tdi: ['diisocianato de tolueno', 'tolueno diisocianato', 'toluileno'], dop: ['etilhexil', 'dioctilftalato'], dehp: ['etilhexil'], mek: ['metiletilcetona', 'butanona'], glp: ['propano', 'butano'] };
// produtos (FDS) que contêm o agente: pelo CAS (do campo ou escrito no nome), pelo nome principal, pela sigla ou pelo
// nome comercial citado no nome do agente ("PMDI Voracor CE 164")
export function produtosDoAgente(a, dados = {}) {
  const x = a.data || a;
  const cass = [casValido(x.cas), casValido(x.nome)].join(', ').split(/,\s*/).filter(Boolean);
  const nomeTodo = semAc(x.nome);
  const nome = nomeTodo.replace(/\s+[(–-].*$/, '').trim();
  const palavras = (t) => ` ${t.replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const termos = [nome.length >= 4 ? nome : '', ...(SIGLAS[nome.replace(/[^a-z]/g, '')] || [])].filter(Boolean).map((t) => palavras(t).trim());
  return (dados.produtos || []).filter((p) => {
    const d = p.data;
    const c = palavras(semAc(`${d.nome || ''} ${d.uso || ''} ${d.s3Componentes || ''}`));
    const comercial = palavras(semAc(d.nome || '')).trim();
    return cass.some((k) => c.includes(k.replace(/[^0-9]+/g, ' ').trim()))
      || termos.some((t) => c.includes(` ${t} `))
      || (comercial.length >= 6 && palavras(nomeTodo).includes(` ${comercial.split(' ').slice(0, 3).join(' ')} `));
  });
}
// efeitos à saúde pela seção 2 da FDS (frases de perigo; na falta, a classificação), quando o agente não tem texto próprio
export function efeitosDaFds(a, dados = {}) {
  for (const p of produtosDoAgente(a, dados)) {
    const d = p.data;
    const frases = v(d.s2FrasesH) || v(d.s2Classificacao);
    if (!frases || /^n[ãa]o classificad/i.test(frases)) continue;
    const lst = frases.split(/\n+|;\s*/).map((t) => t.replace(/^H\d{3}\w?\s*[–-]\s*/, '').replace(/\.$/, '').trim()).filter(Boolean);
    return `${lst.map((t, i) => (i ? t.replace(/^\p{Lu}(?=\p{Ll})/u, (c) => c.toLowerCase()) : t)).join('; ').replace(/^./, (c) => c.toUpperCase())} (FDS ${v(d.nome)}${v(d.revisao) ? `, ${v(d.revisao)}` : ''}, seção 2).`;
  }
  return '';
}
export function perigosDoAgente(a, dados = {}) {
  const x = a.data || a;
  if (x.tipo && x.tipo !== 'Químico') return [];
  const q = bancoDoAgente(a, dados.quimicos || []);
  const b = q ? q.data : {};
  const fds = produtosDoAgente(a, dados).map((p) => `${p.data.s2FrasesH || ''} ${p.data.s2Classificacao || ''}`).join(' ');
  // trechos negados ("sem sensibilização", "não classificado", "nenhum efeito na fertilidade") não contam
  const t = semAc(`${x.efeitos || ''} ${x.limites || ''} ${fds}`).replace(/\b(sem|nao|nenhum|nenhuma|negativ\w*)\b[^.;,()]*/g, ' ');
  const out = [];
  // sensibilizante respiratório ou cutâneo ("sensibilização cardíaca" dos halogenados não é)
  if (/sensibiliza\w*\s+(respirat|cutane|a pele|da pele|dermic)|sensibilizante|asma ocupacional|h334|h317/.test(t)) out.push('sensibilizante');
  if (/\bgrupo 1\b/.test(semAc(b.linach)) || /^(1|2a)\b/i.test(v(b.iarc).replace(/^grupo\s*/i, '')) || /h350|carcinog|cancerigen/.test(t)) out.push('cancerígeno');
  if (/h360|toxicidade a reproducao|toxico a reproducao|fertilidade/.test(t)) out.push('tóxico à reprodução');
  return out;
}
export function medidasDoPerigo(perigos) {
  const m = [];
  if (perigos.includes('sensibilizante')) m.push('sistema fechado na transferência, purga e limpeza; ventilação local exaustora; proteção respiratória com filtro para vapores orgânicos e particulados nas operações com aerossol; luvas e óculos compatíveis com a FDS; vigilância médica respiratória e dermatológica (NR-7)');
  if (perigos.includes('cancerígeno')) m.push('substituição por produto menos perigoso; sistema fechado; exposição mínima e registro dos expostos');
  if (perigos.includes('tóxico à reprodução')) m.push('substituição do produto; luvas compatíveis e higiene das mãos; orientação sobre o risco reprodutivo e afastamento de gestantes da exposição');
  return m.length ? `${m.join('; ').replace(/^./, (c) => c.toUpperCase())}.` : '';
}
