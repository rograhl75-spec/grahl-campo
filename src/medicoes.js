import { nenQ5, lavgDaDose, ibutg, fmt, num } from './calc.js';
import { CONDICAO_CALOR } from './schema.js';

// Campos de cada tipo de medição: [chave, rótulo, tipo, opções]
export const CAMPOS_MEDICAO = {
  'Ruído': [
    ['tempoAmostragem', 'Tempo de amostragem (ex.: 6h10)', 'text'],
    ['jornada', 'Jornada diária (ex.: 8h48)', 'text'],
    ['dose', 'Dose (%)', 'num'],
    ['lavg', 'Lavg (q=5) dB(A)', 'num'],
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

// Valores calculados exibidos em campo
export function calculados(m) {
  const d = m.data || m;
  const out = [];
  if (d.agente === 'Ruído') {
    const nen = nenQ5(d.lavg, d.jornada);
    if (isFinite(nen)) out.push(['NEN (q=5)', `${fmt(nen)} dB(A)`, 'NEN = Lavg + 16,61 × log(TE/480)']);
    const ld = lavgDaDose(d.dose, d.tempoAmostragem);
    if (isFinite(ld)) out.push(['Lavg calculado pela dose', `${fmt(ld)} dB(A)`, 'Conferência: 85 + 16,61 × log(D / (100 × T/480))']);
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

export function resumoMedicao(m) {
  const d = m.data || m;
  const campos = CAMPOS_MEDICAO[d.agente] || CAMPOS_MEDICAO.Outro;
  const partes = [];
  for (const [k, rot, tipo, opcoes] of campos) {
    const v = d[k];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    partes.push(`${rot.replace(/\s*\(ex\.:[^)]*\)/, '')}: ${v}`);
    void tipo; void opcoes;
  }
  for (const [rot, val] of calculados(m)) partes.push(`${rot}: ${val}`);
  if (d.horaInicio && d.horaFim) partes.push(`Horário: ${d.horaInicio} às ${d.horaFim}`);
  else if (d.horaInicio) partes.push(`Início: ${d.horaInicio}`);
  return partes.join('; ');
}
