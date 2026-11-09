// Penosidade de motorista / cobrador (previdenciário)
// - até 28/04/1995: enquadramento por categoria profissional (Decreto 53.831/1964, cód. 2.4.4;
//   Decreto 83.080/1979, Anexo II, cód. 2.4.2);
// - depois da Lei 9.032/1995: STJ, Tema 1307 – penosidade reconhecível se comprovada, por perícia
//   técnica individualizada, a exposição habitual e permanente a condições concretas de desgaste à saúde.
// O documento apresenta a avaliação técnica dos fatores de desgaste; o enquadramento é do Juízo.
import { dataBR, postosDoPeriodo, nomeCurto } from './base.js';
import { comJurisprudencia } from './fontes.js';
import { nenParaJornada, arenParaJornada, num } from '../paradigmas.js';

const RE_MOT = /motorista|caminh|carreteir|cobrador|ônibus|onibus|truck|carreta|bitrem|rodotrem|condutor/i;
const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
const f1 = (x) => (isFinite(x) ? x.toFixed(1).replace('.', ',') : '');

export function vinculosMotorista(dados) {
  return dados.periodos.filter((r) => r.data.penosidade !== 'Não'
    && (r.data.penosidade === 'Sim' || RE_MOT.test(`${r.data.cargo || ''} ${r.data.atividades || ''} ${r.data.veiculoTipo || ''}`)
      || r.data.paradigmaRuido || r.data.paradigmaVibracao));
}

export function avaliaPenosidade(dados) {
  if (dados.c.penosidade === 'Não') return false;
  if (dados.c.penosidade === 'Sim') return true;
  return vinculosMotorista(dados).length > 0 || RE_MOT.test(dados.c.funcoes || '');
}

const periodo = (r) => `${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`;
const nome = (r, dados) => `V${dados.periodos.indexOf(r) + 1} – ${r.data.empresa || ''}`.trim();

function agentesFisicos(r, dados) {
  const T = num(r.data.conducaoH);
  const out = [];
  const pr = dados.paradigmas && dados.paradigmas.get(r.data.paradigmaRuido);
  const pv = dados.paradigmas && dados.paradigmas.get(r.data.paradigmaVibracao);
  if (pr && isFinite(T)) out.push(`ruído: NEN ${f1(nenParaJornada(pr.data.lavg, T))} dB(A) para ${r.data.conducaoH} h (paradigma ${pr.data.codigo})`);
  if (pv && isFinite(T)) out.push(`VCI: aren ${(arenParaJornada(pv.data.arep || pv.data.arenLaudo, T) || 0).toFixed(2).replace('.', ',')} m/s² (paradigma ${pv.data.codigo})`);
  return out.join('; ');
}

// Informações já coletadas na diligência e nos autos, por vínculo (o que foi digitado no vínculo prevalece)
function frases(t) {
  return String(t || '').split(/(?<=[.;])\s+|\n+/).map((f) => f.trim().replace(/[.;]$/, '')).filter(Boolean);
}
function coletado(r, dados) {
  const ps = postosDoPeriodo(r, dados);
  const fontesTxt = [r.data.atividades, ...ps.flatMap((p) => [p.data.infoTrabalhador, p.data.jornada, p.data.descricao, p.data.epc])];
  const pool = fontesTxt.flatMap(frases);
  const pega = (re, max = 3) => [...new Set(pool.filter((f) => re.test(f)))].slice(0, max).join('; ');
  const out = {};
  const put = (k, val) => { if (!v(r.data[k]) && v(val)) out[k] = val; };
  put('tipoTransporte', pega(/transport|bobina|carga|celulose|gr[ãa]os|min[ée]rio|mdf|passageir/i, 2));
  put('jornadaSemanal', pega(/h\/dia|horas|jornada|hora extra/i, 2));
  put('noturnoPernoite', pega(/pernoit|noturn|madrugada|dormia|viagens? de .* dias/i, 2));
  put('cargaDescarga', pega(/descarg|carga e descarga|enlon|amarra|lona|troca de pneu/i, 3));
  put('vias', pega(/rodovi|destinos?|rotas?|estrada|asfalt|interestad|intermunic/i, 3));
  put('cabine', pega(/cabine|ar-condicionado|ar condicionado|assento|c[âa]mbio|suspens/i, 3));
  put('riscoAcidente', pega(/acidente|assalt|roubo|perigos/i, 2));
  if (!v(r.data.conducaoH)) {
    const h = pool.join(' ').match(/(\d{1,2})\s*h\/dia/i);
    if (h) { out.conducaoH = h[1]; out.conducaoBase = out.conducaoBase || 'informado pelo autor na diligência'; }
  }
  if (ps.length) out.veiculosAvaliados = ps.map((p) => nomeCurto(p.data.nome)).join('; ');
  return out;
}

// numero/nivel: posição do item no documento; tipo: 'laudo' | 'parecer' | 'ltcat'
export function secaoPenosidade(d, dados, { numero = '', nivel = 'h2', tipo = 'laudo' } = {}) {
  if (!avaliaPenosidade(dados)) return false;
  const vs = vinculosMotorista(dados);
  const jur = comJurisprudencia(dados);
  d[nivel](numero, 'Condições de penosidade da atividade de motorista');
  d.texto('Até 28/04/1995, a atividade de motorista de ônibus e de caminhão enquadra-se por categoria profissional (Decreto nº 53.831/1964, Quadro Anexo, cód. 2.4.4; Decreto nº 83.080/1979, Anexo II, cód. 2.4.2, para ocupação em caráter permanente). A partir de 29/04/1995 (Lei nº 9.032/1995), a penosidade não consta do Anexo IV do Regulamento da Previdência Social e só pode ser reconhecida em juízo, mediante perícia técnica individualizada que demonstre a exposição habitual e permanente a condições concretas de desgaste à saúde'
    + (jur ? ' (STJ, Tema 1307).' : '.'));
  d.texto('Este item avalia, para cada vínculo, os fatores concretos de desgaste físico e mental e de risco de acidentes. A avaliação é técnica e independente da caracterização dos agentes nocivos do item anterior; o enquadramento cabe ao Juízo.');
  if (tipo === 'ltcat') {
    d.texto('A penosidade não é agente nocivo do Anexo IV do RPS e não é informada no PPP nem altera o código GFIP: este item destina-se à prova em juízo.');
  }

  d.quadro('Critérios da penosidade por período', [['Período', 'Critério'],
    ['Até 28/04/1995', 'Categoria profissional: motorista de ônibus ou de caminhão de cargas, em caráter permanente (cód. 2.4.4 do Decreto 53.831/1964; cód. 2.4.2 do Anexo II do Decreto 83.080/1979). Basta a prova da função (CTPS, registro de empregado).'],
    ['A partir de 29/04/1995', `Exposição habitual e permanente a condições concretas de desgaste à saúde, comprovada por perícia técnica individualizada${jur ? ' (STJ, Tema 1307, REsp 2.164.724)' : ''}; não basta o enquadramento presumido pela categoria.`]],
  { larguras: [0.22, 0.78], alinhar: 'left', fonte: 'Elaborado pelo autor.' });

  if (!vs.length) {
    d.redigir('identificar os vínculos como motorista e avaliar os fatores do quadro de penosidade.');
    return true;
  }
  const linha = (rot, val, fonte) => [rot, v(val) || '[[preencher]]', fonte];
  for (const r of vs) {
    const x = { ...r.data, ...coletado(r, dados) };
    const veic = [x.veiculoTipo, x.veiculoMarca, x.veiculoModelo, x.veiculoAno].filter(Boolean).join(' ');
    d.quadro(`Fatores de penosidade – ${nome(r, dados)} (${periodo(r)})`, [['Fator', 'Condição apurada', 'Fonte / parâmetro'],
      linha('Veículo e tipo de transporte', [veic || x.veiculosAvaliados, x.tipoTransporte].filter(Boolean).join(' – '), 'CTPS, PPP, entrevista, veículo avaliado'),
      linha('Tempo diário de condução', x.conducaoH && `${String(x.conducaoH).replace('.', ',')} h – ${x.conducaoBase || 'base a informar'}`, 'CLT, art. 235-C (jornada de 8 h + até 2 h extras, ou 4 h por convenção)'),
      linha('Jornada semanal e horas extras habituais', x.jornadaSemanal, 'Registros de jornada, tacógrafo, rastreador'),
      linha('Direção contínua sem pausa e descansos', x.pausas, 'CTB, art. 67-C (tempo máximo de direção contínua e descansos)'),
      linha('Trabalho noturno, turnos irregulares e pernoites fora', x.noturnoPernoite, 'Entrevista, diários de bordo'),
      linha('Tempo de espera, carga e descarga, amarração e lona', x.cargaDescarga, 'Entrevista, descrição da função'),
      linha('Condições das vias e trajetos', x.vias, 'Rotas, tipo de pavimento, extensão'),
      linha('Cabine, assento e conforto térmico', x.cabine, 'Vistoria / paradigma (suspensão, ar-condicionado)'),
      linha('Ruído e vibração (mesmo abaixo dos limites)', agentesFisicos(r, dados) || x.agentesFisicos, 'Item de avaliação dos agentes'),
      linha('Risco de acidentes e de violência (carga perigosa, roubo)', x.riscoAcidente, 'Tipo de carga, rotas, ocorrências'),
      linha('Pressão de prazos, metas e remuneração por produção', x.pressao, 'Contrato, entrevista'),
      ['Conclusão técnica do vínculo', x.penosidadeConclusao ? x.penosidadeConclusao : '[[Há / não há exposição habitual e permanente a condições concretas de desgaste à saúde – fundamentar]]', 'Perícia individualizada']],
    { larguras: [0.27, 0.45, 0.28], tam: 9, fonte: 'Elaborado pelo autor com base na diligência, na entrevista e nos documentos dos autos (PPP e descrição das atividades).' });
  }
  d.quadro('Síntese da penosidade por vínculo', [['Vínculo', 'Período', 'Até 28/04/1995', 'A partir de 29/04/1995'],
    ...vs.map((r) => {
      const ini = r.data.inicio || '';
      const ate95 = ini && ini <= '1995-04-28' ? 'Categoria profissional – [[função comprovada?]]' : '—';
      const fim = r.data.fim || '9999-12-31';
      const pos = fim >= '1995-04-29' ? (r.data.penosidadeConclusao ? r.data.penosidadeConclusao.split(/[.;\n]/)[0] : '[[desgaste concreto: SIM / NÃO]]') : '—';
      return [nome(r, dados), periodo(r), ate95, pos];
    })],
  { larguras: [0.26, 0.22, 0.26, 0.26], tam: 9, alinhar: 'left', fonte: 'Elaborado pelo autor.' });
  return true;
}

export const CAMPOS_PENOSIDADE = [
  ['penosidade', 'Avaliar penosidade neste vínculo?', 'select', ['Automático (motorista)', 'Sim', 'Não']],
  ['tipoTransporte', 'Tipo de transporte (ex.: carga seca rodoviária, grãos, combustível, passageiros urbano)', 'text'],
  ['jornadaSemanal', 'Jornada semanal e horas extras habituais', 'text'],
  ['pausas', 'Direção contínua e pausas (ex.: 6 h seguidas sem pausa)', 'text'],
  ['noturnoPernoite', 'Trabalho noturno, turnos irregulares, pernoites fora', 'text'],
  ['cargaDescarga', 'Espera, carga/descarga, amarração, lona', 'text'],
  ['vias', 'Vias e trajetos (pavimento, estrada de terra, serra, extensão)', 'text'],
  ['cabine', 'Cabine, assento e conforto térmico', 'text'],
  ['riscoAcidente', 'Risco de acidente e violência (carga perigosa, roubo, ocorrências)', 'text'],
  ['pressao', 'Pressão de prazos, metas, remuneração por produção', 'text'],
  ['penosidadeConclusao', 'Conclusão técnica da penosidade neste vínculo', 'area'],
];
