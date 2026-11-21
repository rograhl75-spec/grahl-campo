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

// agente avaliado → registro do banco de químicos (pelo nome, sinônimos ou CAS)
export function bancoDoAgente(a, quimicos = []) {
  const x = a.data || a;
  const cas = v(x.cas);
  if (cas) { const r = quimicos.find((q) => v(q.data.cas) === cas); if (r) return r; }
  const alvo = ` ${semAc(x.nome).replace(/[^a-z0-9]+/g, ' ')} `;
  let melhor = null; let tam = 0;
  for (const q of quimicos) {
    const nomes = [String(q.data.nome || '').replace(/\s*\(.*$/, ''), ...String(q.data.sinonimos || '').split(';')].map((n) => semAc(n).replace(/[^a-z0-9]+/g, ' ').trim()).filter((n) => n.length >= 4);
    for (const n of nomes) if (alvo.includes(` ${n} `) && n.length > tam) { melhor = q; tam = n.length; }
  }
  return melhor;
}

// linhas do quadro de características
function linhaQuimico(nome, x = {}, q = null) {
  const b = q ? q.data : {};
  const cas = v(x.cas) || v(b.cas);
  const vias = (v(x.vias) || viasEmPortugues(b.vias)).replace(/^\p{Lu}(?=\p{Ll})/u, (c) => c.toLowerCase()).replace(/\.$/, '');
  const orgaos = orgaosEmPortugues(b.orgaosAlvo);
  const efeitos = v(x.efeitos);
  const lim = [
    v(b.nr15Mgm3) || v(b.nr15Ppm) ? `NR-15, Anexo 11: ${[v(b.nr15Ppm) && `${b.nr15Ppm} ppm`, v(b.nr15Mgm3) && `${b.nr15Mgm3} mg/m³`].filter(Boolean).join(' – ')}${b.nr15Teto === 'Sim' ? ' (valor teto)' : ''}${b.nr15Grau ? `, grau ${b.nr15Grau}` : ''}` : '',
    !/^Nenhum/i.test(v(b.nr15Anexos)) && /Anexo 13(?!-)/.test(v(b.nr15Anexos)) ? 'NR-15, Anexo 13' : '',
    !/^Nenhum/i.test(v(b.nr15Anexos)) && /Anexo 13-A/.test(v(b.nr15Anexos)) ? 'NR-15, Anexo 13-A' : '',
    v(b.linach) && `LINACH ${b.linach}`, v(b.iarc) && `IARC ${b.iarc}`,
  ].filter(Boolean).join('; ');
  return [`${nome}${cas ? `\nCAS ${cas}` : ''}`, [vias && `Vias: ${vias}`, orgaos && `Órgãos-alvo: ${orgaos}`].filter(Boolean).join('\n') || '[[vias de absorção]]',
    efeitos || '[[efeitos à saúde]]', v(x.limites) || lim || 'Sem limite de tolerância na NR-15'];
}

// itens: [{ nome, dados (campos do agente avaliado ou da medição), banco }]
export function quadroCaracteristicasQuimicos(d, itens) {
  if (!itens.length) return false;
  d.quadro('Características dos agentes químicos', [['Agente / CAS', 'Vias de absorção e órgãos-alvo', 'Efeitos à saúde', 'Limites e classificação'],
    ...itens.map((i) => linhaQuimico(i.nome, i.dados, i.banco))],
  { larguras: [0.22, 0.26, 0.3, 0.22], tam: 8.5, alinhar: 'left',
    fonte: 'Elaborado pelo signatário com base nas fichas com dados de segurança dos produtos, no banco de agentes químicos do signatário (NIOSH Pocket Guide, NR-15, LINACH e IARC). Características informadas independentemente da caracterização da exposição.' });
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
        [v(x.vias), v(x.frequencia)].filter(Boolean).map((t) => t.replace(/\.$/, '')).join('. ').replace(/(.)$/, '$1.').replace(/^\.$/, '') || '[[meios de contato, vias, frequência e duração]]'];
    })],
  { larguras: [0.2, 0.27, 0.25, 0.28], tam: 8.5, alinhar: 'left', fonte: 'Elaborado pelo signatário com base na vistoria e nas declarações do item 2.3.' });
  return true;
}

// agente com limite de tolerância nos Anexos 11 ou 12 da NR-15 (pelo banco de químicos): "Anexo 11" | "Anexo 12" | ''
export function anexoQuantitativo(a, quimicos = []) {
  const x = a.data || a;
  if (x.tipo && x.tipo !== 'Químico') return '';
  const q = bancoDoAgente(a, quimicos);
  if (!q) return '';
  if (v(q.data.nr15Mgm3) || v(q.data.nr15Ppm)) return 'Anexo 11';
  if (/Anexo 12/.test(v(q.data.nr15Anexos)) && !/^Nenhum/i.test(v(q.data.nr15Anexos))) return 'Anexo 12';
  return '';
}

// agentes do quadro do art. 68: os que caracterizam em alguma época ou ainda estão "a confirmar"
export const agentesDoArt68 = (ags) => ags.filter((a) => [a.data.resAte97, a.data.resDesde97].some((r) => r === 'Caracteriza' || r === 'A confirmar' || !r));
