// ======================================================================
// Hidrocarbonetos: óleo mineral × derivado de petróleo × base sintética, e o IP 346 dos óleos minerais.
//
// Todo óleo mineral é derivado de petróleo (é a fração pesada refinada do petróleo bruto); o que muda é a
// atividade e o código do Anexo IV:
//  - ÓLEO MINERAL (óleos básicos, lubrificantes, hidráulicos, de corte, de têmpera, vaselina, petrolato,
//    parafina, graxas de base mineral): cód. 1.0.7, b – "extração, produção e utilização de óleos minerais e
//    parafinas" –, que descreve a utilização em qualquer atividade; até 05/03/1997, cód. 1.2.11 do Dec.
//    53.831/64 e 1.2.10 do Anexo I do Dec. 83.080/79; avaliação qualitativa (NR-15, Anexo 13 – hidrocarbonetos
//    e outros compostos de carbono: manipulação de óleos minerais).
//  - DEMAIS DERIVADOS DE PETRÓLEO (combustíveis, nafta, querosene, solventes alifáticos e aromáticos de
//    petróleo, aguarrás mineral, betume): cód. 1.0.17, cujas atividades listadas são as de unidades de
//    extração, plantas petrolíferas e petroquímicas e as misturas asfálticas; fora delas, o enquadramento vale
//    pelas atividades exemplificativas dos agentes químicos (art. 287, § 4º, da IN 128/2022) – a conferir caso a
//    caso. Componente com limite no Anexo 11 (tolueno, xileno, n-hexano…) é agente próprio, quantitativo; o
//    benzeno é agente próprio (cód. 1.0.3, NR-15, Anexo 13-A).
//  - BASE SINTÉTICA OU VEGETAL (polialfaolefinas, ésteres, poliglicóis, silicones, óleos vegetais): não é óleo
//    mineral; sem componente do Anexo IV, não é enquadrável.
// IP 346 (extrato em DMSO): < 3 % = óleo mineral altamente refinado, que não integra o Grupo 1 da LINACH
// (IARC, Grupo 3); "não tratado ou pouco tratado" é o do Grupo 1 da LINACH – sem CAS único, fora da avaliação
// qualitativa do art. 298 da IN 128/2022, de modo que o enquadramento segue o Anexo 13 da NR-15.
// ======================================================================

const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
const semAc = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// CAS das frações de petróleo usadas como óleo básico, vaselina, petrolato e parafina
const CAS_OLEO_MINERAL = new Set(['64742-52-5', '64742-53-6', '64742-54-7', '64742-55-8', '64742-56-9', '64742-57-0', '64742-58-1', '64742-62-7', '64742-63-8',
  '64742-65-0', '64742-01-4', '64742-70-7', '64741-88-4', '64741-89-5', '64741-96-4', '64741-97-5', '72623-87-1', '72623-85-9', '72623-86-0', '8042-47-5',
  '8012-95-1', '8009-03-8', '8002-74-2', '64742-61-6', '64742-43-4', '64742-44-5', '64742-46-7', '8020-83-5', '101316-72-7']);
// combustíveis e solventes de petróleo
const CAS_DERIVADO = new Set(['68334-30-5', '86290-81-5', '8006-61-9', '8008-20-6', '64742-88-7', '8052-41-3', '64742-47-8', '64742-48-9', '64742-82-1',
  '64742-89-8', '64742-94-5', '64742-95-6', '8030-30-6', '64741-41-9', '8032-32-4', '68476-34-6', '64742-81-0', '68476-30-2', '8052-42-4', '64742-93-4']);
const CAS_SINTETICO = new Set(['68037-01-4', '68649-12-7', '163149-28-8', '9003-13-8', '63148-62-9', '68411-46-1']);

const RE_OLEO = /\b(oleo|oleos)\s+(basico|mineral|minerais|lubrificante|hidraulico|de corte|soluvel|de tempera|de transformador|isolante|de processo|parafinico|naftenico)|vaselina|petrolato|parafina|graxa (mineral|de base mineral|lubrificante)|white oil|mineral oil|base oil|destilados? (de petroleo )?(parafinicos|naftenicos)|hidrotratad/;
const RE_DERIV = /diesel|gasolina|querosene|nafta|aguarras|solvente (alifatico|aromatico|de petroleo)|white spirit|thinner|betume|asfalt|hidrocarbonetos? (alifaticos|aromaticos|c\d)|combustivel|oleo combustivel|gas liquefeito|glp/;
const RE_SINT = /sintetic|polialfaolefin|\bpao\b|\bester|poliglicol|polialquilenoglicol|silicone|siloxan|vegeta|soja|mamona|biodegradavel/;

// grupo do agente ou do componente: 'oleoMineral' | 'derivadoPetroleo' | 'sintetico' | ''
export function grupoHidrocarboneto(nome, cas = '') {
  const n = semAc(nome);
  const cs = String(cas || '').match(/\b\d{2,7}-\d{2}-\d\b/g) || [];
  if (cs.some((c) => CAS_SINTETICO.has(c)) || (RE_SINT.test(n) && !/base mineral|mineral/.test(n))) return 'sintetico';
  if (cs.some((c) => CAS_OLEO_MINERAL.has(c)) || RE_OLEO.test(n)) return 'oleoMineral';
  if (cs.some((c) => CAS_DERIVADO.has(c)) || RE_DERIV.test(n) || /derivados? de petroleo/.test(n)) return 'derivadoPetroleo';
  return '';
}

export const IP346 = ['< 3 % (óleo altamente refinado)', '≥ 3 % ou não tratado / pouco tratado', 'Não informado na FDS'];
// IP 346 lido do texto da FDS (seções 2, 3, 11 ou observações)
export function ip346DoTexto(t) {
  const s = semAc(t);
  if (/(ip\s*346|dmso)[^.;\n]{0,60}<\s*3\s*%|<\s*3\s*%[^.;\n]{0,60}(ip\s*346|dmso)|altamente refinad|severamente refinad|highly refined|severely refined/.test(s)) return IP346[0];
  if (/(ip\s*346|dmso)[^.;\n]{0,60}(>|≥|>=)\s*3\s*%|nao tratad|pouco tratad|untreated|mildly treated/.test(s)) return IP346[1];
  return '';
}

export const CODIGOS_GRUPO = {
  oleoMineral: { ate97: '1.2.11 do Dec. 53.831/64 e 1.2.10 do Anexo I do Dec. 83.080/79', desde97: '1.0.7, b, do Anexo IV (utilização de óleos minerais e parafinas)', tecnica: 'Qualitativa – NR-15, Anexo 13' },
  derivadoPetroleo: { ate97: '1.2.11 do Dec. 53.831/64 e 1.2.10 do Anexo I do Dec. 83.080/79', desde97: '1.0.17 do Anexo IV (petróleo e seus derivados)', tecnica: 'Qualitativa – NR-15, Anexo 13', conferir: 'cód. 1.0.17: as atividades listadas são as de unidades de extração, plantas petrolíferas e petroquímicas e as misturas asfálticas; fora delas, enquadramento pelas atividades exemplificativas (art. 287, § 4º, da IN 128/2022)' },
};

// texto técnico do grupo, para a fundamentação
export function textoDoGrupo(grupo, ip346 = '') {
  if (grupo === 'oleoMineral') {
    const t = ['O óleo mineral é derivado de petróleo. Para a sua utilização, o Anexo IV traz atividade própria no cód. 1.0.7, b (extração, produção e utilização de óleos minerais e parafinas); o cód. 1.0.17 refere-se às atividades em unidades de extração, plantas petrolíferas e petroquímicas e à aplicação de misturas asfálticas. A avaliação é qualitativa (NR-15, Anexo 13 – manipulação de óleos minerais).'];
    if (ip346 === IP346[0]) t.push('A FDS informa óleo básico altamente refinado, com extrato em DMSO inferior a 3 % (IP 346), que não integra o Grupo 1 da LINACH (classificação IARC, Grupo 3); a regra da LINACH a partir de 08/10/2014 não se aplica.');
    else if (ip346 === IP346[1]) t.push('O óleo mineral não tratado ou pouco tratado consta do Grupo 1 da LINACH, mas não tem registro único no CAS; não se aplica a avaliação qualitativa do art. 298 da IN 128/2022, e o enquadramento segue o Anexo 13 da NR-15.');
    return t.join(' ');
  }
  if (grupo === 'derivadoPetroleo') return 'O produto é derivado de petróleo (combustível ou solvente). O cód. 1.0.17 do Anexo IV lista as atividades em unidades de extração, plantas petrolíferas e petroquímicas e as misturas asfálticas; fora delas, o enquadramento se dá pelas atividades exemplificativas dos agentes químicos (art. 287, § 4º, da IN 128/2022), com avaliação qualitativa (NR-15, Anexo 13 – hidrocarbonetos e outros compostos de carbono). Os componentes com limite de tolerância no Anexo 11 da NR-15 e o benzeno são avaliados como agentes próprios.';
  if (grupo === 'sintetico') return 'O produto é de base sintética ou vegetal, e não óleo mineral; sem componente do Anexo IV, não é enquadrável a partir de 06/03/1997.';
  return '';
}

// classificação para o quadro de características (coluna "Limites e classificação")
export function classificacaoDoGrupo(grupo, ip346 = '') {
  if (grupo !== 'oleoMineral') return '';
  if (ip346 === IP346[0]) return 'Óleo altamente refinado (IP 346 < 3 %): IARC Grupo 3; não integra a LINACH';
  if (ip346 === IP346[1]) return 'Óleo não tratado ou pouco tratado: LINACH Grupo 1 e IARC Grupo 1 (sem CAS único)';
  return '[[IP 346 não informado: conferir na FDS – LINACH Grupo 1 só para óleo não tratado ou pouco tratado]]';
}
