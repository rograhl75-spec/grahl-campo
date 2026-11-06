import { ORIGEM_QUESITO } from '../schema.js';
import { p, run } from './ooxml.js';
import {
  Doc, carregar, finalizar, dataBR, menosCincoAnos, partes, credencial, papelAssinatura, equipamentosUsados, quadroEquipamentos,
  quadroDiligencia, quadroPeriodos, quadroEpis, quadroDocumentos, quadroCriteriosRuido, subperiodosRuido, quadroMedicoesRuido,
  quadroMedicoesGenerico, medicoesPorAgente, nomePostoFn, profissiografia, figurasDoCaso, capaTecnica, blocoAssinatura,
} from './base.js';
import {
  laudoPericial, ltcatPpp, parecerPrevidenciario, parecerAssistente, parecerPreventivo, peticaoIndicacaoAT, peticaoAgendamento, peticaoHonorarios,
} from './modelos.js';

export { dataBR };

const ehPerito = (c) => c.papel === 'Perito do Juízo';
const ehAT = (c) => /Assistente/i.test(c.papel || '');
const ehExtra = (c) => c.tipoAtuacao === 'Extrajudicial' || /extrajudicial/i.test(c.papel || '');

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
    d.texto('Marcos adicionais a observar: 13/08/2014 (início do Anexo 8 da NR-15 – vibração) e 13/11/2019 (Emenda Constitucional nº 103/2019).');
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
    const lista = dados.quesitos.filter((q) => (q.data.origem || 'Outro') === origem);
    if (!lista.length) continue;
    n += 1;
    d.h2(`7.${n}`, `Quesitos – ${origem}`);
    for (const q of lista) d.add(p([run(`${q.data.numero || '•'}) `, { b: true }), run(q.data.texto || '')], { after: 100 }));
  }
  if (!n) d.texto(ehExtra(c) ? 'Não se aplica (perícia extrajudicial).' : '[[Quesitos não cadastrados.]]');

  d.h1('8', 'Planejamento da diligência');
  d.identificacao([['Data e horário', [dataBR(c.dataDiligencia), c.horaDiligencia].filter(Boolean).join(' às ') || 'a definir'], ['Local', [c.vistoriaLocal, c.vistoriaEndereco].filter(Boolean).join(' – ')]]);
  d.h2('8.1', 'Roteiro e documentos a solicitar'); d.texto(c.roteiro || '[[roteiro]]');
  d.h2('8.2', 'Equipamentos');
  const levar = dados.equipamentos.filter((e) => (c.equipamentos || []).includes(e.id));
  quadroEquipamentos(d, levar, 'Equipamentos a levar');
  if (ehExtra(c)) {
    d.h2('8.3', 'Estrutura prevista do LTCAT e campos do PPP');
    d.texto('O LTCAT seguirá os elementos do art. 276 da IN 128/2022, com sumário e formatação ABNT, e o PPP será emitido por subperíodo, com código GFIP 04 quando houver enquadramento.');
  }
  if (c.observacoes) { d.h2('8.4', 'Observações'); d.texto(c.observacoes); }
  void credencial; void papelAssinatura;
  return finalizar(d, { titulo: 'Pré-relatório', arquivo: 'Pre-relatorio', c });
}

// ---------------- REGISTRO DA DILIGÊNCIA ----------------
export async function gerarRegistroDiligencia(caseId) {
  const dados = await carregar(caseId);
  const { c } = dados;
  const pt = partes(c);
  const d = new Doc();
  d.add(p([run('REGISTRO DA DILIGÊNCIA', { b: true, size: 14, color: '1B365D' })], { align: 'center', after: 60 }));
  if (c.numero) d.add(p([run(`Processo nº ${c.numero}${c.juizo ? ` – ${c.juizo}` : ''}`)], { align: 'center', after: 0 }));
  d.add(p([run([c.autorNome, c.reuNome].filter(Boolean).join(' × '))], { align: 'center', after: 240 }));
  d.h1('1', 'Dados da diligência', { novaPagina: false });
  quadroDiligencia(d, c);
  d.h1('2', 'Equipamentos utilizados', { novaPagina: false });
  quadroEquipamentos(d, equipamentosUsados(dados));
  d.h1('3', 'Postos e atividades avaliados', { novaPagina: false });
  profissiografia(d, dados.postos);
  const g = medicoesPorAgente(dados);
  const nome = nomePostoFn(dados.postos);
  const eq = new Map(dados.equipamentos.map((e) => [e.id, e]));
  if (dados.medicoes.length) {
    d.h1('4', 'Medições', { novaPagina: false });
    if (g['Ruído']) quadroMedicoesRuido(d, g['Ruído'], eq, nome);
    for (const [k, ms] of Object.entries(g)) if (k !== 'Ruído') quadroMedicoesGenerico(d, `Resultados – ${k}`, ms, nome);
  }
  const resp = dados.quesitos.filter((q) => (q.data.resposta || '').trim());
  if (resp.length) {
    d.h1('5', 'Anotações de campo sobre os quesitos', { novaPagina: false });
    for (const q of resp) {
      d.add(p([run(`${q.data.origem || ''} – ${q.data.numero || ''}) `, { b: true }), run(q.data.texto || '', { i: true })], { after: 40 }));
      d.add(p(q.data.resposta, { left: 709 }));
    }
  }
  if (c.vistoriaNotas) { d.h1('6', 'Anotações gerais', { novaPagina: false }); d.texto(c.vistoriaNotas); }
  void pt;
  return finalizar(d, { titulo: 'Registro da diligência', arquivo: 'Registro_diligencia', c });
}

// ---------------- RELATÓRIO FOTOGRÁFICO ----------------
export async function gerarRelatorioFotografico(caseId) {
  const dados = await carregar(caseId);
  const { c } = dados;
  const d = new Doc();
  d.add(p([run('RELATÓRIO FOTOGRÁFICO', { b: true, size: 14, color: '1B365D' })], { align: 'center', after: 60 }));
  if (c.numero) d.add(p([run(`Processo nº ${c.numero}`)], { align: 'center', after: 0 }));
  d.add(p([run([c.autorNome, c.reuNome].filter(Boolean).join(' × '))], { align: 'center', after: 60 }));
  d.add(p([run(`Diligência: ${dataBR(c.vistoriaData) || '—'}${c.vistoriaLocal ? ` – ${c.vistoriaLocal}` : ''}`)], { align: 'center', after: 240 }));
  const { lista, faltando } = await figurasDoCaso(dados);
  if (lista.length) d.figuras(lista); else d.texto('Nenhuma foto registrada.');
  const r = await finalizar(d, { titulo: 'Relatório fotográfico', arquivo: 'Relatorio_fotografico', c });
  return { ...r, faltando };
}

// ---------------- CATÁLOGO ----------------
// rec: em quais situações o documento é sugerido
export const CATALOGO = [
  { id: 'pre', grupo: 'Preparação', titulo: 'Pré-relatório', desc: 'Identificação, síntese dos autos, períodos (com a divisão pelos critérios de ruído), documentos, EPIs, quesitos e planejamento.', fn: gerarPreRelatorio, rec: () => true },
  { id: 'honor', grupo: 'Petições', titulo: 'Aceite e proposta de honorários', desc: 'Aceite do encargo e estimativa de horas (art. 465, § 2º, do CPC).', fn: peticaoHonorarios, rec: ehPerito },
  { id: 'agenda', grupo: 'Petições', titulo: 'Agendamento da diligência', desc: 'Data, horário e local, intimação das partes (art. 474) e documentos a apresentar.', fn: peticaoAgendamento, rec: ehPerito },
  { id: 'indic', grupo: 'Petições', titulo: 'Indicação de assistente técnico e quesitos', desc: 'Qualificação, documentos necessários, avaliações no local, quesitos e requerimentos.', fn: peticaoIndicacaoAT, rec: ehAT },
  { id: 'reg', grupo: 'Campo', titulo: 'Registro da diligência', desc: 'Data, local, presentes, equipamentos com calibração, postos, medições e anotações dos quesitos.', fn: gerarRegistroDiligencia, rec: () => true },
  { id: 'foto', grupo: 'Campo', titulo: 'Relatório fotográfico', desc: 'Fotos numeradas, duas por linha, com legenda, data/hora e GPS.', fn: gerarRelatorioFotografico, rec: () => true },
  { id: 'laudo', grupo: 'Laudo / parecer', titulo: 'Laudo pericial', desc: 'Estrutura completa do laudo do perito: diligência, metodologia, ambiente, EPC/EPI, agentes, conclusão e respostas aos quesitos.', fn: laudoPericial, rec: ehPerito },
  { id: 'parecerAT', grupo: 'Laudo / parecer', titulo: 'Parecer de assistente técnico / impugnação', desc: 'Síntese do laudo, análise por agente, quesitos de esclarecimento e requerimentos.', fn: parecerAssistente, rec: ehAT },
  { id: 'prevent', grupo: 'Laudo / parecer', titulo: 'Parecer preventivo para a empresa', desc: 'Avaliação de risco, análise crítica da documentação de SST e recomendações.', fn: parecerPreventivo, rec: (c) => /réu/i.test(c.papel || '') },
  { id: 'ltcat', grupo: 'Laudo / parecer', titulo: 'LTCAT + PPP', desc: 'Modelo do LTCAT extrajudicial (IN 128/2022): identificação, condições, fundamentação, profissiografia, agentes, conclusão e anexos.', fn: ltcatPpp, rec: ehExtra },
  { id: 'parprev', grupo: 'Laudo / parecer', titulo: 'Parecer técnico previdenciário', desc: 'Avaliação das condições especiais por vínculo, para o segurado ou o advogado.', fn: parecerPrevidenciario, rec: (c) => ehExtra(c) || c.materia === 'Previdenciária' },
];

void figurasDoCaso; void blocoAssinatura;
