// Modelos de documentos da GRAHL, baseados nos documentos reais do signatário:
// laudo pericial (Fazenda Pública), parecer técnico previdenciário, LTCAT+PPP,
// impugnação / parecer de assistente técnico, parecer preventivo, petição de
// indicação com quesitos. O que depende de análise técnica sai marcado em
// amarelo ("[[Redigir: ...]]") para ser escrito por você.
import { ORIGEM_QUESITO, ehSuplementar } from '../schema.js';
import {
  Doc, carregar, finalizar, dataBR, menosCincoAnos, ou, partes, papelAssinatura, enderecamentoTexto, linhasProcesso,
  qualificacaoCurta, qualificacaoCompleta, blocoAssinatura, credencial, equipamentosUsados, quadroEquipamentos, quadroDiligencia,
  quadroPeriodos, quadroEpis, quadroDocumentos, quadroCriteriosRuido, quadroConfrontoRuido, quadroMedicoesRuido,
  quadroMedicoesGenerico, medicoesPorAgente, nomePostoFn, profissiografia, figurasDoCaso, respostasQuesitos, capaTecnica,
  quadroCriteriosCalor, quadroCriteriosVibracao, documentosARequerer, quadrosParadigmasMetodologia, memoriasParadigmas, usaParadigmas,
  art, dadosDaConta, dataPorExtenso, horaPorExtenso, reaisPorExtenso, numeroPorExtenso, moeda, lerValor, nomeOrigemQuesito,
} from './base.js';
import { p, run, rich } from './ooxml.js';

const v = (x) => (x === undefined || x === null ? '' : String(x).trim());

function eqMap(dados) { return new Map(dados.equipamentos.map((e) => [e.id, e])); }

// Avaliação dos agentes. Cada finalidade usa só a sua legislação:
// - trabalhista: NR-15 / NR-16 na redação vigente em cada período;
// - previdenciária: Decretos 53.831/1964, 2.172/1997 e 3.048/1999 e IN 128/2022,
//   com a NR-15 apenas como referência técnica dos limites, quando o decreto a ela remete.
function avaliacaoAgentes(d, dados, base, { previdenciario }) {
  return previdenciario ? avaliacaoPrevidenciaria(d, dados, base) : avaliacaoTrabalhista(d, dados, base);
}

function avaliacaoTrabalhista(d, dados, base) {
  const ctx = { prev: false };
  const g = medicoesPorAgente(dados);
  const nome = nomePostoFn(dados.postos);
  const eq = eqMap(dados);
  let n = 0;
  const sub = (t) => { n += 1; d.h2(`${base}.${n}`, t); };
  if (g['Ruído']) {
    sub('Ruído contínuo ou intermitente (NR-15, Anexo 1)');
    d.texto('Limite de tolerância de 85 dB(A) para jornada de 8 horas, com incremento de duplicação de dose q = 5 (NR-15, Anexo 1). A insalubridade caracteriza-se quando a dose diária supera 100%.');
    quadroMedicoesRuido(d, g['Ruído'], eq, nome, ctx);
    d.redigir('análise do ruído e da neutralização pelo protetor auricular (item 15.4.1, "b", da NR-15: CA válido, NRRsf, fichas de entrega, periodicidade de troca, treinamento).');
  }
  if (g['Calor (IBUTG)']) {
    sub('Calor (NR-15, Anexo 3)');
    d.texto('Até 10/12/2019 aplica-se o Anexo 3 na redação original (IBUTG, quadros de regime de trabalho e de taxa metabólica; entre linhas do quadro, usa-se a linha imediatamente superior, sem interpolar). A partir de 11/12/2019, a redação da Portaria SEPRT nº 1.359/2019, com avaliação conforme a NHO-06 e IBUTG ajustado pela vestimenta; a exposição ao calor a céu aberto sem fonte artificial não caracteriza insalubridade nessa redação.');
    quadroMedicoesGenerico(d, 'Resultados – Calor', g['Calor (IBUTG)'], nome, ctx);
    d.redigir('taxa metabólica, regime de trabalho e descanso, limite aplicável ao período e conclusão.');
  }
  for (const k of ['Vibração de corpo inteiro (VCI)', 'Vibração de mãos e braços (VMB)']) {
    if (!g[k]) continue;
    sub(`${k} (NR-15, Anexo 8)`);
    d.texto('A partir de 13/08/2014, NR-15, Anexo 8, na redação da Portaria MTE nº 1.297/2014, com avaliação conforme as NHO-09 (VCI) e NHO-10 (VMB). Antes dessa data, o Anexo 8 na redação original remetia às normas ISO 2631 e ISO/DIS 5349.');
    quadroMedicoesGenerico(d, `Resultados – ${k}`, g[k], nome, ctx);
    d.redigir('aren e VDVR normalizados para a jornada e conclusão.');
  }
  for (const k of ['Agente químico', 'Outro']) {
    if (!g[k]) continue;
    sub(k === 'Outro' ? 'Outros agentes avaliados' : 'Agentes químicos (NR-15, Anexos 11, 12 ou 13)');
    quadroMedicoesGenerico(d, k === 'Outro' ? 'Outros registros' : 'Resultados – Agentes químicos', g[k], nome, ctx);
    d.redigir('enquadramento no anexo aplicável (Anexo 11 quantitativo – jornada > 48 h: correção do limite por Brief & Scala; Anexo 13 qualitativo; álcali cáustico: referência pH 11,5).');
  }
  if (v(dados.c.agentesAlegados)) {
    sub(n ? 'Demais agentes alegados' : 'Agentes alegados');
    d.texto(`Agentes indicados nos autos: ${dados.c.agentesAlegados.replace(/\n+/g, '; ')}`);
    d.redigir('avaliação de cada agente no anexo correspondente da NR-15 (insalubridade) ou da NR-16 (periculosidade, anexos em algarismos romanos), na redação vigente no período.');
  }
  if (!n) d.redigir('avaliação dos agentes (cadastre as medições na aba Campo).');
}

function avaliacaoPrevidenciaria(d, dados, base) {
  const ctx = { prev: true };
  const g = medicoesPorAgente(dados);
  const nome = nomePostoFn(dados.postos);
  const eq = eqMap(dados);
  let n = 0;
  const sub = (t) => { n += 1; d.h2(`${base}.${n}`, t); };
  if (g['Ruído']) {
    sub('Ruído');
    quadroCriteriosRuido(d);
    quadroMedicoesRuido(d, g['Ruído'], eq, nome, ctx);
    quadroConfrontoRuido(d, dados);
    d.redigir('fonte, habitualidade e permanência por período; o EPI não descaracteriza o ruído (STF, Tema 555).');
  }
  if (g['Calor (IBUTG)']) {
    sub('Calor');
    quadroCriteriosCalor(d);
    quadroMedicoesGenerico(d, 'Resultados – Calor', g['Calor (IBUTG)'], nome, ctx);
    d.redigir('fonte de calor, taxa metabólica e limite aplicável a cada período.');
  }
  const vib = ['Vibração de corpo inteiro (VCI)', 'Vibração de mãos e braços (VMB)'].filter((k) => g[k]);
  if (vib.length) {
    sub('Vibração');
    quadroCriteriosVibracao(d);
    for (const k of vib) quadroMedicoesGenerico(d, `Resultados – ${k}`, g[k], nome, ctx);
    d.redigir('aren e VDVR normalizados para a jornada; leitura pelo critério de cada período.');
  }
  for (const k of ['Agente químico', 'Outro']) {
    if (!g[k]) continue;
    sub(k === 'Outro' ? 'Outros agentes avaliados' : 'Agentes químicos');
    quadroMedicoesGenerico(d, k === 'Outro' ? 'Outros registros' : 'Resultados – Agentes químicos', g[k], nome, ctx);
    d.redigir('enquadramento no Anexo IV do Decreto 3.048/1999 (até 05/03/1997, Decreto 53.831/1964); óleos minerais: somente cód. 1.0.17; avaliação qualitativa quando a nocividade decorre da simples exposição (art. 287 da IN 128/2022).');
  }
  if (v(dados.c.agentesAlegados)) {
    sub(n ? 'Demais agentes alegados' : 'Agentes alegados');
    d.texto(`Agentes indicados: ${dados.c.agentesAlegados.replace(/\n+/g, '; ')}`);
    d.redigir('avaliação de cada agente pelo decreto vigente no período. Biológicos: somente o rol de atividades do cód. 3.0.1 do Anexo IV (não se usa o Anexo 14 da NR-15).');
  }
  if (!n) d.redigir('avaliação dos agentes (cadastre as medições na aba Campo).');
}

// ======================================================================
// LAUDO PERICIAL TRABALHISTA (perito do juízo) – Justiça do Trabalho,
// Fazenda Pública (servidor) e cível: NR-15 / NR-16, CLT art. 189-195
// ======================================================================
export async function laudoPericial(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const pt = partes(c);
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
  d.texto(`Em atendimento à determinação judicial, o presente laudo tem por objetivo apurar as reais condições do ambiente e das atividades laborais desenvolvidas pela parte ${pt.autorCurto.toLowerCase()}, para a caracterização ou descaracterização de ${(c.objeto || []).join(', ').toLowerCase() || '[[objeto]]'}, nos termos dos arts. 189 a 195 da CLT e das NR-15 e NR-16, na redação vigente em cada período${pt.trab && c.dataAjuizamento ? ` do período imprescrito (a partir de ${menosCincoAnos(c.dataAjuizamento)})` : ''}.`);
  d.h2('2.3', 'Metodologia');
  d.texto('Em atendimento ao art. 473, inciso III, do Código de Processo Civil, a metodologia consistiu em análise dos autos, inspeção *in loco*, entrevista com as partes e avaliações ambientais, quando cabíveis, conforme a NR-15, a NR-16 e as Normas de Higiene Ocupacional da FUNDACENTRO.');
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
  d.redigir('neutralização ou não (item 15.4.1 da NR-15 e NR-6: CA válido, periodicidade de troca, treinamento, uso efetivo).');

  d.h1('5', 'Avaliação técnica dos agentes (NR-15 e NR-16)');
  avaliacaoAgentes(d, dados, '5', { previdenciario: false });

  d.h1('6', 'Conclusão pericial');
  d.redigir('conclusão por agente e por período (grau de insalubridade e/ou periculosidade).');

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
// LAUDO PERICIAL PREVIDENCIÁRIO (perito do juízo) – tempo especial:
// Lei 8.213/1991, Decretos 53.831/1964, 2.172/1997 e 3.048/1999, IN 128/2022
// ======================================================================
export async function laudoPrevidenciario(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const pt = partes(c);
  const d = new Doc();
  d.enderecamento(enderecamentoTexto(c), linhasProcesso(c));
  d.texto(`${qualificacaoCurta(perfil)}, perito nomeado e compromissado nos autos do processo em epígrafe, tendo realizado as vistorias, os levantamentos técnicos e as diligências necessárias, vem, respeitosamente, à presença de Vossa Excelência, apresentar o presente **LAUDO TÉCNICO PERICIAL**, destinado à verificação das condições especiais de trabalho para fins previdenciários.`);
  d.sumario();

  d.h1('1', 'Identificação e dados da diligência pericial');
  d.h2('1.1', 'Dados do processo');
  d.identificacao([['Processo', c.numero], ['Juízo', [c.juizo, c.comarca].filter(Boolean).join(' – ')], [pt.autor, c.autorNome], ['CPF / NIT', c.autorCpf], [pt.reu, c.reuNome],
    ['Objeto', (c.objeto || []).join(', ')]]);
  d.h2('1.2', 'Períodos controvertidos');
  quadroPeriodos(d, dados.periodos, 'Vínculos e períodos controvertidos');
  d.h2('1.3', 'Data, hora e local da vistoria');
  quadroDiligencia(d, c);
  d.h2('1.4', 'Instrumentos utilizados');
  quadroEquipamentos(d, equipamentosUsados(dados));

  d.h1('2', 'Objeto e metodologia');
  d.h2('2.1', 'Determinação judicial (objeto da perícia)');
  d.redigir('transcrever ou resumir o despacho que determinou a perícia (evento / mov.).');
  d.h2('2.2', 'Metodologia');
  d.texto('Em atendimento ao art. 473, inciso III, do Código de Processo Civil, a metodologia consistiu em análise dos autos, inspeção *in loco* e avaliações ambientais, seguindo as NHO da FUNDACENTRO e os limites de tolerância do Anexo IV do Regulamento da Previdência Social ou, na sua falta, da NR-15, quando o decreto a ela remete (art. 288 da IN 128/2022). [[Perícia direta / indireta por similaridade – ajustar.]]');
  d.texto('A conclusão fundamenta-se exclusivamente na norma técnica; entendimentos jurisprudenciais são registrados para apreciação do Juízo.');
  if (usaParadigmas(dados)) { d.h2('2.3', 'Avaliação por similaridade (paradigmas)'); quadrosParadigmasMetodologia(d, dados); }

  d.h1('3', 'Fundamentação por período');
  d.texto('O enquadramento observa a legislação vigente à época da prestação do serviço (*tempus regit actum*).');
  d.quadro('Forma de enquadramento, prova e medidas de controle', [['Período', 'Enquadramento', 'Documentos', 'Permanência', 'EPC / EPI'],
    ['Até 28/04/1995', 'Categoria profissional ou agente nocivo', 'Formulário; laudo para ruído', 'Não exigida para categoria', 'Não considerados'],
    ['29/04/1995 a 13/10/1996', 'Agente nocivo', 'Formulário; laudo para ruído', 'Exigida', 'Não considerados'],
    ['14/10/1996 a 02/12/1998', 'Agente nocivo', 'Formulário com base em LTCAT', 'Exigida', 'EPC informado; EPI não considerado'],
    ['03/12/1998 a 31/12/2003', 'Agente nocivo', 'Formulário com base em LTCAT ou PPP', 'Exigida', 'EPC e EPI considerados'],
    ['A partir de 01/01/2004', 'Agente nocivo', 'PPP com base em LTCAT', 'Exigida', 'EPC e EPI considerados; NHO obrigatórias']],
  { larguras: [0.2, 0.18, 0.24, 0.14, 0.24], tam: 9, fonte: 'Elaborado pelo autor com base em Brasil (2022, arts. 274, 285, 286, 289 e 291).' });

  d.h1('4', 'Ambiente de trabalho e profissiografia');
  d.texto(c.funcoes || '');
  dados.periodos.forEach((r, i) => {
    d.h2(`4.${i + 1}`, `${r.data.empresa || 'Empresa'} – ${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`);
    d.texto(r.data.atividades || '[[atividades do período]]');
  });
  profissiografia(d, dados.postos);

  d.h1('5', 'Avaliação dos agentes nocivos');
  avaliacaoAgentes(d, dados, '5', { previdenciario: true });
  memoriasParadigmas(d, dados);

  d.h1('6', 'Medidas de controle');
  d.texto('Considera-se o EPC que elimina ou neutraliza a nocividade (art. 290 da IN 128/2022). O EPI só é considerado a partir de 03/12/1998 e quando atendidos, cumulativamente, os requisitos do art. 291. Para ruído, o EPI não descaracteriza a especialidade (STF, Tema 555).');
  quadroEpis(d, dados.epis);
  d.redigir('análise dos requisitos do art. 291 por período.');

  d.h1('7', 'Conclusão');
  if (dados.periodos.length) {
    d.quadro('Conclusão por período', [['Período', 'Agente(s)', 'Código', 'Caracteriza'],
      ...dados.periodos.map((r) => [`${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`, r.data.agentes || '[[agentes]]', '[[cód.]]', '[[S/N]]'])],
    { larguras: [0.26, 0.38, 0.18, 0.18] });
  }
  d.redigir('conclusão por período: exposição habitual e permanente, não ocasional nem intermitente, a agentes nocivos – caracteriza / não caracteriza.');

  d.h1('8', 'Respostas aos quesitos');
  d.texto('Em atendimento ao art. 473, inciso IV, do Código de Processo Civil, passa-se a responder aos quesitos formulados, com remissão às análises do corpo deste laudo.');
  respostasQuesitos(d, dados.quesitos, '8', c);

  d.h1('9', 'Encerramento e anexos');
  d.texto('Nada mais havendo a relatar no âmbito da Engenharia de Segurança do Trabalho, este Perito dá por encerrados os trabalhos periciais, colocando-se à disposição do Juízo e das partes para os esclarecimentos que se fizerem necessários.');
  blocoAssinatura(d, dados, 'Perito do Juízo');
  const { lista, faltando } = await figurasDoCaso(dados);
  if (lista.length) { d.h1('', 'Anexo I – Relatório fotográfico da diligência'); d.figuras(lista); }
  const r = await finalizar(d, { titulo: 'Laudo técnico pericial previdenciário', arquivo: 'Laudo_pericial_previdenciario', c });
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
  if (usaParadigmas(dados)) { d.h2('', 'Avaliação por similaridade (paradigmas)'); quadrosParadigmasMetodologia(d, dados); }
  avaliacaoAgentes(d, { ...dados }, '5', { previdenciario: true });
  memoriasParadigmas(d, dados);

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
  d.texto('O enquadramento observa a legislação previdenciária vigente à época da prestação do serviço: por categoria profissional até 28/04/1995 e por exposição a agentes nocivos a partir de 29/04/1995. Os critérios de cada agente, por período, constam do item 7.');
  d.redigir('ajustes específicos do caso (categoria do segurado, EC 103/2019).');
  d.h1('5', 'Metodologia');
  d.redigir('etapas; avaliação por similaridade (quando aplicável); normalização pela jornada efetiva; instrumentação.');
  if (!quadrosParadigmasMetodologia(d, dados)) quadroEquipamentos(d, equipamentosUsados(dados));
  d.h1('6', 'Descrição das atividades por vínculo');
  dados.periodos.forEach((r, i) => {
    d.h2(`6.${i + 1}`, `V${i + 1} – ${r.data.empresa || 'Empresa'} – ${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`);
    d.texto(r.data.atividades || '[[atividades do vínculo]]');
  });
  if (!dados.periodos.length) d.redigir('cadastre os vínculos na aba Preparação.');
  profissiografia(d, dados.postos);
  d.h1('7', 'Avaliação técnica');
  avaliacaoAgentes(d, dados, '7', { previdenciario: true });
  memoriasParadigmas(d, dados);
  d.h2('', 'EPI e EPC');
  quadroEpis(d, dados.epis);
  d.h1('8', 'Quadro conclusivo');
  if (!usaParadigmas(dados)) quadroConfrontoRuido(d, dados);
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
  d.texto(`${qualificacaoCurta(perfil)}, assistente técnico indicado ${art(lado).pelo} ${lado}${c.vistoriaData ? `, tendo acompanhado a diligência pericial realizada em ${dataBR(c.vistoriaData)}` : ''}, vem, respeitosamente, à presença de Vossa Excelência, apresentar **MANIFESTAÇÃO TÉCNICA SOBRE O LAUDO PERICIAL**${c.peritoJuizo ? ` elaborado por ${c.peritoJuizo}` : ''}, pelos fundamentos técnicos expostos a seguir.`);
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
  if (g['Ruído']) quadroMedicoesRuido(d, g['Ruído'], eqMap(dados), nome, { prev: pt.prev });
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

export async function peticaoIndicacaoAT(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const pt = partes(c);
  const lado = /réu/i.test(c.papel || '') ? pt.reuCurto : pt.autorCurto;
  const origemLado = /réu/i.test(c.papel || '') ? 'Réu / Reclamada' : 'Autor / Reclamante';
  const d = new Doc();
  d.enderecamento(enderecamentoTexto(c), linhasProcesso(c, [['Perito do Juízo', c.peritoJuizo]]));
  d.texto(`${qualificacaoCompleta(perfil)}, vem, respeitosamente, à presença de Vossa Excelência, na qualidade de **assistente técnico indicado ${art(lado).pelo} ${lado}**, nos termos ${pt.trab ? 'do art. 3º da Lei nº 5.584/1970 e ' : ''}dos arts. 465, § 1º, II, e 466, § 1º, do Código de Processo Civil${c.despachoRef ? `, em atenção a ${c.despachoRef}` : ''}, expor e requerer o que segue.`);
  d.h1('1.', 'Da indicação do assistente técnico', { novaPagina: false });
  d.texto(`O signatário foi indicado ${art(lado).pelo} ${lado} para acompanhar, como seu assistente técnico, a prova pericial de ${(c.objeto || []).join(' e ').toLowerCase() || '[[objeto]]'} determinada por este Juízo${c.peritoJuizo ? `, a cargo do Sr. Perito ${c.peritoJuizo}` : ''}.`);
  d.texto('Requer seja o signatário cadastrado nos autos e que o Sr. Perito comunique a data, o horário e o local da diligência com antecedência, também pelos contatos acima, de modo a assegurar o acompanhamento previsto no art. 466, § 2º, do CPC.');
  d.texto('No desempenho da função, o assistente técnico poderá valer-se dos meios previstos no art. 473, § 3º, do CPC, inclusive registro fotográfico, obtenção de informações e solicitação de documentos em poder das partes.');
  d.h1('2.', 'Dos documentos necessários à perícia', { novaPagina: false });
  d.texto(`Para que a perícia retrate as reais condições de trabalho${c.dataAjuizamento && pt.trab ? ` no período imprescrito (a partir de ${menosCincoAnos(c.dataAjuizamento)})` : ''}, requer seja a parte intimada a apresentar ao Sr. Perito, até a data da diligência, os documentos abaixo:`);
  const docs = v(c.roteiro) ? c.roteiro.split('\n').map((l) => l.replace(/^[-•\d.)\s]+/, '').trim()).filter(Boolean) : documentosARequerer({ prev: pt.prev });
  docs.forEach((t, i) => d.texto(`${String.fromCharCode(97 + i)}) ${t}${i < docs.length - 1 ? ';' : '.'}`));
  d.h1('3.', 'Do pedido de avaliações no local', { novaPagina: false });
  d.redigir('pedir diligência com operação normal e a reprodução das tarefas críticas; avaliações quantitativas no próprio local.');
  d.h1('4.', 'Dos quesitos', { novaPagina: false });
  d.texto(`${art(lado).O} ${lado}, por seu assistente técnico, apresenta os seguintes quesitos, sem prejuízo de quesitos suplementares (art. 469 do CPC):`);
  const qs = dados.quesitos.filter((q) => q.data.origem === origemLado);
  if (qs.length) qs.forEach((q, i) => d.texto(`${q.data.numero || i + 1}. ${q.data.texto}`, { recuo: false }));
  else d.redigir(`quesitos (cadastre na aba Quesitos com origem "${origemLado}").`);
  d.h1('5.', 'Dos requerimentos finais', { novaPagina: false });
  d.texto(`Diante do exposto, requer:\na) o cadastramento do signatário como assistente técnico ${art(lado).do} ${lado}, com a sua intimação, pelos contatos indicados, da data, do horário e do local da diligência pericial;\nb) a intimação da parte para apresentar ao Sr. Perito os documentos relacionados no item 2;\nc) a realização da diligência na forma do item 3;\nd) o recebimento dos quesitos do item 4, sem prejuízo da apresentação de quesitos suplementares.`);
  d.add(p([run('Nestes termos,\npede deferimento.')], { first: 709, before: 240 }));
  blocoAssinatura(d, dados);
  return finalizar(d, { titulo: 'Petição – indicação de assistente técnico', arquivo: 'Peticao_indicacao_AT', c });
}

// ---------- auxiliares das petições do perito ----------
function introPerito(perfil, c, acao) {
  const ref = v(c.despachoRef) ? `, em atenção ${/^(decisão|sentença|r\.)/i.test(v(c.despachoRef)) ? 'à' : 'ao'} ${c.despachoRef}` : '';
  return `${qualificacaoCurta(perfil)}, perito judicial nomeado nos autos em epígrafe, vem, respeitosamente, à presença de Vossa Excelência${ref}, ${acao}`;
}
function fecho(d, dados, papel = 'Perito Judicial') {
  d.add(p([run('Nestes termos,')], { first: 709, before: 240, after: 0 }));
  d.add(p([run('pede deferimento.')], { first: 709, after: 120 }));
  return blocoAssinatura(d, dados, papel, { linha: true });
}
function travessao(d, texto, nivel = 1) {
  d.add(p([run('–\t'), ...[rich(texto)]], { left: 1069 + nivel * 360, hanging: 284, after: 40 }));
}
function listaPeriodos(periodos) {
  const ps = periodos.filter((r) => r.data.inicio).map((r) => `${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`);
  if (ps.length <= 1) return ps.join('');
  return `${ps.slice(0, -1).join(', ')} e ${ps[ps.length - 1]}`;
}
function anosSomados(periodos) {
  let dias = 0;
  for (const r of periodos) {
    if (!r.data.inicio) continue;
    const i = new Date(r.data.inicio), f = r.data.fim ? new Date(r.data.fim) : new Date();
    if (f > i) dias += (f - i) / 86400000;
  }
  return Math.floor(dias / 365.25);
}
const VEZES = { 2: '2 (duas)', 3: '3 (três)' };
function fundamentoCJF(c) {
  return /Federal/i.test(c.justica || '') || /delegada/i.test(c.justica || '');
}

// ======================================================================
// AGENDAMENTO DA VISTORIA PERICIAL (padrão: petição 5024131-16.2021)
// ======================================================================
export async function peticaoAgendamento(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const pt = partes(c);
  const ctx = { prev: pt.prev };
  const d = new Doc();
  d.enderecamento(enderecamentoTexto(c), linhasProcesso(c));
  d.texto(introPerito(perfil, c, 'informar e requerer o que segue.'));

  d.h1('1.', 'Do agendamento da vistoria pericial', { novaPagina: false });
  const data = dataPorExtenso(c.dataDiligencia, { semana: true }) || '[[data da vistoria]]';
  const hora = horaPorExtenso(c.horaDiligencia) || '[[horário]]';
  d.texto(`Comunica-se que a vistoria pericial fica designada para o dia **${data}**, às **${hora}**, a ser realizada nas dependências da empresa:`);
  const local = [v(c.vistoriaLocal).toUpperCase() || '[[EMPRESA]]', ...String(c.vistoriaEndereco || '[[endereço – cidade/UF – CEP]]').split(/\n|\s*;\s*/).filter(Boolean)];
  local.forEach((l, i) => d.add(p([run(l, { b: i === 0 })], { left: 1418, after: i === local.length - 1 ? 200 : 0, align: 'left' })));
  const periodos = listaPeriodos(dados.periodos);
  const item = v(c.itensVistoria) ? `, conforme determinado ${/[e,]/.test(c.itensVistoria) ? 'nos itens' : 'no item'} ${c.itensVistoria} do referido despacho` : '';
  d.texto(pt.prev
    ? `A vistoria destina-se a examinar as condições de trabalho do autor${periodos ? ` nos períodos de ${periodos}` : ' [[nos períodos de ...]]'}${item}.`
    : `A vistoria destina-se a examinar as condições de trabalho do ${pt.autorCurto.toLowerCase()}${c.dataAjuizamento && pt.trab ? ` no período imprescrito (a partir de ${menosCincoAnos(c.dataAjuizamento)})` : ''}${item}.`);

  d.h1('2.', 'Dos requerimentos', { novaPagina: false });
  d.texto('Diante do exposto, requer-se:');
  d.texto(`a) a intimação das partes e de seus assistentes técnicos, caso indicados, para que, querendo, compareçam ao ato na data, horário e local acima;`);
  d.texto(`b) a intimação do ${pt.autorCurto.toLowerCase()} para comparecimento pessoal, a fim de prestar informações sobre os setores, atividades, máquinas e rotina de trabalho ${pt.prev ? 'nos períodos em análise' : 'no período discutido'};`);
  const empresa = v(c.vistoriaLocal) || '[[empresa]]';
  d.texto(`c) a expedição de ofício à empresa ${empresa}${v(c.itemOficio) ? `, nos termos do item ${c.itemOficio} do despacho` : ''}, comunicando a data e o horário da vistoria e solicitando:`);
  travessao(d, 'o acesso do perito, das partes e dos assistentes técnicos aos setores em que o ' + pt.autorCurto.toLowerCase() + ' laborou;');
  travessao(d, 'a designação de representante com conhecimento do processo produtivo e, se possível, do profissional responsável pela segurança do trabalho;');
  const agentes = v(c.agentesAlegados).replace(/\n+/g, ', ').replace(/;\s*/g, ', ');
  const docs = ctx.prev
    ? `PPP do autor; LTCAT, PPRA/PGR e demais laudos ambientais existentes; relatórios de avaliações quantitativas dos agentes ambientais${agentes ? `, em especial de ${agentes}` : ''}; fichas de entrega de EPI e respectivos Certificados de Aprovação (CA); registro de funções/setores e descrição de cargos do autor; e fichas com dados de segurança (FISPQ/FDS) dos produtos químicos utilizados`
    : `PGR (e PPRA, para o período anterior a 2022), PCMSO e laudos de insalubridade e periculosidade; relatórios de avaliações quantitativas dos agentes ambientais${agentes ? `, em especial de ${agentes}` : ''}; fichas de entrega de EPI e respectivos Certificados de Aprovação (CA); ordens de serviço e descrição de cargo; e fichas com dados de segurança (FISPQ/FDS) dos produtos químicos utilizados`;
  travessao(d, `a disponibilização, no dia do ato, dos documentos relativos ${ctx.prev ? 'aos períodos em análise' : 'ao período discutido'}: ${docs}.`);

  if (v(c.prazoLaudoDias)) {
    d.h1('3.', 'Do prazo para entrega do laudo', { novaPagina: false });
    const n = Number(String(c.prazoLaudoDias).replace(/\D/g, ''));
    d.texto(`Ressalta-se que o laudo pericial será entregue no prazo de ${n} (${numeroPorExtenso(n)}) dias após a realização da vistoria${v(c.itemPrazoLaudo) ? `, conforme item ${c.itemPrazoLaudo} do despacho` : ''}.`);
  }
  fecho(d, dados);
  return finalizar(d, { titulo: 'Petição – agendamento de vistoria', arquivo: 'Peticao_agendamento_vistoria', c });
}

// ======================================================================
// MAJORAÇÃO DE HONORÁRIOS (padrão: petições 5015376-66.2022 e 5002237-15.2026)
// ======================================================================
export async function peticaoMajoracao(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const d = new Doc();
  d.enderecamento(enderecamentoTexto(c), linhasProcesso(c));
  d.texto(introPerito(perfil, c, 'requerer a majoração dos honorários periciais, pelos fundamentos a seguir expostos.'));
  let n = 0;
  const sec = (t) => { n += 1; d.h1(`${n}.`, t, { novaPagina: false }); };

  const tabela = lerValor(c.honorariosTabela);
  const fixados = lerValor(c.honorariosFixados);
  const mult = Number(c.honorariosMultiplicador || 2);
  const cjf = fundamentoCJF(c);
  sec('Dos honorários fixados');
  const vezesFix = isFinite(fixados) && isFinite(tabela) && tabela > 0 ? Math.round(fixados / tabela) : 1;
  d.texto(`No ${v(c.honorariosItem) || '[[item]]'} do referido despacho, os honorários periciais foram fixados em ${isFinite(fixados) ? moeda(fixados) : '[[valor]]'}, ${vezesFix > 1 ? `correspondentes a ${vezesFix === 2 ? 'duas' : vezesFix} vezes o valor máximo` : 'valor máximo'} ${cjf ? 'previsto na Tabela II da Resolução nº 305/2014 do Conselho da Justiça Federal, com as alterações da Resolução CJF nº 937/2025' : 'previsto na tabela aplicável [[norma do tribunal]]'}.`);

  const fora = c.foraDomicilio === 'Sim';
  if (fora) {
    sec('Do local de realização da perícia');
    d.texto(`A perícia deverá ser realizada na empresa ${v(c.vistoriaLocal) || '[[empresa]]'}, situada na ${v(c.vistoriaEndereco) || '[[endereço e município]]'}, ou seja, fora do domicílio profissional deste perito, estabelecido em ${(perfil.cidade || 'Londrina – PR').replace(' – ', '/')}.`);
    d.texto('O ato em outro município impõe ao perito deslocamento rodoviário de ida e volta, com custos de combustível e de uso de veículo próprio, além do tempo de viagem e do transporte dos equipamentos de medição. Esses custos não são ressarcidos de forma autônoma e recaem integralmente sobre os honorários.');
  }

  sec('Da complexidade do exame');
  const motivos = [];
  const per = dados.periodos.filter((r) => r.data.inicio);
  const anos = anosSomados(per);
  const lista = listaPeriodos(per);
  if (c.similaridade === 'Sim') {
    d.texto(`Trata-se${fora ? ', ainda,' : ''} de perícia por similaridade, em empresa paradigma que substitui a empregadora original${v(c.empresaOriginal) ? ` (${c.empresaOriginal})` : ''}${lista ? `, sobre ${per.length > 1 ? 'os períodos' : 'o período'} de ${lista}` : ''}. Isso exige reconstituir as condições de trabalho da época, verificar a equivalência entre ambientes e processos e analisar se as avaliações feitas no paradigma se aplicam ao caso.`);
  } else if (per.length) {
    d.texto(`A perícia${v(c.vistoriaLocal) ? `, a ser realizada em ${c.vistoriaLocal},` : ''} abrange ${per.length > 1 ? `${per.length} períodos de trabalho que somam mais de ${anos} anos` : `período de trabalho de mais de ${anos} anos`} (${lista}). Esse intervalo torna o exame mais complexo do que uma perícia comum, pelos seguintes motivos:`);
    const maisAntigo = per.map((r) => r.data.inicio).sort()[0];
    if (maisAntigo && new Date(maisAntigo) < new Date(Date.now() - 10 * 365.25 * 86400000)) {
      motivos.push(`é preciso reconstituir as condições de trabalho de ${anos >= 20 ? 'mais de duas décadas' : 'longo período'}, considerando as alterações de leiaute, equipamentos, processos e medidas de controle ao longo do tempo`);
    }
  } else {
    d.redigir('descrever a perícia e os motivos de complexidade.');
  }
  const qJuizo = dados.quesitos.filter((q) => q.data.origem === 'Juízo').length;
  const agentesMed = [...new Set(dados.medicoes.map((m) => m.data.agente))];
  const agentesTxt = agentesMed.length ? agentesMed.join(', ').toLowerCase() : v(c.agentesAlegados).replace(/\n+/g, ', ').toLowerCase();
  if (qJuizo >= 3) motivos.push(`o Juízo formulou ${qJuizo} (${numeroPorExtenso(qJuizo)}) quesitos detalhados${agentesTxt ? `, que exigem avaliações de ${agentesTxt}` : ''}, além da análise da eficácia de EPI e EPC`);
  const empresas = [...new Set(per.map((r) => v(r.data.empresa)).filter(Boolean))];
  if (empresas.length > 1) motivos.push(`envolve ${numeroPorExtenso(empresas.length, { feminino: true })} empresas (${empresas.join('; ')}), com setores diversos e documentação ambiental própria de cada período`);
  for (const l of String(c.complexidadeExtra || '').split('\n').map((x) => x.replace(/^[-•\d.)\s]+/, '').trim()).filter(Boolean)) motivos.push(l);
  if (c.similaridade !== 'Sim') {
    if (motivos.length) motivos.forEach((m, i) => d.texto(`${String.fromCharCode(97 + i)}) ${m}${i < motivos.length - 1 ? ';' : '.'}`));
    else d.redigir('motivos de complexidade (cadastre em "Outros motivos de complexidade").');
  } else if (motivos.length) {
    motivos.forEach((m, i) => d.texto(`${String.fromCharCode(97 + i)}) ${m}${i < motivos.length - 1 ? ';' : '.'}`));
  }

  sec('Do fundamento para a majoração');
  const criterios = [fora && 'o local de realização fora do domicílio do perito', 'a complexidade do exame'].filter(Boolean);
  if (cjf) {
    d.texto(`O art. 28 da Resolução CJF nº 305/2014, com a redação dada pela Resolução CJF nº 937/2025, autoriza o magistrado a fixar os honorários acima do limite máximo da tabela, em até 3 (três) vezes, considerando, entre outros critérios, a especialização do perito, a complexidade do exame e o local de sua realização. No caso, ${criterios.length > 1 ? `estão presentes ao mesmo tempo ${criterios.reverse().join(' e ')}, o que justifica a fixação ${mult === 3 ? 'no patamar máximo admitido pela norma' : 'acima do limite da tabela'}` : `verifica-se ${criterios[0]}`}.`);
  } else {
    d.redigir('fundamento normativo da tabela do tribunal (ex.: Resolução TJPR) e critérios presentes.');
  }

  sec('Do pedido');
  const pedido = isFinite(tabela) ? mult * tabela : NaN;
  d.texto(`Diante do exposto, requer-se a majoração dos honorários periciais para ${VEZES[mult] || mult} vezes o valor máximo da ${cjf ? 'Tabela II' : 'tabela'}, ou seja, ${isFinite(pedido) ? `${moeda(pedido)} (${reaisPorExtenso(pedido)}) (${mult} × ${moeda(tabela)})` : '[[valor]]'}${cjf ? ', nos termos do art. 28 da Resolução CJF nº 305/2014, com a redação da Resolução CJF nº 937/2025' : ''}.`);
  if (!v(c.dataDiligencia)) d.texto(`A data e o horário da vistoria serão informados oportunamente${v(c.itensVistoria) ? `, para os fins ${/[e,]/.test(c.itensVistoria) ? 'dos itens' : 'do item'} ${c.itensVistoria} do despacho` : ''}.`);
  fecho(d, dados);
  return finalizar(d, { titulo: 'Petição – majoração de honorários', arquivo: 'Peticao_majoracao_honorarios', c });
}

// ======================================================================
// ACEITE DOS HONORÁRIOS ARBITRADOS (após a decisão que majora/arbitra)
// Aceita o valor e os termos, aguarda o depósito, indica a conta para o
// alvará e se compromete a informar a data da perícia após o levantamento.
// ======================================================================
const itemTxt = (x) => (v(x) ? (/^item/i.test(v(x)) ? v(x) : `item ${v(x)}`) : '');
// "item 7, a" no meio da frase pede vírgula depois: "no item 7, a, da decisão"
const itemMeio = (x) => { const t = itemTxt(x); return t && t.includes(',') ? `${t},` : t; };
function pelo(quem) {
  const q = v(quem);
  if (!q) return '';
  if (/^(o|a)\s/i.test(q)) return q.replace(/^o\s/i, 'pelo ').replace(/^a\s/i, 'pela ');
  if (/^(pelo|pela)\s/i.test(q)) return q;
  return `por ${q}`;
}
function valorExt(n) { return `${moeda(n)} (${reaisPorExtenso(n)})`; }

export async function peticaoAceiteArbitrados(caseId, { conta } = {}) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const d = new Doc();
  d.enderecamento(enderecamentoTexto(c), linhasProcesso(c));
  d.texto(introPerito(perfil, c, '**aceitar os honorários periciais arbitrados** e os termos fixados para o seu pagamento, indicar a conta para o levantamento e requerer o que segue.'));

  const fixados = lerValor(c.honorariosFixados);
  let adiant = lerValor(c.honorariosAdiantamento);
  if (!isFinite(adiant) && isFinite(fixados)) adiant = Math.round(fixados * 50) / 100;
  const saldo = isFinite(fixados) && isFinite(adiant) ? Math.round((fixados - adiant) * 100) / 100 : NaN;
  const pct = isFinite(fixados) && fixados > 0 && isFinite(adiant) ? Math.round((adiant / fixados) * 100) : NaN;
  const depositante = pelo(c.honorariosDepositante);
  const iFix = itemTxt(c.honorariosItem);

  d.h1('1.', 'Do aceite dos honorários arbitrados', { novaPagina: false });
  d.texto(`${iFix ? `No ${itemMeio(c.honorariosItem)} da referida decisão` : 'Na referida decisão'}, os honorários periciais foram arbitrados em **${isFinite(fixados) ? valorExt(fixados) : '[[valor arbitrado]]'}**, em acolhimento ao valor proposto pelo signatário.`);
  d.texto(`O signatário declara **aceitar o valor arbitrado e os termos fixados**${itemTxt(c.itemAceite) ? ` no ${itemMeio(c.itemAceite).replace(/,$/, '')}` : ''}, ciente de que:`);
  const termos = [];
  if (isFinite(adiant)) termos.push(`receberá no início dos trabalhos o valor de ${valorExt(adiant)}${isFinite(pct) && pct < 100 ? `, correspondente a ${pct}% dos honorários` : ''}, a ser depositado${depositante ? ` ${depositante}` : ''} em conta judicial vinculada aos autos (art. 465, § 4º, do CPC)`);
  else termos.push('receberá no início dos trabalhos [[valor do adiantamento]] (art. 465, § 4º, do CPC)');
  if (isFinite(saldo) && saldo > 0) termos.push(`o saldo de ${valorExt(saldo)} será pago ao final, depois de entregue o laudo e prestados os esclarecimentos, por quem a sentença indicar`);
  if (c.limiteTabelaPublico === 'Sim') termos.push('o pagamento eventualmente feito com recursos públicos observará o limite da tabela, com a majoração admitida');
  termos.forEach((t, i) => d.texto(`${String.fromCharCode(97 + i)}) ${t}${i < termos.length - 1 ? ';' : '.'}`));

  d.h1('2.', 'Da conta para o levantamento', { novaPagina: false });
  d.texto(`Efetuado o depósito${itemTxt(c.itemDeposito) ? ` determinado no ${itemTxt(c.itemDeposito)}` : ''}, requer-se a expedição de alvará em favor do signatário do valor depositado, com os acréscimos da conta${itemTxt(c.itemAlvara) ? `, nos termos do ${itemTxt(c.itemAlvara)}` : ''}, ou a sua transferência para a conta abaixo:`);
  d.add(p(dadosDaConta(perfil, conta), { left: 1418, align: 'left' }));

  d.h1('3.', 'Da designação da diligência', { novaPagina: false });
  const nDias = Number(String(c.antecedenciaDias || '').replace(/\D/g, ''));
  d.texto(`Levantado o valor, o signatário indicará nos autos${nDias ? `, com antecedência mínima de ${nDias} (${numeroPorExtenso(nDias)}) dias úteis` : ''}, a data, o horário e o local de início dos trabalhos${itemTxt(c.itemDataPericia) ? `, conforme o ${itemTxt(c.itemDataPericia)}` : ''}, para a intimação das partes (art. 474 do CPC).`);

  d.h1('4.', 'Dos requerimentos', { novaPagina: false });
  d.texto('Diante do exposto, requer-se:');
  const reqs = [
    'o recebimento do presente aceite;',
    `a intimação do signatário quando comprovado nos autos o depósito${itemTxt(c.itemDeposito) ? ` do ${itemTxt(c.itemDeposito)}` : ''};`,
    'a expedição de alvará ou a transferência do valor depositado, com os acréscimos da conta, para a conta indicada no item 2, para início dos trabalhos.',
  ];
  reqs.forEach((t, i) => d.texto(`${String.fromCharCode(97 + i)}) ${t}`));
  fecho(d, dados);
  return finalizar(d, { titulo: 'Petição – aceite dos honorários arbitrados', arquivo: 'Peticao_aceite_honorarios_arbitrados', c });
}

// ======================================================================
// ACEITE E PROPOSTA DE HONORÁRIOS (Justiça Estadual / Trabalho)
// ======================================================================
export async function peticaoHonorarios(caseId, { conta } = {}) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const d = new Doc();
  d.enderecamento(enderecamentoTexto(c), linhasProcesso(c));
  d.texto(introPerito(perfil, c, '**aceitar o encargo** e apresentar **proposta de honorários periciais**, nos termos do art. 465, § 2º, do Código de Processo Civil.'));
  d.h1('1.', 'Do aceite', { novaPagina: false });
  d.texto('O signatário declara aceitar o encargo e não possuir impedimento ou suspeição para atuar no feito (arts. 148, 156 e 467 do CPC).');
  d.h1('2.', 'Da proposta de honorários', { novaPagina: false });
  d.texto(`A perícia envolve ${(c.objeto || []).join(', ').toLowerCase() || '[[objeto]]'}${dados.periodos.length ? `, abrangendo ${dados.periodos.length} período(s) de trabalho` : ''}${dados.quesitos.length ? ` e ${dados.quesitos.length} quesito(s) formulados` : ''}. A estimativa considera as etapas abaixo:`);
  d.quadro('Estimativa de horas técnicas', [['Etapa', 'Horas'], ['Análise dos autos e planejamento', '[[h]]'], ['Deslocamento', '[[h]]'],
    ['Diligência, vistoria e avaliações ambientais', '[[h]]'], ['Elaboração do laudo e respostas aos quesitos', '[[h]]'], ['Total', '[[h]]']],
  { larguras: [0.75, 0.25] });
  const prop = lerValor(c.honorariosFixados);
  d.texto(`Propõe-se o valor de **${isFinite(prop) ? `${moeda(prop)} (${reaisPorExtenso(prop)})` : '[[R$ valor]]'}**.`);
  d.h1('3.', 'Dos dados para pagamento', { novaPagina: false });
  d.texto('Para o depósito ou a transferência dos honorários, indica-se a conta abaixo:');
  d.add(p(dadosDaConta(perfil, conta), { left: 1418, align: 'left' }));
  fecho(d, dados);
  return finalizar(d, { titulo: 'Petição – aceite e honorários', arquivo: 'Peticao_honorarios', c });
}

// ======================================================================
// PEDIDO DE PAGAMENTO / LIBERAÇÃO DOS HONORÁRIOS
// ======================================================================
export async function peticaoPagamento(caseId, { conta } = {}) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const d = new Doc();
  d.enderecamento(enderecamentoTexto(c), linhasProcesso(c));
  d.texto(introPerito(perfil, c, 'requerer o pagamento dos honorários periciais, pelos fundamentos a seguir expostos.'));
  d.h1('1.', 'Dos trabalhos periciais', { novaPagina: false });
  const juntada = [dataBR(c.laudoData) && `em ${dataBR(c.laudoData)}`, v(c.laudoRefPerito) && `(${c.laudoRefPerito})`].filter(Boolean).join(' ') || 'em [[data – evento / mov.]]';
  const supl = dados.quesitos.filter(ehSuplementar).length;
  d.texto(`A vistoria pericial foi realizada em ${dataBR(c.vistoriaData) || '[[data]]'} e o laudo pericial foi juntado aos autos ${juntada}${supl ? ', tendo sido respondidos também os quesitos suplementares' : ''}, encerrando-se os trabalhos periciais.`);
  d.h1('2.', 'Do pedido', { novaPagina: false });
  const val = lerValor(c.honorariosFixados);
  d.texto(`Diante do exposto, requer-se ${fundamentoCJF(c) ? 'a expedição da requisição de pagamento dos honorários periciais fixados' : 'a liberação dos honorários periciais depositados, mediante expedição de alvará ou transferência,'}${isFinite(val) ? ` no valor de ${moeda(val)} (${reaisPorExtenso(val)})` : ''}, com crédito na conta abaixo:`);
  d.add(p(dadosDaConta(perfil, conta), { left: 1418, align: 'left' }));
  fecho(d, dados);
  return finalizar(d, { titulo: 'Petição – pagamento de honorários', arquivo: 'Peticao_pagamento_honorarios', c });
}

// ======================================================================
// RESPOSTA AOS QUESITOS SUPLEMENTARES / ESCLARECIMENTOS (art. 477, § 2º, I, do CPC)
// ======================================================================
const linhas = (t) => String(t || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

export function referenciaLaudo(c) {
  const partesRef = [v(c.laudoRefPerito) && `(${c.laudoRefPerito})`, dataBR(c.laudoData) && `em ${dataBR(c.laudoData)}`].filter(Boolean);
  return `laudo pericial juntado aos autos ${partesRef.length ? partesRef.join(' ') : '[[mov. / evento e data]]'}`;
}

export async function respostaQuesitosSuplementares(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const d = new Doc();
  d.enderecamento(enderecamentoTexto(c), linhasProcesso(c));
  const dec = v(c.esclDecisaoRef);
  const emAtencao = dec ? `, em atenção ${/^(decisão|sentença|r\.)/i.test(dec) ? 'à' : 'ao'} ${dec}` : '';
  d.texto(`${qualificacaoCurta(perfil)}, perito judicial nomeado nos autos em epígrafe, vem, respeitosamente, à presença de Vossa Excelência${emAtencao}, apresentar **RESPOSTA AOS QUESITOS SUPLEMENTARES** e os esclarecimentos sobre o ${referenciaLaudo(c)}, nos termos do art. 477, § 2º, inciso I, do Código de Processo Civil.`);

  const supl = dados.quesitos.filter(ehSuplementar);
  let n = 0;
  n += 1;
  d.h1(`${n}.`, 'Dos quesitos suplementares e pedidos de esclarecimento', { novaPagina: false });
  if (!supl.length) d.texto('[[Cadastre os quesitos suplementares na etapa 3. Quesitos, marcando "Suplementar (após o laudo)".]]');
  let g = 0;
  for (const origem of ORIGEM_QUESITO) {
    const lista = supl.filter((q) => (q.data.origem || 'Outro') === origem);
    if (!lista.length) continue;
    g += 1;
    const ref = lista.map((q) => v(q.data.refPeticao)).find(Boolean);
    d.h2(`${n}.${g}`, `Quesitos suplementares ${nomeOrigemQuesito(origem, c)}${ref ? ` (${ref})` : ''}`);
    for (const q of lista) {
      const tx = linhas(q.data.texto);
      const rot = `${/quesito/i.test(v(q.data.numero)) ? v(q.data.numero) : `Quesito suplementar ${v(q.data.numero) || '•'}`}: `;
      d.add(p([run(rot, { b: true }), run(tx[0] || '', { i: true })], { left: 709, after: 40, keepNext: true }));
      for (const l of tx.slice(1)) d.add(p([run(l, { i: true })], { left: 709, after: 40, keepNext: true }));
      const rs = linhas(q.data.resposta);
      d.add(p([run('Resposta: ', { b: true })].concat(rs.length ? [rich(rs[0])] : [run('[[Responder]]', { b: true, hl: true })]), { first: 709, before: 80, after: 80 }));
      if (rs.length > 1) d.texto(rs.slice(1).join('\n'));
      d.add(p('', { after: 80 }));
    }
  }

  if (linhas(c.esclRetificacoes).length) {
    n += 1;
    d.h1(`${n}.`, 'Das retificações de erro material', { novaPagina: false });
    d.texto(`Ficam retificados os seguintes erros materiais do ${referenciaLaudo(c)}, sem alteração das avaliações técnicas:`);
    d.texto(linhas(c.esclRetificacoes).map((l) => (/^[-•▪]\s/.test(l) ? l : `- ${l}`)).join('\n'));
  }
  if (v(c.esclObservacoes)) {
    n += 1;
    d.h1(`${n}.`, 'Esclarecimentos complementares', { novaPagina: false });
    d.texto(c.esclObservacoes);
  }
  n += 1;
  d.h1(`${n}.`, 'Da conclusão', { novaPagina: false });
  if (c.esclRatifica === 'Não') d.redigir('indicar quais conclusões do laudo são alteradas pelos esclarecimentos e em que termos.');
  else d.texto('Os esclarecimentos ora prestados não alteram as avaliações técnicas nem as conclusões do laudo pericial, que ficam integralmente ratificadas.');
  d.texto('O signatário permanece à disposição do Juízo para outros esclarecimentos que se fizerem necessários.');
  fecho(d, dados);
  return finalizar(d, { titulo: 'Resposta aos quesitos suplementares', arquivo: 'Resposta_quesitos_suplementares', c });
}
