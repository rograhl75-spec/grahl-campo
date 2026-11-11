// Penosidade de motorista / cobrador (previdenciário)
// - até 28/04/1995: enquadramento por categoria profissional (Decreto 53.831/1964, cód. 2.4.4;
//   Decreto 83.080/1979, Anexo II, cód. 2.4.2);
// - depois da Lei 9.032/1995: STJ, Tema 1307 – penosidade reconhecível se comprovada, por perícia
//   técnica individualizada, a exposição habitual e permanente a condições concretas de desgaste à saúde.
// O documento apresenta a avaliação técnica dos fatores de desgaste; o enquadramento é do Juízo.
import { dataBR, postosDoPeriodo, nomeCurto } from './base.js';
import { comJurisprudencia } from './fontes.js';
import { num } from '../paradigmas.js';
import { fmt } from '../calc.js';
import { valores } from './conclusao.js';

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

// ruído e vibração do vínculo: medição do veículo avaliado ou paradigma (mesma base da conclusão)
function agentesFisicos(r, dados) {
  const val = valores(r, dados);
  const out = [];
  if (isFinite(val.nen) || isFinite(val.lavg)) out.push(`ruído ${isFinite(val.nen) ? `NEN ${fmt(val.nen, 1)}` : `Lavg ${fmt(val.lavg, 1)}`} dB(A)`);
  if (isFinite(val.aren)) out.push(`vibração de corpo inteiro aren ${fmt(val.aren, 2)} m/s²${isFinite(val.vdv) ? ` e VDVR ${fmt(val.vdv, 2)} m/s^1,75` : ''}`);
  if (!out.length) return '';
  const fonte = [...new Set([val.fonteR, val.fonteV].filter(Boolean))].join(' / ');
  return `${out.join('; ')}${fonte ? ` (${fonte})` : ''}`;
}

// Informações já coletadas na diligência e nos autos, por vínculo (o que foi digitado no vínculo prevalece)
function frases(t) {
  return String(t || '').split(/(?<=[.;])\s+|\n+/).map((f) => f.trim().replace(/[.;]$/, '')).filter(Boolean);
}
export function coletado(r, dados) {
  const ps = postosDoPeriodo(r, dados);
  const fontesTxt = [r.data.atividades, ...ps.flatMap((p) => [p.data.infoTrabalhador, p.data.jornada, p.data.descricao, p.data.epc])];
  const pool = fontesTxt.flatMap(frases);
  const usadas = new Set(); // cada frase entra em um fator só
  const pega = (re, max = 3, reusa = false) => {
    const l = [...new Set(pool.filter((f) => re.test(f) && (reusa || !usadas.has(f))))].slice(0, max);
    l.forEach((f) => usadas.add(f));
    return l.join('; ');
  };
  const out = {};
  const put = (k, val) => { if (!v(r.data[k]) && v(val)) out[k] = val; };
  put('tipoTransporte', pega(/transport|bobina|carga|celulose|gr[ãa]os|min[ée]rio|mdf|passageir/i, 2));
  put('jornadaSemanal', pega(/h\/dia|horas|jornada|hora extra/i, 2));
  put('noturnoPernoite', pega(/pernoit|noturn|madrugada|dormia|viagens? de .* dias/i, 2));
  put('cargaDescarga', pega(/descarg|carga e descarga|enlon|amarra|lona|troca de pneu/i, 3));
  put('vias', pega(/rodovias?\b|destinos?|rotas?|estradas?|asfalt|interestad|intermunic|\bBR-?\d|\b[A-Z]{2}\b.*\b[A-Z]{2}\b/, 3, true));
  put('cabine', pega(/cabine|ar-condicionado|ar condicionado|assento|c[âa]mbio|suspens/i, 3));
  put('riscoAcidente', pega(/acidente|assalt|roubo|perigos/i, 2));
  put('pausas', pega(/pausa|parad[ao]s? |sem parar|direto,? sem/i, 2));
  put('fisiologicas', pega(/banheiro|sanit[áa]ri|necessidades|refei[çc]|alimenta[çc]/i, 2));
  put('pressao', pega(/prazo|metas?\b|entrega|por produ|comiss|frete/i, 2));
  if (!v(r.data.conducaoH)) {
    const h = pool.join(' ').match(/(\d{1,2})\s*h\/dia/i);
    if (h) { out.conducaoH = h[1]; out.conducaoBase = out.conducaoBase || 'informado pelo autor na diligência'; }
  }
  if (ps.length) out.veiculosAvaliados = ps.map((p) => nomeCurto(p.data.nome)).join('; ');
  return out;
}

// ---------------------------------------------------------------------------------------------
// Matriz de avaliação da penosidade – parâmetros do IAC nº 5 do TRF4 (veículo, trajetos, jornadas),
// acrescida da análise das cargas no transporte rodoviário de cargas. Base: entrevista do autor,
// vistoria do veículo e medições; sem remissão a limites de jornada da CLT ou do CTB.
// ---------------------------------------------------------------------------------------------
const RE_CAB = /sem ar|sem climatiz|manual|mec[âa]nic|desconfort|calor|dur[oa]|r[ií]gid|antig|sem suspens|bancos? fix|motor (dianteiro|junto|ao lado)/i;
const RE_VIA = /rodovi|interestad|intermunic|estrada|terra|sem pavim|buraco|serra|urban|tr[âa]nsito|ch[ãa]o|cascalh/i;
const RE_RISCO = /assalt|roubo|acidente|perig|viol[êe]ncia|inflam|combust|vidas?|passageir|valor/i;
const RE_CARGA = /descarg|carreg|enlon|amarra|lona|pneu|bobina|gr[ãa]os|carga/i;
const RE_PERN = /pernoit|noturn|madrugada|dormia|cabine.*dorm|dias fora|semanas? fora|viagens? de/i;

// maior tempo diário de trabalho informado (condução ou jornada total)
export function horasDia(r, dados) {
  const x = { ...r.data, ...coletado(r, dados) };
  const hs = [num(x.conducaoH), ...[...String(`${x.jornadaSemanal || ''} ${x.pausas || ''}`).matchAll(/(\d{1,2})\s*h(?:oras)?\s*(?:\/|por|ao|diárias)\s*(?:dia)?/gi)].map((m) => Number(m[1]))]
    .filter((h) => isFinite(h) && h > 0 && h <= 24);
  return hs.length ? Math.max(...hs) : NaN;
}
// a frase conta como fator adverso só se não for negativa ("sem acidentes", "não fazia carga")
const adv = (re, t) => String(t || '').split(/;\s*|\.\s+/).some((f) => re.test(f) && !/^\s*(sem|n[ãa]o|nunca|nenhum)/i.test(f));
const UFS = /\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/g;
const interestadual = (t) => new Set(String(t || '').match(UFS) || []).size >= 2;

// condições apuradas por critério + sinalização de desgaste (adverso) para a conclusão
export function matrizIAC(r, dados) {
  const x = { ...r.data, ...coletado(r, dados) };
  const T = horasDia(r, dados);
  const hTxt = isFinite(T) ? String(T).replace('.', ',') : '';
  const Tc = num(x.conducaoH);
  const cTxt = isFinite(Tc) ? String(Tc).replace('.', ',') : hTxt;
  const veic = [x.veiculoTipo, x.veiculoMarca, x.veiculoModelo, x.veiculoAno].filter(Boolean).join(' ') || x.veiculosAvaliados || '';
  const fis = agentesFisicos(r, dados);
  // sem informação apurada, o app só SUGERE (deduzido da jornada); sai marcado para o perito confirmar ou apagar
  const pressaoSug = !v(x.pressao) && T >= 12;
  const pausasSug = !v(x.pausas) && T >= 10;
  const pressao = v(x.pressao) || (pressaoSug ? `[[sugestão do app – confirmar: jornada de cerca de ${hTxt} h/dia, que pode indicar pressão de prazos e metas de entrega]]` : '');
  const pausas = v(x.pausas) || (pausasSug ? `[[sugestão do app – confirmar: condução prolongada ao longo de jornada de cerca de ${hTxt} h/dia]]` : '');
  const L = (rot, t) => (v(t) ? `${rot}: ${v(t)}` : '');
  const criterios = [
    { id: 'veiculo', titulo: '1. Análise do veículo',
      oque: 'Idade e modelo da frota; câmbio, embreagem, direção, assento e climatização; esforço físico, desconforto térmico, movimentos repetitivos e desgaste osteomuscular; ruído, vibração e calor do motor.',
      linhas: [L('Veículo', veic), L('Cabine e conforto', x.cabine), L('Agentes físicos medidos (mesmo abaixo dos limites)', fis)].filter(Boolean),
      adverso: adv(RE_CAB, x.cabine) || !!fis,
      fonte: fis ? 'Entrevista do autor; vistoria e medições no veículo' : 'Entrevista do autor; vistoria' },
    { id: 'trajetos', titulo: '2. Análise dos trajetos',
      oque: 'Rotas urbanas de trânsito intenso ou rodovias e vias em más condições ou sem pavimentação; localidades de risco de assaltos e violência; estado de alerta e tensão constantes.',
      linhas: [L('Vias e trajetos', x.vias), interestadual(x.vias) && 'Rotas interestaduais de longa distância, com exigência de alerta constante', L('Risco de acidentes e de violência', x.riscoAcidente)].filter(Boolean),
      adverso: adv(RE_VIA, x.vias) || interestadual(x.vias) || adv(RE_RISCO, x.riscoAcidente),
      fonte: 'Entrevista do autor' },
    { id: 'cargas', titulo: '3. Análise das cargas',
      oque: 'Responsabilidade pela carga de valor ou por vidas humanas; carga, descarga, amarração e enlonamento; metas logísticas; risco de acidente e de roubo de carga.',
      linhas: [L('Tipo de transporte', x.tipoTransporte), L('Carga, descarga e esperas', x.cargaDescarga), L('Prazos e metas', pressao)].filter(Boolean),
      adverso: adv(RE_CARGA, x.cargaDescarga) || adv(RE_RISCO, x.tipoTransporte) || !!pressao,
      fonte: pressaoSug ? 'Entrevista do autor; [[prazos e metas deduzidos da jornada – confirmar]]' : 'Entrevista do autor' },
    { id: 'jornadas', titulo: '4. Análise das jornadas',
      oque: 'Horários rígidos ou viagens extenuantes que impedem a recuperação; privação de sono; dificuldade de acesso a sanitários, alimentação e locais de descanso.',
      linhas: [L('Tempo diário de condução', cTxt && `cerca de ${cTxt} h/dia${x.conducaoBase ? ` (${x.conducaoBase})` : ''}`), L('Jornada e horas extras', x.jornadaSemanal),
        L('Direção contínua e pausas', pausas), L('Trabalho noturno e pernoites', x.noturnoPernoite), L('Sanitários, alimentação e descanso', x.fisiologicas)].filter(Boolean),
      adverso: T >= 10 || adv(RE_PERN, x.noturnoPernoite) || /sem acesso|dif[ií]cil|n[ãa]o (havia|tinha)|precária/i.test(x.fisiologicas || ''),
      fonte: pausasSug ? 'Entrevista do autor; [[pausas deduzidas da jornada – confirmar]]' : 'Entrevista do autor' },
  ];
  const nAdv = criterios.filter((c) => c.adverso).length;
  const comDados = criterios.filter((c) => c.linhas.length).length;
  let conclusao = v(x.penosidadeConclusao);
  let penoso = conclusao ? !/n[ãa]o (h[áa]|caracteriz|se caracteriz)/i.test(conclusao) : null;
  let sugerida = false;
  if (!conclusao && comDados >= 2) {
    sugerida = true;
    penoso = nAdv >= 3;
    const adv = criterios.filter((c) => c.adverso).map((c) => c.titulo.replace(/^\d\. Análise d[oa]s? /, ''));
    conclusao = penoso
      ? `Pela convergência cumulativa dos fatores de desgaste apurados (${adv.join(', ')}), na matriz de fatores adotada nesta perícia, a atividade foi exercida em condições excepcionalmente penosas, com exposição habitual e permanente a condições concretas de desgaste físico e mental à saúde.`
      : `Os fatores apurados (${adv.join(', ') || 'nenhum adverso'}) não convergem de forma suficiente para caracterizar, na matriz de fatores adotada nesta perícia, trabalho excepcionalmente penoso.`;
  }
  // conclusão calculada pelo app (contagem de fatores): é proposta, não juízo técnico – sai marcada para revisão
  if (sugerida) conclusao = `[[Proposta do app pela contagem de fatores – confirmar ou redigir no campo "Conclusão técnica da penosidade" do vínculo:]] ${conclusao}`;
  return { criterios, conclusao, penoso, T, sugerida };
}

// numero/nivel: posição do item no documento; tipo: 'laudo' | 'parecer' | 'ltcat'
export function secaoPenosidade(d, dados, { numero = '', nivel = 'h2', tipo = 'laudo' } = {}) {
  if (!avaliaPenosidade(dados)) return false;
  const vs = vinculosMotorista(dados);
  const jur = comJurisprudencia(dados);
  const quem = tipo === 'parecer' ? 'este Assistente Técnico' : tipo === 'ltcat' ? 'este Engenheiro de Segurança do Trabalho' : 'este Perito';
  d[nivel](numero, jur ? 'Condições especiais por penosidade (critério jurisprudencial – STJ, Tema 1307; TRF4, IAC nº 5 e nº 12)' : 'Condições especiais por penosidade (perícia individualizada)');
  d.texto('Até 28/04/1995, a atividade de motorista de ônibus e de caminhão enquadra-se por categoria profissional (Decreto nº 53.831/1964, Quadro Anexo, cód. 2.4.4; Decreto nº 83.080/1979, Anexo II, cód. 2.4.2, para ocupação em caráter permanente). A partir de 29/04/1995 (Lei nº 9.032/1995), exige-se a comprovação da exposição a agentes nocivos (art. 57, §§ 3º e 4º, da Lei nº 8.213/1991), e a penosidade não consta do Anexo IV dos Decretos 2.172/1997 e 3.048/1999; só pode ser reconhecida em juízo, mediante perícia técnica individualizada que demonstre a exposição habitual e permanente a condições concretas de desgaste à saúde'
    + (jur ? ' (STJ, Tema 1307).' : '.'));
  d.texto(`A penosidade das categorias de transporte não se confunde com a insalubridade: não decorre de um agente que supere um limite de tolerância, mas da conjunção de estressores físicos e mentais que, somados e mantidos ao longo da jornada, impõem desgaste excepcional ao trabalhador. Por isso, ${quem} analisa o veículo efetivamente conduzido, os trajetos e as jornadas e, no transporte rodoviário de cargas, as cargas${jur ? ' – roteiro que acompanha o Incidente de Assunção de Competência nº 5 do Tribunal Regional Federal da 4ª Região (IAC 5033888-90.2018.4.04.0000), estendido ao motorista de caminhão pelo IAC nº 12 (5042327-85.2021.4.04.0000)' : ''}. Os limites quantitativos de ruído e de vibração são dispensados nesta análise: os valores medidos entram como um dos estressores, mesmo quando abaixo dos limites de tolerância.`);
  d.texto('As condições de cada critério foram apuradas na entrevista do autor, na vistoria do veículo e nas medições da diligência.');
  if (tipo === 'ltcat') d.texto('A penosidade não é agente nocivo do Anexo IV do RPS e não é informada no PPP nem altera o código GFIP: este item destina-se à prova em juízo.');

  d.quadro('Critérios da penosidade por período', [['Período', 'Critério'],
    ['Até 28/04/1995', 'Categoria profissional: motoristas e cobradores de ônibus e motoristas e ajudantes de caminhão (cód. 2.4.4 do Decreto 53.831/1964); motorista de ônibus e de caminhões de cargas, ocupado em caráter permanente (cód. 2.4.2 do Anexo II do Decreto 83.080/1979). Basta a prova da função (CTPS, registro de empregado).'],
    ['A partir de 29/04/1995', `Penosidade comprovada por perícia técnica individualizada, com análise do veículo, dos trajetos, das cargas e das jornadas${jur ? '; STJ, Tema 1307 (REsp 2.164.724); TRF4, IAC nº 5 e nº 12' : ''}; não basta o enquadramento presumido pela categoria.`]],
  { larguras: [0.22, 0.78], alinhar: 'left', fonte: 'Elaborado pelo signatário.' });

  if (!vs.length) {
    d.redigir('identificar os vínculos como motorista e preencher os fatores de penosidade do vínculo (etapa 2).');
    return true;
  }
  const mats = vs.map((r) => ({ r, m: matrizIAC(r, dados) }));
  for (const { r, m } of mats) {
    d.quadro(`Matriz de avaliação de penosidade – ${nome(r, dados)} (${periodo(r)})`, [['Critério', 'Condição apurada', 'Fonte'],
      ...m.criterios.map((c) => [c.titulo, c.linhas.length ? c.linhas.join('\n') : `[[${c.oque}]]`, c.linhas.length ? c.fonte : 'Entrevista do autor']),
      ['Conclusão técnica do vínculo', m.conclusao || '[[poucos fatores informados – complete os campos de penosidade do vínculo na etapa 2]]', 'Perícia individualizada']],
    { larguras: [0.22, 0.56, 0.22], tam: 9, alinhar: 'left', fonte: 'Elaborado pelo signatário com base na entrevista do autor, na vistoria do veículo e nas medições da diligência.' });
  }
  d.texto('**Conclusão metodológica da penosidade.** Os critérios acima não são avaliados isoladamente. A convergência cumulativa da condução de veículo com desconforto e agentes físicos, dos trajetos que exigem alerta constante, da responsabilidade e do manuseio da carga e de jornadas extenuantes, que impedem a recuperação física e mental, caracteriza o trabalho excepcionalmente penoso; a ausência de convergência afasta a caracterização.');
  d.quadro('Síntese da penosidade por vínculo', [['Vínculo', 'Período', 'Até 28/04/1995', 'A partir de 29/04/1995'],
    ...mats.map(({ r, m }) => {
      const ini = r.data.inicio || '';
      const ate95 = ini && ini <= '1995-04-28' ? 'Categoria profissional (cód. 2.4.4 / 2.4.2), comprovada a função de motorista' : '—';
      const fim = r.data.fim || '9999-12-31';
      const pos = fim >= '1995-04-29' ? (m.penoso === true ? 'Penosidade caracterizada' : m.penoso === false ? 'Penosidade não caracterizada' : '[[complete os fatores do vínculo]]') : '—';
      return [nome(r, dados), periodo(r), ate95, pos];
    })],
  { larguras: [0.26, 0.22, 0.26, 0.26], tam: 9, alinhar: 'left', fonte: 'Elaborado pelo signatário.' });
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
  ['pressao', 'Pressão de prazos, metas, remuneração por produção (vazio: deduzido de jornada ≥ 12 h/dia)', 'text'],
  ['fisiologicas', 'Acesso a sanitários, alimentação e descanso durante a jornada', 'text'],
  ['penosidadeConclusao', 'Conclusão técnica da penosidade (vazio: o app propõe uma conclusão pela contagem de fatores da matriz, marcada para conferir)', 'area'],
];
