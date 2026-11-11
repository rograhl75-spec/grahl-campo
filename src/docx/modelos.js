// Modelos de documentos da GRAHL, baseados nos documentos reais do signatário:
// laudo pericial (Fazenda Pública), parecer técnico previdenciário, LTCAT+PPP,
// impugnação / parecer de assistente técnico, parecer preventivo, petição de
// indicação com quesitos. O que depende de análise técnica sai marcado em
// amarelo ("[[Redigir: ...]]") para ser escrito por você.
import { ORIGEM_QUESITO, ehSuplementar, FORMAS_PAGAMENTO, localVistoria, ehAcidente } from '../schema.js';
import {
  Doc, carregar, finalizar, dataBR, menosCincoAnos, ou, partes, papelAssinatura, enderecamentoTexto, linhasProcesso,
  qualificacaoCurta, qualificacaoCompleta, blocoAssinatura, credencial, equipamentosUsados, quadroEquipamentos, quadroDiligencia,
  quadroPeriodos, quadroEpis, quadroDocumentos, quadroCriteriosRuido, quadroConfrontoRuido, quadroMedicoesRuido,
  quadroMedicoesGenerico, medicoesPorAgente, nomePostoFn, profissiografia, figurasDoCaso, respostasQuesitos, capaTecnica,
  quadroCriteriosCalor, quadroCriteriosVibracao, documentosARequerer, quadrosParadigmasMetodologia, memoriasParadigmas, usaParadigmas,
  art, dadosDaConta, dataPorExtenso, horaPorExtenso, reaisPorExtenso, numeroPorExtenso, moeda, lerValor, nomeOrigemQuesito,
  quadroFormaEnquadramento, quadroRequisitosEpi, codigosEnquadramento, textoDeterminacao, nomeCurto,
  apendicesDoCaso, textoIntegram, inserirApendices, tituloVinculo, descricaoVinculo, agentesCurtos, refDespachos, ehSimilaridade, empresaDoDespacho, empresaCurta, prefixoQuesito,
} from './base.js';
import { comJurisprudencia, registroJurisprudencia, secaoReferencias } from './fontes.js';
import { secaoPenosidade } from './penosidade.js';
import { conclusaoPrevidenciaria, avaliarPeriodos } from './conclusao.js';
import { p, run, rich } from './ooxml.js';
import { quadroQuimicosAnexo11, quadroConclusivoTrab, conclusaoAT, POSICOES_AT, agenteDaMedicao, sinteseTrab, quadroRequisitos473, quadroRecomendacoes, quadroDadosPPP, roteiroPericulosidade } from './modelos2.js';

const v = (x) => (x === undefined || x === null ? '' : String(x).trim());

// perícia direta ou indireta por similaridade, a partir da aba Campo (local da vistoria), do campo
// "similaridade" do caso e dos paradigmas vinculados
function periciaIndireta(dados) {
  const { c } = dados;
  const local = `${c.vistoriaLocal || ''} ${c.vistoriaCondicoes || ''}`;
  return /indiret|similar|paradigma|terceir/i.test(local) || c.similaridade === 'Sim' || usaParadigmas(dados);
}
function textoTipoPericia(dados) {
  const { c } = dados;
  const indireta = periciaIndireta(dados);
  const veic = dados.postos.map((ps) => nomeCurto(ps.data.nome)).filter(Boolean);
  if (!indireta) return 'A perícia foi realizada de forma direta, no local de trabalho e nos postos ocupados pela parte autora, com avaliação das condições ambientais e das atividades nele desenvolvidas.';
  return `A perícia foi realizada de forma indireta, por similaridade, porque o ambiente e os veículos de origem não estão mais disponíveis nas condições da época. Foram avaliados${veic.length ? ` os seguintes postos e veículos, representativos dos utilizados pelo autor em cada vínculo: ${veic.join('; ')}` : ' postos e veículos representativos dos utilizados pelo autor em cada vínculo'}${usaParadigmas(dados) ? ', complementados por paradigmas de veículos similares (item 2.3)' : ''}. A semelhança de função, tipo de veículo e condições de operação está demonstrada no item 4, vínculo a vínculo.`;
}

// confronto da VCI com o critério de cada período (previdenciário), a partir da conclusão calculada
function quadroConfrontoVci(d, dados) {
  const linhas = avaliarPeriodos(dados).flatMap(({ r, segs }) => segs.flatMap((s) => s.itens.filter((i) => /^VCI/.test(i.t))
    .map((i) => [`${r.data.empresa || ''}\n${dataBR(s.ini)} a ${dataBR(s.fim)}`, i.t.replace(/^VCI: /, ''), i.sup ? 'Supera' : 'Não supera'])));
  if (!linhas.length) return false;
  d.quadro('Confronto da vibração de corpo inteiro com o critério de cada período', [['Vínculo / período', 'Valores e critério', 'Resultado'], ...linhas],
    { larguras: [0.3, 0.52, 0.18], tam: 9, fonte: 'Elaborado pelo autor. aren e VDVR referidos à exposição diária (NHO-09).' });
  return true;
}

// trabalhista: confronto direto de cada medição com o Anexo 8 da NR-15
function textoVibracaoTrab(d, ms, nome, k) {
  const vmb = /mãos/.test(k);
  for (const m of ms) {
    const a = Number(String(m.data.aren || '').replace(',', '.')); const vd = Number(String(m.data.vdv || '').replace(',', '.'));
    if (!isFinite(a) || String(m.data.aren || '').trim() === '') { d.redigir(`valores de ${nome(m.data.postoId)} e conclusão.`); continue; }
    const f = (x) => x.toFixed(2).replace('.', ',');
    const sup = vmb ? a > 5 : (a > 1.1 || (isFinite(vd) && vd > 21));
    d.texto(`${nome(m.data.postoId)}: aren de ${f(a)} m/s²${!vmb && isFinite(vd) && String(m.data.vdv || '').trim() ? ` e VDVR de ${f(vd)} m/s^1,75` : ''}, ${sup ? 'acima' : 'abaixo'} do limite de exposição da NR-15, Anexo 8 (${vmb ? 'aren de 5 m/s²' : 'aren de 1,1 m/s² ou VDVR de 21,0 m/s^1,75'}); ${sup ? 'caracteriza-se a insalubridade em grau médio' : 'não se caracteriza a insalubridade por vibração'}, a partir de 14/08/2014.`);
  }
}

// Capa do laudo pericial (perito do juízo): órgão, título, dados do processo e da perícia; o endereçamento vem na página seguinte
function capaLaudo(d, dados, { subtitulo }) {
  const { c, perfil } = dados;
  const pt = partes(c);
  const juizo = [c.juizo, c.comarca && !String(c.juizo || '').includes(c.comarca) ? c.comarca : ''].filter(Boolean).join(' – ');
  const vistoria = [c.vistoriaData && dataBR(c.vistoriaData), c.vistoriaLocal && String(c.vistoriaLocal).split(/\s[–-]\s/)[0]].filter(Boolean).join(' – ');
  capaTecnica(d, {
    titulo: 'LAUDO TÉCNICO PERICIAL', subtitulo, perfil,
    orgao: c.justica ? `Poder Judiciário – ${c.justica}` : '',
    linha2: dados.periodos.length ? `${dados.periodos.length} ${dados.periodos.length > 1 ? 'períodos controvertidos' : 'período controvertido'}` : '',
    pares: [['Processo', c.numero], ['Juízo', juizo], [pt.autor, c.autorNome], [pt.reu, c.reuNome],
      ['Vistoria', vistoria], ['Perito do Juízo', `${perfil.nome} – ${credencial(perfil)}`]].filter(([, x]) => v(x)),
  });
  d.quebra();
}

function eqMap(dados) { return new Map(dados.equipamentos.map((e) => [e.id, e])); }

// Avaliação dos agentes. Cada finalidade usa só a sua legislação:
// - trabalhista: NR-15 / NR-16 na redação vigente em cada período;
// - previdenciária: Decretos 53.831/1964, 2.172/1997 e 3.048/1999 e IN 128/2022,
//   com a NR-15 apenas como referência técnica dos limites, quando o decreto a ela remete.
export function avaliacaoAgentes(d, dados, base, { previdenciario, inicio = 0 }) {
  return previdenciario ? avaliacaoPrevidenciaria(d, dados, base, inicio) : avaliacaoTrabalhista(d, dados, base);
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
    d.texto('Até 10/12/2019 aplica-se o Anexo 3 na redação original (IBUTG, quadros de regime de trabalho e de taxa metabólica; entre linhas do quadro, usa-se a linha imediatamente superior, sem interpolar). A partir de 11/12/2019, a redação da Portaria SEPRT nº 1.359/2019, com avaliação conforme a NHO 06 (2ª ed., 2017) – o ajuste do IBUTG pela vestimenta consta do Quadro 4 do Anexo III da NR-9; a exposição ao calor a céu aberto sem fonte artificial não caracteriza insalubridade nessa redação.');
    quadroMedicoesGenerico(d, 'Resultados – Calor', g['Calor (IBUTG)'], nome, ctx);
    d.redigir('taxa metabólica, regime de trabalho e descanso, limite aplicável ao período e conclusão.');
  }
  for (const k of ['Vibração de corpo inteiro (VCI)', 'Vibração de mãos e braços (VMB)']) {
    if (!g[k]) continue;
    sub(`${k} (NR-15, Anexo 8)`);
    d.texto('A partir de 14/08/2014, NR-15, Anexo 8, na redação da Portaria MTE nº 1.297, de 13/08/2014 (DOU de 14/08/2014), com avaliação conforme as Normas de Higiene Ocupacional da FUNDACENTRO (NHO-09 para VCI e NHO-10 para VMB). Limites de exposição: VMB, aren de 5 m/s²; VCI, aren de 1,1 m/s² ou VDVR de 21,0 m/s^1,75. Antes dessa data, o Anexo 8 na redação original remetia às normas ISO 2631 e ISO/DIS 5349.');
    quadroMedicoesGenerico(d, `Resultados – ${k}`, g[k], nome, ctx);
    textoVibracaoTrab(d, g[k], nome, k);
  }
  if (g['Agente químico']) {
    sub('Agentes químicos (NR-15, Anexos 11, 12, 13 e 13-A)');
    d.texto('No Anexo 11, a insalubridade se caracteriza quando a média aritmética das concentrações supera o limite de tolerância do Quadro 1 (itens 1 e 8) ou, para os agentes com valor teto, quando qualquer amostra o supera (item 9). Os limites valem para absorção pela via respiratória e para jornadas de até 48 horas semanais (itens 2 e 10). Os agentes dos Anexos 13 e 13-A são avaliados qualitativamente, pela atividade ou operação descrita no anexo.');
    quadroQuimicosAnexo11(d, g['Agente químico'], dados, nome);
    if (g['Agente químico'].some((m) => !agenteDaMedicao(m, dados))) d.redigir('enquadramento dos agentes sem limite no banco (Anexo 11 ou 12, ou avaliação qualitativa pelo Anexo 13 / 13-A; álcali cáustico: referência pH 11,5).');
    d.redigir('neutralização pelo EPI (respirador e filtro adequados ao agente; luvas quando há absorção pela pele – item 5 do Anexo 11).');
  }
  if (g['Outro']) {
    sub('Outros agentes avaliados');
    quadroMedicoesGenerico(d, 'Outros registros', g['Outro'], nome, ctx);
  }
  if ((dados.c.objeto || []).includes('Periculosidade')) {
    sub('Periculosidade (NR-16)');
    roteiroPericulosidade(d, dados);
  }
  if (v(dados.c.agentesAlegados)) {
    sub(n ? 'Demais agentes alegados' : 'Agentes alegados');
    d.texto(`Agentes indicados nos autos: ${dados.c.agentesAlegados.replace(/\n+/g, '; ')}`);
    d.redigir('avaliação de cada agente no anexo correspondente da NR-15 (insalubridade) ou da NR-16 (periculosidade, anexos em algarismos romanos), na redação vigente no período.');
  }
  if (!n) d.redigir('avaliação dos agentes (cadastre as medições na aba Campo).');
}

function avaliacaoPrevidenciaria(d, dados, base, inicio = 0) {
  const ctx = { prev: true };
  const g = medicoesPorAgente(dados);
  const nome = nomePostoFn(dados.postos);
  const eq = eqMap(dados);
  let n = inicio;
  const sub = (t) => { n += 1; d.h2(`${base}.${n}`, t); };
  if (g['Ruído']) {
    sub('Ruído');
    quadroCriteriosRuido(d);
    quadroMedicoesRuido(d, g['Ruído'], eq, nome, ctx);
    quadroConfrontoRuido(d, dados);
    if (usaParadigmas(dados)) d.texto('Para os vínculos avaliados por similaridade, os valores do paradigma normalizados para a jornada efetiva e a comparação com o limite de cada período estão na memória de cálculo do ruído, adiante.');
    if (dados.periodos.length && dados.periodos.every((r) => /motorista|caminh|carreteir|cobrador|ônibus/i.test(`${r.data.cargo || ''} ${r.data.atividades || ''}`))) {
      d.texto('A fonte do ruído e da vibração é o próprio veículo (motor, transmissão, rodagem e carroceria). A exposição ocorre durante toda a condução, que é a atividade principal da função, de forma habitual e permanente, não ocasional nem intermitente.');
    } else d.redigir('fonte, habitualidade e permanência por período.');
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
    if (usaParadigmas(dados)) {
      d.texto('Os valores de aren e VDVR normalizados para a jornada efetiva e a leitura pelo critério de cada período estão na memória de cálculo da vibração de corpo inteiro, adiante.');
      quadroConfrontoVci(d, dados);
    } else {
      d.texto('Os valores de aren e VDVR do quadro acima referem-se à exposição diária do trabalhador, normalizados para a jornada conforme a NHO-09 da FUNDACENTRO. Cada vínculo é lido pelo critério vigente no período: até 05/03/1997, cód. 1.1.5 do Decreto 53.831/1964 (trepidações e vibrações industriais: operadores de perfuratrizes e marteletes pneumáticos, e outros; máquinas acionadas a ar comprimido com velocidade acima de 120 golpes por minuto) e cód. 1.1.4 do Anexo I do Decreto 83.080/1979 (perfuratrizes e marteletes pneumáticos); de 06/03/1997 a 13/08/2014, fronteira superior da zona de cautela da ISO 2631-1 (aren de 0,9 m/s² ou VDV de 17 m/s^1,75); a partir de 14/08/2014, NR-15, Anexo 8 (aren de 1,1 m/s² ou VDVR de 21,0 m/s^1,75).');
      quadroConfrontoVci(d, dados);
    }
  }
  for (const k of ['Agente químico', 'Outro']) {
    if (!g[k]) continue;
    sub(k === 'Outro' ? 'Outros agentes avaliados' : 'Agentes químicos');
    quadroMedicoesGenerico(d, k === 'Outro' ? 'Outros registros' : 'Resultados – Agentes químicos', g[k], nome, ctx);
    d.redigir('enquadramento no Anexo IV do Decreto 3.048/1999 (até 05/03/1997, Decreto 53.831/1964); óleos minerais: somente cód. 1.0.17; avaliação qualitativa quando a nocividade decorre da simples exposição (art. 287 da IN 128/2022).');
    if (k === 'Agente químico') {
      const linach = [...new Set(g[k].map((m) => agenteDaMedicao(m, dados)).filter((a) => a && a.data.linach === 'Grupo 1').map((a) => a.data.nome))];
      const ags = [...new Map(g[k].map((m) => agenteDaMedicao(m, dados)).filter(Boolean).map((a) => [a.id, a])).values()];
      if (ags.length) d.quadro('Agentes químicos – referências previdenciárias', [['Agente', 'LINACH', 'Códigos nos decretos'],
        ...ags.map((a) => [`${a.data.nome}${a.data.cas ? `\nCAS ${a.data.cas}` : ''}`, a.data.linach || '—', a.data.codDecretos || '[[código por decreto, conforme o período]]'])],
      { larguras: [0.3, 0.15, 0.55], tam: 9, alinhar: 'left', fonte: 'Banco de agentes químicos do signatário; códigos conferidos nos Decretos 53.831/1964, 83.080/1979, 2.172/1997 e 3.048/1999.' });
      if (linach.length) d.texto(`${linach.join(', ')} ${linach.length > 1 ? 'constam' : 'consta'} do Grupo 1 da LINACH (Portaria Interministerial nº 9/2014). Para agentes reconhecidamente cancerígenos em humanos, a avaliação é qualitativa (Decreto 3.048/1999, art. 68, §§ 2º a 4º). Na redação do Decreto nº 8.123/2013 (de 17/10/2013 a 30/06/2020), a presença no ambiente de trabalho com possibilidade de exposição bastava para a comprovação da efetiva exposição; na redação do Decreto nº 10.410/2020 (a partir de 01/07/2020), a efetiva exposição é descaracterizada quando adotadas as medidas de controle previstas na legislação trabalhista que eliminem a nocividade.`);
    }
  }
  if (v(dados.c.agentesAlegados) && n === inicio) {
    sub('Agentes alegados');
    d.texto(`Agentes indicados: ${dados.c.agentesAlegados.replace(/\n+/g, '; ')}`);
    d.redigir('avaliação de cada agente pelo decreto vigente no período. Biológicos: somente o rol de atividades do cód. 3.0.1 do Anexo IV (não se usa o Anexo 14 da NR-15).');
  }
  if (n === inicio) d.redigir('avaliação dos agentes (cadastre as medições na aba Campo).');
  return n;
}

// ======================================================================
// LAUDO PERICIAL TRABALHISTA (perito do juízo) – Justiça do Trabalho,
// Fazenda Pública (servidor) e cível: NR-15 / NR-16, CLT art. 189-195
// ======================================================================
// contratante do trabalho extrajudicial: o nome digitado ou, se foi a empresa, a razão social
export const contratanteDe = (c) => v(c.contratante) || (c.contratadoPor === 'Empresa' ? v(c.reuNome) : v(c.contratadoPor));

// extra = laudo extrajudicial de insalubridade e periculosidade (contratado pela empresa, trabalhador ou advogado)
export async function laudoPericial(caseId, { extra = false } = {}) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const pt = partes(c);
  const d = new Doc();
  const objTitulo = (c.objeto || []).filter((o) => /Insalub|Periculos/.test(o)).join(' e ').toLowerCase() || 'insalubridade e/ou periculosidade';
  if (extra) {
    capaTecnica(d, {
      titulo: `LAUDO TÉCNICO DE ${objTitulo.toUpperCase()}`, subtitulo: 'Caracterização conforme a CLT (arts. 189 a 195), a NR-15 e a NR-16', perfil,
      pares: [['Contratante', contratanteDe(c)], ['Empresa', c.reuNome], ['CNPJ', c.reuCnpj], ['Trabalhador', c.autorNome], ['Função', String(c.funcoes || '').split('\n')[0]],
        ['Data da avaliação', dataBR(c.vistoriaData)], ['Responsável técnico', `${perfil.nome} – ${credencial(perfil)}`], ['ART', v(c.art) || '[[nº da ART]]']].filter(([, x]) => v(x)),
    });
  } else {
    capaLaudo(d, dados, { subtitulo: `Caracterização de ${objTitulo}` });
    d.enderecamento(enderecamentoTexto(c), linhasProcesso(c));
    d.texto(`${qualificacaoCurta(perfil)}, perito nomeado e compromissado nos autos do processo em epígrafe, tendo realizado as vistorias, os levantamentos técnicos e as diligências necessárias, vem, respeitosamente, à presença de Vossa Excelência, apresentar o presente **LAUDO TÉCNICO PERICIAL**, consubstanciado nas informações e análises a seguir expostas.`);
  }
  d.sumario();

  d.h1('1', extra ? 'Identificação e dados da avaliação' : 'Identificação e dados da diligência pericial');
  d.h2('1.1', extra ? 'Identificação' : 'Dados do processo');
  if (extra) {
    d.identificacao([['Contratante', contratanteDe(c)], ['Empresa', c.reuNome], ['CNPJ', c.reuCnpj], ['Endereço', c.vistoriaEndereco], ['Trabalhador', c.autorNome],
      ['Função / período', c.funcoes], ['Objeto', (c.objeto || []).join(', ')], ['Responsável técnico', `${perfil.nome} – ${perfil.titulos} – ${credencial(perfil)}`], ['ART', v(c.art) || '[[nº da ART]]']]);
  } else {
    d.identificacao([['Processo', c.numero], ['Juízo', [c.juizo, c.comarca].filter(Boolean).join(' – ')], [pt.autor, c.autorNome], [pt.reu, c.reuNome],
      ['Objeto', (c.objeto || []).join(', ')], ...(pt.trab && c.dataAjuizamento ? [['Período imprescrito', `a partir de ${menosCincoAnos(c.dataAjuizamento)}`]] : [])]);
  }
  d.h2('1.2', 'Data, hora e local da vistoria');
  quadroDiligencia(d, c);
  d.h2('1.3', 'Instrumentos utilizados');
  quadroEquipamentos(d, equipamentosUsados(dados));
  sinteseTrab(d, dados, '1.4', '6');

  d.h1('2', extra ? 'Objetivo e metodologia' : 'Objetivo e metodologia da avaliação pericial');
  if (extra) {
    d.h2('2.1', 'Objeto contratado');
    if (v(c.pedidos)) d.texto(c.pedidos); else d.redigir('o que foi contratado (setores, funções e agentes a caracterizar; finalidade: pagamento do adicional, revisão, defesa).');
  } else {
    d.h2('2.1', 'Determinação judicial (objeto da perícia)');
    if (textoDeterminacao(dados, false)) d.texto(textoDeterminacao(dados, false)); else d.redigir('transcrever ou resumir o despacho que determinou a perícia (ID / mov.) – cadastre a referência do despacho na etapa 1.');
  }
  d.h2('2.2', 'Objetivo técnico');
  const servidor = c.materia === 'Administrativa (servidor)' || /Fazenda/i.test(c.justica || '');
  const baseLegal = servidor
    ? `nos termos da lei do ente que rege o adicional do servidor [[lei estadual/municipal e artigo]] e, por remissão dessa lei, das NR-15 e NR-16, na redação vigente em cada período`
    : 'nos termos dos arts. 189 a 195 da CLT e das NR-15 e NR-16, na redação vigente em cada período';
  const objTxt = (c.objeto || []).filter((o) => o !== 'Adicional (servidor público)').join(', ').toLowerCase() || '[[objeto]]';
  d.texto(`${extra ? 'O' : 'Em atendimento à determinação judicial, o'} presente laudo tem por objetivo apurar as reais condições do ambiente e das atividades laborais desenvolvidas ${extra ? (v(c.autorNome) ? `por ${c.autorNome}` : 'pelos trabalhadores dos setores avaliados') : `pela parte ${pt.autorCurto.toLowerCase()}`}, para a caracterização ou descaracterização de ${objTxt}, ${baseLegal}${pt.trab && c.dataAjuizamento ? ` do período imprescrito (a partir de ${menosCincoAnos(c.dataAjuizamento)})` : ''}.`);
  d.h2('2.3', 'Metodologia');
  d.texto(extra
    ? 'A metodologia consistiu em análise dos documentos de SST da empresa, inspeção *in loco*, entrevistas com os trabalhadores e a supervisão e avaliações ambientais, quando cabíveis, conforme a NR-15, a NR-16 e as Normas de Higiene Ocupacional da FUNDACENTRO.'
    : 'Em atendimento ao art. 473, inciso III, do Código de Processo Civil, a metodologia consistiu em análise dos autos, inspeção *in loco*, entrevista com as partes e avaliações ambientais, quando cabíveis, conforme a NR-15, a NR-16 e as Normas de Higiene Ocupacional da FUNDACENTRO.');
  d.texto(`A conclusão deste laudo fundamenta-se exclusivamente na legislação e nas normas técnicas indicadas${comJurisprudencia(dados) && !extra ? '; entendimentos jurisprudenciais aplicáveis são apenas registrados, em item próprio, para apreciação do Juízo' : ''}.`);

  d.h1('3', 'Descrição do ambiente e das atividades laborais');
  d.h2('3.1', 'Função, período e atividades alegadas');
  d.texto(c.funcoes || '');
  d.texto(c.atividadesAlegadas || '');
  d.h2('3.2', 'Ambiente e atividades constatados na diligência');
  profissiografia(d, dados.postos, dados, { base: '3.2' });

  d.h1('4', 'Equipamentos de proteção coletiva (EPC) e individual (EPI)');
  d.h2('4.1', 'Medidas de proteção coletiva');
  d.redigir('EPC existentes e sua eficácia.');
  d.h2('4.2', 'Equipamentos de proteção individual e registros');
  quadroEpis(d, dados.epis, { extra });
  if (c.analiseEpi) d.texto(c.analiseEpi);
  d.h2('4.3', 'Conclusão técnica quanto à neutralização');
  d.redigir('neutralização ou não (item 15.4.1 da NR-15 e NR-6: CA válido, periodicidade de troca, treinamento, uso efetivo).');

  d.h1('5', 'Avaliação técnica dos agentes (NR-15 e NR-16)');
  avaliacaoAgentes(d, dados, '5', { previdenciario: false });

  d.h1('6', extra ? 'Conclusão' : 'Conclusão pericial');
  quadroConclusivoTrab(d, dados);
  d.redigir(extra ? 'conclusão por setor / função e agente (grau de insalubridade e/ou periculosidade).' : 'conclusão por agente e por período (grau de insalubridade e/ou periculosidade).');
  if (!extra) registroJurisprudencia(d, dados, { numero: '6.1', nivel: 'h2', prev: false });

  let nq = 6;
  if (!extra || dados.quesitos.some((q) => !ehSuplementar(q))) {
    nq += 1;
    d.h1(String(nq), 'Respostas aos quesitos');
    if (!extra) d.texto('Em atendimento ao art. 473, inciso IV, do Código de Processo Civil, passa-se a responder aos quesitos formulados, com remissão às análises do corpo deste laudo.');
    respostasQuesitos(d, dados.quesitos, String(nq), c);
  }
  if (extra) {
    nq += 1;
    d.h1(String(nq), 'Recomendações');
    d.texto('Recomendam-se as medidas abaixo, na ordem de prioridade da NR-1, item 1.4.1, "g" (eliminação dos fatores de risco, proteção coletiva, medidas administrativas ou de organização do trabalho e proteção individual). As recomendações não alteram a caracterização da situação avaliada.');
    quadroRecomendacoes(d, dados);
    d.redigir('ajustar as medidas a cada setor e incluir prazos e responsáveis.');
  }
  nq += 1;
  d.h1(String(nq), 'Encerramento e anexos');
  d.texto(extra
    ? 'Este laudo foi elaborado com imparcialidade técnica, sob a responsabilidade do signatário, e retrata as condições verificadas na data da avaliação. Alterações no processo, nos produtos ou nas medidas de controle exigem nova avaliação.'
    : 'Nada mais havendo a relatar no âmbito da Engenharia de Segurança do Trabalho, este Perito dá por encerrados os trabalhos periciais, colocando-se à disposição do Juízo e das partes para os esclarecimentos que se fizerem necessários.');
  const { lista, faltando } = await figurasDoCaso(dados);
  const { apendices, falhasApendice } = await apendicesDoCaso(dados);
  if (!extra) quadroRequisitos473(d, { objeto: '2.1 e 2.2', analise: '3 a 6', metodo: '2.3', quesitos: dados.quesitos.some((q) => !ehSuplementar(q)) ? String(nq - 1) : 'não houve quesitos' });
  textoIntegram(d, { fotos: lista.length > 0, apendices });
  blocoAssinatura(d, dados, extra ? `Responsável técnico – ART nº ${v(c.art) || '[[nº]]'}` : 'Perito do Juízo');
  secaoReferencias(d, dados, { prev: false, judicial: !extra });
  if (lista.length) { d.h1('', 'Anexo I – Relatório fotográfico da diligência'); d.figuras(lista); }
  inserirApendices(d, apendices);
  const r = await finalizar(d, { titulo: extra ? 'Laudo técnico de insalubridade e periculosidade' : 'Laudo técnico pericial', arquivo: extra ? 'Laudo_insalubridade_periculosidade' : 'Laudo_pericial', c });
  return { ...r, faltando, falhasApendice };
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
  capaLaudo(d, dados, { subtitulo: 'Verificação das condições especiais de trabalho para fins previdenciários (tempo especial)' });
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
  d.h2('1.5', 'Síntese da conclusão');
  const sint = avaliarPeriodos(dados).flatMap(({ r, segs }) => segs.map((s) => [r.data.empresa || '', `${dataBR(s.ini)} a ${dataBR(s.fim)}`, s.caracteriza || '[[ ]]']));
  if (sint.length) d.quadro('Síntese da conclusão por período', [['Vínculo', 'Período', 'Caracteriza tempo especial'], ...sint], { larguras: [0.45, 0.3, 0.25], tam: 9, alinhar: 'left', fonte: 'Elaborado pelo autor. Fundamentação e conclusão detalhadas nos itens 3 a 7.' });
  else d.redigir('síntese da conclusão por período (detalhada no item 7).');

  d.h1('2', 'Objeto e metodologia');
  d.h2('2.1', 'Determinação judicial (objeto da perícia)');
  if (textoDeterminacao(dados, true)) d.texto(textoDeterminacao(dados, true)); else d.redigir('transcrever ou resumir o despacho que determinou a perícia (evento / mov.) – cadastre a referência do despacho na etapa 1.');
  d.h2('2.2', 'Metodologia');
  d.texto('Em atendimento ao art. 473, inciso III, do Código de Processo Civil, a metodologia consistiu em análise dos autos, inspeção *in loco* e avaliações ambientais, seguindo as NHO da FUNDACENTRO e os limites de tolerância do Anexo IV do Regulamento da Previdência Social ou, na sua falta, da NR-15, quando o decreto a ela remete (art. 288 da IN 128/2022).');
  d.texto(textoTipoPericia(dados));
  // Res. CJF 305/2014, art. 30-A (incluído pela Res. CJF 575/2019): perícia por similaridade como prova emprestada
  if (periciaIndireta(dados) && fundamentoCJF(c)) d.texto(`Nos termos do art. 30-A da Resolução CJF nº 305/2014, incluído pela Resolução CJF nº 575/2019, a perícia indireta por similaridade realizada em empresa paradigma${v(c.empresaOriginal) ? ` da empresa encerrada (${c.empresaOriginal})` : ' da empresa encerrada'}, do mesmo ramo de atividade, pode ser utilizada como prova emprestada nos demais processos, ainda que não sejam da mesma vara da Subseção Judiciária ou Comarca.`);
  d.texto(`A conclusão fundamenta-se exclusivamente na legislação previdenciária e nas normas técnicas indicadas${comJurisprudencia(dados) ? '; entendimentos jurisprudenciais são apenas registrados, em item próprio, para apreciação do Juízo' : ''}.`);
  if (usaParadigmas(dados)) { d.h2('2.3', 'Avaliação por similaridade (paradigmas)'); quadrosParadigmasMetodologia(d, dados); }

  d.h1('3', 'Fundamentação por período');
  d.texto('O enquadramento observa a legislação vigente à época da prestação do serviço (*tempus regit actum*).');
  quadroFormaEnquadramento(d);

  d.h1('4', 'Ambiente de trabalho e profissiografia');
  d.texto(c.funcoes || '');
  dados.periodos.forEach((r, i) => {
    d.h2(`4.${i + 1}`, tituloVinculo(r));
    descricaoVinculo(d, r, dados, { refVistoria: `4.${dados.periodos.length + 1}` });
  });
  profissiografia(d, dados.postos, dados, { numero: `4.${dados.periodos.length + 1}` });

  d.h1('5', 'Avaliação dos agentes nocivos');
  let n5 = avaliacaoAgentes(d, dados, '5', { previdenciario: true });
  if (memoriasParadigmas(d, dados, { numero: `5.${n5 + 1}` })) n5 += 1;
  secaoPenosidade(d, dados, { numero: `5.${n5 + 1}`, tipo: 'laudo' });

  d.h1('6', 'Medidas de controle');
  d.texto('Considera-se o EPC que elimina ou neutraliza a nocividade (art. 290 da IN 128/2022). O EPI só é considerado em demonstrações ambientais a partir de 03/12/1998, quando elimina ou neutraliza a nocividade, observa a NR-6, consta do PPP e atende, cumulativamente, aos requisitos do art. 291 da IN 128/2022.');
  quadroEpis(d, dados.epis);
  quadroRequisitosEpi(d, dados);
  if (dados.epis.length) d.redigir('análise dos requisitos do art. 291 por período.');

  d.h1('7', 'Conclusão');
  conclusaoPrevidenciaria(d, dados);
  registroJurisprudencia(d, dados, { numero: '7.1', nivel: 'h2', prev: true, tipo: 'laudo' });

  d.h1('8', 'Respostas aos quesitos');
  d.texto('Em atendimento ao art. 473, inciso IV, do Código de Processo Civil, passa-se a responder aos quesitos formulados, com remissão às análises do corpo deste laudo.');
  respostasQuesitos(d, dados.quesitos, '8', c);

  d.h1('9', 'Encerramento e anexos');
  d.texto('Nada mais havendo a relatar no âmbito da Engenharia de Segurança do Trabalho, este Perito dá por encerrados os trabalhos periciais, colocando-se à disposição do Juízo e das partes para os esclarecimentos que se fizerem necessários.');
  const { lista, faltando } = await figurasDoCaso(dados);
  const { apendices, falhasApendice } = await apendicesDoCaso(dados);
  quadroRequisitos473(d, { objeto: '2.1', analise: '3 a 7', metodo: '2.2', quesitos: '8' });
  textoIntegram(d, { fotos: lista.length > 0, apendices });
  blocoAssinatura(d, dados, 'Perito do Juízo');
  secaoReferencias(d, dados, { prev: true });
  if (lista.length) { d.h1('', 'Anexo I – Relatório fotográfico da diligência'); d.figuras(lista); }
  inserirApendices(d, apendices);
  const r = await finalizar(d, { titulo: 'Laudo técnico pericial previdenciário', arquivo: 'Laudo_pericial_previdenciario', c });
  return { ...r, faltando, falhasApendice };
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
  // ABNT NBR 14724:2024, 4.2.1.9: quadros e figuras são ilustrações; recomenda-se lista própria para cada tipo (a norma não fixa ordem entre elas)
  if (dados.fotos.some((f) => !f.deleted)) d.listaFiguras({ novaPagina: true });
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
  d.texto(`O laudo extrajudicial é meio de prova lícito (arts. 369 e 371 do CPC) e pode dispensar a perícia judicial quando suficiente (art. 472). Sua estrutura atende ao art. 473 do CPC – objeto, análise técnica, método e conclusão${comJurisprudencia(dados) ? ' – e a extemporaneidade não lhe retira a eficácia (Súmula 68 da TNU)' : ''}.`);
  if (c.similaridade === 'Sim' || usaParadigmas(dados)) {
    d.texto('Na via administrativa, o INSS não aceita laudo de equipamento ou setor semelhante, de localidade diversa ou de empresa diversa (art. 277, parágrafo único, III a V, da IN 128/2022). A avaliação por similaridade destina-se, assim, à prova em juízo, em que é meio de prova lícito (art. 369 do CPC).');
  }

  d.h1('3', 'Fundamentação');
  d.texto('O enquadramento observa a lei vigente à época da prestação do serviço (*tempus regit actum*). O critério de cada agente consta do item 5.');
  d.h2('3.1', 'Exigências por período');
  quadroFormaEnquadramento(d);
  d.h2('3.2', 'Categoria de segurado e Emenda Constitucional nº 103/2019');
  d.redigir(`categoria do segurado (empregado / contribuinte individual${comJurisprudencia(dados) ? ' – STJ, Tema 1291' : ''}) e efeitos da EC 103/2019 (vigente desde 13/11/2019) sobre os períodos posteriores.`);
  registroJurisprudencia(d, dados, { numero: '3.3', nivel: 'h2', prev: true, tipo: 'ltcat' });

  d.h1('4', 'Ambiente de trabalho e profissiografia');
  profissiografia(d, dados.postos, dados, { numero: '4.1' });
  const { lista, faltando } = await figurasDoCaso(dados);
  if (lista.length) { d.h2('4.2', 'Registro fotográfico'); d.figuras(lista); }

  d.h1('5', 'Avaliação dos agentes e das condições especiais');
  d.h2('5.1', 'Critérios gerais');
  d.texto('As avaliações seguem as NHO da FUNDACENTRO e os limites de tolerância do Anexo IV do RPS ou, na falta destes, da NR-15 (art. 288 da IN 128/2022), com as normas vigentes na data da avaliação (art. 289). A caracterização considera a exposição acima dos limites de tolerância, por critério quantitativo ou qualitativo (art. 287). As atividades do Anexo IV do RPS são exaustivas, ressalvadas as relacionadas exclusivamente a agentes químicos, que são exemplificativas, observada a relação obrigatória com os agentes do Anexo IV (art. 287, § 4º).');
  d.h2('5.2', 'Medidas de controle');
  d.texto('Considera-se adotado o EPC que elimina ou neutraliza a nocividade (art. 290 da IN 128/2022). O EPI só é considerado em demonstrações ambientais a partir de 03/12/1998, quando elimina ou neutraliza a nocividade, observa a NR-6, consta do PPP e atende, cumulativamente, aos requisitos do art. 291 da IN 128/2022.');
  quadroEpis(d, dados.epis);
  quadroRequisitosEpi(d, dados);
  let ini5 = 2;
  if (usaParadigmas(dados)) { d.h2('5.3', 'Avaliação por similaridade (paradigmas)'); quadrosParadigmasMetodologia(d, dados); ini5 = 3; }
  let n5 = avaliacaoAgentes(d, { ...dados }, '5', { previdenciario: true, inicio: ini5 });
  if (memoriasParadigmas(d, dados, { numero: `5.${n5 + 1}` })) n5 += 1;
  secaoPenosidade(d, dados, { numero: `5.${n5 + 1}`, tipo: 'ltcat' });

  d.h1('6', 'Conclusão');
  d.h2('6.1', 'Síntese do enquadramento');
  conclusaoPrevidenciaria(d, dados, { tituloQuadro: 'Síntese do enquadramento por período' });
  d.h2('6.2', 'Parecer técnico');
  d.texto(`Nos períodos que caracterizam exposição habitual e permanente, não ocasional nem intermitente, a agentes nocivos, o PPP deve informar o código GFIP 04; nos demais, o código aplicável à ausência de exposição.`);
  d.h1('7', 'Recomendações');
  d.texto('Em atendimento ao art. 58, § 2º, da Lei nº 8.213/1991, recomendam-se as medidas abaixo, na ordem de prioridade da NR-1. As recomendações não alteram o enquadramento dos períodos avaliados.');
  quadroRecomendacoes(d, dados);
  d.h1('8', 'Encerramento');
  d.texto('Este laudo foi elaborado com imparcialidade técnica, sob responsabilidade civil e criminal do signatário, e é assinado digitalmente. A validade dos dados pretéritos depende da veracidade das declarações do item 2.3.');
  d.quadro('Elementos do LTCAT – art. 276 da IN 128/2022', [['Elemento', 'Item deste laudo'],
    ['I – se individual ou coletivo', '2.1'], ['II – identificação da empresa', '1.1'], ['III – identificação do setor e da função', '1.3 e 4'],
    ['IV – descrição da atividade', '4'], ['V – agente prejudicial arrolado na legislação previdenciária', '5'], ['VI – localização das possíveis fontes geradoras', '4 (registro de cada posto)'],
    ['VII – via e periodicidade de exposição', '4 (registro de cada posto)'], ['VIII – metodologia e procedimentos de avaliação', '5.1'], ['IX – medidas de controle existentes', '5.2'],
    ['X – conclusão', '6'], ['XI – assinatura e identificação do responsável técnico', 'Encerramento'], ['XII – data da avaliação ambiental', '2.2']],
  { larguras: [0.65, 0.35], tam: 9, alinhar: 'left', fonte: 'Elaborado pelo autor com base em Brasil (2022, art. 276).' });
  if (!dados.postos.some((x) => v(x.data.fontes)) || !dados.postos.some((x) => v(x.data.viaPeriodicidade))) {
    d.texto('[[Preencher, em cada posto da etapa 4. Campo, as fontes geradoras e a via e periodicidade da exposição (art. 276, VI e VII).]]');
  }
  blocoAssinatura(d, dados, `Responsável técnico – ART nº [[nº]]`);
  secaoReferencias(d, dados, { prev: true, judicial: true });
  d.h1('', 'Anexos');
  d.texto('- Anexo A – Dados para o Perfil Profissiográfico Previdenciário (PPP)\n- Anexo B – Calibração dos instrumentos\n- Anexo C – Anotação de Responsabilidade Técnica\n- Anexo D – Comprovante de inscrição no CNPJ\n- Anexo E – Fichas com dados de segurança dos produtos químicos\n- Anexo F – Anotações da CTPS');
  const { apendices, falhasApendice } = await apendicesDoCaso(dados);
  if (apendices.length) d.texto(apendices.map((a) => `- Apêndice ${a.letra} – ${a.titulo}`).join('\n'));
  d.h1('', 'Anexo A – Dados para o Perfil Profissiográfico Previdenciário (PPP)');
  d.texto('Dados de exposição por período para o preenchimento do PPP em papel dos períodos anteriores ao eSocial (SST). O código GFIP 04 se aplica aos períodos com enquadramento (item 6).');
  quadroDadosPPP(d, dados);
  inserirApendices(d, apendices);
  const r = await finalizar(d, { titulo: 'LTCAT', arquivo: 'LTCAT_PPP', c });
  return { ...r, faltando, falhasApendice };
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
  d.h1('4', comJurisprudencia(dados) ? 'Fundamentação legal e registro jurisprudencial' : 'Fundamentação legal');
  d.h2('4.1', 'Enquadramento por período (tempus regit actum)');
  d.texto('O enquadramento observa a legislação previdenciária vigente à época da prestação do serviço: por categoria profissional até 28/04/1995 e por exposição a agentes nocivos a partir de 29/04/1995. Os critérios de cada agente, por período, constam do item 7.');
  d.redigir('ajustes específicos do caso (categoria do segurado, EC 103/2019).');
  quadroFormaEnquadramento(d);
  registroJurisprudencia(d, dados, { numero: '4.2', nivel: 'h2', prev: true, tipo: 'parecer' });
  d.h1('5', 'Metodologia');
  d.redigir('etapas; avaliação por similaridade (quando aplicável); normalização pela jornada efetiva; instrumentação.');
  if (!quadrosParadigmasMetodologia(d, dados)) quadroEquipamentos(d, equipamentosUsados(dados));
  d.h1('6', 'Descrição das atividades por vínculo');
  dados.periodos.forEach((r, i) => {
    d.h2(`6.${i + 1}`, tituloVinculo(r, { prefixo: `V${i + 1} – ` }));
    descricaoVinculo(d, r, dados, { refVistoria: `6.${dados.periodos.length + 1}` });
  });
  if (!dados.periodos.length) d.redigir('cadastre os vínculos na aba Preparação.');
  profissiografia(d, dados.postos, dados, { numero: `6.${dados.periodos.length + 1}` });
  d.h1('7', 'Avaliação técnica');
  let n7 = avaliacaoAgentes(d, dados, '7', { previdenciario: true });
  if (memoriasParadigmas(d, dados, { numero: `7.${n7 + 1}` })) n7 += 1;
  if (secaoPenosidade(d, dados, { numero: `7.${n7 + 1}`, tipo: 'parecer' })) n7 += 1;
  d.h2(`7.${n7 + 1}`, 'EPI e EPC');
  quadroEpis(d, dados.epis);
  d.h1('8', 'Quadro conclusivo');
  conclusaoPrevidenciaria(d, dados, { tituloQuadro: 'Quadro conclusivo por vínculo e período' });
  d.h1('9', 'Limitações e ressalvas');
  d.redigir('limitações (similaridade, informações do requerente, documentos não apresentados).');
  d.h1('10', 'Termo de encerramento');
  d.texto('Nada mais havendo a acrescentar, encerra-se o presente parecer técnico, elaborado com imparcialidade e sob responsabilidade do signatário.');
  const { lista, faltando } = await figurasDoCaso(dados);
  const { apendices, falhasApendice } = await apendicesDoCaso(dados);
  textoIntegram(d, { fotos: lista.length > 0, rotuloFotos: 'Anexo – Registro fotográfico', apendices, doc: 'parecer' });
  blocoAssinatura(d, dados, 'Responsável técnico');
  secaoReferencias(d, dados, { prev: true, judicial: false });
  if (lista.length) { d.h1('', 'Anexo – Registro fotográfico'); d.figuras(lista); }
  inserirApendices(d, apendices);
  const r = await finalizar(d, { titulo: 'Parecer técnico previdenciário', arquivo: 'Parecer_previdenciario', c });
  return { ...r, faltando, falhasApendice };
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
  d.texto(`${qualificacaoCurta(perfil)}, assistente técnico indicado ${art(lado).pelo} ${lado}${c.vistoriaData ? `, tendo acompanhado a diligência pericial realizada em ${dataBR(c.vistoriaData)}` : ''}, vem, respeitosamente, à presença de Vossa Excelência, apresentar **MANIFESTAÇÃO TÉCNICA SOBRE O LAUDO PERICIAL**${c.peritoJuizo ? ` elaborado por ${c.peritoJuizo}` : ''}, nos termos do art. 477, § 1º, do Código de Processo Civil, pelos fundamentos técnicos expostos a seguir.`);
  // manifestação nos autos (peça processual): sem sumário e com as seções em sequência, sem página nova a cada título
  d.h1NovaPagina = false;
  const posicao = c.posicaoAT || '';
  const concorda = posicao === POSICOES_AT[0];
  const acid = !pt.prev && ehAcidente(c);
  d.h1('1', 'Síntese do laudo e dos pontos analisados');
  d.redigir(`resumo da conclusão do laudo e da posição desta assistência${posicao ? ` (${posicao.toLowerCase()})` : ' (concorda / impugna em parte / impugna)'}.`);
  // linhas da síntese: por período (previdenciário), por tema (acidente) ou por agente (trabalhista)
  const temas = pt.prev
    ? dados.periodos.map((r) => `${empresaCurta(r.data.empresa) || '[[empresa]]'}\n${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`)
    : acid ? ['Dinâmica do acidente', 'Normas aplicáveis e medidas de prevenção', 'Causas do acidente']
      : (c.objeto || []).filter((o) => ['Insalubridade', 'Periculosidade'].includes(o));
  d.quadro('Síntese das conclusões', [[pt.prev ? 'Vínculo / período' : 'Agente / tema', 'Conclusão do laudo', 'Posição da assistência técnica'],
    ...(temas.length ? temas : ['[[agente]]']).map((a) => [a, '[[conclusão do perito]]', concorda ? 'Concorda' : '[[concorda / impugna – motivo]]'])],
  { larguras: [0.28, 0.36, 0.36], tam: pt.prev ? 9 : 10 });
  if (!concorda) {
    d.quadro('Pontos divergentes', [['Afirmação do laudo', 'Item / fls.', 'Análise da assistência técnica', 'Fundamento técnico ou normativo'], ['[[ ]]', '[[ ]]', '[[ ]]', '[[ ]]']],
      { larguras: [0.28, 0.12, 0.35, 0.25], tam: 9, alinhar: 'left' });
  }
  let n = 1;
  if (pt.prev) {
    n += 1;
    d.h1(String(n), 'Critérios técnicos por período');
    d.texto('O enquadramento observa a legislação vigente à época da prestação do serviço (*tempus regit actum*).');
    quadroFormaEnquadramento(d);
    if (dados.medicoes.some((m) => m.data.agente === 'Ruído') || /ru[ií]do/i.test(`${c.agentesAlegados || ''} ${dados.periodos.map((r) => r.data.agentes || '').join(' ')}`)) quadroCriteriosRuido(d);
    n += 1;
    d.h1(String(n), 'Análise por período');
    dados.periodos.forEach((r, i) => {
      d.h2(`${n}.${i + 1}`, tituloVinculo(r));
      d.redigir('o que o laudo concluiu e a análise da assistência: agente e intensidade, metodologia (NHO-01 / NR-15 e técnica informada no PPP), habitualidade e permanência, EPI (art. 291 da IN 128/2022) e documentos considerados.');
    });
    if (!dados.periodos.length) d.redigir('cadastre os vínculos e períodos na Preparação.');
  } else {
    for (const a of temas.length ? temas : ['Análise técnica']) {
      n += 1;
      d.h1(String(n), a);
      d.redigir(acid
        ? 'pontos técnicos: versão adotada pelo perito e vestígios que a sustentam, normas e requisitos considerados ou omitidos, causas e medidas de prevenção.'
        : 'pontos técnicos: premissas não verificadas, enquadramento incompleto, quesitos sem resposta, divergências de narrativa, falta de quantificação de tempo/frequência, falta de delimitação do período.');
    }
  }
  n += 1;
  d.h1(String(n), 'Elementos registrados na diligência');
  quadroDiligencia(d, c, 'Diligência acompanhada');
  profissiografia(d, dados.postos, dados, { base: String(n) });
  const g = medicoesPorAgente(dados);
  const nome = nomePostoFn(dados.postos);
  if (g['Ruído']) quadroMedicoesRuido(d, g['Ruído'], eqMap(dados), nome, { prev: pt.prev });
  if (g['Agente químico'] && !pt.prev) quadroQuimicosAnexo11(d, g['Agente químico'], dados, nome);
  const compl = dados.quesitos.filter((q) => q.data.origem === 'Complementares');
  if (!concorda || compl.length) {
    n += 1;
    d.h1(String(n), 'Quesitos de esclarecimento');
    d.texto('Com base no exposto, requer-se que o Sr. Perito responda, de forma fundamentada, aos seguintes quesitos de esclarecimento:');
    if (compl.length) compl.forEach((q, i) => d.texto(`${i + 1}. ${q.data.texto}`, { recuo: false }));
    else d.redigir('quesitos de esclarecimento (cadastre-os na aba Quesitos com origem "Esclarecimentos ao perito (após o laudo)").');
  }
  n += 1;
  d.h1(String(n), 'Conclusão técnica e requerimentos');
  d.texto('Com base nos documentos dos autos e no acompanhamento da diligência pericial, este assistente técnico conclui:');
  conclusaoAT(d, posicao);
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
  d.h1NovaPagina = false; // seções curtas em sequência (antes, cada título abria página nova)
  d.redigir('objetivo do parecer (avaliar o risco técnico do pedido e subsidiar a defesa e as medidas corretivas).');
  d.h1('2', 'Identificação do caso');
  d.identificacao([['Processo', c.numero], ['Juízo', c.juizo], [pt.autor, c.autorNome], ['Função / período', c.funcoes],
    ['Ajuizamento', dataBR(c.dataAjuizamento)], ['Período imprescrito', c.dataAjuizamento ? `a partir de ${menosCincoAnos(c.dataAjuizamento)}` : ''], ['Pedido', c.pedidos]]);
  d.h1('3', 'Documentos analisados');
  quadroDocumentos(d, dados.documentos);
  d.h1('4', 'Fundamentação técnica e legal');
  d.redigir(comJurisprudencia(dados) ? 'normas aplicáveis ao agente discutido.' : 'normas aplicáveis ao agente discutido (sem súmulas ou jurisprudência, conforme a opção do caso).');
  registroJurisprudencia(d, dados, { numero: '4.1', nivel: 'h2', prev: pt.prev });
  d.h1('5', 'Instalações e atividades');
  profissiografia(d, dados.postos, dados, { base: '5' });
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
  d.texto(`${qualificacaoCompleta(perfil)}, vem, respeitosamente, à presença de Vossa Excelência, na qualidade de **assistente técnico indicado ${art(lado).pelo} ${lado}**, nos termos ${pt.trab ? 'do art. 3º da Lei nº 5.584/1970 e ' : ''}dos arts. 465, § 1º, II, e 466, § 1º, do Código de Processo Civil${c.despachoRef ? `, em atenção ${/^(decisão|sentença|r\.)/i.test(v(c.despachoRef)) ? 'à' : 'ao'} ${c.despachoRef}` : ''}, expor e requerer o que segue.`);
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
  if (qs.length) qs.forEach((q, i) => d.texto(`${q.data.numero ? prefixoQuesito(q, '. ') : `${i + 1}. `}${q.data.texto}`, { recuo: false }));
  else d.redigir(`quesitos (cadastre na aba Quesitos com origem "${origemLado}").`);
  d.h1('5.', 'Dos requerimentos finais', { novaPagina: false });
  d.texto(`Diante do exposto, requer:\na) o cadastramento do signatário como assistente técnico ${art(lado).do} ${lado}, com a sua intimação, pelos contatos indicados, da data, do horário e do local da diligência pericial;\nb) a intimação da parte para apresentar ao Sr. Perito os documentos relacionados no item 2;\nc) a realização da diligência na forma do item 3;\nd) o recebimento dos quesitos do item 4, sem prejuízo da apresentação de quesitos suplementares.`);
  d.add(p([run('Nestes termos,\npede deferimento.')], { first: 709, before: 240 }));
  blocoAssinatura(d, dados);
  return finalizar(d, { titulo: 'Petição – indicação de assistente técnico', arquivo: 'Peticao_indicacao_AT', c });
}

// ---------- auxiliares das petições do perito ----------
export function introPerito(perfil, c, acao) {
  const ref = refDespachos(c) ? `, em atenção ${refDespachos(c)}` : '';
  return `${qualificacaoCurta(perfil)}, perito judicial nomeado nos autos em epígrafe, vem, respeitosamente, à presença de Vossa Excelência${ref}, ${acao}`;
}
export function fecho(d, dados, papel = 'Perito Judicial') {
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
  const simil = ehSimilaridade(c);
  const prop = v(c.vistoriaProprietario); // pessoa física (sem empresa): prevalece sobre o campo de empresa e traz o nome completo
  const veic = v(c.vistoriaVeiculo);
  const empresaV = prop || v(c.vistoriaLocal) || empresaDoDespacho(c);
  const origem = v(c.empresaOriginal) || [...new Set(dados.periodos.map((r) => empresaCurta(r.data.empresa)).filter(Boolean))].join(', ');
  d.texto(prop
    ? `Comunica-se que a vistoria pericial fica designada para o dia **${data}**, às **${hora}**, a ser realizada${simil ? ', por similaridade,' : ''} ${veic ? 'no veículo paradigma indicado nos autos' : 'no local indicado nos autos'}, no endereço de seu proprietário:`
    : `Comunica-se que a vistoria pericial fica designada para o dia **${data}**, às **${hora}**, a ser realizada${simil ? ', por similaridade,' : ''} nas dependências da empresa${simil ? ' paradigma' : ''}:`);
  const cab = prop ? `${prop.toUpperCase()} (pessoa física${veic ? `, proprietário do veículo paradigma ${veic}` : ''})` : (empresaV.toUpperCase() || '[[EMPRESA]]');
  const local = [cab, ...String(c.vistoriaEndereco || '[[endereço – cidade/UF – CEP]]').split(/\n|\s*;\s*/).filter(Boolean)];
  local.forEach((l, i) => d.add(p([run(l, { b: i === 0 })], { left: 1418, after: i === local.length - 1 ? 200 : 0, align: 'left' })));
  const periodos = listaPeriodos(dados.periodos);
  const item = v(c.itensVistoria) ? `, conforme determinado ${/[e,]/.test(c.itensVistoria) ? 'nos itens' : 'no item'} ${c.itensVistoria} do referido despacho` : '';
  d.texto(pt.prev
    ? (prop && veic
      ? `A vistoria destina-se a avaliar a exposição ao ruído e à vibração de corpo inteiro (VCI) em veículo similar ao conduzido pelo autor na${origem ? ` ${origem}` : ' empregadora original'}, nas condições de trabalho${periodos ? ` dos períodos de ${periodos}` : ' [[dos períodos de ...]]'}${item}.`
      : `A vistoria destina-se a examinar${simil ? `, em ambiente e atividades similares aos da${origem ? ` ${origem}` : ' empregadora original'},` : ''} as condições de trabalho do autor${periodos ? ` nos períodos de ${periodos}` : ' [[nos períodos de ...]]'}${item}.`.replace('examinar ,', 'examinar,'))
    : `A vistoria destina-se a examinar as condições de trabalho do ${pt.autorCurto.toLowerCase()}${c.dataAjuizamento && pt.trab ? ` no período imprescrito (a partir de ${menosCincoAnos(c.dataAjuizamento)})` : ''}${item}.`);

  d.texto('A comunicação é feita para ciência das partes (art. 474 do CPC) e para assegurar aos assistentes técnicos o acompanhamento da diligência, com antecedência mínima de 5 (cinco) dias (art. 466, § 2º, do CPC).');
  if (v(c.dataDiligencia)) {
    const dias = Math.floor((new Date(`${c.dataDiligencia}T12:00:00`) - new Date()) / 86400000);
    if (dias < 5) d.texto('[[VERIFICAR: faltam menos de 5 dias para a diligência – antecedência mínima do art. 466, § 2º, do CPC.]]');
  }
  d.h1('2.', 'Dos requerimentos', { novaPagina: false });
  d.texto('Diante do exposto, requer-se:');
  d.texto(`a) a intimação das partes e de seus assistentes técnicos, caso indicados, para que, querendo, compareçam ao ato na data, horário e local acima;`);
  d.texto(`b) a intimação do ${pt.autorCurto.toLowerCase()} para comparecimento pessoal, a fim de prestar informações sobre ${prop && veic ? 'os veículos conduzidos, as cargas transportadas, os trajetos' : 'os setores, atividades, máquinas'} e rotina de trabalho ${pt.prev ? 'nos períodos em análise' : 'no período discutido'};`);
  if (prop) {
    const end = String(c.vistoriaEndereco || '').replace(/\n/g, ' – ').trim();
    const ref = [end, v(c.vistoriaContato) && `tel. ${c.vistoriaContato}`].filter(Boolean).join(' – ');
    d.texto(`c) a expedição de ofício ao(à) Sr.(a) ${prop}${veic ? `, proprietário(a) do veículo paradigma ${veic}` : ''}${ref ? ` (${ref})` : ''}${v(c.itemOficio) ? `, nos termos do item ${c.itemOficio} do despacho` : ''}, comunicando a data e o horário da vistoria e solicitando:`);
    travessao(d, `o acesso do perito, das partes e dos assistentes técnicos ${veic ? 'ao veículo paradigma' : 'ao local da vistoria'};`);
    if (veic) {
      travessao(d, 'a disponibilização do veículo em condições operacionais de tráfego em via urbana e rodovia, com condutor habilitado, para as medições em deslocamento;');
      travessao(d, 'a apresentação, no dia do ato, do documento do veículo (CRLV) e de informações sobre as manutenções e modificações realizadas (motor, cabine, assento, suspensão e pneus).');
    }
  } else {
  const empresa = empresaV || '[[empresa]]';
  d.texto(`c) a expedição de ofício à empresa ${empresa}${v(c.itemOficio) ? `, nos termos do item ${c.itemOficio} do despacho` : ''}, comunicando a data e o horário da vistoria e solicitando:`);
  const simil2 = simil;
  travessao(d, simil2 ? `o acesso do perito, das partes e dos assistentes técnicos aos setores com atividades similares às exercidas pelo ${pt.autorCurto.toLowerCase()};`
    : `o acesso do perito, das partes e dos assistentes técnicos aos setores em que o ${pt.autorCurto.toLowerCase()} laborou;`);
  travessao(d, 'a designação de representante com conhecimento do processo produtivo e, se possível, do profissional responsável pela segurança do trabalho;');
  const agentes = agentesCurtos(c.agentesAlegados);
  const docs = simil2
    ? `LTCAT, PGR/PPRA e demais laudos ambientais dos setores a vistoriar; relatórios de avaliações quantitativas dos agentes ambientais${agentes ? `, em especial de ${agentes}` : ''}; descrição das funções similares às do ${pt.autorCurto.toLowerCase()}; e fichas com dados de segurança (FISPQ/FDS) dos produtos químicos utilizados`
    : ctx.prev
    ? `PPP do autor; LTCAT, PPRA/PGR e demais laudos ambientais existentes; relatórios de avaliações quantitativas dos agentes ambientais${agentes ? `, em especial de ${agentes}` : ''}; fichas de entrega de EPI e respectivos Certificados de Aprovação (CA); registro de funções/setores e descrição de cargos do autor; e fichas com dados de segurança (FISPQ/FDS) dos produtos químicos utilizados`
    : `PGR (e PPRA, para o período anterior a 2022), PCMSO e laudos de insalubridade e periculosidade; relatórios de avaliações quantitativas dos agentes ambientais${agentes ? `, em especial de ${agentes}` : ''}; fichas de entrega de EPI e respectivos Certificados de Aprovação (CA); ordens de serviço e descrição de cargo; e fichas com dados de segurança (FISPQ/FDS) dos produtos químicos utilizados`;
  travessao(d, simil2 ? `a disponibilização, no dia do ato, dos seguintes documentos: ${docs}.` : `a disponibilização, no dia do ato, dos documentos relativos ${ctx.prev ? 'aos períodos em análise' : 'ao período discutido'}: ${docs}.`);
  }

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
  const tabCJF = /delegada|Juizado Especial Federal/i.test(c.justica || '') ? 'Tabela V' : 'Tabela II';
  const vezesFix = isFinite(fixados) && isFinite(tabela) && tabela > 0 ? Math.round(fixados / tabela) : 1;
  d.texto(`No ${v(c.honorariosItem) || '[[item]]'} do referido despacho, os honorários periciais foram fixados em ${isFinite(fixados) ? moeda(fixados) : '[[valor]]'}, ${vezesFix > 1 ? `correspondentes a ${vezesFix === 2 ? 'duas' : vezesFix} vezes o valor máximo` : 'valor máximo'} ${cjf ? `previsto na ${tabCJF} do Anexo Único da Resolução nº 305/2014 do Conselho da Justiça Federal, na redação da Resolução CJF nº 937, de 22/01/2025` : 'previsto na tabela aplicável [[norma do tribunal]]'}.`);

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
    d.texto(`A perícia${v(c.vistoriaLocal) ? `, a ser realizada em ${c.vistoriaLocal},` : ''} abrange ${per.length > 1 ? `${per.length} períodos de trabalho que somam ${anos >= 2 ? `mais de ${anos} anos` : anos === 1 ? 'mais de 1 ano' : 'menos de 1 ano'}` : `período de trabalho de ${anos >= 2 ? `mais de ${anos} anos` : anos === 1 ? 'mais de 1 ano' : 'menos de 1 ano'}`} (${lista}). Esse intervalo torna o exame mais complexo do que uma perícia comum, pelos seguintes motivos:`);
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
  const criterios = ['a especialização e a complexidade do trabalho, distinto da generalidade das perícias (inciso I)', fora && 'o deslocamento que justifica indenização (inciso III)'].filter(Boolean);
  if (cjf) {
    d.texto(`O art. 28, § 1º, da Resolução CJF nº 305/2014 (incluído pela Resolução CJF nº 575/2019) autoriza o juiz, em situações excepcionais e mediante decisão fundamentada, a arbitrar os honorários até o limite de 3 (três) vezes o valor máximo previsto no anexo, observados os critérios ali enumerados. No caso, ${criterios.length > 1 ? `estão presentes ${criterios.join(' e ')}` : `está presente ${criterios[0]}`}, o que justifica a fixação ${mult === 3 ? 'no patamar máximo admitido pela norma' : 'acima do limite da tabela'}.`);
    d.redigir('se houver, acrescentar os demais critérios do § 1º presentes no caso: ausência de outro profissional cadastrado (II), uso de instalações ou equipamentos próprios (IV), perícia em mais de uma localidade (VI) ou outra peculiaridade (VII).');
  } else {
    d.redigir('fundamento normativo da tabela do tribunal (ex.: Resolução TJPR) e critérios presentes.');
  }

  sec('Do pedido');
  const pedido = isFinite(tabela) ? mult * tabela : NaN;
  if (isFinite(pedido) && isFinite(fixados) && pedido <= fixados) d.texto(`[[VERIFICAR: o valor pedido (${moeda(pedido)}) não supera o já fixado (${moeda(fixados)}); confira o multiplicador e a tabela.]]`);
  d.texto(`Diante do exposto, requer-se a majoração dos honorários periciais para ${VEZES[mult] || mult} vezes o valor máximo da ${cjf ? tabCJF : 'tabela'}, ou seja, ${isFinite(pedido) ? `${moeda(pedido)} (${reaisPorExtenso(pedido)}) (${mult} × ${moeda(tabela)})` : '[[valor]]'}${cjf ? `, nos termos do art. 28, § 1º, da Resolução CJF nº 305/2014 e da ${tabCJF} do seu Anexo Único, na redação da Resolução CJF nº 937/2025` : ''}.`);
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

  // valor: campo do caso ou, na falta, o que a referência do despacho registra ("honorários R$ 1.086,00")
  let fixados = lerValor(c.honorariosFixados);
  if (!isFinite(fixados)) {
    const m = `${v(c.despachoRef)} ${v(c.observacoes)}`.match(/honor[áa]rios[^R$]{0,60}R\$\s*([\d.]+,\d{2})/i);
    if (m) fixados = lerValor(m[1]);
  }
  const jt = /Trabalho/i.test(c.justica || '');
  const forma = v(c.honorariosForma)
    || (jt && !v(c.honorariosAdiantamento) ? FORMAS_PAGAMENTO[2]
      : /Federal/i.test(c.justica || '') && !v(c.honorariosAdiantamento) ? FORMAS_PAGAMENTO[1] : FORMAS_PAGAMENTO[0]);
  const semAdiant = forma !== FORMAS_PAGAMENTO[0];
  let adiant = lerValor(c.honorariosAdiantamento);
  // Justiça Federal (AJG): adiantamento de até 30% (Res. CJF 305/2014, art. 29, parágrafo único); nos demais casos, 50% (art. 465, § 4º, do CPC)
  const jfAjg = fundamentoCJF(c);
  if (!isFinite(adiant) && isFinite(fixados)) adiant = Math.round(fixados * (jfAjg ? 30 : 50)) / 100;
  const saldo = isFinite(fixados) && isFinite(adiant) ? Math.round((fixados - adiant) * 100) / 100 : NaN;
  const pct = isFinite(fixados) && fixados > 0 && isFinite(adiant) ? Math.round((adiant / fixados) * 100) : NaN;
  const depositante = pelo(c.honorariosDepositante);
  // "item" só quando o campo traz mesmo um item do despacho (ex.: "1.2", "7, b")
  const itemOk = (x) => (/^\s*(item\s*)?\d+[\w.,\s]*$/i.test(v(x)) && v(x).length < 20 ? x : '');
  const iFix = itemTxt(itemOk(c.honorariosItem));

  d.texto(introPerito(perfil, c, semAdiant
    ? '**aceitar os honorários periciais arbitrados** e os termos fixados para o seu pagamento e requerer o que segue.'
    : '**aceitar os honorários periciais arbitrados** e os termos fixados para o seu pagamento, indicar a conta para o levantamento e requerer o que segue.'));
  let n = 0;
  const sec = (t) => { n += 1; d.h1(`${n}.`, t, { novaPagina: false }); };

  sec('Do aceite dos honorários arbitrados');
  d.texto(`${iFix ? `No ${itemMeio(itemOk(c.honorariosItem))} da referida decisão` : 'Na referida decisão'}, os honorários periciais foram arbitrados em **${isFinite(fixados) ? valorExt(fixados) : '[[valor arbitrado]]'}**.`);
  d.texto(`O signatário declara **aceitar o valor arbitrado e os termos fixados**${itemTxt(itemOk(c.itemAceite)) ? ` no ${itemMeio(itemOk(c.itemAceite)).replace(/,$/, '')}` : ''}, ciente de que:`);
  const termos = [];
  if (forma === FORMAS_PAGAMENTO[2]) termos.push('os honorários serão pagos ao final pela parte sucumbente na pretensão objeto da perícia, sendo vedado exigir adiantamento na Justiça do Trabalho (art. 790-B, caput e § 3º, da CLT)');
  else if (forma === FORMAS_PAGAMENTO[1]) {
    termos.push('não há adiantamento de honorários');
    termos.push(`os honorários serão pagos integralmente depois da entrega do laudo e do decurso do prazo para a manifestação das partes ou, havendo pedido de esclarecimentos, depois de prestados${/Federal/i.test(c.justica || '') ? ', na forma da Resolução CJF nº 305/2014' : ''}`);
  } else {
    termos.push(isFinite(adiant)
      ? `receberá no início dos trabalhos o valor de ${valorExt(adiant)}${isFinite(pct) && pct < 100 ? `, correspondente a ${pct}% dos honorários` : ''}, a ser depositado${depositante ? ` ${depositante}` : ''} em conta judicial vinculada aos autos (${jfAjg ? 'art. 29, parágrafo único, da Resolução CJF nº 305/2014' : 'art. 465, § 4º, do CPC'})${jfAjg && isFinite(pct) && pct > 30 ? ' [[VERIFICAR: na Justiça Federal o adiantamento é de até 30% e depende da comprovação da necessidade das despesas]]' : ''}`
      : `receberá no início dos trabalhos [[valor do adiantamento]] (${jfAjg ? 'art. 29, parágrafo único, da Resolução CJF nº 305/2014' : 'art. 465, § 4º, do CPC'})`);
    if (isFinite(saldo) && saldo > 0) termos.push(`o saldo de ${valorExt(saldo)} será pago ao final, depois de entregue o laudo e prestados os esclarecimentos, por quem a sentença indicar`);
  }
  if (c.limiteTabelaPublico === 'Sim') termos.push('o pagamento eventualmente feito com recursos públicos observará o limite da tabela, com a majoração admitida');
  termos.forEach((t, i) => d.texto(`${String.fromCharCode(97 + i)}) ${t}${i < termos.length - 1 ? ';' : '.'}`));

  const nDias = Number(String(c.antecedenciaDias || '').replace(/\D/g, ''));
  if (semAdiant) {
    sec('Do início dos trabalhos');
    d.texto(`Não havendo depósito a aguardar, o signatário indicará nos autos${nDias ? `, com antecedência mínima de ${nDias} (${numeroPorExtenso(nDias)}) dias úteis` : ', com a antecedência mínima de 5 (cinco) dias'}, a data, o horário e o local da vistoria${itemTxt(itemOk(c.itemDataPericia)) ? `, conforme o ${itemTxt(itemOk(c.itemDataPericia))}` : ''}, para a intimação das partes e dos assistentes técnicos (arts. 466, § 2º, e 474 do CPC).`);
    sec('Da conta para o pagamento');
    d.texto('Para o pagamento dos honorários, a ser feito depois da entrega do laudo, indica a conta abaixo:');
    d.add(p(dadosDaConta(perfil, conta), { left: 1418, align: 'left' }));
    sec('Dos requerimentos');
    d.texto('Diante do exposto, requer-se:');
    ['o recebimento do presente aceite;',
      'depois da entrega do laudo e do decurso do prazo para a manifestação das partes, a requisição do pagamento dos honorários em favor do signatário, na conta indicada no item anterior.']
      .forEach((t, i) => d.texto(`${String.fromCharCode(97 + i)}) ${t}`));
  } else {
    sec('Da conta para o levantamento');
    d.texto(`Efetuado o depósito${itemTxt(itemOk(c.itemDeposito)) ? ` determinado no ${itemTxt(itemOk(c.itemDeposito))}` : ''}, requer-se a expedição de alvará em favor do signatário do valor depositado, com os acréscimos da conta${itemTxt(itemOk(c.itemAlvara)) ? `, nos termos do ${itemTxt(itemOk(c.itemAlvara))}` : ''}, ou a sua transferência para a conta abaixo:`);
    d.add(p(dadosDaConta(perfil, conta), { left: 1418, align: 'left' }));
    sec('Da designação da diligência');
    d.texto(`Levantado o valor, o signatário indicará nos autos${nDias ? `, com antecedência mínima de ${nDias} (${numeroPorExtenso(nDias)}) dias úteis` : ''}, a data, o horário e o local de início dos trabalhos${itemTxt(itemOk(c.itemDataPericia)) ? `, conforme o ${itemTxt(itemOk(c.itemDataPericia))}` : ''}, para a intimação das partes (art. 474 do CPC).`);
    sec('Dos requerimentos');
    d.texto('Diante do exposto, requer-se:');
    ['o recebimento do presente aceite;',
      `a intimação do signatário quando comprovado nos autos o depósito${itemTxt(itemOk(c.itemDeposito)) ? ` do ${itemTxt(itemOk(c.itemDeposito))}` : ''};`,
      'a expedição de alvará ou a transferência do valor depositado, com os acréscimos da conta, para a conta indicada no item 2, para início dos trabalhos.']
      .forEach((t, i) => d.texto(`${String.fromCharCode(97 + i)}) ${t}`));
  }
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
  d.texto('O signatário declara aceitar o encargo e não possuir impedimento ou suspeição para atuar no feito (arts. 148, II, e 467 do CPC).');
  d.texto(`Em atenção ao art. 465, § 2º, II e III, do CPC, apresenta ${v(perfil.curriculoUrl) && !/^anexo$/i.test(v(perfil.curriculoUrl)) ? `currículo, com a comprovação da especialização, disponível em ${perfil.curriculoUrl}` : 'currículo, com a comprovação da especialização, em anexo'}, e indica para as intimações pessoais os contatos profissionais: ${[v(perfil.email) && `e-mail ${perfil.email}`, v(perfil.telefone) && `telefone ${perfil.telefone}`].filter(Boolean).join('; ') || '[[e-mail e telefone – cadastre em Configurações → Meus dados]]'}.`);
  d.h1('2.', 'Da proposta de honorários', { novaPagina: false });
  d.texto(`A perícia envolve ${(c.objeto || []).join(', ').toLowerCase() || '[[objeto]]'}${dados.periodos.length ? `, abrangendo ${dados.periodos.length} período(s) de trabalho` : ''}${dados.quesitos.length ? ` e ${dados.quesitos.length} quesito(s) formulados` : ''}. A estimativa considera as etapas abaixo:`);
  d.quadro('Estimativa de horas técnicas', [['Etapa', 'Horas'], ['Análise dos autos e planejamento', '[[h]]'], ['Deslocamento', '[[h]]'],
    ['Diligência, vistoria e avaliações ambientais', '[[h]]'], ['Elaboração do laudo e respostas aos quesitos', '[[h]]'], ['Total', '[[h]]']],
  { larguras: [0.75, 0.25] });
  const prop = lerValor(c.honorariosFixados);
  d.texto(`Propõe-se o valor de **${isFinite(prop) ? `${moeda(prop)} (${reaisPorExtenso(prop)})` : '[[R$ valor]]'}**.`);
  if (c.justica === 'Justiça do Trabalho') {
    // na Justiça do Trabalho o adiantamento não pode ser exigido (CLT, art. 790-B, § 3º): a conta vai só no pedido de pagamento
    d.texto('Os honorários serão suportados ao final pela parte sucumbente na pretensão objeto da perícia (CLT, art. 790-B), sem pedido de adiantamento (§ 3º).');
  } else {
    d.h1('3.', 'Dos dados para pagamento', { novaPagina: false });
    d.texto('Para o depósito ou a transferência dos honorários, indica-se a conta abaixo:');
    d.add(p(dadosDaConta(perfil, conta), { left: 1418, align: 'left' }));
  }
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
      d.add(p([run('Resposta: ', { b: true })].concat(rs.length ? [rich(rs[0])] : [run('Responder', { b: true, hl: true })]), { first: 709, before: 80, after: 80 }));
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
  const pontosAT = linhas(c.esclParecerAT);
  if (pontosAT.length || v(c.esclParecerATRef)) {
    n += 1;
    d.h1(`${n}.`, 'Dos esclarecimentos sobre o parecer do assistente técnico', { novaPagina: false });
    d.texto(`Em atenção ao art. 477, § 2º, inciso II, do Código de Processo Civil, esclarecem-se os pontos divergentes apresentados no parecer do assistente técnico${v(c.esclParecerATRef) ? ` (${c.esclParecerATRef})` : ''}:`);
    const pares = pontosAT.map((l) => l.split(/\s*::\s*/));
    d.quadro('Pontos do parecer do assistente técnico', [['Alegação do assistente técnico', 'Esclarecimento do perito'],
      ...(pares.length ? pares.map(([a, e]) => [a, e || '[[esclarecimento]]']) : [['[[alegação]]', '[[esclarecimento]]']])],
    { larguras: [0.45, 0.55], tam: 9, alinhar: 'left' });
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
