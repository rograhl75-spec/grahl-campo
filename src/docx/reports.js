import { ORIGEM_QUESITO, contextoLegal, ehSuplementar, localVistoria, ehAcidente } from '../schema.js';
import { db } from '../db.js';
import { p, run } from './ooxml.js';
import {
  Doc, carregar, finalizar, dataBR, menosCincoAnos, partes, credencial, papelAssinatura, equipamentosUsados, quadroEquipamentos,
  quadroDiligencia, quadroPeriodos, quadroEpis, quadroDocumentos, quadroCriteriosRuido, subperiodosRuido, quadroMedicoesRuido,
  quadroMedicoesGenerico, medicoesPorAgente, nomePostoFn, profissiografia, figurasDoCaso, capaTecnica, blocoAssinatura, prefixoQuesito, nomeOrigemQuesito, art,
} from './base.js';
import { CAMPOS_ACIDENTE } from '../schema.js';
import {
  laudoPericial, laudoPrevidenciario, ltcatPpp, parecerPrevidenciario, parecerAssistente, parecerPreventivo, peticaoIndicacaoAT, peticaoAgendamento, peticaoHonorarios, peticaoMajoracao, peticaoAceiteArbitrados, peticaoPagamento, respostaQuesitosSuplementares,
} from './modelos.js';
import { laudoAcidente, peticaoPeritoAvulsa, peticaoAssistente, PETICOES_PERITO, PETICOES_AT, POSICOES_AT } from './modelos2.js';

export { PETICOES_PERITO, PETICOES_AT, POSICOES_AT };

export { dataBR };

const ehPerito = (c) => c.papel === 'Perito do Juízo';
const ehAT = (c) => /Assistente/i.test(c.papel || '');
const ehExtra = (c) => c.tipoAtuacao === 'Extrajudicial' || /extrajudicial/i.test(c.papel || '');
const ehPrev = (c) => contextoLegal(c).prev === true;

// ---------------- PRÉ-RELATÓRIO (varia conforme a situação) ----------------
export async function gerarPreRelatorio(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const pt = partes(c);
  const d = new Doc();
  capaTecnica(d, {
    titulo: 'PRÉ-RELATÓRIO', subtitulo: ehExtra(c) ? 'Análise prévia para elaboração de LTCAT e PPP' : 'Análise processual e planejamento da diligência',
    linha2: c.papel, perfil,
    pares: [['Processo', c.numero], ['Juízo', [c.juizo, c.comarca].filter(Boolean).join(' – ')], ['Justiça / matéria', [c.justica, c.materia].filter(Boolean).join(' – ')],
      [pt.autor, c.autorNome], [pt.reu, c.reuNome], ['Objeto', (c.objeto || []).join(', ')],
      ['Diligência', [dataBR(c.dataDiligencia), c.horaDiligencia].filter(Boolean).join(' às ')], ['Prazo', dataBR(c.prazoLaudo || c.prazoManifestacao)]],
  });
  d.sumario();

  d.h1('1', 'Identificação');
  const linhas = [['Processo', c.numero], ['Juízo', [c.juizo, c.comarca].filter(Boolean).join(' – ')], ['Data de ajuizamento', dataBR(c.dataAjuizamento)]];
  if (pt.trab && c.dataAjuizamento) linhas.push(['Período imprescrito', `a partir de ${menosCincoAnos(c.dataAjuizamento)} (ajuizamento – 5 anos)`]);
  linhas.push(['Valor da causa', c.valorCausa], ['Rito', c.rito], [pt.autor, c.autorNome], ['CPF / NIT', c.autorCpf], ['Nascimento', dataBR(c.autorNascimento)],
    [pt.reu, c.reuNome], ['CNPJ', c.reuCnpj], ['Perito do Juízo', ehAT(c) ? c.peritoJuizo : ''], ['Atuação', c.papel]);
  d.identificacao(linhas);

  d.h1('2', 'Contrato, funções e períodos');
  d.texto(c.funcoes || '');
  quadroPeriodos(d, dados.periodos);
  if ((pt.prev || ehExtra(c)) && dados.periodos.length) {
    d.h2('2.1', 'Divisão dos períodos pelos critérios de ruído');
    quadroCriteriosRuido(d);
    const subs = subperiodosRuido(dados.periodos);
    if (subs.length) d.quadro('Subperíodos a avaliar', [['Vínculo', 'Subperíodo', 'Critério'],
      ...subs.map((s) => [s.periodo.data.empresa || '', `${dataBR(s.ini)} a ${dataBR(s.fim)}`, `${s.janela.crit} > ${s.janela.lim} dB(A)`])], { larguras: [0.4, 0.35, 0.25] });
    d.texto('Marcos adicionais a observar: 14/08/2014 (vigência do Anexo 8 da NR-15 – vibração) e 13/11/2019 (Emenda Constitucional nº 103/2019).');
  }

  d.h1('3', 'Síntese da petição inicial');
  d.h2('3.1', 'Atividades descritas'); d.texto(c.atividadesAlegadas || '[[não informado]]');
  d.h2('3.2', 'Agentes nocivos / riscos alegados'); d.texto(c.agentesAlegados || '[[não informado]]');
  d.h2('3.3', 'Pedidos técnicos'); d.texto(c.pedidos || '[[não informado]]');

  if (!ehExtra(c)) {
    d.h1('4', 'Síntese da defesa');
    d.h2('4.1', 'Tese técnica'); d.texto(c.defesa || '[[não informado]]');
    d.h2('4.2', 'Pontos de atenção e preliminares periciais'); d.texto(c.preliminares || '[[não informado]]');
  } else {
    d.h1('4', 'Pontos de atenção e pendências');
    d.texto(c.preliminares || '[[pendências antes da vistoria]]');
  }

  d.h1('5', 'Documentos técnicos analisados');
  quadroDocumentos(d, dados.documentos);
  if (!dados.documentos.length) d.texto('[[Nenhum documento cadastrado.]]');

  d.h1('6', 'Equipamentos de proteção individual');
  quadroEpis(d, dados.epis);
  if (c.analiseEpi) { d.h2('6.1', 'Análise crítica'); d.texto(c.analiseEpi); }

  d.h1('7', 'Quesitos');
  let n = 0;
  for (const origem of ORIGEM_QUESITO) {
    const lista = dados.quesitos.filter((q) => !ehSuplementar(q) && (q.data.origem || 'Outro') === origem);
    if (!lista.length) continue;
    n += 1;
    d.h2(`7.${n}`, `Quesitos ${nomeOrigemQuesito(origem, c)}`);
    for (const q of lista) d.add(p([run(prefixoQuesito(q) || (q.data.numero ? '' : '• '), { b: true }), run(q.data.texto || '')], { after: 100 }));
  }
  if (!n) d.texto(ehExtra(c) ? 'Não se aplica (perícia extrajudicial).' : '[[Quesitos não cadastrados.]]');

  d.h1('8', 'Planejamento da diligência');
  d.identificacao([['Data e horário', [dataBR(c.dataDiligencia), c.horaDiligencia].filter(Boolean).join(' às ') || 'a definir'], ['Local', [localVistoria(c), c.vistoriaEndereco].filter(Boolean).join(' – ')]]);
  d.h2('8.1', 'Roteiro e documentos a solicitar'); d.texto(c.roteiro || '[[roteiro]]');
  d.h2('8.2', 'Equipamentos');
  const levar = dados.equipamentos.filter((e) => (c.equipamentos || []).includes(e.id));
  quadroEquipamentos(d, levar, 'Equipamentos a levar');
  if (ehExtra(c)) {
    d.h2('8.3', 'Estrutura prevista do LTCAT e campos do PPP');
    d.texto('O LTCAT seguirá os elementos do art. 276 da IN 128/2022, com sumário e formatação ABNT, e o PPP será emitido por subperíodo, com código GFIP 04 quando houver enquadramento.');
  }
  if (c.observacoes) { d.h2(ehExtra(c) ? '8.4' : '8.3', 'Observações'); d.texto(c.observacoes); }
  let nx = 8;
  if (CAMPOS_ACIDENTE.some(([k]) => String(c[k] || '').trim())) {
    nx += 1;
    d.h1(String(nx), 'Dados do acidente');
    d.identificacao(CAMPOS_ACIDENTE.map(([k, r]) => [r, k === 'acidenteData' ? dataBR(c[k]) : c[k]]));
  }
  if (ehAT(c)) {
    nx += 1;
    d.h1(String(nx), 'Estratégia da assistência técnica');
    d.h2(`${nx}.1`, 'Pontos favoráveis à parte'); d.redigir('fatos, documentos e normas que sustentam a tese da parte.');
    d.h2(`${nx}.2`, 'Pontos desfavoráveis e riscos'); d.redigir('o que pode pesar contra e como tratar.');
    d.h2(`${nx}.3`, 'Documentos a juntar ou a pedir ao perito'); d.redigir('lista.');
    d.h2(`${nx}.4`, 'Quesitos a propor e o que acompanhar na diligência'); d.redigir('quesitos e pontos de atenção na vistoria (instrumentos, calibração, tempo de amostragem, postos).');
  } else if (ehPerito(c)) {
    nx += 1;
    d.h1(String(nx), 'Verificações do perito');
    d.texto('- Impedimento ou suspeição (arts. 148, II, e 467 do CPC): [[nenhum / indicar]]\n- Prazo para escusa: 15 dias da intimação (art. 157, § 1º, do CPC)\n- Estimativa de horas para a proposta de honorários: [[análise dos autos / deslocamento / diligência / laudo]]');
  }
  void credencial; void papelAssinatura;
  return finalizar(d, { titulo: 'Pré-relatório', arquivo: 'Pre-relatorio', c });
}

// ---------------- REGISTRO DA DILIGÊNCIA (perito) / RELATÓRIO DE ACOMPANHAMENTO (assistente técnico) ----------------
export async function gerarRegistroDiligencia(caseId) {
  const dados = await carregar(caseId);
  const { c } = dados;
  const pt = partes(c);
  const at = ehAT(c);
  const d = new Doc();
  d.add(p([run(at ? 'RELATÓRIO DE ACOMPANHAMENTO DA DILIGÊNCIA PERICIAL' : 'REGISTRO DA DILIGÊNCIA', { b: true, size: 14, color: '1B365D' })], { align: 'center', after: 60 }));
  if (c.numero) d.add(p([run(`Processo nº ${c.numero}${c.juizo ? ` – ${c.juizo}` : ''}`)], { align: 'center', after: 0 }));
  d.add(p([run([c.autorNome, c.reuNome].filter(Boolean).join(' × '))], { align: 'center', after: 240 }));
  d.h1('1', 'Dados da diligência', { novaPagina: false });
  quadroDiligencia(d, c);
  d.h1('2', 'Equipamentos utilizados', { novaPagina: false });
  quadroEquipamentos(d, equipamentosUsados(dados));
  d.h1('3', 'Postos e atividades avaliados', { novaPagina: false });
  profissiografia(d, dados.postos, dados, { base: '3' });
  const g = medicoesPorAgente(dados);
  const nome = nomePostoFn(dados.postos);
  const eq = new Map(dados.equipamentos.map((e) => [e.id, e]));
  if (dados.medicoes.length) {
    d.h1('4', 'Medições', { novaPagina: false });
    const ctx = contextoLegal(c);
    if (g['Ruído']) quadroMedicoesRuido(d, g['Ruído'], eq, nome, ctx);
    for (const [k, ms] of Object.entries(g)) if (k !== 'Ruído') quadroMedicoesGenerico(d, `Resultados – ${k}`, ms, nome, ctx);
  }
  const resp = dados.quesitos.filter((q) => (q.data.resposta || '').trim());
  if (resp.length) {
    d.h1('5', 'Anotações de campo sobre os quesitos', { novaPagina: false });
    for (const q of resp) {
      d.add(p([run(`Quesitos ${nomeOrigemQuesito(q.data.origem, c)} – ${prefixoQuesito(q)}`, { b: true }), run(q.data.texto || '', { i: true })], { after: 40 }));
      d.add(p(q.data.resposta, { left: 709 }));
    }
  }
  if (c.vistoriaNotas) { d.h1('6', 'Anotações gerais', { novaPagina: false }); d.texto(c.vistoriaNotas); }
  if (at) {
    // relatório para o cliente (advogado ou empresa): como o perito conduziu a diligência e o que esperar do laudo
    d.h1('7', 'Procedimentos do perito', { novaPagina: false });
    d.quadro('Verificação dos procedimentos adotados pelo perito', [['Item', 'Constatação', 'Observação para a manifestação'],
      ...['Instrumentos utilizados e certificados de calibração apresentados', 'Calibração do dosímetro antes e depois da medição', 'Tempo de amostragem representativo da jornada',
        'Postos e atividades avaliados (todos os do período discutido?)', 'Condições de operação no dia (normais ou atípicas)', 'Documentos solicitados e recebidos pelo perito',
        'Informações colhidas e de quem', 'Pedidos e observações apresentados pela assistência'].map((t) => [t, '[[ ]]', '[[ ]]'])],
    { larguras: [0.38, 0.31, 0.31], tam: 9, alinhar: 'left' });
    d.h1('8', 'Avaliação da assistência técnica', { novaPagina: false });
    d.h2('8.1', `Pontos favoráveis ${art(ladoCurto(c)).o === 'a' ? 'à' : 'ao'} ${ladoCurto(c)}`); d.redigir('o que a diligência confirmou a favor da tese da parte.');
    d.h2('8.2', 'Pontos de atenção'); d.redigir('o que pode pesar contra a parte e como tratar na manifestação.');
    d.h1('9', 'Próximos passos', { novaPagina: false });
    d.texto(`Prazo do laudo: ${dataBR(c.prazoLaudo) || '[[conforme o despacho]]'}. Depois da intimação do laudo, o prazo comum para o parecer do assistente técnico é de 15 dias (art. 477, § 1º, do CPC).`);
    d.redigir('documentos ou quesitos a apresentar antes do laudo, se houver.');
  }
  void pt;
  return finalizar(d, { titulo: at ? 'Relatório de acompanhamento da diligência' : 'Registro da diligência', arquivo: at ? 'Relatorio_acompanhamento_diligencia' : 'Registro_diligencia', c });
}

// ---------------- RELATÓRIO FOTOGRÁFICO ----------------
export async function gerarRelatorioFotografico(caseId) {
  const dados = await carregar(caseId);
  const { c } = dados;
  const d = new Doc();
  d.add(p([run('RELATÓRIO FOTOGRÁFICO', { b: true, size: 14, color: '1B365D' })], { align: 'center', after: 60 }));
  if (c.numero) d.add(p([run(`Processo nº ${c.numero}`)], { align: 'center', after: 0 }));
  d.add(p([run([c.autorNome, c.reuNome].filter(Boolean).join(' × '))], { align: 'center', after: 60 }));
  d.add(p([run(`Diligência: ${dataBR(c.vistoriaData) || '—'}${localVistoria(c) ? ` – ${localVistoria(c)}` : ''}`)], { align: 'center', after: 240 }));
  const { lista, faltando } = await figurasDoCaso(dados);
  if (lista.length) d.figuras(lista); else d.texto('Nenhuma foto registrada.');
  const r = await finalizar(d, { titulo: 'Relatório fotográfico', arquivo: 'Relatorio_fotografico', c });
  return { ...r, faltando };
}

// ---------------- HONORÁRIOS (um cartão, três situações) ----------------
export const HONORARIOS = ['Apresentar proposta (art. 465, § 2º, do CPC)', 'Pedir majoração do valor fixado', 'Aceitar o valor arbitrado'];
export const situacaoHonorarios = (c) => c.honorariosSituacao || (/Federal/i.test(c.justica || '') ? HONORARIOS[1] : HONORARIOS[0]);
async function peticaoHonorariosUnica(caseId, opts) {
  const c = ((await db.records.get(caseId)) || { data: {} }).data;
  const s = situacaoHonorarios(c);
  if (s === HONORARIOS[1]) return peticaoMajoracao(caseId, opts);
  if (s === HONORARIOS[2]) return peticaoAceiteArbitrados(caseId, opts);
  return peticaoHonorarios(caseId, opts);
}

function ladoCurto(c) { const pt = partes(c); return /réu/i.test(c.papel || '') ? pt.reuCurto : pt.autorCurto; }

const ehAcid = (c) => ehAcidente(c) && contextoLegal(c).prev !== true;
const contratouEmpresa = (c) => c.contratadoPor === 'Empresa';

// ---------------- CATÁLOGO ----------------
// rec: em quais situações o documento é sugerido
export const CATALOGO = [
  { id: 'pre', grupo: '1. Início do caso', titulo: 'Pré-relatório', desc: 'Identificação, síntese dos autos, períodos (com a divisão pelos critérios de ruído), documentos, EPIs, quesitos e planejamento.', fn: gerarPreRelatorio, rec: () => true },
  { id: 'honorarios', grupo: '1. Início do caso', titulo: 'Honorários', desc: 'Escolha a situação: proposta com estimativa de horas (art. 465, § 2º), majoração do valor fixado (complexidade, local, Res. CJF 305/2014) ou aceite do valor arbitrado (com ou sem adiantamento). Os dados ficam em 1. Cadastro → Honorários e itens do despacho.', fn: peticaoHonorariosUnica, rec: ehPerito, usaConta: true },
  { id: 'indic', grupo: '1. Início do caso', titulo: 'Indicação de assistente técnico e quesitos', desc: 'Qualificação, documentos necessários, avaliações no local, quesitos e requerimentos.', fn: peticaoIndicacaoAT, rec: ehAT, redacao: 'indic' },
  { id: 'agenda', grupo: '2. Antes da diligência', titulo: 'Agendamento da vistoria pericial', desc: 'Data por extenso, empresa e endereço, períodos, intimação das partes e do autor, ofício à empresa com os documentos e prazo do laudo.', fn: peticaoAgendamento, rec: ehPerito },
  { id: 'reg', grupo: '3. Depois da diligência', titulo: 'Registro da diligência', desc: 'Data, local, presentes, equipamentos com calibração, postos, medições e anotações dos quesitos.', fn: gerarRegistroDiligencia, rec: (c) => !ehAT(c) },
  { id: 'acomp', grupo: '3. Depois da diligência', titulo: 'Relatório de acompanhamento da diligência (para o cliente)', desc: 'O que o perito fez: instrumentos e calibração, tempo de amostragem, postos, documentos pedidos; pontos favoráveis, pontos de atenção e próximos prazos.', fn: gerarRegistroDiligencia, rec: ehAT },
  { id: 'foto', grupo: '3. Depois da diligência', titulo: 'Relatório fotográfico avulso', desc: 'Fotos numeradas, duas por linha, com legenda, data/hora e GPS. Os laudos já trazem as fotos no anexo; use este para manifestações e para o cliente.', fn: gerarRelatorioFotografico, rec: () => true },
  { id: 'laudo', grupo: '4. Laudo / parecer', titulo: 'Laudo pericial – insalubridade e periculosidade', desc: 'CLT, NR-15 e NR-16 na redação de cada período (também adicional de servidor): diligência, metodologia, ambiente, EPC/EPI e neutralização, agentes com confronto do Anexo 11, quadro conclusivo e quesitos.', fn: laudoPericial, rec: (c) => ehPerito(c) && !ehPrev(c) && !ehAcid(c), redacao: 'laudo' },
  { id: 'laudoprev', grupo: '4. Laudo / parecer', titulo: 'Laudo pericial previdenciário', desc: 'Tempo especial (Decretos 53.831/64, 2.172/97 e 3.048/99, IN 128/2022): fundamentação por período, profissiografia por vínculo, critérios por período, medidas de controle (art. 291), conclusão por período e quesitos.', fn: laudoPrevidenciario, rec: (c) => ehPerito(c) && ehPrev(c), redacao: 'laudo' },
  { id: 'acidente', grupo: '4. Laudo / parecer', titulo: 'Laudo de acidente do trabalho', desc: 'Judicial ou extrajudicial: dados do acidente, local e máquina, dinâmica pelas versões, normas aplicáveis em quadro (NR-12, NR-35, NR-10…), árvore de causas, medidas existentes e exigíveis, conclusão e quesitos. Preencha "Acidente do trabalho" no Resumo.', fn: laudoAcidente, rec: (c) => ehAcid(c) && (ehPerito(c) || ehExtra(c)), redacao: 'acidente' },
  { id: 'laudoExtra', grupo: '4. Laudo / parecer', titulo: 'Laudo de insalubridade e periculosidade (extrajudicial)', desc: 'Para empresa, trabalhador ou advogado: capa com contratante e ART, identificação, metodologia, agentes com confronto do Anexo 11, quadro conclusivo, recomendações (NR-1) e encerramento, sem endereçamento ao Juízo.', fn: (id) => laudoPericial(id, { extra: true }), rec: (c) => ehExtra(c) && contextoLegal(c).prev === false, redacao: 'laudoExtra' },
  { id: 'ltcat', grupo: '4. Laudo / parecer', titulo: 'LTCAT (com dados para o PPP)', desc: 'LTCAT extrajudicial, inclusive extemporâneo e por similaridade (IN 128/2022, art. 276): identificação, condições, fundamentação, profissiografia, agentes, conclusão por período e anexos.', fn: ltcatPpp, rec: (c) => ehExtra(c) && ehPrev(c), redacao: 'ltcat' },
  { id: 'parprev', grupo: '4. Laudo / parecer', titulo: 'Parecer técnico previdenciário (para o segurado)', desc: 'Avaliação das condições especiais por vínculo, para o segurado ou o advogado, antes do requerimento ou da ação.', fn: parecerPrevidenciario, rec: (c) => ehExtra(c) && ehPrev(c) && !contratouEmpresa(c), redacao: 'parprev' },
  { id: 'parecerAT', grupo: '4. Laudo / parecer', titulo: 'Parecer de assistente técnico sobre o laudo', desc: 'Conforme a sua posição (concorda, impugna em parte ou impugna): síntese por agente ou por período, pontos divergentes, análise, quesitos de esclarecimento e requerimentos.', fn: parecerAssistente, rec: ehAT, redacao: 'parecerAT' },
  { id: 'prevent', grupo: '4. Laudo / parecer', titulo: 'Parecer preventivo para a empresa', desc: 'Avaliação de risco, análise crítica da documentação de SST e recomendações.', fn: parecerPreventivo, rec: (c) => !ehPrev(c) && (/réu/i.test(c.papel || '') || (ehExtra(c) && contratouEmpresa(c))), redacao: 'prevent' },
  { id: 'supl', grupo: '5. Quesitos suplementares e esclarecimentos', titulo: 'Resposta aos quesitos suplementares', desc: 'Depois do laudo (art. 477, § 2º, do CPC): referência à decisão e ao laudo, cada quesito suplementar por parte com a resposta, retificação de erro material e ratificação das conclusões. Cadastre os quesitos na etapa 3, marcados como suplementares.', fn: respostaQuesitosSuplementares, rec: ehPerito, redacao: 'supl' },
  { id: 'atAvulsa', grupo: '5. Quesitos suplementares e esclarecimentos', titulo: 'Petições do assistente técnico', desc: 'Escolha: quesitos suplementares (art. 469), pedido de esclarecimentos ao perito (art. 477, § 2º) ou manifestação sobre os esclarecimentos.', fn: peticaoAssistente, rec: ehAT, redacao: 'peticaoAT' },
  { id: 'pagto', grupo: '6. Recebimento dos honorários', titulo: 'Pagamento dos honorários', desc: 'Pedido de requisição de pagamento (JF) ou de liberação por alvará, com a conta escolhida.', fn: peticaoPagamento, rec: ehPerito, usaConta: true },
  { id: 'peritoAvulsa', grupo: '7. Outras petições do perito', titulo: 'Prorrogação, diligência frustrada ou escusa', desc: 'Escolha: prorrogação do prazo do laudo (art. 476), diligência frustrada ou documentos não apresentados (arts. 380 e 473, § 3º) ou escusa do encargo (art. 157).', fn: peticaoPeritoAvulsa, rec: ehPerito },
];

void figurasDoCaso; void blocoAssinatura;
