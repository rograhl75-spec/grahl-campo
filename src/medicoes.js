import { nen, lavgDaDose, ibutg, fmt, num, minutos, fatorQ, doseJornada } from './calc.js';
import { CONDICAO_CALOR } from './schema.js';

// Campos de cada tipo de medição: [chave, rótulo, tipo, opções]
export const CAMPOS_MEDICAO = {
  'Ruído': [
    ['tempoAmostragem', 'Tempo de amostragem (ex.: 6h10)', 'text'],
    ['jornada', 'Jornada diária (ex.: 8h48)', 'text'],
    ['dose', 'Dose (%)', 'num'],
    ['q', 'Fator de duplicação do dosímetro', 'select', ['5 (NR-15, Anexo 1)', '3 (NHO-01)']],
    ['lavg', 'Nível médio dB(A) – Lavg (q=5) ou Leq (q=3)', 'num'],
    ['nen', 'NEN do relatório (dB(A)) – já normalizado pelo aparelho para a jornada', 'num'],
    ['lmax', 'Lmax / pico dB', 'num'],
    ['calibInicial', 'Calibração inicial (dB)', 'num'],
    ['calibFinal', 'Calibração final (dB)', 'num'],
    ['posicao', 'Posição do microfone / trabalhador amostrado', 'text'],
  ],
  'Calor (IBUTG)': [
    ['condicao', 'Condição', 'select', CONDICAO_CALOR],
    ['tbn', 'tbn – bulbo úmido natural (°C)', 'num'],
    ['tbs', 'tbs – bulbo seco (°C)', 'num'],
    ['tg', 'tg – globo (°C)', 'num'],
    ['ibutgLido', 'IBUTG lido no aparelho (°C)', 'num'],
    ['atividade', 'Atividade / taxa metabólica', 'text'],
    ['regime', 'Regime de trabalho e descanso', 'text'],
    ['localDescanso', 'Local de descanso', 'text'],
  ],
  'Vibração de corpo inteiro (VCI)': [
    ['veiculo', 'Veículo / máquina (marca, modelo, ano)', 'text'],
    ['aren', 'aren (m/s²)', 'num'],
    ['vdv', 'VDVR (m/s¹·⁷⁵)', 'num'],
    ['eixo', 'Eixo dominante', 'text'],
    ['tempoExposicao', 'Tempo de exposição diária', 'text'],
    ['condicaoVia', 'Condição da via / piso', 'text'],
    ['carga', 'Carga do conjunto durante a medição', 'select', ['Vazio', 'Carregado', 'Parcialmente carregado']],
  ],
  'Vibração de mãos e braços (VMB)': [
    ['ferramenta', 'Ferramenta / equipamento', 'text'],
    ['aren', 'aren (m/s²)', 'num'],
    ['tempoExposicao', 'Tempo de exposição diária', 'text'],
  ],
  // o agente do banco (campo "agenteBanco") é escolhido na tela da medição
  'Agente químico': [
    ['descricao', 'Agente / produto (como no rótulo ou na FISPQ)', 'text'],
    ['metodo', 'Método / amostrador', 'text'],
    ['nAmostras', 'Nº de amostras', 'text'],
    ['valor', 'Resultado (média aritmética das amostras – NR-15, Anexo 11, item 8)', 'text'],
    ['maximo', 'Maior concentração entre as amostras', 'text'],
    ['unidade', 'Unidade', 'select', ['ppm', 'mg/m³', 'f/cm³', '%']],
    ['limite', 'Limite de referência (em branco = o do banco)', 'text'],
  ],
  'Outro': [
    ['descricao', 'Agente / parâmetro', 'text'],
    ['valor', 'Valor', 'text'],
    ['unidade', 'Unidade', 'text'],
    ['metodo', 'Método', 'text'],
  ],
};

export const CAMPOS_MEDICAO_COMUNS = [
  ['horaInicio', 'Início', 'time'],
  ['horaFim', 'Fim', 'time'],
  ['obs', 'Observações da medição', 'area'],
];

// Valores calculados exibidos em campo.
// ctx.prev: true = previdenciário (NEN); false = trabalhista (dose / Lavg da NR-15);
// indefinido = mostra os dois (tela de campo).
export function calculados(m, ctx = {}) {
  const d = m.data || m;
  const out = [];
  if (d.agente === 'Ruído') {
    const q = fatorQ(d);
    // NEN do relatório do aparelho: usado como está, sem recalcular
    const nRel = num(d.nen);
    const n = isFinite(nRel) ? nRel : nen(d.lavg, d.jornada, q);
    if (ctx.prev !== false && isFinite(n)) out.push([`NEN (q=${q}) – previdenciário`, `${fmt(n)} dB(A)`, isFinite(nRel) ? 'do relatório do dosímetro' : `NEN = ${q === 3 ? 'Leq + 10' : 'Lavg + 16,61'} × log(TE/480)${q === 3 ? ' – NHO-01; só para períodos a partir de 19/11/2003' : ''}`]);
    const dose = num(d.dose);
    const doseJ = doseJornada(d.dose, d.tempoAmostragem, d.jornada);
    const proj = isFinite(doseJ) && doseJ !== dose;
    if (ctx.prev !== true && isFinite(doseJ)) {
      if (q === 3) out.push(['Situação – NR-15, Anexo 1 (trabalhista)', 'dosímetro com q = 3: a NR-15 adota q = 5 – refaça a leitura com q = 5 para o enquadramento trabalhista', '']);
      else out.push(['Situação – NR-15, Anexo 1 (trabalhista)', `dose ${proj ? `projetada para a jornada de ${fmt(doseJ)}% (medida: ${fmt(dose)}% no tempo amostrado)` : `de ${fmt(dose)}%`} – ${Math.round(doseJ * 10) / 10 > 100 ? 'acima' : 'dentro'} do limite de tolerância`, 'limite: dose de 100% (85 dB(A) para 8 h, q = 5)' + (proj ? '; D(jornada) = D × TE / T amostrado' : '')]);
    }
    const ld = lavgDaDose(d.dose, d.tempoAmostragem, q);
    if (isFinite(ld)) out.push([`${q === 3 ? 'Leq' : 'Lavg'} calculado pela dose`, `${fmt(ld)} dB(A)`, `Conferência: 85 + ${q === 3 ? '10' : '16,61'} × log(D / (100 × T/480))`]);
    const ci = num(d.calibInicial), cf = num(d.calibFinal);
    if (isFinite(ci) && isFinite(cf)) out.push(['Desvio de calibração', `${fmt(cf - ci)} dB`, '']);
  }
  if (d.agente === 'Calor (IBUTG)') {
    const solar = d.condicao === CONDICAO_CALOR[1];
    const v = ibutg(d.tbn, d.tg, d.tbs, solar);
    if (isFinite(v)) out.push(['IBUTG calculado', `${fmt(v)} °C`, solar ? '0,7 tbn + 0,2 tg + 0,1 tbs' : '0,7 tbn + 0,3 tg']);
  }
  return out;
}

export function resumoMedicao(m, ctx = {}) {
  const d = m.data || m;
  const campos = CAMPOS_MEDICAO[d.agente] || CAMPOS_MEDICAO.Outro;
  const partes = [];
  for (const [k, rot, tipo, opcoes] of campos) {
    const v = d[k];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    partes.push(`${rot.replace(/\s*\(ex\.:[^)]*\)/, '')}: ${v}`);
    void tipo; void opcoes;
  }
  for (const [rot, val] of calculados(m, ctx)) partes.push(`${rot.replace(/ – previdenciário$/, '').replace(/ \(trabalhista\)$/, '')}: ${val}`);
  if (d.horaInicio && d.horaFim) partes.push(`Horário: ${d.horaInicio} às ${d.horaFim}`);
  else if (d.horaInicio) partes.push(`Início: ${d.horaInicio}`);
  return partes.join('; ');
}

// ---------- Tom do calibrador dentro da dosimetria ----------
// A aferição de campo (tom de 94 ou 114 dB) às vezes fica gravada no 1º ou no último intervalo do registro: Lmax igual
// ao nível do calibrador e Lavg do intervalo muito acima dos demais. Esse intervalo não é exposição: sai do cálculo,
// e Lavg, NEN, dose da amostragem, Lmax e tempo de amostragem são refeitos com os intervalos restantes (mesma duração).
const NIVEIS_CALIBRADOR = [94, 104, 114];
function kQ(q) { return String(q || '5').trim().startsWith('3') ? 10 : 16.61; }
export function excluirTomCalibracao(m) {
  const ints = (Array.isArray(m.intervalos) ? m.intervalos : []).map((x) => (Array.isArray(x) ? x : [x?.lavg, x?.lmax]).map(num))
    .filter(([l]) => isFinite(l));
  if (ints.length < 4 || !/^Ru[íi]do/i.test(m.agente || 'Ruído')) return null;
  const calib = [num(m.calibInicial), num(m.calibFinal)].filter(isFinite);
  const niveis = calib.length ? calib : NIVEIS_CALIBRADOR;
  const ord = ints.map(([l]) => l).sort((a, b) => a - b);
  const mediana = ord[Math.floor(ord.length / 2)];
  const ehTom = ([l, lmax]) => isFinite(lmax) && niveis.some((n) => Math.abs(lmax - n) <= 0.5) && l - mediana >= 6;
  let ini = 0, fim = ints.length;
  while (ini < fim - 3 && ehTom(ints[ini])) ini += 1;
  while (fim - 1 > ini + 3 && ehTom(ints[fim - 1])) fim -= 1;
  const fora = ini + (ints.length - fim);
  if (!fora) return null;
  const resto = ints.slice(ini, fim);
  const k = kQ(m.q);
  const lavg = k * Math.log10(resto.reduce((s, [l]) => s + 10 ** (l / k), 0) / resto.length);
  // tempo de amostragem: "00:13:30" (relatório), número puro em minutos (leitura do Claude) ou "6h10"
  const ta = String(m.tempoAmostragem ?? '').trim();
  const hms = ta.match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
  const tTot = hms ? Number(hms[1]) * 60 + Number(hms[2]) + Number(hms[3]) / 60 : /^\d+([.,]\d+)?$/.test(ta) ? num(ta) : minutos(ta);
  const dur = num(m.duracaoIntervalo) > 0 ? num(m.duracaoIntervalo) / 60 : (isFinite(tTot) ? tTot / ints.length : NaN);
  const t = isFinite(dur) ? dur * resto.length : NaN;
  const lmaxResto = Math.max(...resto.map(([, x]) => x).filter(isFinite));
  const n = (v, c = 2) => (isFinite(v) ? v.toFixed(c) : '');
  const novo = { lavg: n(lavg) };
  if (isFinite(t)) { const seg = Math.round(t * 60); novo.tempoAmostragem = `${String(Math.floor(seg / 3600)).padStart(2, '0')}:${String(Math.floor((seg % 3600) / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`; }
  const te = minutos(m.jornada);
  if (isFinite(te) && te > 0) novo.nen = n(lavg + k * Math.log10(te / 480));
  if (isFinite(t) && String(m.dose ?? '').trim()) novo.dose = n(100 * (t / 480) * 2 ** ((lavg - 85) / (k === 10 ? 3 : 5)));
  if (isFinite(lmaxResto)) novo.lmax = n(lmaxResto);
  const quais = [ini && `${ini === 1 ? '1º intervalo' : `${ini} primeiros intervalos`}`, fora - ini && `${fora - ini === 1 ? 'último intervalo' : `${fora - ini} últimos intervalos`}`].filter(Boolean).join(' e ');
  const ex = [...ints.slice(0, ini), ...ints.slice(fim)];
  const aviso = `Tom do calibrador dentro da medição de ruído (${quais}: Lavg ${ex.map(([l]) => fmt(l, 1)).join(' / ')} dB; Lmax ${ex.map(([, x]) => fmt(x, 1)).join(' / ')} dB) – excluído do cálculo: Lavg ${fmt(lavg, 1)} dB(A)${novo.nen ? `, NEN ${fmt(num(novo.nen), 1)} dB(A)` : ''} (relatório do instrumento, com o tom: Lavg ${fmt(num(m.lavg), 1)}${String(m.nen ?? '').trim() ? `, NEN ${fmt(num(m.nen), 1)}` : ''}).`;
  const obs = `Excluído do cálculo o ${quais} do registro, com o tom do calibrador (Lmax ${ex.map(([, x]) => fmt(x, 1)).join(' / ')} dB). Relatório do instrumento, com esse intervalo: Lavg ${fmt(num(m.lavg), 1)} dB(A)${String(m.nen ?? '').trim() ? `; NEN ${fmt(num(m.nen), 1)} dB(A)` : ''}${String(m.dose ?? '').trim() ? `; dose ${fmt(num(m.dose), 1)} %` : ''}${String(m.lmax ?? '').trim() ? `; Lmax ${fmt(num(m.lmax), 1)} dB` : ''}.`;
  return { campos: { ...novo, tomCalibracao: quais, obs: [m.obs, obs].filter(Boolean).join('\n') }, aviso };
}
// medição já gravada sem a tabela de intervalos: Lmax igual ao nível do calibrador = conferir o registro
export function suspeitaTomCalibracao(m) {
  if (!/^Ru[íi]do/i.test(m.agente || '') || m.tomCalibracao) return false;
  const lmax = num(m.lmax);
  if (!isFinite(lmax)) return false;
  const calib = [num(m.calibInicial), num(m.calibFinal)].filter(isFinite);
  return (calib.length ? calib : NIVEIS_CALIBRADOR).some((n) => Math.abs(lmax - n) <= 0.3);
}
