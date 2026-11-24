// ======================================================================
// PARECER TÉCNICO DE CONDIÇÕES DE TRABALHO E PENOSIDADE (motorista) – extrajudicial
// Para o segurado ou o advogado: instrui requerimento ao INSS, revisão ou ação de aposentadoria especial.
// Estrutura do padrão do signatário (quadro de identificação, metodologia por similaridade, marco legal,
// um quadro por vínculo, matriz sintética, conclusão e encerramento com a ART); os valores, a fonte da
// prova e o enquadramento por subperíodo são calculados pelo app – nada é digitado no texto.
// ======================================================================
import { empresaLimpa } from '../nomes.js';
import {
  carregar, finalizar, dataBR, credencial, capaTecnica, blocoAssinatura, quadroFormaEnquadramento, quadroCriteriosRuido,
  quadroCriteriosVibracao, quadrosParadigmasMetodologia, memoriasParadigmas, figurasDoCaso, apendicesDoCaso, fluxoAvaliacao,
  textoIntegram, inserirApendices, quadroEquipamentos, equipamentosUsados, hojeLocal,
} from './base.js';
import { Doc } from './ooxml.js';
import { avaliarPeriodos, valores, conclusaoPrevidenciaria, resultadoSubperiodo } from './conclusao.js';
import { matrizIAC, tempoConducao } from './penosidade.js';
import { capitalizarCidades } from '../cidades.js';
import { comJurisprudencia, registroJurisprudencia, secaoReferencias } from './fontes.js';
import { contratanteDe } from './modelos.js';
import { citacaoDe, rotuloParadigma, sugerirParaVinculo, fichaPesquisaTexto } from '../paradigmas.js';
import { fmt, horasDia as horasCampo, fmtHoras } from '../calc.js';

const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
const per = (r) => `${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`;
// texto limpo: sem a anotação crua da entrevista entre aspas ("('8150 VW primeiro período')") nem reticências repetidas
const limpo = (t) => v(t).replace(/^\(\s*['"‘“]([^)]*?)['"’”]\s*\)$/, '$1').replace(/\s*\(['"‘“][^)]*['"’”]\)/g, '').replace(/\.{2,}/g, ', ').replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').trim();
const veiculo = (r) => limpo([r.data.veiculoTipo, r.data.veiculoMarca, r.data.veiculoModelo, r.data.veiculoAno].map(v).filter(Boolean).join(' '));
// nome curto da empresa nos quadros-resumo (sem a razão social da CTPS entre parênteses)
const empresaCurta = (r) => v(r.data.empresa).replace(/\s*\((CTPS|sucess|antiga|atual)[^)]*\)/gi, '').trim() || v(r.data.empresa);
const empresaQuadro = (r) => empresaLimpa(r.data.empresa);
const fimTxt = (r, s) => (!r.data.fim && s.fim === hojeLocal() ? 'atual' : dataBR(s.fim));
const EC103 = '2019-11-13';
const fimOuHoje = (r) => r.data.fim || '9999-12-31';

// fonte da prova: paradigma do banco (com processo, vara e data) ou medição do próprio veículo/posto
function fontesDaProva(r, dados, val) {
  const P = dados.paradigmas;
  const out = [];
  for (const [rot, cod, auto] of [['Ruído', r.data.paradigmaRuido, r._autoRuido], ['Vibração', r.data.paradigmaVibracao, r._autoVib]]) {
    if (!v(cod)) continue;
    const p = P.get(cod);
    if (!p) { out.push(`${rot}: paradigma ${cod} [[não encontrado no banco]]`); continue; }
    const avisos = [auto && `paradigma sugerido automaticamente (${r._criterio || 'banco de paradigmas'}) – confirmar no vínculo`,
      !/^ok$/i.test(v(p.data.situacao) || 'OK') && `situação do paradigma no banco: ${p.data.situacao} – conferir`].filter(Boolean);
    out.push(`${rot}: paradigma ${rotuloParadigma(p)} – ${citacaoDe(p) || '[[citação do paradigma]]'}${avisos.length ? ` [[${avisos.join('; ')}]]` : ''}`);
  }
  if (!out.length && (val.fonteR || val.fonteV)) out.push([val.fonteR && `Ruído: medição no veículo/posto ${val.fonteR}`, val.fonteV && `Vibração: medição em ${val.fonteV}`].filter(Boolean).join('\n'));
  // sem paradigma no banco: ficha para o signatário pesquisar nos seus laudos e incluir o paradigma
  if (!out.length) out.push(`[[PESQUISAR PARADIGMA – sem paradigma no banco para este vínculo. ${fichaPesquisaTexto(isFinite(val.T) && !v(r.data.conducaoH) ? { ...r, data: { ...r.data, conducaoH: String(val.T) } } : r, r._familia)}. Inclua em Bases técnicas → Veículos → Importar / exportar e vincule em 2. Autos.]]`);
  return out.join('\n');
}

// Paradigma automático: vínculos sem paradigma recebem o melhor candidato do banco (só na memória do documento,
// marcado para conferir); a escolha definitiva continua no vínculo.
async function paradigmasAutomaticos(dados) {
  // texto da entrevista limpo em todos os quadros (inclusive os da metodologia e da memória de cálculo)
  for (const r of dados.periodos) {
    const data = { ...r.data };
    for (const k of ['veiculoTipo', 'veiculoMarca', 'veiculoModelo', 'veiculoAno', 'cargo', 'carroceria', 'tipoCarga', 'vias']) if (v(data[k])) data[k] = limpo(data[k]);
    r.data = data;
  }
  for (const r of dados.periodos) {
    if (r.data.fim && r.data.fim <= '1995-04-28') continue; // categoria profissional: não precisa de medição
    if (v(r.data.paradigmaRuido) && v(r.data.paradigmaVibracao)) continue;
    const s = await sugerirParaVinculo(r);
    r._familia = s.familia; r._criterio = s.criterio;
    const data = { ...r.data };
    if (!v(data.paradigmaRuido) && s.ruido) { data.paradigmaRuido = s.ruido.p.data.codigo; r._autoRuido = true; dados.paradigmas.set(data.paradigmaRuido, s.ruido.p); }
    if (!v(data.paradigmaVibracao) && s.vibracao) { data.paradigmaVibracao = s.vibracao.p.data.codigo; r._autoVib = true; dados.paradigmas.set(data.paradigmaVibracao, s.vibracao.p); }
    r.data = data;
  }
}

const textoItens = (r, segs, filtro) => segs.flatMap((s) => s.itens.filter(filtro).map((i) => `${dataBR(s.ini)} a ${fimTxt(r, s)}: ${i.t.replace(/^(Ruído|VCI): /, '')}`)).join('\n');

function penosidadeDoVinculo(r, dados, m) {
  if (r.data.fim && r.data.fim <= '1995-04-28') return 'Vínculo encerrado até 28/04/1995: enquadramento por categoria profissional, sem necessidade da análise de penosidade.';
  // cada critério com os fatos da entrevista, mantendo o rótulo de cada item (ex.: "Assalto / roubo de carga no vínculo: …")
  // itens já mostrados nas linhas anteriores do quadro (veículo, carga, trajetos, jornada) não se repetem aqui
  const JA = /^(Veículo|Grupo do veículo|Carroceria \/ reboque|Tipo de carga|Vias e trajetos|Tempo diário de condução|Jornada e horas extras|Trabalho noturno e pernoites):/;
  const fatos = m.criterios.map((c) => [c, c.linhas.filter((l) => !JA.test(l))]).filter(([, ls]) => ls.length)
    .map(([c, ls]) => `**${c.titulo.replace(/^\d\. Análise d[oa]s? /, '').replace(/^./, (k) => k.toUpperCase())}** – ${ls.map((l) => l.replace(/^./, (k) => k.toLowerCase())).join('; ')}`);
  const algum = m.criterios.some((c) => c.linhas.length);
  return [fatos.join('.\n') + (fatos.length ? '.' : '') || (algum ? 'Fatores descritos nas linhas anteriores deste quadro.' : '') || '[[preencher a entrevista do vínculo (etapa 1. Autos → vínculo → Entrevista do motorista e Penosidade)]]', m.conclusao].filter(Boolean).join('\n');
}

function enquadramentoDoVinculo(r, segs, m) {
  const linhas = segs.map((s) => `${dataBR(s.ini)} a ${fimTxt(r, s)}: ${s.caracteriza === 'SIM' ? `especial (cód. ${s.codigos})` : s.caracteriza === 'NÃO' ? 'não especial pelos agentes avaliados' : s.caracteriza}`);
  if (fimOuHoje(r) > '1995-04-28') linhas.push(`Penosidade a partir de 29/04/1995: ${m.penoso === true ? 'condições penosas caracterizadas na matriz' : m.penoso === false ? 'não caracterizada na matriz' : '[[completar a entrevista]]'}${m.sugerida ? ' [[proposta do app – confirmar]]' : ''}`);
  // resultado técnico por subperíodo, juntando agentes, categoria e penosidade (o mesmo da matriz e da conclusão)
  if (segs.length) linhas.push(`Resultado técnico: ${segs.map((s) => `${dataBR(s.ini)} a ${fimTxt(r, s)} – ${resultadoSubperiodo(s, m.penoso)}`).join('; ')}`);
  if (fimOuHoje(r) > EC103) linhas.push('Após 13/11/2019: sem conversão do tempo especial em comum (EC 103/2019, art. 25, § 2º).');
  return linhas.join('\n');
}

export async function parecerPenosidade(caseId) {
  const dados = await carregar(caseId);
  await paradigmasAutomaticos(dados);
  const { c, perfil } = dados;
  const jur = comJurisprudencia(dados);
  const d = new Doc();
  const ps = dados.periodos;
  const ini = ps.map((r) => r.data.inicio).filter(Boolean).sort()[0];
  const abertos = ps.some((r) => !r.data.fim);
  const fim = ps.map((r) => r.data.fim).filter(Boolean).sort().pop();
  // atividade: o cargo mais frequente dos vínculos (o campo de funções às vezes traz dados da CTPS)
  const contagem = {};
  ps.forEach((r) => { const k = limpo(r.data.cargo).replace(/\s*\(CBO[^)]*\)/i, '').replace(/\s*\(ve[ií]c[^)]*\)/i, '').trim(); if (k) contagem[k.toLowerCase()] = (contagem[k.toLowerCase()] || 0) + 1; });
  const cargoFreq = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0];
  const f1 = v(c.funcoes).split('\n')[0];
  const atividade = (f1 && !/CTPS|NIT|\bn[ºo°]\s*\d|CNIS|s[ée]rie/i.test(f1) && f1.length < 120 ? f1 : '')
    || (cargoFreq ? cargoFreq[0].replace(/^./, (k) => k.toUpperCase()) : 'Motorista profissional');

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
  d.texto(`Este parecer técnico de engenharia de segurança do trabalho avalia as condições de trabalho de ${c.autorNome || '[[segurado]]'} na função de ${atividade.toLowerCase().replace(/[.:;\s]+$/, '')}: a exposição a agentes nocivos (ruído e vibração) e os fatores de penosidade de cada vínculo, para ${v(c.finalidade) && c.finalidade !== 'Outra' ? c.finalidade.replace(/^./, (k) => k.toLowerCase()) : 'subsidiar o pedido de aposentadoria especial'}. O enquadramento jurídico dos períodos cabe ao INSS ou ao Poder Judiciário; o documento fornece os parâmetros técnicos para essa decisão.`);
  fluxoAvaliacao(d, dados, 'penosidade');
  d.h2('1.1', 'Avaliação por similaridade');
  d.texto('Os veículos conduzidos nos vínculos antigos foram desativados, vendidos ou substituídos. Por isso, o ruído e a vibração são quantificados por similaridade: medições realizadas pelo signatário, em perícias judiciais e em avaliações extrajudiciais, em veículos com as mesmas características técnicas dos conduzidos pelo segurado, normalizadas para o tempo diário de condução informado. A fonte de cada valor (processo, vara e data, ou avaliação extrajudicial) consta do quadro de cada vínculo e da memória de cálculo.');
  d.texto(jur
    ? 'O laudo não contemporâneo é apto à comprovação da atividade especial (TNU, Súmula 68) e, quando impossível a perícia no local de trabalho, admite-se a prova em empresa ou veículo similar (TRF4, Súmula 106). Na via administrativa, o INSS não aceita laudo de empresa diversa (IN PRES/INSS 128/2022, art. 277, parágrafo único): o parecer serve, nesse caso, para instruir o pedido de revisão ou a ação judicial.'
    : 'Na via administrativa, o INSS não aceita laudo de empresa diversa (IN PRES/INSS 128/2022, art. 277, parágrafo único): a avaliação por similaridade destina-se, nesse caso, a instruir o pedido de revisão ou a ação judicial.');
  if (!quadrosParadigmasMetodologia(d, dados)) {
    if (equipamentosUsados(dados).length) quadroEquipamentos(d, equipamentosUsados(dados), undefined, dados.c.vistoriaData);
    else d.redigir('vincule os paradigmas de ruído e vibração aos vínculos (2. Autos → vínculo → Sugerir paradigmas), ou inclua no banco os que pesquisar.');
  }
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
  quadroFormaEnquadramento(d, dados);
  quadroCriteriosRuido(d);
  quadroCriteriosVibracao(d);
  d.texto(jur
    ? 'Quanto ao ruído, a declaração de eficácia do protetor auricular não descaracteriza o tempo especial (STF, Tema 555 – ARE 664.335). Para os demais agentes, o EPI só é considerado a partir de 03/12/1998, com os requisitos do art. 291 da IN PRES/INSS 128/2022.'
    : 'O EPI só é considerado a partir de 03/12/1998, com os requisitos cumulativos do art. 291 da IN PRES/INSS 128/2022; sem registros de fornecimento, não se considera neutralizada a exposição.');
  d.texto('Após 13/11/2019 (Emenda Constitucional nº 103/2019, art. 25, § 2º), o tempo especial não é mais convertido em tempo comum; para a aposentadoria especial, aplicam-se as regras da emenda.');
  registroJurisprudencia(d, dados, { numero: '2.1', nivel: 'h2', prev: true, tipo: 'parecer' });

  // 3 Vínculos
  d.h1('3', 'Análise dos vínculos e das condições de trabalho');
  if (!ps.length) d.redigir('cadastre os vínculos (etapa 1. Autos) e a entrevista do motorista em cada um.');
  // quadro-resumo dos vínculos: nome curto e a fonte resumida (as notas completas ficam no quadro de cada vínculo)
  if (ps.length) d.quadro('Vínculos avaliados', [['Empresa', 'Período', 'Cargo', 'Documentos'],
    ...ps.map((r) => [[empresaCurta(r), r.data.cnpj && `CNPJ ${r.data.cnpj}`].filter(Boolean).join('\n'), per(r), limpo(r.data.cargo),
      v(r.data.fonte).split(/;\s*/).filter((t) => /CTPS|CNIS|PPP|Entrevista/i.test(t)).map((t) => t.replace(/\s*\(PDF[^)]*\)/g, '').replace(/[:,].*$/, '').trim()).filter(Boolean).slice(0, 3).join('; ')])],
  { larguras: [0.36, 0.2, 0.2, 0.24], alinhar: 'left', tam: 9, fonte: 'CTPS, CNIS e entrevista do segurado.' });
  const av = avaliarPeriodos(dados);
  const resumo = [];
  av.forEach(({ r, val, segs }, i) => {
    const m = matrizIAC(r, dados);
    const x = r.data;
    d.h2(`3.${i + 1}`, `${empresaCurta(r) || '[[empresa]]'} – ${per(r)}`, { novaPagina: true });
    const soCategoria = !!(x.fim && x.fim <= '1995-04-28');
    const semValor = soCategoria ? 'não necessário: enquadramento por categoria profissional' : '[[sem paradigma vinculado – ver Fonte da prova]]';
    const ruido = textoItens(r, segs, (it) => it.ruido) || (isFinite(val.lavg) ? `Lavg ${fmt(val.lavg, 1)} dB(A)` : semValor);
    const vib = textoItens(r, segs, (it) => /^VCI/.test(it.t)) || (isFinite(val.aren) ? `aren ${fmt(val.aren, 2)} m/s²` : semValor);
    const fonte = soCategoria && !v(x.paradigmaRuido) && !v(x.paradigmaVibracao) ? 'Não se aplica (categoria profissional até 28/04/1995).' : fontesDaProva(r, dados, val);
    const enq = enquadramentoDoVinculo(r, segs, m);
    d.quadro(`Vínculo ${i + 1} – ${empresaQuadro(r)}`, [['Item', 'Registro'],
      ['Empresa e documentos', [v(x.empresa), x.cnpj && `CNPJ ${x.cnpj}`, v(x.fonte) && `Fonte: ${v(x.fonte)}`].filter(Boolean).join('\n')],
      ['Função e veículo', [limpo(x.cargo), veiculo(r)].filter(Boolean).join(' – ') || '[[função e veículo]]'],
      ['Grupo do veículo', v(x.grupoVeiculo) || '[[grupo do veículo]]'],
      ['Carga e trajetos', [x.carroceria && `Carroceria/reboque: ${limpo(x.carroceria)}`, x.tipoCarga && `Carga: ${limpo(x.tipoCarga)}`, x.vias && `Trajetos: ${capitalizarCidades(limpo(x.vias))}`].filter(Boolean).join('\n') || '[[carga e trajetos]]'],
      ['Jornada e pernoite', [(() => { const tc = tempoConducao(r, dados); if (isFinite(tc.T)) return `Condução: cerca de ${fmtHoras(tc.T)}/dia${tc.base ? ` (${tc.base})` : ''}`; return x.conducaoH ? `Condução: ${x.conducaoH} [[informe um número de horas por dia]]` : ''; })(), x.jornadaSemanal && `Jornada: ${x.jornadaSemanal}`, x.noturnoPernoite && `Pernoite: ${x.noturnoPernoite}`].filter(Boolean).join('\n') || '[[jornada]]'],
      ['Penosidade – fatores apurados', penosidadeDoVinculo(r, dados, m)],
      ['Ruído', ruido], ['Vibração de corpo inteiro', vib], ['Fonte da prova', fonte], ['Enquadramento técnico', enq]],
    // quadros em sequência: o quadro do vínculo pode continuar na página seguinte (não pula página inteira)
    { larguras: [0.24, 0.76], alinhar: 'left', tam: 9, juntar: false, fonte: 'Entrevista do segurado, CTPS/CNIS e banco de paradigmas do signatário.' });
    const um = segs.length === 1; // um subperíodo só: sem repetir as datas nas colunas de resultado
    resumo.push([empresaQuadro(r), `${dataBR(x.inicio)} a\n${x.fim ? dataBR(x.fim) : 'atual'}`, veiculo(r) || v(x.grupoVeiculo),
      [isFinite(val.nen) ? `NEN ${fmt(val.nen, 1)} dB(A)` : isFinite(val.lavg) ? `Lavg ${fmt(val.lavg, 1)} dB(A)` : '', isFinite(val.aren) ? `aren ${fmt(val.aren, 2)} m/s²` : ''].filter(Boolean).join('\n') || '—',
      segs.map((s) => `${um ? '' : `${dataBR(s.ini)}–${fimTxt(r, s)}: `}${s.caracteriza}${s.caracteriza === 'SIM' ? ` (${s.codigos})` : ''}`).join('\n'),
      fimOuHoje(r) <= '1995-04-28' ? 'não se aplica (antes de 29/04/1995)' : m.penoso === true ? 'caracterizada' : m.penoso === false ? 'não caracterizada' : '[[completar]]',
      segs.map((s) => `${um ? '' : `${dataBR(s.ini)}–${fimTxt(r, s)}: `}${resultadoSubperiodo(s, m.penoso)}`).join('\n')]);
  });

  // 4 Matriz sintética
  d.h1('4', 'Matriz sintética por vínculo');
  if (resumo.length) {
    d.quadro('Matriz de agentes, penosidade e enquadramento técnico', [['Empresa', 'Período', 'Veículo', 'Ruído / vibração', 'Agentes nocivos', 'Penosidade', 'Resultado técnico'], ...resumo],
      { larguras: [0.16, 0.13, 0.13, 0.115, 0.13, 0.145, 0.19], tam: 8, alinhar: 'left', fonte: 'Elaborado pelo signatário. Agentes nocivos: SIM quando o ruído ou a vibração superam o limite da época, ou pela categoria até 28/04/1995. Penosidade: matriz de fatores, a partir de 29/04/1995. Resultado técnico: SIM quando há enquadramento por qualquer desses critérios.' });
  } else d.redigir('cadastre os vínculos.');
  memoriasParadigmas(d, dados, { numero: '4.1' });

  // 5 Conclusão
  d.h1('5', 'Conclusão técnica');
  // a penosidade já está no quadro de cada vínculo: a conclusão não repete a síntese
  const penosoDe = new Map(av.map(({ r }) => [r.id, fimOuHoje(r) > '1995-04-28' ? matrizIAC(r, dados).penoso : null]));
  conclusaoPrevidenciaria(d, dados, { tituloQuadro: 'Quadro conclusivo por vínculo e subperíodo', resumoPenosidade: false, penosidade: (r) => penosoDe.get(r.id) });
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
  const { apendices, falhasApendice, semRelatorios, semRelatoriosLgpd } = await apendicesDoCaso(dados);
  textoIntegram(d, { fotos: lista.length > 0, rotuloFotos: 'Anexo – Registro fotográfico', apendices, doc: 'parecer' });
  blocoAssinatura(d, dados, `Responsável técnico – ART nº ${v(c.art) || '[[nº]]'}`);
  secaoReferencias(d, dados, { prev: true, judicial: false });
  if (lista.length) { d.h1('', 'Anexo – Registro fotográfico'); d.figuras(lista); }
  inserirApendices(d, apendices, dados);
  const r = await finalizar(d, { titulo: 'Parecer técnico de condições de trabalho e penosidade', arquivo: 'Parecer_penosidade', c });
  return { ...r, faltando, falhasApendice, semRelatorios, semRelatoriosLgpd };
}

// ======================================================================
// ROTEIRO DE ENTREVISTA DO MOTORISTA – para levar à entrevista com o segurado.
// Sai com os vínculos da CTPS/CNIS já cadastrados e as respostas que já existirem;
// depois de preenchido, volta pelo Claude (2. Autos) para os campos de cada vínculo.
// ======================================================================
const PERGUNTAS_ENTREVISTA = [
  ['Veículo (marca, modelo, ano)', (x) => [x.veiculoMarca, x.veiculoModelo, x.veiculoAno].map(v).filter(Boolean).join(' ')],
  ['Características do veículo (cabine, ar-condicionado, câmbio, motor junto da cabine)', (x) => x.cabine],
  ['Carroceria / reboque', (x) => x.carroceria],
  ['Tipo de carga (perecível, de valor, perigosa, passageiros)', (x) => x.tipoCarga],
  ['Carregava / descarregava? Como e quanto tempo?', (x) => [x.carregaDescarrega, x.cargaDescarga].map(v).filter(Boolean).join(' – ')],
  ['Trajetos (cidades e UFs, estradas ruins, áreas de risco)', (x) => x.vias],
  ['Pernoite (cabine, hotel, casa) e dias fora de casa', (x) => x.noturnoPernoite],
  ['Jornada (horário de saída e chegada, dias da semana)', (x) => x.jornadaSemanal],
  ['Horas por dia de carga, descarga e paradas (fora da direção)', (x) => x.cargaDescarga],
  ['Horas de direção por dia e pausas', (x) => [x.conducaoH && (isFinite(horasCampo(x.conducaoH)) ? fmtHoras(horasCampo(x.conducaoH)) : x.conducaoH), x.pausas].map(v).filter(Boolean).join(' – ')],
  ['Prazos e metas de entrega', (x) => x.pressao],
  ['Acesso a sanitários, alimentação e descanso', (x) => x.fisiologicas],
  ['Onde abastecia (posto/frentista, base própria)', (x) => x.abastecimento],
  ['Acidente no vínculo', (x) => x.acidenteVinculo],
  ['Assalto / roubo de carga no vínculo', (x) => x.assaltoVinculo],
];

export async function roteiroEntrevista(caseId) {
  const dados = await carregar(caseId);
  const { c } = dados;
  const d = new Doc();
  d.h1('', 'Roteiro de entrevista do motorista', { novaPagina: false });
  d.identificacao([['Segurado', c.autorNome], ['CPF / NIT', c.autorCpf], ['Data da entrevista', '____/____/________'], ['Local', '']]);
  d.texto('Para cada vínculo, pergunte e anote as respostas com as palavras do segurado. Quando um vínculo repetir outro, escreva "mesmas atividades do vínculo N" e anote só o que mudou. Depois, cole a entrevista no Claude pela etapa 1. Autos do app: as respostas vão para os campos de cada vínculo.');
  const ps = [...dados.periodos].sort((a, b) => String(a.data.inicio).localeCompare(String(b.data.inicio)));
  if (!ps.length) d.redigir('cadastre os vínculos da CTPS/CNIS (2. Autos) antes de gerar o roteiro.');
  ps.forEach((r, i) => {
    const x = r.data;
    d.h2(String(i + 1), `${empresaCurta(r) || 'Empresa'} – ${per(r)}${v(x.cargo) ? ` – ${limpo(x.cargo)}` : ''}`);
    if (x.fim && x.fim <= '1995-04-28') d.texto('Até 28/04/1995: o enquadramento é por categoria profissional; basta confirmar a função de motorista e o tipo de veículo.', { recuo: false });
    d.quadro(`Entrevista – vínculo ${i + 1}`, [['Pergunta', 'Resposta'], ...PERGUNTAS_ENTREVISTA.map(([q, f]) => [q, limpo(f(x)) || '\n\n'])],
      { larguras: [0.38, 0.62], alinhar: 'left', tam: 9, juntar: false, fonte: '' });
  });
  d.h2('', 'Outros vínculos de motorista não registrados e observações');
  d.quadro('Anotações gerais', [['Item', 'Anotação'], ['Vínculos sem registro na CTPS', '\n\n\n'], ['Documentos a pedir (PPP, LTCAT, fotos do veículo)', '\n\n'], ['Observações', '\n\n\n']],
    { larguras: [0.38, 0.62], alinhar: 'left', tam: 9, juntar: false, fonte: '' });
  return finalizar(d, { titulo: 'Roteiro de entrevista do motorista', arquivo: 'Roteiro_entrevista_motorista', c });
}
