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
    ['condicaoVia', 'Condição da via / piso / carga', 'text'],
  ],
  'Vibração de mãos e braços (VMB)': [
    ['ferramenta', 'Ferramenta / equipamento', 'text'],
    ['aren', 'aren (m/s²)', 'num'],
    ['tempoExposicao', 'Tempo de exposição diária', 'text'],
  ],
  'Agente químico': [
    ['descricao', 'Agente / produto', 'text'],
    ['metodo', 'Método / amostrador', 'text'],
    ['valor', 'Resultado', 'text'],
    ['unidade', 'Unidade', 'text'],
    ['limite', 'Limite de tolerância de referência', 'text'],
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
    const n = nen(d.lavg, d.jornada, q);
    if (ctx.prev !== false && isFinite(n)) out.push([`NEN (q=${q}) – previdenciário`, `${fmt(n)} dB(A)`, `NEN = ${q === 3 ? 'Leq + 10' : 'Lavg + 16,61'} × log(TE/480)${q === 3 ? ' – NHO-01; só para períodos a partir de 19/11/2003' : ''}`]);
    const dose = num(d.dose);
    const doseJ = doseJornada(d.dose, d.tempoAmostragem, d.jornada);
    const proj = isFinite(doseJ) && doseJ !== dose;
    if (ctx.prev !== true && isFinite(doseJ)) {
      if (q === 3) out.push(['Situação – NR-15, Anexo 1 (trabalhista)', 'dosímetro com q = 3: a NR-15 adota q = 5 – refaça a leitura com q = 5 para o enquadramento trabalhista', '']);
      else out.push(['Situação – NR-15, Anexo 1 (trabalhista)', `dose ${proj ? `projetada para a jornada de ${fmt(doseJ)}% (medida: ${fmt(dose)}% no tempo amostrado)` : `de ${fmt(dose)}%`} – ${doseJ > 100 ? 'acima' : 'dentro'} do limite de tolerância`, 'limite: dose de 100% (85 dB(A) para 8 h, q = 5)' + (proj ? '; D(jornada) = D × TE / T amostrado' : '')]);
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
