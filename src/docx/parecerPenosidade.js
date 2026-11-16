// ======================================================================
// PARECER TÉCNICO DE CONDIÇÕES DE TRABALHO E PENOSIDADE (motorista) – extrajudicial
// Para o segurado ou o advogado: instrui requerimento ao INSS, revisão ou ação de aposentadoria especial.
// Estrutura do padrão do signatário (quadro de identificação, metodologia por similaridade, marco legal,
// um quadro por vínculo, matriz sintética, conclusão e encerramento com a ART); os valores, a fonte da
// prova e o enquadramento por subperíodo são calculados pelo app – nada é digitado no texto.
// ======================================================================
import {
  carregar, finalizar, dataBR, credencial, capaTecnica, blocoAssinatura, quadroFormaEnquadramento, quadroCriteriosRuido,
  quadroCriteriosVibracao, quadrosParadigmasMetodologia, memoriasParadigmas, quadroPeriodos, figurasDoCaso, apendicesDoCaso,
  textoIntegram, inserirApendices, quadroEquipamentos, equipamentosUsados,
} from './base.js';
import { Doc } from './ooxml.js';
import { avaliarPeriodos, valores, conclusaoPrevidenciaria } from './conclusao.js';
import { matrizIAC } from './penosidade.js';
import { comJurisprudencia, registroJurisprudencia, secaoReferencias } from './fontes.js';
import { contratanteDe } from './modelos.js';
import { rotuloParadigma } from '../paradigmas.js';
import { fmt } from '../calc.js';

const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
const per = (r) => `${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`;
const veiculo = (r) => [r.data.veiculoTipo, r.data.veiculoMarca, r.data.veiculoModelo, r.data.veiculoAno].map(v).filter(Boolean).join(' ');
const EC103 = '2019-11-13';
const fimOuHoje = (r) => r.data.fim || '9999-12-31';

// fonte da prova: paradigma do banco (com processo, vara e data) ou medição do próprio veículo/posto
function fontesDaProva(r, dados, val) {
  const P = dados.paradigmas;
  const out = [];
  for (const [rot, cod] of [['Ruído', r.data.paradigmaRuido], ['Vibração', r.data.paradigmaVibracao]]) {
    if (!v(cod)) continue;
    const p = P.get(cod);
    out.push(p ? `${rot}: paradigma ${rotuloParadigma(p)} – ${v(p.data.citacao) || '[[citação do paradigma]]'}` : `${rot}: paradigma ${cod} [[não encontrado no banco]]`);
  }
  if (!out.length && (val.fonteR || val.fonteV)) out.push([val.fonteR && `Ruído: medição no veículo/posto ${val.fonteR}`, val.fonteV && `Vibração: medição em ${val.fonteV}`].filter(Boolean).join('\n'));
  return out.join('\n');
}

const textoItens = (segs, filtro) => segs.flatMap((s) => s.itens.filter(filtro).map((i) => `${dataBR(s.ini)} a ${dataBR(s.fim)}: ${i.t.replace(/^(Ruído|VCI): /, '')}`)).join('\n');

function penosidadeDoVinculo(r, dados, m) {
  if (r.data.fim && r.data.fim <= '1995-04-28') return 'Vínculo encerrado até 28/04/1995: enquadramento por categoria profissional, sem necessidade da análise de penosidade.';
  // cada critério com os fatos da entrevista, mantendo o rótulo de cada item (ex.: "Assalto / roubo de carga no vínculo: …")
  // itens já mostrados nas linhas anteriores do quadro (veículo, carga, trajetos, jornada) não se repetem aqui
  const JA = /^(Veículo|Grupo do veículo|Carroceria \/ reboque|Tipo de carga|Vias e trajetos|Tempo diário de condução|Jornada e horas extras|Trabalho noturno e pernoites):/;
  const fatos = m.criterios.map((c) => [c, c.linhas.filter((l) => !JA.test(l))]).filter(([, ls]) => ls.length)
    .map(([c, ls]) => `${c.titulo.replace(/^\d\. Análise d[oa]s? /, '').replace(/^./, (k) => k.toUpperCase())} – ${ls.join('; ')}`);
  const algum = m.criterios.some((c) => c.linhas.length);
  return [fatos.join('.\n') || (algum ? 'Fatores descritos nas linhas anteriores deste quadro.' : '') || '[[preencher a entrevista do vínculo (etapa 2 → vínculo → Entrevista do motorista e Penosidade)]]', m.conclusao].filter(Boolean).join('\n');
}

function enquadramentoDoVinculo(r, segs, m) {
  const linhas = segs.map((s) => `${dataBR(s.ini)} a ${dataBR(s.fim)}: ${s.caracteriza === 'SIM' ? `especial (cód. ${s.codigos})` : s.caracteriza === 'NÃO' ? 'não especial pelos agentes avaliados' : s.caracteriza}`);
  if (fimOuHoje(r) > '1995-04-28') linhas.push(`Penosidade a partir de 29/04/1995: ${m.penoso === true ? 'condições penosas caracterizadas na matriz' : m.penoso === false ? 'não caracterizada na matriz' : '[[completar a entrevista]]'}${m.sugerida ? ' [[proposta do app – confirmar]]' : ''}`);
  if (fimOuHoje(r) > EC103) linhas.push('Após 13/11/2019: sem conversão do tempo especial em comum (EC 103/2019, art. 25, § 2º).');
  return linhas.join('\n');
}

export async function parecerPenosidade(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const jur = comJurisprudencia(dados);
  const d = new Doc();
  const ps = dados.periodos;
  const ini = ps.map((r) => r.data.inicio).filter(Boolean).sort()[0];
  const abertos = ps.some((r) => !r.data.fim);
  const fim = ps.map((r) => r.data.fim).filter(Boolean).sort().pop();
  const atividade = v(c.funcoes).split('\n')[0] || 'Motorista profissional';

  capaTecnica(d, {
    titulo: 'PARECER TÉCNICO DE CONDIÇÕES DE TRABALHO E PENOSIDADE',
    subtitulo: 'Exposição a agentes nocivos e critérios de penosidade (IAC nº 5 do TRF4)',
    linha2: v(c.finalidade) && c.finalidade !== 'Outra' ? c.finalidade : 'Subsídio técnico para aposentadoria especial', perfil,
    pares: [
      ['Segurado requerente', [c.autorNome, c.autorCpf && `CPF / NIT ${c.autorCpf}`, c.autorNascimento && `nascimento em ${dataBR(c.autorNascimento)}`].filter(Boolean).join(' – ')],
      ['Atividade', atividade],
      ['Períodos avaliados', ps.length ? `${dataBR(ini)} a ${abertos ? 'atual' : dataBR(fim)} – ${ps.length} ${ps.length === 1 ? 'vínculo' : 'vínculos'}` : '[[cadastrar os vínculos]]'],
      ['Contratante', contratanteDe(c)],
      ['Responsável técnico', `${perfil.nome} – ${perfil.titulos} – ${credencial(perfil)}`],
      ['ART', v(c.art) || '[[nº da ART]]'],
    ].filter(([, x]) => v(x)),
  });
  d.listaQuadros();
  d.sumario();

  // 1 Objetivo e metodologia
  d.h1('1', 'Objetivo e metodologia');
  d.texto(`Este parecer técnico de engenharia de segurança do trabalho avalia as condições de trabalho de ${c.autorNome || '[[segurado]]'} na função de ${atividade.toLowerCase()}: a exposição a agentes nocivos (ruído e vibração) e os fatores de penosidade de cada vínculo, para ${v(c.finalidade) && c.finalidade !== 'Outra' ? c.finalidade.replace(/^./, (k) => k.toLowerCase()) : 'subsidiar o pedido de aposentadoria especial'}. O enquadramento jurídico dos períodos cabe ao INSS ou ao Poder Judiciário; o documento fornece os parâmetros técnicos para essa decisão.`);
  d.h2('1.1', 'Avaliação por similaridade');
  d.texto('Os veículos conduzidos nos vínculos antigos foram desativados, vendidos ou substituídos. Por isso, o ruído e a vibração são quantificados por similaridade: medições realizadas pelo signatário, em perícias judiciais e em avaliações extrajudiciais, em veículos com as mesmas características técnicas dos conduzidos pelo segurado, normalizadas para o tempo diário de condução informado. A fonte de cada valor (processo, vara e data, ou avaliação extrajudicial) consta do quadro de cada vínculo e da memória de cálculo.');
  d.texto(jur
    ? 'O laudo não contemporâneo é apto à comprovação da atividade especial (TNU, Súmula 68) e, quando impossível a perícia no local de trabalho, admite-se a prova em empresa ou veículo similar (TRF4, Súmula 106). Na via administrativa, o INSS não aceita laudo de empresa diversa (IN PRES/INSS 128/2022, art. 277, parágrafo único): o parecer serve, nesse caso, para instruir o pedido de revisão ou a ação judicial.'
    : 'Na via administrativa, o INSS não aceita laudo de empresa diversa (IN PRES/INSS 128/2022, art. 277, parágrafo único): a avaliação por similaridade destina-se, nesse caso, a instruir o pedido de revisão ou a ação judicial.');
  if (!quadrosParadigmasMetodologia(d, dados)) quadroEquipamentos(d, equipamentosUsados(dados));
  d.h2('1.2', 'Critérios de penosidade');
  d.texto('A partir de 29/04/1995 (Lei nº 9.032/1995), a penosidade da atividade de motorista não consta do Anexo IV do Regulamento da Previdência Social e só pode ser reconhecida mediante perícia técnica individualizada que demonstre a exposição habitual e permanente a condições concretas de desgaste à saúde. Este parecer avalia, vínculo a vínculo, os fatores apurados na entrevista do segurado:');
  d.texto(['- Veículo: modelo e geração, cabine, climatização, câmbio e direção, motor junto à cabine, ruído e vibração (mesmo abaixo dos limites);',
    '- Trajetos: rodovias e vias em más condições, longas distâncias, trânsito urbano intenso, risco de acidentes e de assaltos;',
    '- Cargas: carga perecível, de valor ou perigosa, responsabilidade por passageiros, carga e descarga pelo motorista, prazos de entrega;',
    '- Jornadas: horas diárias de condução, pausas, pernoite na cabine, trabalho noturno e acesso a sanitários, alimentação e descanso.'].join('\n'));
  if (jur) d.texto('Esses critérios correspondem aos parâmetros fixados pelo TRF4 no IAC nº 5 (IAC 5033888-90.2018.4.04.0000), acrescidos da análise das cargas no transporte rodoviário de cargas (STJ, Tema 1307).');

  // 2 Marco legal
  d.h1('2', 'Marco legal por período (tempus regit actum)');
  d.texto('Aplica-se a legislação vigente em cada período de trabalho: até 28/04/1995, enquadramento por categoria profissional de motorista de ônibus ou de caminhão de cargas (cód. 2.4.4 do Decreto nº 53.831/1964 e cód. 2.4.2 do Anexo II do Decreto nº 83.080/1979); a partir de 29/04/1995, comprovação da efetiva exposição a agentes nocivos.');
  quadroFormaEnquadramento(d);
  quadroCriteriosRuido(d);
  quadroCriteriosVibracao(d);
  d.texto(jur
    ? 'Quanto ao ruído, a declaração de eficácia do protetor auricular não descaracteriza o tempo especial (STF, Tema 555 – ARE 664.335). Para os demais agentes, o EPI só é considerado a partir de 03/12/1998, com os requisitos do art. 291 da IN PRES/INSS 128/2022.'
    : 'O EPI só é considerado a partir de 03/12/1998, com os requisitos cumulativos do art. 291 da IN PRES/INSS 128/2022; sem registros de fornecimento, não se considera neutralizada a exposição.');
  d.texto('Após 13/11/2019 (Emenda Constitucional nº 103/2019, art. 25, § 2º), o tempo especial não é mais convertido em tempo comum; para a aposentadoria especial, aplicam-se as regras da emenda.');
  registroJurisprudencia(d, dados, { numero: '2.1', nivel: 'h2', prev: true, tipo: 'parecer' });

  // 3 Vínculos
  d.h1('3', 'Análise dos vínculos e das condições de trabalho');
  if (!ps.length) d.redigir('cadastre os vínculos (etapa 2) e a entrevista do motorista em cada um.');
  quadroPeriodos(d, ps, 'Vínculos avaliados');
  const av = avaliarPeriodos(dados);
  const resumo = [];
  av.forEach(({ r, val, segs }, i) => {
    const m = matrizIAC(r, dados);
    const x = r.data;
    d.h2(`3.${i + 1}`, `${x.empresa || '[[empresa]]'} – ${per(r)}`);
    const ruido = textoItens(segs, (it) => it.ruido) || (isFinite(val.lavg) ? `Lavg ${fmt(val.lavg, 1)} dB(A)` : '[[sem valor de ruído – vincule o paradigma ou a medição]]');
    const vib = textoItens(segs, (it) => /^VCI/.test(it.t)) || (isFinite(val.aren) ? `aren ${fmt(val.aren, 2)} m/s²` : '[[sem valor de vibração – vincule o paradigma ou a medição]]');
    const fonte = fontesDaProva(r, dados, val) || '[[sem paradigma ou medição vinculados]]';
    const enq = enquadramentoDoVinculo(r, segs, m);
    d.quadro(`Vínculo ${i + 1} – ${x.empresa || ''}`, [['Item', 'Registro'],
      ['Função e veículo', [x.cargo, veiculo(r)].map(v).filter(Boolean).join(' – ') || '[[função e veículo]]'],
      ['Grupo do veículo', v(x.grupoVeiculo) || '[[grupo do veículo]]'],
      ['Carga e trajetos', [x.carroceria && `Carroceria/reboque: ${x.carroceria}`, x.tipoCarga && `Carga: ${x.tipoCarga}`, x.vias && `Trajetos: ${x.vias}`].filter(Boolean).join('\n') || '[[carga e trajetos]]'],
      ['Jornada e pernoite', [x.conducaoH && `Condução: cerca de ${String(x.conducaoH).replace('.', ',')} h/dia${x.conducaoBase ? ` (${x.conducaoBase})` : ''}`, x.jornadaSemanal && `Jornada: ${x.jornadaSemanal}`, x.noturnoPernoite && `Pernoite: ${x.noturnoPernoite}`].filter(Boolean).join('\n') || '[[jornada]]'],
      ['Penosidade – fatores apurados', penosidadeDoVinculo(r, dados, m)],
      ['Ruído', ruido], ['Vibração de corpo inteiro', vib], ['Fonte da prova', fonte], ['Enquadramento técnico', enq]],
    { larguras: [0.24, 0.76], alinhar: 'left', tam: 9, fonte: 'Entrevista do segurado, CTPS/CNIS e banco de paradigmas do signatário.' });
    resumo.push([x.empresa || '', per(r), veiculo(r) || v(x.grupoVeiculo),
      [isFinite(val.nen) ? `NEN ${fmt(val.nen, 1)} dB(A)` : isFinite(val.lavg) ? `Lavg ${fmt(val.lavg, 1)} dB(A)` : '', isFinite(val.aren) ? `aren ${fmt(val.aren, 2)} m/s²` : ''].filter(Boolean).join('\n') || '—',
      fimOuHoje(r) <= '1995-04-28' ? 'categoria profissional' : m.penoso === true ? 'caracterizada' : m.penoso === false ? 'não caracterizada' : '[[completar]]',
      segs.map((s) => `${dataBR(s.ini)}–${dataBR(s.fim)}: ${s.caracteriza}${s.caracteriza === 'SIM' ? ` (${s.codigos})` : ''}`).join('\n')]);
  });

  // 4 Matriz sintética
  d.h1('4', 'Matriz sintética por vínculo');
  if (resumo.length) {
    d.quadro('Matriz de agentes, penosidade e enquadramento técnico', [['Empresa', 'Período', 'Veículo', 'Ruído / vibração', 'Penosidade', 'Enquadramento por subperíodo'], ...resumo],
      { larguras: [0.15, 0.13, 0.13, 0.15, 0.15, 0.29], tam: 8, alinhar: 'left', fonte: 'Elaborado pelo autor. SIM = especial pelos agentes ou pela categoria no subperíodo; a penosidade é avaliada a partir de 29/04/1995.' });
  } else d.redigir('cadastre os vínculos.');
  memoriasParadigmas(d, dados, { numero: '4.1' });

  // 5 Conclusão
  d.h1('5', 'Conclusão técnica');
  conclusaoPrevidenciaria(d, dados, { tituloQuadro: 'Quadro conclusivo por vínculo e subperíodo' });
  if (ps.some((r) => fimOuHoje(r) > EC103)) d.texto('Para os períodos posteriores a 13/11/2019, o tempo eventualmente reconhecido como especial não se converte em tempo comum (EC 103/2019, art. 25, § 2º).');
  d.texto('O enquadramento final dos períodos cabe ao INSS ou ao Poder Judiciário, à vista deste parecer e das demais provas.');
  d.h2('5.1', 'Limitações');
  d.texto('As condições de cada vínculo foram informadas pelo segurado em entrevista e conferidas com a CTPS e o CNIS; os valores de ruído e de vibração decorrem de medições em veículos similares, normalizadas para a jornada informada. Divergências posteriores nessas informações podem alterar as conclusões.');
  d.h2('5.2', 'Encerramento');
  d.texto('Nada mais havendo a acrescentar, encerra-se o presente parecer técnico, elaborado com base na engenharia de segurança do trabalho e sob a responsabilidade do signatário.');
  d.quadro('Responsabilidade técnica', [['Item', 'Registro'],
    ['Responsável técnico', perfil.nome], ['Formação', perfil.titulos], ['Registro profissional', credencial(perfil)], ['ART', v(c.art) || '[[nº da ART]]']],
  { larguras: [0.3, 0.7], alinhar: 'left', fonte: '' });
  const { lista, faltando } = await figurasDoCaso(dados);
  const { apendices, falhasApendice } = await apendicesDoCaso(dados);
  textoIntegram(d, { fotos: lista.length > 0, rotuloFotos: 'Anexo – Registro fotográfico', apendices, doc: 'parecer' });
  blocoAssinatura(d, dados, `Responsável técnico – ART nº ${v(c.art) || '[[nº]]'}`);
  secaoReferencias(d, dados, { prev: true, judicial: false });
  if (lista.length) { d.h1('', 'Anexo – Registro fotográfico'); d.figuras(lista); }
  inserirApendices(d, apendices);
  const r = await finalizar(d, { titulo: 'Parecer técnico de condições de trabalho e penosidade', arquivo: 'Parecer_penosidade', c });
  return { ...r, faltando, falhasApendice };
}
