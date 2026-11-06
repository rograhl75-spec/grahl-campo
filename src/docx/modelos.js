// Modelos de documentos da GRAHL, baseados nos documentos reais do signatário:
// laudo pericial (Fazenda Pública), parecer técnico previdenciário, LTCAT+PPP,
// impugnação / parecer de assistente técnico, parecer preventivo, petição de
// indicação com quesitos. O que depende de análise técnica sai marcado em
// amarelo ("[[Redigir: ...]]") para ser escrito por você.
import { ORIGEM_QUESITO } from '../schema.js';
import {
  Doc, carregar, finalizar, dataBR, menosCincoAnos, ou, partes, papelAssinatura, enderecamentoTexto, linhasProcesso,
  qualificacaoCurta, qualificacaoCompleta, blocoAssinatura, credencial, equipamentosUsados, quadroEquipamentos, quadroDiligencia,
  quadroPeriodos, quadroEpis, quadroDocumentos, quadroCriteriosRuido, quadroConfrontoRuido, quadroMedicoesRuido,
  quadroMedicoesGenerico, medicoesPorAgente, nomePostoFn, profissiografia, figurasDoCaso, respostasQuesitos, capaTecnica,
} from './base.js';
import { p, run } from './ooxml.js';

const v = (x) => (x === undefined || x === null ? '' : String(x).trim());

function eqMap(dados) { return new Map(dados.equipamentos.map((e) => [e.id, e])); }

// Seção de avaliação: um subtítulo por agente medido + os agentes alegados sem medição
function avaliacaoAgentes(d, dados, base, { previdenciario }) {
  const g = medicoesPorAgente(dados);
  const nome = nomePostoFn(dados.postos);
  const eq = eqMap(dados);
  let n = 0;
  const sub = (t) => { n += 1; d.h2(`${base}.${n}`, t); };
  if (g['Ruído']) {
    sub('Ruído');
    if (previdenciario) quadroCriteriosRuido(d);
    else d.texto('Limite de tolerância de 85 dB(A) para 8 horas, com incremento de duplicação de dose q = 5 (NR-15, Anexo 1).');
    quadroMedicoesRuido(d, g['Ruído'], eq, nome);
    if (previdenciario) quadroConfrontoRuido(d, dados);
    d.redigir(previdenciario ? 'análise do ruído por período (fonte, habitualidade e permanência; EPI não descaracteriza – STF, Tema 555).' : 'análise do ruído e da neutralização pelo protetor auricular (CA, NRRsf, fichas de entrega).');
  }
  if (g['Calor (IBUTG)']) {
    sub('Calor');
    d.texto(previdenciario
      ? 'Enquadramento pelo cód. 2.0.4 do Anexo IV do Decreto 3.048/1999, que prevalece sobre a redação mais restritiva da IN INSS (hierarquia normativa). O IBUTG medido é ajustado pela vestimenta (NHO-06) e comparado com o limite.'
      : 'Avaliação conforme a NR-15, Anexo 3, e a NHO-06; IBUTG ajustado pela vestimenta e comparado com o limite para a taxa metabólica (linha imediatamente superior do quadro, sem interpolar).');
    quadroMedicoesGenerico(d, 'Resultados – Calor', g['Calor (IBUTG)'], nome);
    d.redigir('taxa metabólica, regime de trabalho e conclusão.');
  }
  for (const k of ['Vibração de corpo inteiro (VCI)', 'Vibração de mãos e braços (VMB)']) {
    if (!g[k]) continue;
    sub(k);
    d.texto(previdenciario
      ? 'Até 13/08/2014 apresentam-se as duas leituras, inclusive pela norma ISO (VCI: fronteira superior da zona de cautela da ISO 2631-1; VMB: 5 m/s², Diretiva 2002/44/CE); a partir de 13/08/2014, NR-15, Anexo 8, com as NHO-09 e NHO-10.'
      : 'Avaliação conforme a NR-15, Anexo 8, e as NHO-09 (VCI) e NHO-10 (VMB).');
    quadroMedicoesGenerico(d, `Resultados – ${k}`, g[k], nome);
    d.redigir('aren e VDVR normalizados para a jornada e conclusão.');
  }
  for (const k of ['Agente químico', 'Outro']) {
    if (!g[k]) continue;
    sub(k === 'Outro' ? 'Outros agentes avaliados' : 'Agentes químicos');
    quadroMedicoesGenerico(d, k === 'Outro' ? 'Outros registros' : 'Resultados – Agentes químicos', g[k], nome);
    d.redigir(previdenciario ? 'enquadramento (óleos minerais: somente cód. 1.0.17; avaliação qualitativa quando não há limite).' : 'enquadramento no anexo da NR-15 aplicável (jornada > 48 h: correção do limite por Brief & Scala).');
  }
  if (v(dados.c.agentesAlegados)) {
    sub(n ? 'Demais agentes alegados' : 'Agentes alegados');
    d.texto(`Agentes indicados nos autos: ${dados.c.agentesAlegados.replace(/\n+/g, '; ')}`);
    d.redigir(previdenciario
      ? 'avaliação de cada agente alegado. Biológicos: somente o rol de atividades do cód. 3.0.1 do Anexo IV (não usar o Anexo 14 da NR-15).'
      : 'avaliação de cada agente alegado no anexo correspondente da NR-15 / NR-16.');
  }
  if (!n) d.redigir('avaliação dos agentes (cadastre as medições na aba Campo).');
}

// ======================================================================
// LAUDO PERICIAL (perito do juízo) – trabalhista, Fazenda Pública, cível
// ======================================================================
export async function laudoPericial(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const pt = partes(c);
  const prev = pt.prev;
  const d = new Doc();
  d.enderecamento(enderecamentoTexto(c), linhasProcesso(c));
  d.texto(`${qualificacaoCurta(perfil)}, perito nomeado e compromissado nos autos do processo em epígrafe, tendo realizado as vistorias, os levantamentos técnicos e as diligências necessárias, vem, respeitosamente, à presença de Vossa Excelência, apresentar o presente **LAUDO TÉCNICO PERICIAL**, consubstanciado nas informações e análises a seguir expostas.`);
  d.sumario();

  d.h1('1', 'Identificação e dados da diligência pericial');
  d.h2('1.1', 'Dados do processo');
  d.identificacao([['Processo', c.numero], ['Juízo', [c.juizo, c.comarca].filter(Boolean).join(' – ')], [pt.autor, c.autorNome], [pt.reu, c.reuNome],
    ['Objeto', (c.objeto || []).join(', ')], ...(pt.trab && c.dataAjuizamento ? [['Período imprescrito', `a partir de ${menosCincoAnos(c.dataAjuizamento)}`]] : [])]);
  d.h2('1.2', 'Data, hora e local da vistoria');
  quadroDiligencia(d, c);
  d.h2('1.3', 'Instrumentos utilizados');
  quadroEquipamentos(d, equipamentosUsados(dados));

  d.h1('2', 'Objetivo e metodologia da avaliação pericial');
  d.h2('2.1', 'Determinação judicial (objeto da perícia)');
  d.redigir('transcrever ou resumir o despacho que determinou a perícia (ID / mov.).');
  d.h2('2.2', 'Objetivo técnico');
  d.texto(`Em atendimento à determinação judicial, o presente laudo tem por objetivo apurar as reais condições do ambiente e das atividades laborais desenvolvidas pela parte ${pt.autorCurto.toLowerCase()}, para a caracterização ou descaracterização de ${(c.objeto || []).join(', ').toLowerCase() || '[[objeto]]'}.`);
  d.h2('2.3', 'Metodologia');
  d.texto('Em atendimento ao art. 473, inciso III, do Código de Processo Civil, a metodologia consistiu em análise dos autos, inspeção *in loco*, entrevista com as partes e avaliações ambientais, quando cabíveis, conforme as Normas Regulamentadoras e as Normas de Higiene Ocupacional da FUNDACENTRO.');
  d.texto('A conclusão deste laudo fundamenta-se exclusivamente na norma técnica. Eventuais entendimentos jurisprudenciais aplicáveis são registrados para apreciação do Juízo.');

  d.h1('3', 'Descrição do ambiente e das atividades laborais');
  d.h2('3.1', 'Função, período e atividades alegadas');
  d.texto(c.funcoes || '');
  d.texto(c.atividadesAlegadas || '');
  d.h2('3.2', 'Ambiente e atividades constatados na diligência');
  profissiografia(d, dados.postos);

  d.h1('4', 'Equipamentos de proteção coletiva (EPC) e individual (EPI)');
  d.h2('4.1', 'Medidas de proteção coletiva');
  d.redigir('EPC existentes e sua eficácia.');
  d.h2('4.2', 'Equipamentos de proteção individual e registros');
  quadroEpis(d, dados.epis);
  if (c.analiseEpi) d.texto(c.analiseEpi);
  d.h2('4.3', 'Conclusão técnica quanto à neutralização');
  d.redigir('neutralização ou não (CA válido, periodicidade de troca, treinamento, uso efetivo).');

  d.h1('5', prev ? 'Avaliação técnica dos agentes' : 'Avaliação técnica dos agentes (NR-15 e NR-16)');
  avaliacaoAgentes(d, dados, '5', { previdenciario: prev });

  d.h1('6', 'Conclusão pericial');
  d.redigir(`conclusão por agente e por período${pt.trab ? ' (grau de insalubridade e/ou periculosidade)' : ''}.`);

  d.h1('7', 'Respostas aos quesitos');
  d.texto('Em atendimento ao art. 473, inciso IV, do Código de Processo Civil, passa-se a responder aos quesitos formulados, com remissão às análises do corpo deste laudo.');
  respostasQuesitos(d, dados.quesitos, '7', c);

  d.h1('8', 'Encerramento e anexos');
  d.texto('Nada mais havendo a relatar no âmbito da Engenharia de Segurança do Trabalho, este Perito dá por encerrados os trabalhos periciais, colocando-se à disposição do Juízo e das partes para os esclarecimentos que se fizerem necessários.');
  d.texto('Integra o presente laudo o Anexo I – Relatório fotográfico da diligência.');
  blocoAssinatura(d, dados, 'Perito do Juízo');
  const { lista, faltando } = await figurasDoCaso(dados);
  if (lista.length) { d.h1('', 'Anexo I – Relatório fotográfico da diligência'); d.figuras(lista); }
  const r = await finalizar(d, { titulo: 'Laudo técnico pericial', arquivo: 'Laudo_pericial', c });
  return { ...r, faltando };
}

// ======================================================================
// LTCAT + PPP (extrajudicial, inclusive extemporâneo / por similaridade)
// ======================================================================
export async function ltcatPpp(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const d = new Doc();
  const seg = c.autorNome || '[[segurado]]';
  const emp = c.reuNome || dados.periodos[0]?.data.empresa || '[[empresa]]';
  capaTecnica(d, {
    titulo: 'LAUDO TÉCNICO DAS CONDIÇÕES AMBIENTAIS DO TRABALHO (LTCAT)',
    subtitulo: 'Demonstração ambiental para fins previdenciários (art. 58 da Lei nº 8.213/1991)',
    perfil,
    pares: [['Segurado', seg], ['CPF / NIT', c.autorCpf], ['Empresa', emp], ['CNPJ', c.reuCnpj],
      ['Períodos avaliados', dados.periodos.map((r) => `${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`).join('; ')],
      ['Responsável técnico', `${perfil.nome} – ${credencial(perfil)}`], ['Data da avaliação', dataBR(c.vistoriaData)]],
  });
  d.listaQuadros();
  d.sumario();

  d.h1('1', 'Identificação');
  d.h2('1.1', 'Empresa emitente');
  d.identificacao([['Razão social', emp], ['CNPJ', c.reuCnpj], ['Endereço', c.vistoriaEndereco]]);
  d.h2('1.2', 'Segurado');
  d.identificacao([['Nome', seg], ['CPF / NIT', c.autorCpf], ['Nascimento', dataBR(c.autorNascimento)], ['Função', c.funcoes]]);
  d.h2('1.3', 'Períodos avaliados');
  quadroPeriodos(d, dados.periodos);
  d.h2('1.4', 'Responsável técnico');
  d.identificacao([['Nome', perfil.nome], ['Formação', perfil.titulos], ['Registro', credencial(perfil)], ['ART', '[[nº da ART]]']]);

  d.h1('2', 'Condições da avaliação');
  d.h2('2.1', 'Objeto e natureza');
  d.texto(`Este laudo avalia a exposição de ${seg} a agentes nocivos nas atividades exercidas na ${emp}, nos períodos do item 1.3, para fundamentar o PPP (Anexo A). [[Avaliação individual / extemporânea / por similaridade – ajustar.]]`);
  d.h2('2.2', 'Diligência');
  d.texto('O laudo individual exige autorização escrita da empresa, identificação do acompanhante designado e registro da data e do local da avaliação (art. 277, IV, da IN 128/2022).');
  quadroDiligencia(d, c);
  d.h2('2.3', 'Declarações');
  d.redigir('autorização da diligência e declarações do responsável legal / ex-sócio, com assinaturas.');
  d.h2('2.4', 'Instrumentos e calibração');
  quadroEquipamentos(d, equipamentosUsados(dados));
  d.h2('2.5', 'Valor probatório');
  d.texto('O laudo extrajudicial é meio de prova lícito (arts. 369 e 371 do CPC) e pode dispensar a perícia judicial quando suficiente (art. 472). Sua estrutura atende ao art. 473 do CPC – objeto, análise técnica, método e conclusão – e a extemporaneidade não lhe retira a eficácia (Súmula 68 da TNU).');

  d.h1('3', 'Fundamentação');
  d.texto('O enquadramento observa a lei vigente à época da prestação do serviço (*tempus regit actum*). O critério de cada agente consta do item 5.');
  d.h2('3.1', 'Exigências por período');
  d.quadro('Forma de enquadramento, prova e medidas de controle', [['Período', 'Enquadramento', 'Documentos', 'Permanência', 'EPC / EPI'],
    ['Até 13/10/1996', 'Agente nocivo', 'Formulário; laudo para ruído', 'Exigida', 'Não considerados'],
    ['14/10/1996 a 02/12/1998', 'Agente nocivo', 'Formulário com base em LTCAT', 'Exigida', 'EPC informado; EPI não considerado'],
    ['03/12/1998 a 31/12/2003', 'Agente nocivo', 'Formulário com base em LTCAT ou PPP', 'Exigida', 'EPC e EPI considerados'],
    ['A partir de 01/01/2004', 'Agente nocivo', 'PPP com base em LTCAT', 'Exigida', 'EPC e EPI considerados; NHO obrigatórias']],
  { larguras: [0.2, 0.16, 0.26, 0.14, 0.24], tam: 9, fonte: 'Elaborado pelo autor com base em Brasil (2022, arts. 274, 285, 286, 289 e 291).' });
  d.h2('3.2', 'Categoria de segurado e Emenda Constitucional nº 103/2019');
  d.redigir('categoria do segurado (empregado / contribuinte individual – STJ, Tema 1291) e efeitos da EC 103/2019 a partir de 14/11/2019.');

  d.h1('4', 'Ambiente de trabalho e profissiografia');
  profissiografia(d, dados.postos);
  const { lista, faltando } = await figurasDoCaso(dados);
  if (lista.length) { d.h2('4.3', 'Registro fotográfico'); d.figuras(lista); }

  d.h1('5', 'Avaliação dos agentes e das condições especiais');
  d.h2('5.1', 'Critérios gerais');
  d.texto('As avaliações seguem as NHO da FUNDACENTRO e os limites de tolerância do Anexo IV do RPS ou, na falta destes, da NR-15 (art. 288 da IN 128/2022). A avaliação é quantitativa quando há limite de tolerância e qualitativa quando a nocividade decorre da simples exposição (art. 287). O rol de agentes do Anexo IV é exaustivo; as atividades nele descritas são exemplificativas (art. 287, § 4º).');
  d.h2('5.2', 'Medidas de controle');
  d.texto('Considera-se adotado o EPC que elimina ou neutraliza a nocividade (art. 290 da IN 128/2022). O EPI só é considerado a partir de 03/12/1998 e quando atendidos, cumulativamente, os requisitos do art. 291. Para ruído, o EPI não descaracteriza a especialidade (STF, Tema 555); para os demais agentes, a dúvida sobre a eficácia favorece o segurado (STJ, Tema 1090).');
  quadroEpis(d, dados.epis);
  avaliacaoAgentes(d, { ...dados }, '5', { previdenciario: true });

  d.h1('6', 'Conclusão');
  d.h2('6.1', 'Síntese do enquadramento');
  if (dados.periodos.length) {
    d.quadro('Síntese do enquadramento por período', [['Período', 'Agente(s)', 'Código', 'Enquadra'],
      ...dados.periodos.map((r) => [`${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`, r.data.agentes || '[[agentes]]', '[[cód.]]', '[[S/N]]'])],
    { larguras: [0.26, 0.38, 0.18, 0.18] });
  }
  d.h2('6.2', 'Parecer técnico');
  d.redigir(`conclusão: ${seg} exerceu suas atividades na ${emp}, nos períodos de ..., em condições que CARACTERIZAM / NÃO CARACTERIZAM exposição habitual e permanente, não ocasional nem intermitente, a agentes nocivos (código GFIP 04 quando especial).`);
  d.h1('7', 'Recomendações');
  d.texto('Em atendimento ao art. 58, § 2º, da Lei nº 8.213/1991, recomendam-se as medidas abaixo, na ordem de prioridade da NR-1. As recomendações não alteram o enquadramento dos períodos avaliados.');
  d.redigir('quadro de recomendações por agente.');
  d.h1('8', 'Encerramento');
  d.texto('Este laudo foi elaborado com imparcialidade técnica, sob responsabilidade civil e criminal do signatário, e é assinado digitalmente. A validade dos dados pretéritos depende da veracidade das declarações do item 2.3.');
  blocoAssinatura(d, dados, `Responsável técnico – ART nº [[nº]]`);
  d.h1('', 'Anexos');
  d.texto('- Anexo A – Perfil Profissiográfico Previdenciário (PPP)\n- Anexo B – Calibração dos instrumentos\n- Anexo C – Anotação de Responsabilidade Técnica\n- Anexo D – Comprovante de inscrição no CNPJ\n- Anexo E – Fichas com dados de segurança dos produtos químicos\n- Anexo F – Anotações da CTPS');
  const r = await finalizar(d, { titulo: 'LTCAT', arquivo: 'LTCAT_PPP', c });
  return { ...r, faltando };
}

// ======================================================================
// PARECER TÉCNICO PREVIDENCIÁRIO (para o segurado / advogado)
// ======================================================================
export async function parecerPrevidenciario(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const d = new Doc();
  capaTecnica(d, {
    titulo: 'PARECER TÉCNICO', subtitulo: 'Avaliação das condições especiais de trabalho para fins previdenciários',
    linha2: c.funcoes ? `Atividade: ${c.funcoes.split('\n')[0].slice(0, 80)}` : '', perfil,
    pares: [['Requerente', c.autorNome], ['CPF', c.autorCpf], ['Períodos avaliados', `${dados.periodos.length} vínculo(s)`],
      ['Finalidade', 'Subsidiar requerimento administrativo ou ação judicial de aposentadoria especial'],
      ['Responsável técnico', `${perfil.nome} – ${perfil.titulos} – ${credencial(perfil)}`], ['Local e data', `${perfil.cidade}, ${new Date().toLocaleDateString('pt-BR')}`]],
  });
  d.listaQuadros();
  d.sumario();
  d.h1('1', 'Responsabilidade técnica e natureza do documento');
  d.texto(`Este parecer foi elaborado por ${perfil.nome}, ${perfil.titulos}, ${credencial(perfil)}, a pedido do requerente. Trata-se de parecer técnico de engenharia de segurança do trabalho, sem caráter de laudo oficial da empresa, destinado a fornecer parâmetros técnicos objetivos.`);
  d.h1('2', 'Objeto e finalidade');
  d.texto(c.pedidos || '');
  d.redigir('objeto e finalidade (agentes e vínculos avaliados; princípio tempus regit actum).');
  d.h1('3', 'Identificação do requerente e dos vínculos');
  d.identificacao([['Requerente', c.autorNome], ['CPF / NIT', c.autorCpf], ['Nascimento', dataBR(c.autorNascimento)]]);
  quadroPeriodos(d, dados.periodos, 'Vínculos avaliados');
  d.h1('4', 'Fundamentação legal e jurisprudencial');
  d.h2('4.1', 'Enquadramento por período (tempus regit actum)');
  d.redigir('enquadramento por categoria até 28/04/1995 e por agente depois.');
  d.h2('4.2', 'Ruído');
  quadroCriteriosRuido(d);
  d.h1('5', 'Metodologia');
  d.redigir('etapas; avaliação por similaridade (quando aplicável); normalização pela jornada efetiva; instrumentação.');
  quadroEquipamentos(d, equipamentosUsados(dados));
  d.h1('6', 'Descrição das atividades por vínculo');
  dados.periodos.forEach((r, i) => {
    d.h2(`6.${i + 1}`, `V${i + 1} – ${r.data.empresa || 'Empresa'} – ${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`);
    d.texto(r.data.atividades || '[[atividades do vínculo]]');
  });
  if (!dados.periodos.length) d.redigir('cadastre os vínculos na aba Preparação.');
  profissiografia(d, dados.postos);
  d.h1('7', 'Avaliação técnica');
  avaliacaoAgentes(d, dados, '7', { previdenciario: true });
  d.h2('', 'EPI e EPC');
  quadroEpis(d, dados.epis);
  d.h1('8', 'Quadro conclusivo');
  quadroConfrontoRuido(d, dados);
  d.quadro('Quadro conclusivo por vínculo', [['Vínculo', 'Período', 'Agente(s)', 'Conclusão'],
    ...dados.periodos.map((r, i) => [`V${i + 1} – ${r.data.empresa || ''}`, `${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`, r.data.agentes || '[[agentes]]', '[[especial / comum]]'])],
  { larguras: [0.3, 0.24, 0.26, 0.2] });
  d.h1('9', 'Limitações e ressalvas');
  d.redigir('limitações (similaridade, informações do requerente, documentos não apresentados).');
  d.h1('10', 'Termo de encerramento');
  d.texto('Nada mais havendo a acrescentar, encerra-se o presente parecer técnico, elaborado com imparcialidade e sob responsabilidade do signatário.');
  blocoAssinatura(d, dados, 'Responsável técnico');
  const { lista, faltando } = await figurasDoCaso(dados);
  if (lista.length) { d.h1('', 'Anexo – Registro fotográfico'); d.figuras(lista); }
  const r = await finalizar(d, { titulo: 'Parecer técnico previdenciário', arquivo: 'Parecer_previdenciario', c });
  return { ...r, faltando };
}

// ======================================================================
// PARECER DE ASSISTENTE TÉCNICO / IMPUGNAÇÃO AO LAUDO
// ======================================================================
export async function parecerAssistente(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const pt = partes(c);
  const lado = /réu/i.test(c.papel || '') ? pt.reuCurto : pt.autorCurto;
  const d = new Doc();
  d.enderecamento(enderecamentoTexto(c), linhasProcesso(c, [['Referência', c.refLaudo ? `Laudo pericial (${c.refLaudo})` : '[[ID do laudo pericial]]']]));
  d.texto(`${qualificacaoCurta(perfil)}, assistente técnico indicado pela ${lado}${c.vistoriaData ? `, tendo acompanhado a diligência pericial realizada em ${dataBR(c.vistoriaData)}` : ''}, vem, respeitosamente, à presença de Vossa Excelência, apresentar **MANIFESTAÇÃO TÉCNICA SOBRE O LAUDO PERICIAL**${c.peritoJuizo ? ` elaborado por ${c.peritoJuizo}` : ''}, pelos fundamentos técnicos expostos a seguir.`);
  d.sumario();
  d.h1('1', 'Síntese do laudo e dos pontos analisados');
  d.redigir('resumo da conclusão do laudo e da posição desta assistência (concorda / impugna) por agente.');
  const agentes = (c.objeto || []).filter((o) => ['Insalubridade', 'Periculosidade'].includes(o));
  d.quadro('Síntese das conclusões', [['Agente / tema', 'Conclusão do laudo', 'Posição da assistência técnica'],
    ...(agentes.length ? agentes : ['[[agente]]']).map((a) => [a, '[[conclusão do perito]]', '[[concorda / impugna – motivo]]'])],
  { larguras: [0.24, 0.38, 0.38] });
  let n = 1;
  for (const a of agentes.length ? agentes : ['Análise técnica']) {
    n += 1;
    d.h1(String(n), a);
    d.redigir('pontos técnicos: premissas não verificadas, enquadramento incompleto, quesitos sem resposta, divergências de narrativa, falta de quantificação de tempo/frequência, falta de delimitação do período.');
  }
  d.h1(String(n + 1), 'Elementos registrados na diligência');
  quadroDiligencia(d, c, 'Diligência acompanhada');
  profissiografia(d, dados.postos);
  const g = medicoesPorAgente(dados);
  const nome = nomePostoFn(dados.postos);
  if (g['Ruído']) quadroMedicoesRuido(d, g['Ruído'], eqMap(dados), nome);
  d.h1(String(n + 2), 'Quesitos de esclarecimento');
  d.texto('Com base no exposto, requer-se que o Sr. Perito responda, de forma fundamentada, aos seguintes quesitos de esclarecimento:');
  const compl = dados.quesitos.filter((q) => q.data.origem === 'Complementares');
  if (compl.length) compl.forEach((q, i) => d.texto(`${i + 1}. ${q.data.texto}`, { recuo: false }));
  else d.redigir('quesitos de esclarecimento (cadastre-os na aba Quesitos com origem "Complementares").');
  d.h1(String(n + 3), 'Conclusão técnica e requerimentos');
  d.texto('Com base nos documentos dos autos e no acompanhamento da diligência pericial, este assistente técnico conclui:');
  d.redigir('conclusão por agente (a), b), c)...).');
  d.texto('Diante do exposto, requer-se:\ni) a intimação do Sr. Perito para responder aos quesitos de esclarecimento;\nii) [[retificação / complementação do laudo]];\niii) que o laudo não seja acolhido nos pontos aqui impugnados.');
  d.add(p([run('Nestes termos, pede deferimento.')], { first: 709, before: 240 }));
  blocoAssinatura(d, dados);
  const r = await finalizar(d, { titulo: 'Parecer técnico – assistente técnico', arquivo: 'Parecer_assistente_tecnico', c });
  return r;
}

// ======================================================================
// PARECER PREVENTIVO PARA A EMPRESA (avaliação de risco – Etapa 1)
// ======================================================================
export async function parecerPreventivo(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const pt = partes(c);
  const d = new Doc();
  capaTecnica(d, {
    titulo: 'PARECER TÉCNICO', subtitulo: 'Assessoria inicial e avaliação de risco', linha2: (c.objeto || []).join(', '), perfil,
    pares: [['Processo', c.numero], ['Juízo', c.juizo], [pt.autor, c.autorNome], [pt.reu, c.reuNome], ['Qualidade', papelAssinatura(c)]],
  });
  d.sumario();
  d.h1('1', 'Objetivo');
  d.redigir('objetivo do parecer (avaliar o risco técnico do pedido e subsidiar a defesa e as medidas corretivas).');
  d.h1('2', 'Identificação do caso');
  d.identificacao([['Processo', c.numero], ['Juízo', c.juizo], [pt.autor, c.autorNome], ['Função / período', c.funcoes],
    ['Ajuizamento', dataBR(c.dataAjuizamento)], ['Período imprescrito', c.dataAjuizamento ? `a partir de ${menosCincoAnos(c.dataAjuizamento)}` : ''], ['Pedido', c.pedidos]]);
  d.h1('3', 'Documentos analisados');
  quadroDocumentos(d, dados.documentos);
  d.h1('4', 'Fundamentação técnica e legal');
  d.redigir('normas e súmulas aplicáveis ao agente discutido.');
  d.h1('5', 'Instalações e atividades');
  profissiografia(d, dados.postos);
  d.h1('6', 'Análise crítica dos documentos de SST');
  quadroEpis(d, dados.epis);
  if (c.analiseEpi) d.texto(c.analiseEpi);
  d.redigir('PGR / LTCAT / PCMSO / ASO / fichas de EPI – pontos fortes e lacunas.');
  d.h1('7', 'Avaliação dos riscos de condenação');
  d.redigir('argumentos de defesa ainda exploráveis e pontos de atenção.');
  d.h1('8', 'Recomendações');
  d.redigir('subsídios para a contestação, registro da condição atual e plano de ação.');
  d.h1('9', 'Conclusão');
  d.redigir('conclusão.');
  blocoAssinatura(d, dados);
  return finalizar(d, { titulo: 'Parecer técnico preventivo', arquivo: 'Parecer_preventivo', c });
}

// ======================================================================
// PETIÇÕES
// ======================================================================
const DOCS_PADRAO = [
  'PPRA (até 2021) e PGR com inventário de riscos e plano de ação (a partir de 2022), LTCAT e PCMSO, abrangendo todo o período discutido',
  'avaliações quantitativas dos agentes ambientais, com metodologia, equipamentos e certificados de calibração',
  'fichas de entrega de EPI com os números de CA, comprovantes de troca e registros de treinamento',
  'PPP do(a) trabalhador(a) e descrição de cargo / ordens de serviço',
  'Fichas com Dados de Segurança (FDS/FISPQ) dos produtos químicos utilizados',
];

export async function peticaoIndicacaoAT(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const pt = partes(c);
  const lado = /réu/i.test(c.papel || '') ? pt.reuCurto : pt.autorCurto;
  const origemLado = /réu/i.test(c.papel || '') ? 'Réu / Reclamada' : 'Autor / Reclamante';
  const d = new Doc();
  d.enderecamento(enderecamentoTexto(c), linhasProcesso(c, [['Perito do Juízo', c.peritoJuizo]]));
  d.texto(`${qualificacaoCompleta(perfil)}, vem, respeitosamente, à presença de Vossa Excelência, na qualidade de **assistente técnico indicado pela ${lado}**, nos termos ${pt.trab ? 'do art. 3º da Lei nº 5.584/1970 e ' : ''}dos arts. 465, § 1º, II, e 466, § 1º, do Código de Processo Civil${c.despachoRef ? `, em atenção a ${c.despachoRef}` : ''}, expor e requerer o que segue.`);
  d.h1('1.', 'Da indicação do assistente técnico', { novaPagina: false });
  d.texto(`O signatário foi indicado pela ${lado} para acompanhar, como seu assistente técnico, a prova pericial de ${(c.objeto || []).join(' e ').toLowerCase() || '[[objeto]]'} determinada por este Juízo${c.peritoJuizo ? `, a cargo do Sr. Perito ${c.peritoJuizo}` : ''}.`);
  d.texto('Requer seja o signatário cadastrado nos autos e que o Sr. Perito comunique a data, o horário e o local da diligência com antecedência, também pelos contatos acima, de modo a assegurar o acompanhamento previsto no art. 466, § 2º, do CPC.');
  d.texto('No desempenho da função, o assistente técnico poderá valer-se dos meios previstos no art. 473, § 3º, do CPC, inclusive registro fotográfico, obtenção de informações e solicitação de documentos em poder das partes.');
  d.h1('2.', 'Dos documentos necessários à perícia', { novaPagina: false });
  d.texto(`Para que a perícia retrate as reais condições de trabalho${c.dataAjuizamento && pt.trab ? ` no período imprescrito (a partir de ${menosCincoAnos(c.dataAjuizamento)})` : ''}, requer seja a parte intimada a apresentar ao Sr. Perito, até a data da diligência, os documentos abaixo:`);
  const docs = v(c.roteiro) ? c.roteiro.split('\n').map((l) => l.replace(/^[-•\d.)\s]+/, '').trim()).filter(Boolean) : DOCS_PADRAO;
  docs.forEach((t, i) => d.texto(`${String.fromCharCode(97 + i)}) ${t}${i < docs.length - 1 ? ';' : '.'}`));
  d.h1('3.', 'Do pedido de avaliações no local', { novaPagina: false });
  d.redigir('pedir diligência com operação normal e a reprodução das tarefas críticas; avaliações quantitativas no próprio local.');
  d.h1('4.', 'Dos quesitos', { novaPagina: false });
  d.texto(`A ${lado}, por seu assistente técnico, apresenta os seguintes quesitos, sem prejuízo de quesitos suplementares (art. 469 do CPC):`);
  const qs = dados.quesitos.filter((q) => q.data.origem === origemLado);
  if (qs.length) qs.forEach((q, i) => d.texto(`${q.data.numero || i + 1}. ${q.data.texto}`, { recuo: false }));
  else d.redigir(`quesitos (cadastre na aba Quesitos com origem "${origemLado}").`);
  d.h1('5.', 'Dos requerimentos finais', { novaPagina: false });
  d.texto(`Diante do exposto, requer:\na) o cadastramento do signatário como assistente técnico da ${lado}, com a sua intimação, pelos contatos indicados, da data, do horário e do local da diligência pericial;\nb) a intimação da parte para apresentar ao Sr. Perito os documentos relacionados no item 2;\nc) a realização da diligência na forma do item 3;\nd) o recebimento dos quesitos do item 4, sem prejuízo da apresentação de quesitos suplementares.`);
  d.add(p([run('Nestes termos,\npede deferimento.')], { first: 709, before: 240 }));
  blocoAssinatura(d, dados);
  return finalizar(d, { titulo: 'Petição – indicação de assistente técnico', arquivo: 'Peticao_indicacao_AT', c });
}

export async function peticaoAgendamento(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const d = new Doc();
  d.enderecamento(enderecamentoTexto(c), linhasProcesso(c));
  d.texto(`${qualificacaoCurta(perfil)}, perito nomeado nos autos em epígrafe${c.despachoRef ? `, em atenção a ${c.despachoRef}` : ''}, vem, respeitosamente, à presença de Vossa Excelência, informar a data da diligência pericial e requerer o que segue.`);
  d.h1('1.', 'Da diligência pericial', { novaPagina: false });
  d.texto(`A diligência pericial será realizada no dia **${ou(dataBR(c.dataDiligencia), 'data')}**, às **${ou(c.horaDiligencia, 'horário')}**, no seguinte local: **${ou([c.vistoriaLocal, c.vistoriaEndereco].filter(Boolean).join(', '), 'local e endereço')}**.`);
  d.texto('Requer a intimação das partes e de seus assistentes técnicos, nos termos do art. 474 do CPC, e a expedição de ofício à empresa para franquear o acesso ao local e designar acompanhante que conheça as atividades.');
  d.h1('2.', 'Dos documentos', { novaPagina: false });
  d.texto('Requer seja a empresa intimada a disponibilizar ao perito, até a data da diligência, os seguintes documentos:');
  DOCS_PADRAO.forEach((t, i) => d.texto(`${String.fromCharCode(97 + i)}) ${t}${i < DOCS_PADRAO.length - 1 ? ';' : '.'}`));
  d.add(p([run('Nestes termos,\npede deferimento.')], { first: 709, before: 240 }));
  blocoAssinatura(d, dados, 'Perito do Juízo');
  return finalizar(d, { titulo: 'Petição – agendamento da diligência', arquivo: 'Peticao_agendamento', c });
}

export async function peticaoHonorarios(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const d = new Doc();
  d.enderecamento(enderecamentoTexto(c), linhasProcesso(c));
  d.texto(`${qualificacaoCurta(perfil)}, nomeado perito nos autos em epígrafe${c.despachoRef ? ` (${c.despachoRef})` : ''}, vem, respeitosamente, à presença de Vossa Excelência, **aceitar o encargo** e apresentar **proposta de honorários periciais**, nos termos do art. 465, § 2º, do Código de Processo Civil.`);
  d.h1('1.', 'Do aceite', { novaPagina: false });
  d.texto('O signatário declara aceitar o encargo e não possuir impedimento ou suspeição para atuar no feito (arts. 148, 156 e 467 do CPC).');
  d.h1('2.', 'Da proposta de honorários', { novaPagina: false });
  d.texto(`A perícia envolve ${(c.objeto || []).join(', ').toLowerCase() || '[[objeto]]'}${dados.periodos.length ? `, abrangendo ${dados.periodos.length} período(s) de trabalho` : ''}${dados.quesitos.length ? ` e ${dados.quesitos.length} quesito(s) formulados` : ''}. A estimativa considera as etapas abaixo:`);
  d.quadro('Estimativa de horas técnicas', [['Etapa', 'Horas'], ['Análise dos autos e planejamento', '[[h]]'], ['Deslocamento', '[[h]]'],
    ['Diligência, vistoria e avaliações ambientais', '[[h]]'], ['Elaboração do laudo e respostas aos quesitos', '[[h]]'], ['Total', '[[h]]']],
  { larguras: [0.75, 0.25] });
  d.texto('Propõe-se o valor de **[[R$ valor]]**, [[a ser depositado / conforme tabela do tribunal – ajustar à gratuidade da justiça]].');
  d.h1('3.', 'Dos dados para pagamento', { novaPagina: false });
  d.texto(perfil.dadosBancarios || '[[dados bancários]]');
  d.add(p([run('Nestes termos,\npede deferimento.')], { first: 709, before: 240 }));
  blocoAssinatura(d, dados, 'Perito do Juízo');
  return finalizar(d, { titulo: 'Petição – aceite e honorários', arquivo: 'Peticao_honorarios', c });
}

void ORIGEM_QUESITO;
