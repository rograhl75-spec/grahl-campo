// Bases normativas integradas do Caracterizador Pericial (src/data/caracterizador/, gerado por
// scripts/importar-caracterizador.mjs): consulta normativa e regras usadas nos documentos.
//  - manual.json (pequeno, sempre carregado): quadros do Manual de Aposentadoria Especial do INSS (2018) –
//    agentes de avaliação quantitativa e qualitativa e cancerígenos – e os códigos de cada agente nos decretos;
//  - normas.json (grande, carregado sob demanda): decretos, LINACH, IN 128/2022, NR-15 (Anexos 11 e 13),
//    NR-16, marcos, teses e textos, para a tela de consulta.
import MANUAL from './data/caracterizador/manual.json';

export const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const palavras = (t) => ` ${semAcento(t).replace(/[^a-z0-9]+/g, ' ').trim()} `;
// chave de um nome da lista: antes de parênteses e de "e seus compostos"
const chave = (n) => semAcento(String(n).replace(/\s*\(.*$/, '').replace(/\s+e (seus )?compostos.*$/i, '').replace(/\s+seus compostos.*$/i, '').replace(/\s+e derivados.*$/i, '')).replace(/[^a-z0-9]+/g, ' ').trim();

function achar(lista, nome, obter = (x) => x) {
  const alvo = palavras(nome);
  let melhor = null; let tam = 0;
  for (const it of lista) {
    const k = chave(obter(it));
    if (k.length >= 4 && alvo.includes(` ${k} `) && k.length > tam) { melhor = it; tam = k.length; }
  }
  return melhor;
}

// Manual de Aposentadoria Especial (2018): forma de avaliação do agente pelo nome
export function avaliacaoPeloManual(nome) {
  const q = achar(MANUAL.quantitativos, nome, (x) => x.nome);
  const l = achar(MANUAL.qualitativos, nome);
  if (q && (!l || chave(q.nome).length >= chave(l).length)) return { forma: 'Quantitativa', item: q.nome, lt: [q.ppm && `${q.ppm} ppm`, q.mgm3 && `${q.mgm3} mg/m³`].filter(Boolean).join(' – ') };
  if (l) return { forma: 'Qualitativa', item: l };
  return null;
}
// cancerígeno do Grupo 1 da LINACH com código no Anexo IV (lista do Manual)
export function cancerigenoAnexoIV(nome) {
  const r = achar(MANUAL.cancerigenos, nome, (x) => (Array.isArray(x) ? x[0] : x));
  return r ? { agente: r[0], codigo: r[1], cas: r[3] || '' } : null;
}
// códigos do agente nos decretos (53.831/64, 83.080/79 e Anexo IV) – sugestão quando o cadastro está em branco
export function codigosNosDecretos(nome) {
  const g = achar(MANUAL.agentes.filter((a) => !['categoria', 'outras', 'inorg', 'mineracao'].includes(a.id)), nome, (x) => x.nome);
  if (!g) return null;
  const ate97 = [g.c53.length && `${g.c53.join(' / ')} do Dec. 53.831/64`, g.c83.length && `${g.c83.join(' / ')} do Anexo I do Dec. 83.080/79`].filter(Boolean).join(' e ');
  return { ate97, desde97: g.cIV ? `${g.cIV} do Anexo IV` : '', agente: g.nome };
}

// ---------------- consulta normativa ----------------
const j = (x) => (Array.isArray(x) ? x.filter((y) => y !== null && y !== undefined && String(y).trim()).join(' · ') : String(x ?? ''));
const br = (iso) => String(iso || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');
export function entradasNormas(n) {
  const out = [];
  const add = (fonte, ref, titulo, texto) => out.push({ fonte, ref: String(ref || ''), titulo: String(titulo || ''), texto: String(texto || '') });
  for (const m of n.marcos || []) add('Marcos legais', br(m.d), m.t, m.s);
  for (const a of n.agentes || []) {
    add('Agentes previdenciários', [a.c53?.length && `53.831: ${a.c53.join('/')}`, a.c83?.length && `83.080: ${a.c83.join('/')}`, a.cIV && `Anexo IV: ${a.cIV}`].filter(Boolean).join(' | '), a.nome,
      [...(a.periodos || []).map((p) => j(p)), a.nr15 && `NR-15: ${a.nr15}`, ...(Array.isArray(a.inss) ? a.inss.map((t) => `INSS: ${t}`) : []), ...(Array.isArray(a.perito) ? a.perito.map((t) => `Critério: ${t}`) : [])].filter(Boolean).join('\n'));
  }
  for (const r of n.decreto53831Agentes || []) add('Decreto 53.831/64 – agentes', r[0], r[1], j(r.slice(2)));
  for (const r of n.decreto53831Atividades || []) add('Decretos 53.831/64 e 83.080/79 – categorias profissionais', r[0], r[1], j(r.slice(2)));
  for (const r of n.manualQuantitativos || []) add('Manual INSS 2018 – avaliação quantitativa', '', r[0], j(r.slice(1)));
  for (const r of n.manualQualitativos || []) add('Manual INSS 2018 – avaliação qualitativa', '', r[0], '');
  for (const r of n.cancerigenos || []) add('Cancerígenos – LINACH Grupo 1 e Anexo IV', Array.isArray(r) ? r[1] : '', Array.isArray(r) ? r[0] : r, Array.isArray(r) ? j(r.slice(2)) : '');
  for (const r of n.linach || []) add('LINACH', Array.isArray(r) ? r[1] : '', Array.isArray(r) ? r[0] : r, '');
  for (const [art, ps] of Object.entries(n.in128 || {})) add('IN PRES/INSS 128/2022', `art. ${art}`, String(ps[0] || '').slice(0, 120), j(ps).replace(/ · /g, '\n'));
  for (const a of n.nr15Anexo11 || []) add('NR-15, Anexo 11', a.g ? `grau ${a.g}` : '', a.n, [a.ppm != null && `${a.ppm} ppm`, a.mg != null && `${a.mg} mg/m³`, a.teto && 'valor teto', a.pele && 'absorção pela pele', a.obs, a.vide?.length && `vide ${a.vide.join(', ')}`, a.al?.length && `outros nomes: ${a.al.join(', ')}`].filter(Boolean).join(' · '));
  for (const a of n.nr15Anexo13 || []) add('NR-15, Anexo 13', a.g ? `grau ${a.g}` : '', a.ag, `${a.t}${a.exc ? ' (excluído / revogado)' : ''}`);
  for (const [item, t] of n.nr16Geral || []) add('NR-16', item, t, '');
  for (const an of n.nr16 || []) {
    for (const s of an.secoes || []) add('NR-16', `${an.n} – ${an.t}`, s.tit, (s.itens || []).map((i) => j(i)).join('\n'));
  }
  for (const [id, t] of Object.entries(n.teses || {})) add('Teses e jurisprudência', `${t.trib} ${t.num}`, t.titulo, [t.ref, t.ano, t.tese].filter(Boolean).join(' · '));
  for (const v of n.isoVibracao || []) add('Vibração – normas ISO', v.tipo?.toUpperCase(), v.rot, [v.v != null && `${v.v} ${v.un || ''}`, v.vdv && `VDV ${v.vdv}`, v.nota].filter(Boolean).join(' · '));
  const rotT = { resumo: 'Resumo da legislação previdenciária', regressivas: 'Ações regressivas do INSS', cpc: 'CPC – prova pericial', legislacao: 'Legislação complementar do Decreto 53.831/64' };
  for (const [k, linhas] of Object.entries(n.textos || {})) {
    // blocos de texto: um item por parágrafo longo, para a busca achar o trecho
    (linhas || []).forEach((l, i) => { if (String(l).trim().length > 40) add(rotT[k] || k, `§ ${i + 1}`, String(l).slice(0, 100), String(l)); });
  }
  return out;
}

export function buscarNormas(entradas, consulta, fonte = '') {
  const termos = semAcento(consulta).split(/\s+/).filter((t) => t.length >= 2);
  return entradas.filter((e) => (!fonte || e.fonte === fonte) && (!termos.length || termos.every((t) => semAcento(`${e.ref} ${e.titulo} ${e.texto}`).includes(t))));
}
