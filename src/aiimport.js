import { db, createRecord, updateFields, caseChildren, softDelete } from './db.js';
import { CONVENCOES_CLAUDE } from './docx/claudeDoc.js';
import { ORIGEM_QUESITO, contextoLegal, ehSuplementar, FASE, CAMPOS_DILIGENCIA, CAMPOS_POSTO, AGENTES_MEDICAO, ehAcidente, CAMPOS_ACIDENTE, chaveVistoria, qtdVistorias, vistoriasDoCaso,
  CAMPOS_PPP, CAMPOS_AGENTE_AVALIADO, RESULTADO_AGENTE, CATEGORIAS_SEGURADO, EMITENTE_PPP, MODALIDADE_AVALIACAO, DOCS_EMPRESA, AUTORIA_FOTOS } from './schema.js';
import { resumoMedicao } from './medicoes.js';
import { dataIso } from './migrate.js';
import { citacaoDe } from './paradigmas.js';
import { profissaoDoCaso, referenciaProfissao } from './data/profissoes.js';
import { textoNotasParaClaude } from './basesUsuario.js';
import { REGRAS_FDS, FORMATO_PRODUTO, produtoParaDados, aplicarFds } from './fds.js';
import { normalizarIdentFoto } from './fotosIA.js';

// Origem do quesito por sinônimos (o Claude escreve "Reclamante", "Requerido", "Juiz"…); vazio = "Outro"
export function origemQuesito(o) {
  const t = String(o ?? '').trim().toLowerCase();
  if (!t) return 'Outro';
  if (/ju[ií]z|ju[ií]zo|magistrad/.test(t)) return 'Juízo';
  if (/\binss\b|instituto nacional/.test(t)) return 'INSS';
  if (/complementar|suplementar/.test(t)) return 'Complementares';
  if (/autor|reclamante|requerente|segurad|exequente|embargante/.test(t)) return 'Autor / Reclamante';
  if (/r[ée]u\b|r[ée]\b|reclamad|requerid|empresa|executad|embargad/.test(t)) return 'Réu / Reclamada';
  return ORIGEM_QUESITO.find((x) => x.toLowerCase() === t) || 'Outro';
}

// Agente da medição por sinônimos
export function agenteMedicao(a) {
  const t = String(a ?? '').trim().toLowerCase();
  if (/m[ãa]os|vmb|bra[cç]os/.test(t)) return 'Vibração de mãos e braços (VMB)';
  if (/corpo|vci|vibra/.test(t)) return 'Vibração de corpo inteiro (VCI)';
  if (/ru[ií]do|dosimetr|sonor/.test(t)) return 'Ruído';
  if (/calor|ibutg|t[ée]rmic/.test(t)) return 'Calor (IBUTG)';
  if (/qu[ií]mic|poeira|n[ée]voa|vapor|g[áa]s|fumo|s[íi]lica|benzeno|hidrocarbon|[óo]leo|graxa|agrot[óo]xic/.test(t)) return 'Agente químico';
  return AGENTES_MEDICAO.find((x) => x.toLowerCase() === t) || 'Outro';
}

const CAMPOS_DATA_CASO = ['acidenteData', 'autorNascimento', 'dataAjuizamento', 'vistoriaData', 'dataDiligencia', 'laudoData', 'prazoLaudo', 'prazoManifestacao', 'prazoEsclarecimentos'];
// a IA nunca faz o caso voltar de fase
export function faseAvanca(atual, nova) {
  const ia = FASE.indexOf(atual || 'A preparar'), in_ = FASE.indexOf(nova);
  return in_ >= 0 && (ia < 0 || in_ > ia);
}

// ======================================================================
// Biblioteca de instruções para o Claude, uma por situação.
// Todas carregam os critérios técnicos fixos do signatário e pedem a
// resposta num JSON que o app lê e distribui pelas abas do caso.
// ======================================================================

// Critérios separados por finalidade: não se mistura legislação trabalhista
// (insalubridade/periculosidade) com previdenciária (tempo especial).
export const CRITERIOS_GERAIS = `CRITÉRIOS GERAIS DO SIGNATÁRIO
- O laudo conclui sempre pela norma técnica, nunca pela jurisprudência; súmulas e temas ficam apenas registrados para o juiz decidir.
- Não usar testemunhas. Não citar o advogado do segurado / reclamante.
- Valores medidos com uma casa decimal; resultados próximos do limite arredondados conforme a NHO.
- Equipamentos do signatário: dosímetro Inlite DoseMax V2, medidor de IBUTG Inlite iTemp, medidor de vibração Inlite AxPro, calibrador acústico Inlite CalPro. Os certificados de calibração seguem nos apêndices do laudo (não peça para anexá-los).
- Validade da calibração: o fabricante recomenda 12 meses; o signatário adota até 24 meses da data do certificado. Dentro de 24 meses na data da medição, a calibração é válida: não aponte pendência nem ressalva.
- Aferição de campo do dosímetro antes e depois da medição: cite somente se estiver registrada nas medições; sem registro, não mencione nem marque pendência.
- Veículos, máquinas ou fatos citados apenas em petições e não confirmados na entrevista ou na diligência ficam fora do laudo (não viram pendência).
- CNPJ, CPF e endereço de terceiros (empresa similar ou paradigma, proprietário do veículo avaliado): cite só se estiverem no caso ou nos autos; se não estiverem, omita, sem pendência. Pendência só para dado que muda a conclusão ou que a lei exige.
- Veículo avaliado sem o documento (CRLV): use os dados da consulta pública da placa lançados no posto, citando a fonte e a data (ex.: "conforme consulta da placa AFD-9436 no Sinesp Cidadão em 25/11/2026"). Se ainda não houver, uma pendência só: "[[consultar a placa X no Sinesp Cidadão: marca, modelo e ano]]".
- Mais de uma leitura possível da norma (ex.: cód. 2.0.2 até 13/08/2014 – atividades descritas × limites da ISO 2631-1): nunca conclua só com "cabe ao Juízo". Dê ao juiz os elementos técnicos: (a) um quadro "Elementos técnicos para a leitura do …" com a remissão normativa, a natureza do rol (Anexo IV: agentes exaustivos, atividades exemplificativas), cada resultado × cada referência com o percentual (ex.: "1,07 m/s², 24% acima de 0,86"; "97% do limite de 1,1"), a faixa da norma em que cai (ISO 2631-1, Anexo B: abaixo da zona de cautela, dentro dela = cautela quanto a riscos potenciais, acima dela = riscos à saúde prováveis; NHO-09: nível de ação, região de incerteza, limite), o fator de crista e o método recomendado (ISO 2631-1, item 6.3: acima de 9, o aren pode subestimar e o VDV complementa), a habitualidade e permanência, as condições da medição (carga, vias, duração) e o resultado de cada leitura; (b) na Conclusão, a conclusão técnica do perito (qual critério é tecnicamente aplicável e onde a exposição se situa) e o que acontece em cada leitura; a decisão jurídica fica com o Juízo. Não crie seção chamada "Posição técnica do perito" nem use essa expressão: o perito do Juízo apresenta conclusão técnica, não posição; a seção é "Conclusão técnica". Não afirme o sentido de um efeito sem dado medido (ex.: se o conjunto vazio aumenta ou reduz a vibração, ou se um documento "subestima" a exposição): registre a condição.
- Resultado próximo do limite (margem pequena): no quadro de elementos técnicos, informe também a incerteza de medição do instrumento (do certificado de calibração), o horário e as condições da medição em relação ao turno do segurado (manhã × tarde/noite, clima do dia, número de fontes), e não chame a conclusão de "segura" nos quesitos. Quando a norma já define o critério (ex.: calor – hora mais desfavorável do Anexo 3 da NR-15; adote o maior tempo relatado na fonte quente), aplique esse critério e registre numa frase que o dado vem do relato e a partir de que valor o limite não seria superado: sem tabela de hipóteses (ela sugere dúvida onde a norma decide). Tabela de sensibilidade só quando não há critério normativo (ex.: jornadas divergentes no ruído), com os mesmos valores do cálculo, sem arredondar uma linha e não outra.
- Dúvida sobre fato da medição (ex.: quem portou o dosímetro): sempre como [[pendência]], nunca como texto solto com alternativas.
- Hierarquia das fontes: 1) lei, decreto, NR e IN na redação vigente no período; 2) Normas de Higiene Ocupacional (NHO) da FUNDACENTRO; 3) normas técnicas (ISO, ABNT); 4) somente como apoio técnico, nunca como critério de enquadramento quando houver norma brasileira: ACGIH (TLVs/BEIs – referência da NR-9, item 9.6.1.1, para prevenção), NIOSH, OSHA e convenções da OIT ratificadas pelo Brasil (148 e 155, consolidadas no Decreto 10.088/2019). Cite edição e ano de cada fonte.`;

export const CRITERIOS_TRAB = `FINALIDADE TRABALHISTA (insalubridade / periculosidade – CLT arts. 189 a 195, NR-15 e NR-16; para servidor estatutário, a lei do ente, que em regra remete à NR-15/NR-16 – cite a lei local)
- Use SOMENTE a legislação trabalhista, na redação vigente em cada período analisado (período imprescrito: ajuizamento – 5 anos). NÃO use decretos previdenciários, códigos do Anexo IV, IN INSS, PPP/LTCAT como critério de enquadramento, nem NEN.
- Ruído: NR-15, Anexo 1 – limite de 85 dB(A) para 8 h, q = 5; caracteriza com dose diária acima de 100%. Neutralização pelo protetor (item 15.4.1, "b", da NR-15 e NR-6: CA válido, NRRsf, fichas de entrega, troca, treinamento).
- Calor: NR-15, Anexo 3 – até 10/12/2019 redação original (IBUTG; taxa metabólica entre linhas do quadro → linha imediatamente superior, sem interpolar); a partir de 11/12/2019, redação da Portaria SEPRT 1.359/2019 (avaliação pela NHO 06, 2ª ed., 2017; o ajuste do IBUTG pela vestimenta está no Quadro 4 do Anexo III da NR-9); calor a céu aberto sem fonte artificial depois de 11/12/2019 não caracteriza.
- Vibração: NR-15, Anexo 8 – a partir de 14/08/2014 (Portaria MTE 1.297, de 13/08/2014, DOU de 14/08/2014; NHO-09/10; VMB aren 5 m/s²; VCI aren 1,1 m/s² ou VDVR 21,0 m/s^1,75); antes, redação original (ISO 2631 e ISO/DIS 5349).
- Químicos: Anexo 11 (quantitativo; média aritmética das amostras – item 8; valor teto – item 9; valor máximo = LT × fator de desvio – item 7; limites válidos até 48 h semanais – item 10, e acima disso o item 10.1 remete ao art. 60 da CLT: a correção por Brief & Scala é só critério técnico, não está na norma), Anexo 12 (poeiras minerais), Anexos 13 e 13-A (qualitativos); álcali cáustico: pH ≥ 11,5 classifica como corrosivo à pele, Categoria 1, salvo reserva alcalina que indique o contrário (NBR 14725:2023, item 5.3.2.2.2.5). Agentes do Grupo 1 da LINACH no previdenciário: avaliação qualitativa para períodos a partir de 08/10/2014, se o agente tiver CAS e constar do Anexo IV (Dec. 3.048/1999, art. 68, §§ 2º a 4º; IN 128/2022, art. 298); a partir de 01/07/2020, medidas de controle que eliminem a nocividade descaracterizam a exposição.
- Biológicos: NR-15, Anexo 14 (grau máximo: contato permanente com pacientes em isolamento por doenças infectocontagiosas e objetos de seu uso não previamente esterilizados); adequação mês a mês – a equiparação do contato intermitente ao permanente é construção jurisprudencial, não texto do Anexo 14: se usar, cite a fonte.
- Periculosidade: NR-16, anexos em algarismos romanos – I explosivos; II inflamáveis; III segurança pessoal ou patrimonial; IV energia elétrica; V motocicleta (nova redação da Portaria MTE 2.021/2025, vigente desde 03/04/2026); VI agentes das autoridades de trânsito (Portaria MTE 1.411/2025); radiações ionizantes no anexo sem número (*) (Portaria 518/2003). Troca de cilindro de GLP de empilhadeira não está listada no Anexo II (enquadramento só por jurisprudência, que fica apenas registrada).`;

export const CRITERIOS_PREV = `FINALIDADE PREVIDENCIÁRIA (tempo especial – Lei 8.213/1991, Decretos 53.831/1964, 83.080/1979, 2.172/1997 e 3.048/1999, IN PRES/INSS 128/2022)
- EPI: a conclusão técnica analisa os requisitos do art. 291 da IN 128/2022 (e a incompatibilidade do EPI com a atividade, quando houver). Que o EPI "não descaracteriza o ruído" é tese do STF (Tema 555): só no registro de jurisprudência, nunca como critério técnico ou "critério previdenciário".
- Anexo 8 da NR-15 (VCI): o limite é ultrapassado com aren acima de 1,1 m/s² OU VDVR acima de 21,0 m/s^1,75 – escreva sempre "ou" (nunca "e") em quadros e quesitos.
- Anexo IV dos Decretos 2.172/1997 e 3.048/1999: o rol de AGENTES nocivos é exaustivo; as ATIVIDADES listadas em cada código são exemplificativas (nota explicativa do próprio Anexo IV). Não afirme que a descrição de atividades é rol exaustivo.
- Riscos sem previsão no Anexo IV (ergonômicos, de acidentes, psicossociais, mecânicos): não ganham seção nem quadro próprio em "Avaliação dos agentes". Se constarem dos documentos (PPP, PPRA/PGR, LTCAT), dos quesitos ou das alegações, registre em uma frase no item de demais agentes ("não constam do Anexo IV; não enquadráveis") e responda ao quesito que perguntar. Exceção: na penosidade (motorista, cobrador), postura, esforço, risco de acidente e violência são fatores da matriz e entram nela.
- Ruído: o NEN é normalizado para a jornada do SEGURADO (relato, documentos da empregadora), não para a do trabalhador ou da empresa paradigma; com fontes divergentes, adote a do segurado e mostre as demais num quadro de sensibilidade.
- Período sem medição representativa (ex.: fonte de calor diferente da do paradigma): escreva "não avaliado (sem medição representativa)", nunca "não caracteriza".
- Agente de critério quantitativo sem medição do período (ex.: radiação ionizante sem dosimetria, mercúrio sem amostragem): "não avaliado quantitativamente (sem dosimetria / sem medição)", com o que falta para avaliar; nunca "não caracteriza (não quantificada)".
- Registros do CNIS sobre custeio e regularidade das contribuições (recolhimentos em atraso, pendências, indicadores, competências sem recolhimento) não entram no laudo nem no LTCAT: são alheios à avaliação técnica e podem prejudicar o segurado. Cite do CNIS só os vínculos, as datas e os benefícios por incapacidade.
- O Decreto 4.882/2003 alterou o cód. 2.0.1 (ruído: NEN acima de 85 dB(A)); não o atribua ao cód. 2.0.2. Marcos legais: cite só os que caem dentro dos períodos avaliados.
- Use a legislação previdenciária vigente À ÉPOCA de cada período (tempus regit actum). A NR-15 entra apenas como referência técnica de limites quando o decreto do período a ela remete. NÃO use conceitos trabalhistas como critério: grau de insalubridade, adicional, período imprescrito, neutralização da NR-15, Súmulas do TST.
- Ruído: q = 5 como padrão (NR-15); a partir de 19/11/2003 a NHO-01 (q = 3) também é aceita (TNU, Tema 174) – se o laudo/medição usou q = 3, informe "q": "3" na medição. Até 05/03/1997: Lavg > 80 dB(A) (cód. 1.1.6 do Decreto 53.831/64). De 06/03/1997 a 18/11/2003: Lavg > 90 dB(A) (cód. 2.0.1) – a legislação remetia ao Anexo 1 da NR-15 na íntegra, compara-se o Lavg. A partir de 19/11/2003: somente o NEN > 85 dB(A), calculado conforme a jornada com q = 5. TWA não é usado. EPI não descaracteriza o ruído (STF, Tema 555).
- Calor: até 05/03/1997, cód. 1.1.1 do Decreto 53.831/64 (fonte artificial, TE acima de 28 °C); depois, cód. 2.0.4 dos Decretos 2.172/97 e 3.048/99 com os limites do Anexo 3 da NR-15 na redação do período (original até 10/12/2019; Portaria SEPRT 1.359/2019 depois). O Decreto 3.048/99 prevalece sobre a IN INSS mais restritiva (hierarquia normativa). IBUTG ajustado pela vestimenta (Quadro 4 do Anexo III da NR-9).
- Vibração: até 05/03/1997, cód. 1.1.5 do Decreto 53.831/64 (perfuratrizes e marteletes pneumáticos, e outros; máquinas a ar comprimido acima de 120 golpes/min; a IN 128/2022, art. 296, I, trata o cód. 1.1.5 como critério quantitativo, quando a vibração for medida em golpes por minuto) e cód. 1.1.4 do Decreto 83.080/79 (perfuratrizes e marteletes pneumáticos); de 06/03/1997 a 13/08/2014, cód. 2.0.2 com os limites das normas ISO 2631 e ISO/DIS 5349 (art. 296, II, da IN 128/2022) – fora de perfuratriz/martelete, apresentar as duas leituras, inclusive pela ISO (VCI: fronteira superior da zona de cautela da ISO 2631-1 para 8 h, aren 0,86 m/s² (Figura B.1; Nota Técnica ASPEJUDI nº 001/2013 – a ISO não fixa limite de exposição) ou VDV 17; VMB: 5 m/s², Diretiva 2002/44/CE); a partir de 14/08/2014 (vigência da Portaria MTE 1.297/2014; a IN indica 13/08/2014), limites do Anexo 8 da NR-15 (art. 296, III; NHO-09/10 facultativas desde 10/09/2012).
- Calor: art. 293 da IN 128/2022 – NHO-06 obrigatória a partir de 01/01/2004 (facultativa desde 19/11/2003). Ruído: art. 292 – histograma ou memória de cálculo a partir de 11/10/2001; NHO-01 obrigatória a partir de 01/01/2004 (facultativa desde 19/11/2003).
- Anexo IV do RPS: as atividades são exaustivas, salvo as relacionadas exclusivamente a agentes químicos, que são exemplificativas (art. 287, § 4º, da IN 128/2022). Biológicos: art. 299. LTCAT: elementos do art. 276, I a XII. Laudo individual: requisitos do art. 277, IV; o INSS não aceita laudo relativo a equipamento ou setor similar, realizado em localidade diversa ou de empresa diversa (art. 277, parágrafo único, III a V). LTCAT extrajudicial: a autorização do levantamento (art. 277, IV, a) e a declaração do segurado constam do termo de declaração e autorização que o app insere ao final do laudo; cite esse termo no item próprio e não a registre como pendência nem como documento a apresentar.
- Agentes biológicos: não usar o Anexo 14 da NR-15; somente o rol de atividades do cód. 3.0.1 do Anexo IV do Decreto 3.048/99.
- Agentes químicos (art. 297 da IN 128/2022): até 05/03/1997, qualitativo, por presunção de exposição, nos códigos 1.2.x dos Decretos 53.831/64 e 83.080/79; a partir de 06/03/1997, somente agentes do Anexo IV (rol exaustivo), avaliados conforme os Anexos 11 e 12 (quantitativos) e 13 e 13-A (qualitativos) da NR-15; a partir de 01/01/2004, metodologia das NHO-02, 03, 04 e 07 (facultativa desde 19/11/2003). Óleos minerais (todo óleo mineral é derivado de petróleo; lubrificantes, hidráulicos, de corte, vaselina, petrolato, parafina, graxa de base mineral): cód. 1.0.7, b, do Anexo IV (extração, produção e utilização de óleos minerais e parafinas), avaliação qualitativa (NR-15, Anexo 13); informe em "ip346" o extrato em DMSO da FDS (< 3 % = óleo altamente refinado, fora do Grupo 1 da LINACH; óleo não tratado ou pouco tratado é LINACH Grupo 1, mas sem CAS único, fora do art. 298). Combustíveis e solventes de petróleo (diesel, gasolina, querosene, nafta, aguarrás): cód. 1.0.17, cujas atividades listadas são as de unidades de extração, plantas petrolíferas e petroquímicas e misturas asfálticas – fora delas, atividades exemplificativas (art. 287, § 4º, da IN 128/2022), a conferir; componentes com limite no Anexo 11 (tolueno, xileno, n-hexano) e o benzeno são agentes próprios. Base sintética ou vegetal (PAO, ésteres, silicones) não é óleo mineral.
- Medidas de controle: EPC (art. 290) e EPI somente a partir de 03/12/1998, com os requisitos cumulativos do art. 291 da IN 128/2022.
- Penosidade (motorista de ônibus/caminhão e cobrador): até 28/04/1995, categoria profissional (cód. 2.4.4 do Decreto 53.831/64; cód. 2.4.2 do Anexo II do Decreto 83.080/79); depois, só em juízo, com perícia técnica individualizada que demonstre exposição habitual e permanente a condições concretas de desgaste (jornada e tempo de direção – CLT art. 235-C e CTB art. 67-C –, trabalho noturno, pernoites, carga/descarga, vias, cabine, ruído e vibração mesmo abaixo do limite, risco de acidente e de violência, pressão de prazos). Não vai para o PPP nem altera o código GFIP. Avaliação pela matriz do IAC nº 5 do TRF4 (veículo, trajetos, jornadas) acrescida das cargas, com base na entrevista do autor, sem remissão a limites de jornada da CLT ou do CTB; a convergência cumulativa dos fatores caracteriza trabalho excepcionalmente penoso; jornada de 12 h/dia ou mais pressupõe pressão de prazos e metas.
- Vínculos: a mesma atividade, no mesmo local e sem interrupção é UM vínculo só, ainda que a categoria no CNIS mude (autônomo, cooperado, contribuinte individual) ou haja lacunas de contribuição – divida apenas por empregador diferente. A divisão pelos marcos legais e pelos afastamentos é feita pelo app. Vínculo que continua: "fim": "atual". Afastamentos por benefício do CNIS: no campo "afastamentos" do vínculo. Em "empresa", só o nome (notas e ressalvas vão para "preliminares").
- Resultado dos agentes avaliados: até 05/03/1997, químicos por presunção nos códigos 1.2.x; a partir de 06/03/1997, agente fora do Anexo IV = "Não enquadrável"; agente do Anexo IV de avaliação quantitativa sem medição = "não avaliado quantitativamente (sem dosimetria / sem medição)" (consta do PPP sem quantificação); uso não confirmado = "A confirmar". Textos técnicos sem juízo sobre conversão de tempo especial em comum ou contagem de tempo (questões de direito).
- Marcos: 28/04/1995 (fim do enquadramento por categoria), 05/03/1997, 03/12/1998, 18/11/2003, 14/08/2014, 13/11/2019 (EC 103/2019).
- Datas de vínculo: a CTPS prevalece sobre o CNIS. PPP: código GFIP 04 quando houver enquadramento; o PPP em papel vai só até a entrada do eSocial (SST). Laudo de outro segurado usado como paradigma: não citar o nome desse segurado.
- Intervalos de data (síntese da conclusão e PPP, itens 13 a 15): só abra um novo intervalo quando mudar algum dado da linha (local, cargo/função, agente, resultado, intensidade, técnica). No item 15, uma linha por agente (ou grupo de agentes com o mesmo resultado) com o próprio período; marcos que mudam só uma coluna (EPC/EPI a partir de 03/12/1998, início de um produto ou de uma especialidade) vão na própria célula ("a partir de dd/mm/aaaa, …") ou em nota de rodapé do quadro, e não em linha nova. Nos itens 13 e 14, mudanças de função e acréscimos de atividade entram no texto da célula com a data, e o intervalo muda só com o local ou o setor.`;

export function jurisprudenciaLigada(c = {}, perfil = {}) {
  if (c.jurisprudencia === 'Incluir') return true;
  if (c.jurisprudencia === 'Não incluir') return false;
  return (perfil.jurisprudenciaPadrao || 'Incluir em seção própria') !== 'Não incluir';
}

export function criteriosPara(c = {}, situacaoId = '', perfil = {}) {
  const prev = ['perito-prev', 'extra-ltcat', 'extra-penosidade'].includes(situacaoId) || contextoLegal(c).prev === true;
  const jur = jurisprudenciaLigada(c, perfil)
    ? 'JURISPRUDÊNCIA: pode ser registrada apenas em item próprio ("Registro de entendimentos jurisprudenciais"), separada da fundamentação técnica, citando tribunal, número do tema/súmula e a tese com fidelidade; tema ainda pendente sai marcado [[conferir]].'
    : 'JURISPRUDÊNCIA: NÃO cite súmulas, temas, precedentes nem jurisprudência neste caso; fundamente só na legislação e nas normas técnicas.';
  return [CRITERIOS_GERAIS, prev ? CRITERIOS_PREV : CRITERIOS_TRAB, jur, textoNotasParaClaude()].filter(Boolean).join('\n\n');
}

// compatibilidade
export const CRITERIOS = [CRITERIOS_GERAIS, CRITERIOS_TRAB, CRITERIOS_PREV].join('\n\n');

const REGRAS_EXTRACAO = `REGRAS DE EXTRAÇÃO
1. Fidelidade aos autos: extraia apenas o que está nos documentos. Não invente, não deduza, não presuma. O que não estiver nos documentos fica vazio ("").
2. Cite sempre a localização (ID, mov., fls. ou página do PDF) dos dados relevantes.
3. Quesitos: TRANSCREVA TODOS NA ÍNTEGRA, palavra por palavra, um item por quesito, com origem e número.
4. EPIs: liste cada item das fichas (descrição, CA, data de entrega, observações sobre periodicidade, assinatura e validade do CA).
5. Datas no formato AAAA-MM-DD. Não inclua nomes de advogados.
6. PROCESSO EM ANDAMENTO: se os autos já contêm laudo pericial, parecer, registro ou ata de diligência, preencha também "andamento", "diligencia", "postos" (com as medições de cada posto) e, em cada quesito, a "resposta" dada no laudo, transcrita fielmente (sem resumir). Se não houver laudo nem diligência, deixe esses blocos vazios. Medições: um item por medição, com os valores exatamente como no laudo (número com vírgula ou ponto, sem unidade) e o equipamento (marca, modelo, série, certificado) em "equipamento". Traga a data e os horários de início e fim de cada medição como constam no laudo ou no relatório do equipamento: eles são usados para conferir o horário da diligência.
7. LOCAL DA PERÍCIA: se o despacho ou os autos indicarem onde será feita a vistoria (a empresa empregadora ou, na perícia por similaridade, a empresa paradigma) e o endereço, preencha "diligencia.vistoriaLocal" (razão social), "diligencia.vistoriaEndereco" (rua, número, bairro, cidade/UF, CEP) e "diligencia.vistoriaCnpj", mesmo que a diligência ainda não tenha ocorrido. Na perícia por similaridade, preencha também "processo.similaridade" = "Sim" e "processo.empresaOriginal" com a empregadora original. Se a vistoria for em bem de pessoa física, sem empresa (por exemplo, veículo paradigma de um particular), deixe "vistoriaLocal" e "vistoriaCnpj" vazios e preencha "diligencia.vistoriaProprietario" com o NOME COMPLETO do proprietário como consta nos autos, "diligencia.vistoriaVeiculo" (marca, modelo, ano) e "diligencia.vistoriaContato" (telefone indicado nos autos).
8. FOTOS: use o nome do arquivo e o conteúdo da imagem para a legenda. Em "identificacao", só o que estiver legível na foto (plaqueta, rótulo, display, CA); leitura de display de equipamento serve apenas para conferência com o relatório do equipamento, nunca como resultado de medição.
9. ${REGRAS_FDS.replace(/\n- /g, '\n   - ')}
10. DESPACHO DE NOMEAÇÃO (perito do juízo): preencha "despacho" com o que o despacho/decisão fixar – honorários (valor, item, forma de pagamento, adiantamento, quem deposita, limite da tabela para recursos públicos), os números dos itens (depósito, aceite, alvará, data da perícia, vistoria e partes, ofício à empresa, prazo do laudo), a antecedência para informar a data e o prazo do laudo em dias. Use o número do item como está no despacho (ex.: "7, b"). Datas-limite (prazoLaudo, prazoManifestacao, prazoEsclarecimentos) só se estiverem expressas nos autos (AAAA-MM-DD). Em "processo.classe", a classe da ação na capa (ex.: Procedimento Comum); em "processo.juizoDeprecante", só em carta precatória.
11. VÍNCULOS OBJETO DA PERÍCIA: se o despacho ou a decisão que determinou a perícia delimitar empresas ou períodos, "periodos" traz SOMENTE esses. Os vínculos pedidos na inicial e não incluídos no despacho NÃO entram em "periodos": registre-os em "sintese.preliminares" (empresa, período e "não está no despacho do evento X"). Sem delimitação no despacho, liste os períodos pedidos na inicial.`;

const PRODUTO_FDS = FORMATO_PRODUTO.replace(/\s*\n\s*/g, ' ');
const FORMATO = `FORMATO DA RESPOSTA
Responda SOMENTE com um bloco JSON válido, sem texto antes ou depois, neste formato:
{
  "processo": {"classe": "", "numero": "", "juizo": "", "juizoDeprecante": "", "comarca": "", "dataAjuizamento": "", "valorCausa": "", "rito": "", "peritoJuizo": "", "refLaudo": "", "despachoRef": "", "similaridade": "Sim | Não", "empresaOriginal": ""},
  "despacho": {"honorariosFixados": "", "honorariosItem": "", "honorariosTabela": "valor máximo da tabela citado no despacho", "honorariosForma": "Adiantamento no início e saldo ao final | Integral após a entrega do laudo (sem adiantamento) | Ao final, pela parte sucumbente (Justiça do Trabalho)", "honorariosAdiantamento": "", "honorariosDepositante": "", "limiteTabelaPublico": "Sim | Não", "itemDeposito": "", "itemAceite": "", "itemAlvara": "", "itemDataPericia": "", "antecedenciaDias": "", "itensVistoria": "", "itemOficio": "", "prazoLaudoDias": "", "itemPrazoLaudo": "", "prazoLaudo": "", "prazoManifestacao": "", "prazoEsclarecimentos": ""},
  "partes": {"autorNome": "", "autorCpf": "", "autorNascimento": "", "reuNome": "", "reuCnpj": ""},
  "sintese": {
    "funcoes": "cargos, funções, admissão, demissão, períodos",
    "atividadesAlegadas": "", "agentesAlegados": "", "pedidos": "",
    "defesa": "", "preliminares": "pontos de atenção e pendências, um por linha começando com '- '",
    "analiseEpi": "", "roteiro": "roteiro da vistoria e documentos a solicitar, um por linha começando com '- '",
    "observacoes": ""
  },
  "acidente": {"acidenteData": "só em caso de acidente do trabalho", "acidenteHora": "", "acidenteLocal": "", "acidenteAtividade": "", "acidenteMaquina": "", "acidenteRelato": "versão do acidentado", "acidenteRelatoEmpresa": "versão da empresa e das testemunhas", "acidenteLesao": "", "acidenteCat": "", "acidenteAlteracoes": ""},
  "periodos": [{"empresa": "", "cnpj": "", "inicio": "", "fim": "dd/mm/aaaa, ou \"atual\" se o vínculo continua", "cargo": "", "setor": "", "atividades": "", "agentes": "", "fonte": "", "categoriaSegurado": "Empregado | Contribuinte individual | Cooperado (cooperativa de trabalho) | Avulso", "local": "endereço/cidade do local de trabalho no período", "cbo": "código da CBO 2002 e título, pela atividade efetivamente exercida (ex.: 9503-05 – Supervisor de manutenção eletromecânica)", "funcao": "função, se diferente do cargo", "profissiografia": "descrição das atividades para o PPP, sem anotações de trabalho", "notas": "anotações de trabalho (minutagem, divergências, dados a confirmar) – não saem no laudo", "afastamentos": "um por linha: dd/mm/aaaa a dd/mm/aaaa – B31 ou B91", "tipoTransporte": "só motorista/cobrador", "jornadaSemanal": "", "noturnoPernoite": "", "cargaDescarga": "", "vias": "", "riscoAcidente": "", "cabine": "", "pausas": "", "pressao": "", "fisiologicas": "acesso a sanitários, alimentação e descanso", "veiculoTipo": "", "veiculoMarca": "", "veiculoModelo": "", "veiculoAno": "", "grupoVeiculo": "só motorista – um dos grupos da instrução", "carroceria": "", "tipoCarga": "", "carregaDescarrega": "Não | Carregava | Descarregava | Carregava e descarregava", "conducaoH": "horas de direção por dia (número)", "conducaoBase": "de onde veio a informação", "abastecimento": "", "acidenteVinculo": "Não, ou descrição", "assaltoVinculo": "Não, ou descrição", "cambio": "", "segundoMotorista": "Não | Sim", "lavagemManutencao": "quem lavava, limpava e fazia a manutenção", "tanqueSuplementar": "Não, ou capacidade", "inflamaveis": "Não, ou o quê e quanto"}],
  "agentesAvaliados": [{"nome": "agente avaliado sem medição (biológico, químico ou físico)", "tipo": "Biológico | Químico | Físico", "vinculos": "V1, V2… pela ordem cronológica dos períodos; vazio = todos", "expInicio": "dd/mm/aaaa – só se a exposição a este agente começou depois do início do vínculo", "expFim": "dd/mm/aaaa – só se a exposição terminou antes do fim do vínculo", "fonte": "fonte geradora / atividade com exposição", "cas": "", "ip346": "só óleo mineral: < 3 % (óleo altamente refinado) | ≥ 3 % ou não tratado / pouco tratado | Não informado na FDS", "circunstancias": "circunstâncias da exposição na jornada (art. 68, § 2º, I)", "vias": "meios de contato e vias de absorção", "frequencia": "intensidade, frequência e duração do contato", "efeitos": "efeitos à saúde (só se o agente não estiver no banco de químicos do app)", "limites": "limites e classificação (NR-15, LINACH, IARC) – só se o agente não estiver no banco", "codAte97": "código do Dec. 53.831/64 e do Dec. 83.080/79", "resAte97": "Caracteriza | Não caracteriza | Não enquadrável | A confirmar", "codDesde97": "código do Anexo IV", "resDesde97": "Caracteriza | Não caracteriza | Não enquadrável | A confirmar", "intensidade": "", "tecnica": "Qualitativa ou a norma da medição", "epcEficaz": "Sim | Não | Não se aplica", "epiEficaz": "Sim | Não | Não se aplica", "ca": "", "fundamentacao": "texto técnico do item 5 do LTCAT", "integridadeFisica": "só eletricidade após 05/03/1997, inflamáveis e explosivos: Caracterizada tecnicamente | Não caracterizada | Não se aplica", "criterioIntegridade": "NR-16, anexo e item; NR-10", "excluir": "true só para retirar do caso um agente já cadastrado por engano (pelo nome)", "novoNome": "só para renomear o agente já cadastrado com o nome acima"}],
  "fotos": [{"numero": "nº da foto na ordem do app (1, 2, 3…), só para fotos já anexadas ao caso", "legenda": "o que a foto mostra, em uma frase (o nome do arquivo costuma trazer a descrição)", "tipo": "Máquina / veículo | Equipamento de medição | Produto químico (rótulo) | EPI | Posto / ambiente | Documento | Outro", "identificacao": "marca, modelo, série, ano, CA, produto ou leitura de display vistos na foto – só o que estiver legível"}],
  "ppp": {"pppEmitente": "Empresa (empregador) | Cooperativa de trabalho | Próprio segurado (contribuinte individual)", "pppEmitenteNome": "", "pppEmitenteCnpj": "", "pppCnae": "", "pppEndereco": "", "pppNit": "", "pppSexo": "Masculino | Feminino", "pppRepresentante": "", "pppRepresentanteNit": "", "pppObs": "", "art": "nº da ART", "modalidade": "Presencial (vistoria no local de trabalho) | Remota (entrevista por videoconferência) | Documental (sem vistoria nem entrevista)", "docsEmpresa": "Citar no laudo | Somente referência (não citar)", "fotosAutoria": "Registro fotográfico do signatário | Fornecidas pelo contratante | Fornecidas pelo segurado | Fornecidas pela empresa", "esocialSst": "data de início do eSocial SST do emitente, se houver empregado ou cooperado"},
  "documentos": [{"tipo": "PPP | LTCAT | PGR / PPRA | Laudo pericial | Ficha de EPI | CTPS / CNIS | Outro", "identificacao": "", "analise": ""}],
  "epis": [{"descricao": "", "ca": "", "dataEntrega": "", "obs": ""}],
  "quesitos": [{"origem": "Juízo | Autor / Reclamante | Réu / Reclamada | INSS | Complementares", "numero": "1", "texto": "", "resposta": "resposta dada no laudo, se já houver"}],
  "andamento": {"fase": "A preparar | Diligência agendada | Diligência realizada | Laudo / parecer em elaboração | Aguardando manifestação / esclarecimentos | Respondendo quesitos suplementares | Concluído", "laudoRefPerito": "ID/mov. do laudo", "laudoData": "", "conclusaoLaudo": "conclusão do laudo por agente e período, com as folhas", "honorariosFixados": "", "honorariosItem": "", "dataDiligencia": "", "horaDiligencia": ""},
  "diligencia": {"vistoriaData": "", "vistoriaInicio": "HH:MM", "vistoriaFim": "HH:MM", "vistoriaLocal": "empresa onde será / foi a vistoria", "vistoriaProprietario": "nome completo, se pessoa física sem empresa", "vistoriaVeiculo": "", "vistoriaContato": "", "vistoriaEndereco": "", "vistoriaCnpj": "", "vistoriaPresentes": "nome – função – quem representa, um por linha", "vistoriaIntimacao": "evento/mov. e data da intimação das partes sobre a data da diligência", "vistoriaCondicoes": "", "vistoriaNotas": "outras anotações da diligência e a folha do laudo onde está"},
  "postos": [{"nome": "", "descricao": "", "placa": "placa do veículo avaliado, se houver", "veiculoAvaliado": "marca, modelo, ano e fonte (CRLV), se houver", "infoTrabalhador": "", "infoEmpresa": "", "agentes": "", "jornada": "", "epc": "", "epi": "",
    "medicoes": [{"agente": "Ruído | Calor (IBUTG) | Vibração de corpo inteiro (VCI) | Vibração de mãos e braços (VMB) | Agente químico | Outro", "dataMedicao": "", "horaInicio": "", "horaFim": "", "equipamento": "", "relatorio": "",
      "tempoAmostragem": "", "jornada": "", "dose": "", "lavg": "", "nen": "", "lmax": "", "calibInicial": "", "calibFinal": "", "posicao": "",
      "tbn": "", "tbs": "", "tg": "", "ibutgLido": "", "atividade": "", "regime": "",
      "veiculo": "", "aren": "", "vdv": "", "eixo": "", "tempoExposicao": "",
      "descricao": "", "metodo": "", "valor": "", "unidade": "", "limite": "", "obs": ""}]}],
  "produtos": [${PRODUTO_FDS}]
}`;

// Anotações de diligência já realizada (aba Campo): só os blocos que a diligência alimenta
export const FORMATO_DILIGENCIA = `FORMATO DA RESPOSTA
Responda SOMENTE com um bloco JSON válido, sem texto antes ou depois, neste formato (omita o que não houver):
{
  "andamento": {"fase": "Laudo / parecer em elaboração", "dataDiligencia": "", "horaDiligencia": ""},
  "diligencia": {"vistoriaData": "", "vistoriaInicio": "HH:MM", "vistoriaFim": "HH:MM", "vistoriaLocal": "", "vistoriaEndereco": "", "vistoriaPresentes": "nome – função – quem representa, um por linha", "vistoriaIntimacao": "", "vistoriaCondicoes": "", "vistoriaNotas": ""},
  "periodos": [{"empresa": "igual à lista", "inicio": "igual à lista", "fim": "igual à lista", "atividades": "", "tipoTransporte": "", "jornadaSemanal": "", "noturnoPernoite": "", "cargaDescarga": "", "vias": "", "riscoAcidente": "", "cabine": "", "pausas": "", "pressao": "", "fisiologicas": "", "veiculoMarca": "", "veiculoModelo": "", "veiculoAno": "", "carregaDescarrega": "Não | Carregava | Descarregava | Carregava e descarregava", "cambio": "", "segundoMotorista": "Não | Sim", "lavagemManutencao": "", "tanqueSuplementar": "", "inflamaveis": ""}],
  "quesitos": [{"origem": "", "numero": "", "texto": "", "resposta": ""}],
  "postos": [{"nome": "", "descricao": "", "placa": "placa do veículo avaliado, se houver", "veiculoAvaliado": "marca, modelo, ano e fonte (CRLV), se houver", "infoTrabalhador": "", "infoEmpresa": "", "agentes": "", "fontes": "", "viaPeriodicidade": "", "jornada": "", "epc": "", "epi": "",
    "medicoes": [{"agente": "Ruído | Calor (IBUTG) | Vibração de corpo inteiro (VCI) | Vibração de mãos e braços (VMB) | Agente químico | Outro", "dataMedicao": "", "horaInicio": "", "horaFim": "", "equipamento": "", "relatorio": "",
      "tempoAmostragem": "", "jornada": "", "dose": "", "lavg": "", "nen": "", "lmax": "", "calibInicial": "", "calibFinal": "", "posicao": "",
      "tbn": "", "tbs": "", "tg": "", "ibutgLido": "", "atividade": "", "regime": "", "veiculo": "", "aren": "", "vdv": "", "eixo": "", "tempoExposicao": "",
      "descricao": "", "metodo": "", "valor": "", "unidade": "", "limite": "", "obs": ""}]}]
}`;

export const SITUACOES = [
  {
    id: 'perito-trab', titulo: 'Perito do Juízo – trabalhista (insalubridade / periculosidade)',
    foco: `Sou o PERITO DO JUÍZO numa ação trabalhista. Leia os autos anexados (inicial, contestação, despachos, documentos de SST, petições de quesitos) e prepare o meu pré-relatório pericial.
FOCO: riscos ocupacionais — agentes alegados e anexos da NR-15/NR-16 aplicáveis, atividades descritas pelas duas partes, divergências entre as versões, período imprescrito (ajuizamento – 5 anos), documentos de SST (PPRA/PGR, LTCAT, PCMSO, fichas de EPI com CA). Ignore verbas e horas extras.
Em "preliminares", liste os pontos controvertidos e o que precisa ser verificado na diligência. Em "roteiro", o que observar/medir em campo e os documentos a solicitar à empresa.`,
  },
  {
    id: 'perito-prev', titulo: 'Perito do Juízo – previdenciário (Justiça Federal / competência delegada)',
    foco: `Sou o PERITO DO JUÍZO numa ação previdenciária de reconhecimento de tempo especial (aposentadoria especial). Leia os autos (inicial, CTPS, CNIS, PPP, LTCAT, laudos, despachos, quesitos) e prepare o meu pré-relatório pericial.
FOCO: cada vínculo/período controvertido com empresa, CNPJ, cargo, setor, atividades e agentes alegados; o que os PPP/LTCAT informam (agentes, intensidades, técnica, EPI eficaz, responsável pelos registros ambientais e respectivas datas); empresas ativas ou extintas (necessidade de similaridade); marcos legais (05/03/1997, 18/11/2003, 13/08/2014, 13/11/2019).
Em "preliminares", liste por período o que falta comprovar. Em "roteiro", o plano de diligência por empresa e os documentos a solicitar.`,
  },
  {
    id: 'perito-faz', titulo: 'Perito do Juízo – Fazenda Pública (adicional de servidor)',
    foco: `Sou o PERITO DO JUÍZO numa ação de servidor público contra o ente (Estado/Município) na Vara da Fazenda Pública / Juizado Especial da Fazenda Pública, sobre adicional de insalubridade/periculosidade.
FOCO: cargo, regime (estatutário ou celetista) e lotação do servidor, unidades onde trabalhou no período discutido, atividades, agentes alegados, a lei do ente que rege o adicional e a que norma técnica ela remete, laudos e documentos do ente. Não use legislação previdenciária. Em "preliminares", os pontos controvertidos; em "roteiro", as unidades a vistoriar e os documentos a solicitar.`,
  },
  {
    id: 'at-estudo', titulo: 'Assistente técnico – estudo do processo e quesitos (antes da perícia)',
    foco: `Fui indicado como ASSISTENTE TÉCNICO (veja no caso de qual parte). Faça o estudo completo do processo trazendo as informações para a assistência técnica: tese de cada parte, atividades, agentes, documentos de SST e suas falhas, argumentos técnicos aproveitáveis e pontos fracos.
Além de transcrever os quesitos já apresentados, SUGIRA quesitos técnicos para a minha parte (origem = a da minha parte), objetivos e numerados, por agente. Em "roteiro", os documentos que devo pedir que a outra parte apresente ao perito e as avaliações no local a requerer.`,
  },
  {
    id: 'at-laudo', titulo: 'Assistente técnico – análise do laudo do perito',
    foco: `Sou ASSISTENTE TÉCNICO (veja no caso de qual parte) e preciso analisar o LAUDO PERICIAL anexado, com os autos.
Em "processo.peritoJuizo" e "processo.refLaudo", identifique o perito e o ID do laudo. Em "observacoes", resuma a conclusão do laudo por agente, citando as folhas. Em "preliminares", liste os pontos técnicos a impugnar ou a reforçar (premissas não verificadas, enquadramento incompleto, quesitos sem resposta, divergências de narrativa, falta de quantificação de tempo e frequência, falta de delimitação do período, neutralização por EPI).
Em "quesitos", transcreva os quesitos já respondidos pelo perito e SUGIRA quesitos de esclarecimento com origem "Complementares". Use linguagem técnica, sem juridiquês.`,
  },
  {
    id: 'extra-ltcat', titulo: 'Extrajudicial – LTCAT + PPP (inclusive extemporâneo / por similaridade)',
    foco: `Vou elaborar um LTCAT + PPP extrajudicial para fins de aposentadoria especial (Lei 8.213/91, Decreto 3.048/99, IN PRES/INSS 128/2022). Leia os documentos anexados (CNIS, CTPS, cartão CNPJ, contrato social, laudos anteriores, anotações) e prepare o pré-relatório.
FOCO: segurado e categoria (empregado / contribuinte individual – STJ, Tema 1291), vínculos com datas da CTPS, lacunas do CNIS, empresa ativa ou extinta (similaridade: o INSS não aceita laudo de empresa diversa – art. 277, parágrafo único, da IN 128/2022; em juízo, Súmula 106 do TRF4 e TNU, PEDILEF 0001323-30.2010.4.03.6318: empresa inativa sem representante e sem laudos, ou ambiente substancialmente alterado sem possibilidade de novo laudo; similaridade na mesma época, condições, agentes e habitualidade e permanência), atividades e agentes por subperíodo, marcos legais e EC 103/2019, laudos existentes da empresa e suas falhas.
Em "preliminares", as pendências e documentos a pedir ao segurado antes da vistoria. Em "roteiro", o checklist de campo (o que perguntar, observar, medir e fotografar).
VÍNCULOS: em "empresa", só o nome (sem observações entre parênteses – elas vão para "atividades" ou "preliminares"); preencha "categoriaSegurado", "local" (endereço/cidade do trabalho naquele período), "cbo" e "afastamentos" (benefícios do CNIS dentro do vínculo, um por linha: "13/11/2025 a 11/01/2026 – B31").
AGENTES AVALIADOS ("agentesAvaliados"): um item por agente avaliado sem medição (biológico, químico ou físico), com o código e o resultado de cada época (até 05/03/1997 e a partir de 06/03/1997: Caracteriza | Não caracteriza | Não enquadrável | A confirmar), a fonte, a técnica ("Qualitativa") e a fundamentação técnica que vai para o item 5 do LTCAT. Agente que depende de confirmação do segurado: "A confirmar". Ruído, calor e vibração medidos vão em "postos[].medicoes", não aqui.
PPP ("ppp"): quem emite (empresa, cooperativa de trabalho ou o próprio segurado), nome e CNPJ/CAEPF/CPF do emitente, CNAE, NIT e sexo do segurado, representante legal; "modalidade" da avaliação (houve vistoria no local de trabalho? só entrevista por videoconferência?), "docsEmpresa" e "fotosAutoria" (quem tirou ou forneceu as fotos).
TEXTO PRONTO PARA O LAUDO: "atividades", "profissiografia", "fundamentacao", "circunstancias", "fonte", "vias" e "frequencia" vão como estão para o LTCAT e o PPP. Neles, nada de minutagem da gravação, "transcrição", "transcrito como", "(ver …)", "~", notas entre colchetes ou dados a confirmar: anotações de trabalho vão em "notas" do vínculo ou em "preliminares". Datas aproximadas por extenso ("cerca de 1992").
DOCUMENTOS DA EMPRESA: PGR, LTCAT, PCMSO e laudos da própria empresa servem de referência técnica. No trabalho extrajudicial, não são citados (o app retira as menções), salvo se o contratante pedir – então "docsEmpresa" = "Citar no laudo"; quando pedir que não sejam citados, "docsEmpresa" = "Somente referência (não citar)". Escreva os fatos sem o nome do documento (nem entre parênteses).
COERÊNCIA: o resultado de cada agente tem de bater com a fundamentação. Resultado definitivo (Caracteriza / Não caracteriza / Não enquadrável) não convive com "a confirmar", "se confirmado" ou "depende de" no texto; exposição eventual, ocasional ou intermitente não caracteriza depois de 28/04/1995; agente do Anexo 11 ou 12 da NR-15 sem medição = "Não caracteriza" a partir de 06/03/1997. Se a exposição a um agente vale só para uma fase do vínculo, preencha "expInicio" e "expFim".
RISCO À INTEGRIDADE FÍSICA (eletricidade acima de 250 V após 05/03/1997, inflamáveis, explosivos): não consta do Anexo IV – o resultado do agente segue o decreto ("Não enquadrável" a partir de 06/03/1997), e a condição vai em "integridadeFisica" = "Caracterizada tecnicamente" (exposição habitual e permanente) ou "Não caracterizada" (eventual), com o critério da NR-16/NR-10 em "criterioIntegridade" e as circunstâncias e a frequência descritas (eletricidade: a tensão, ex.: "380 V e 440 V"). O LTCAT enquadra a condição caracterizada (art. 57 da Lei nº 8.213/1991) em item próprio e na síntese; o PPP a cita só nas observações – não entra no campo 15 nem no código GFIP.
PERÍODO DE EXPOSIÇÃO DE CADA AGENTE: o agente só vale a partir de quando a atividade com ele começou e até quando terminou ("expInicio"/"expFim"); não presuma exposição química antes de o segurado trabalhar com o produto (ex.: técnico de eletrônica que passou a montar máquinas de poliuretano em 17/07/1997 → químicos a partir dessa data). Use também os limites legais de uso: CFC-11 (R11) em espumas até 31/12/2000 (Resolução CONAMA nº 267/2000, art. 2º, III); HCFC-141b na manufatura de espumas até 31/12/2019 (IN IBAMA nº 4/2018); mercúrio e pó para liga de amálgama não encapsulado em odontologia até 31/12/2018 (RDC Anvisa nº 173/2017) – cite a norma na fundamentação.
FUNDAMENTAÇÃO E FREQUÊNCIA: o código e o resultado de cada época já saem no quadro do laudo; a "fundamentacao" traz o que é próprio do agente (uso, período, norma que limita o uso, motivo do resultado). Agente que caracteriza: frequência habitual e permanente, descrita pela rotina (ex.: "Habitual, em cada restauração, ao longo da jornada"); não use "pontual", "pequeno volume", "volume mínimo", "pequena quantidade", "eventual" nem "sem exposição permanente" junto de "Caracteriza". Biológicos na área da saúde: exposição inerente à atividade, habitual e permanente. Agente que não consta dos decretos é "Não enquadrável" – nada de código "por analogia" ou "enquadramento forçado". Entendimentos dos tribunais ("há entendimento…", teses) ficam só no item de jurisprudência, nunca na fundamentação do agente.
CATEGORIA DO SEGURADO: cooperado que atende também particulares no próprio consultório, sem exclusividade com a cooperativa, continua "Contribuinte individual" e emite o próprio PPP; mencione a cooperativa nas atividades (o laudo explica a condição simultânea).
CORREÇÕES DE UM CASO JÁ IMPORTADO: o agente é reconhecido pelo nome principal (antes do parêntese); para retirar um agente cadastrado por engano, "excluir": true; para renomear, "novoNome". Campos que só devem ser corrigidos vão com "substituir" marcado na importação.
CBO: em cada vínculo, o código da CBO 2002 que corresponde à atividade efetivamente exercida (não só ao título do cargo), no formato "9999-99 – Título".`,
  },  {
    id: 'extra-penosidade', titulo: 'Extrajudicial – parecer técnico de condições de trabalho e penosidade (motorista)',
    foco: `Vou elaborar um PARECER TÉCNICO EXTRAJUDICIAL de condições de trabalho e penosidade para um MOTORISTA (caminhão, carreta, ônibus), a pedido do segurado ou do advogado, para instruir requerimento ao INSS, revisão ou ação judicial de aposentadoria especial. Leia os documentos anexados: ENTREVISTA do segurado (Word, PDF ou anotação), CTPS, CNIS, PPP e laudos que houver.

VÍNCULOS ("periodos")
1. Um item por CONTRATO, com empresa, CNPJ, início e fim EXATAMENTE como na CTPS/CNIS (vínculo em aberto: "fim" vazio). Se a entrevista juntar dois contratos da mesma empresa (ex.: "2013 a 2014 e 2020 a 2021"), crie um item para cada contrato, com as respostas da entrevista copiadas nos dois.
2. Inclua só os vínculos de motorista (ou de função ligada à condução). Em "fonte", a origem de cada dado (ex.: "CTPS I fl. 14; CNIS seq. 3; entrevista item 1"); notas de leitura e divergências de data vão para "preliminares", não para "fonte".
3. "Mesma empresa anterior", "mesmas atividades", "idem": copie TODAS as respostas do item citado para este vínculo e acrescente só o que a entrevista disser de diferente; em "conducaoBase", escreva "conforme o item N da entrevista".

ENTREVISTA → CAMPOS DE CADA VÍNCULO (cada resposta no campo certo, mesmo que a entrevista a tenha anotado na linha errada)
- Veículo: "veiculoTipo" (toco, truck, 3/4, carreta, ônibus…), "veiculoMarca" e "veiculoModelo" separados (ex.: "Volkswagen" + "8.150"; "Mercedes-Benz" + "1313"; "Chevrolet" + "D-60"), "veiculoAno". Sem aspas, sem a anotação crua da entrevista. Dois veículos no mesmo vínculo: os dois em "veiculoModelo", separados por " / ".
- "grupoVeiculo": exatamente um destes: Caminhão leve 3/4 / VUC | Caminhão toco (chassi rígido, eixo simples) | Caminhão truck (chassi rígido, eixo duplo) | Cavalo mecânico com cabine convencional / semiavançada, sem ar-condicionado (projeto antigo) | Cavalo mecânico com cabine avançada (cara-chata) | Caminhão pesado moderno (câmbio automatizado, suspensão de cabine, ar-condicionado) | Ônibus (transporte coletivo) | Van / utilitário | Máquina agrícola ou de construção.
- "cabine": climatização ("sem ar-condicionado" / "com ar-condicionado"), câmbio, direção, motor junto da cabine.
- "carroceria": carroceria ou reboque (baú refrigerado, baú carga seca, graneleiro, carroceria aberta…). "tipoCarga": o que transportava.
- "carregaDescarrega": "Não", "Carregava", "Descarregava" ou "Carregava e descarregava" ("sim" = "Carregava e descarregava"); o modo (catraca, manual, empilhadeira) e o tempo vão em "cargaDescarga".
- "vias": trajetos com as cidades e as UFs (deduza a UF só de cidade inequívoca do mesmo estado do trajeto; senão, sem UF).
- "noturnoPernoite": onde pernoitava (cabine, hotel/pousada, casa) e se virava a noite.
- "jornadaSemanal": horário e rotina (ex.: "05h00 às 20h00; sai na segunda e volta na quinta").
- "conducaoH": horas de direção por dia (número). Se só houver o horário, use a duração do horário menos os tempos de carga, descarga e paradas que a entrevista informar; em "conducaoBase", mostre a conta e acrescente "confirmar com o segurado". Sem informação, deixe vazio.
- "abastecimento": onde abastecia. "acidenteVinculo" e "assaltoVinculo": "Não", ou a descrição. NÃO repita essas respostas em "riscoAcidente": ele é só para riscos relatados (rota perigosa, carga visada).
- "pressao", "pausas", "fisiologicas": SÓ se a entrevista disser; não deduza.

TEXTO
- Copie o sentido das respostas sem ampliar ("jornadas extenuantes", "desumanas" etc. só se o segurado disse). Corrija acentos, maiúsculas e nomes de cidades (ex.: "bau" → "baú", "cambé" → "Cambé", "cornelio procopio" → "Cornélio Procópio") e troque reticências e vírgulas repetidas por vírgula; não mude o conteúdo.
- "sintese.funcoes": só a função e a síntese dos períodos (ex.: "Motorista de caminhão – 10 vínculos de 1993 a 2026"). Números de CTPS, NIT e documentos vão para "partes.autorCpf" ou "fonte", nunca para "funcoes".
- Não inclua agentes químicos ou inflamáveis pelo abastecimento em posto (operado pelo frentista, exposição eventual), salvo se a entrevista disser que o motorista operava a bomba ou manipulava combustível na rotina.

PENDÊNCIAS
- "preliminares": (a) divergências entre a entrevista, a CTPS e o CNIS (datas, empresas, vínculos sem entrevista); (b) as perguntas da entrevista que ficaram sem resposta, por vínculo (ex.: "Vandir: jornada e pernoite não informados"); (c) as notas de leitura (número ilegível, data deduzida).
- "roteiro": os veículos sem paradigma conhecido a pesquisar, com marca, modelo, ano e grupo.

Lembre: até 28/04/1995, categoria profissional (cód. 2.4.4 / 2.4.2); depois, penosidade só com perícia individualizada (IAC nº 5 do TRF4; STJ, Tema 1307); após 13/11/2019 não há conversão de tempo especial em comum (EC 103/2019, art. 25, § 2º).`,
  },
  {
    id: 'extra-trab', titulo: 'Extrajudicial – laudo de insalubridade e periculosidade para a empresa',
    foco: `Vou elaborar um LAUDO TÉCNICO EXTRAJUDICIAL de caracterização de insalubridade e periculosidade (CLT, arts. 189 a 195; NR-15 e NR-16) contratado pela empresa (ou por trabalhador/advogado, veja no caso). Leia os documentos anexados (PGR, inventário de riscos, PCMSO, fichas de EPI, FISPQs, laudos anteriores, descrição de cargos).
FOCO: setores, cargos e atividades; agentes por posto com o anexo da NR-15 ou da NR-16 aplicável; produtos químicos e suas FISPQs; EPC e EPI (CA, fichas, troca, treinamento); avaliações quantitativas existentes e o que precisa ser medido.
Em "preliminares", as pendências e documentos a pedir antes da vistoria. Em "roteiro", o checklist de campo por setor (o que observar, medir e fotografar).`,
  },
  {
    id: 'acidente', titulo: 'Acidente do trabalho – análise técnica (judicial ou extrajudicial)',
    foco: `Vou analisar tecnicamente um ACIDENTE DO TRABALHO (veja no caso se é perícia judicial ou laudo extrajudicial). Leia os documentos anexados (inicial, contestação, CAT, boletim de ocorrência, análise de acidente da empresa, PGR, ordens de serviço, treinamentos, manuais da máquina, fotos).
FOCO: data, local, atividade em execução e máquina/equipamento envolvido; dinâmica do acidente segundo cada versão (acidentado, empresa, testemunhas) e as divergências; normas aplicáveis (NR-1, NR-6, NR-10, NR-11, NR-12, NR-18, NR-31, NR-33, NR-35, conforme o caso); proteções existentes e exigíveis; treinamentos e capacitação; alterações no local depois do acidente. O nexo com a lesão e a incapacidade é matéria médica: registre só a lesão informada.
Em "preliminares", os pontos controvertidos da dinâmica e o que verificar. Em "roteiro", o que inspecionar, medir e fotografar na máquina ou no local, e os documentos a pedir.`,
  },
];

export function situacaoDoCaso(c) {
  const extra = c.tipoAtuacao === 'Extrajudicial' || /extrajudicial/i.test(c.papel || '');
  const ctx = contextoLegal(c);
  if (ehAcidente(c) && ctx.prev !== true && !/Assistente/i.test(c.papel || '')) return 'acidente';
  if (extra && (/Parecer técnico extrajudicial/i.test(c.papel || '') || (c.objeto || []).includes('Penosidade (motorista)'))) return 'extra-penosidade';
  if (extra) return ctx.prev === false ? 'extra-trab' : 'extra-ltcat';
  if (/Assistente/i.test(c.papel || '')) return c.refLaudo || /laudo|manifesta|esclarec/i.test(c.fase || '') ? 'at-laudo' : 'at-estudo';
  // (os critérios do assistente técnico seguem a matéria do caso: trabalhista ou previdenciária)
  if (/Fazenda/i.test(c.justica || '') || c.materia === 'Administrativa (servidor)') return 'perito-faz';
  if (c.materia === 'Previdenciária' || ctx.prev === true) return 'perito-prev';
  return 'perito-trab';
}

export function montarPrompt(situacaoId, c = {}, perfil = {}) {
  const s = SITUACOES.find((x) => x.id === situacaoId) || SITUACOES[0];
  const ctx = [c.papel && `Minha atuação neste caso: ${c.papel}.`, c.numero && `Processo: ${c.numero}.`].filter(Boolean).join(' ');
  // previdenciário: a referência da profissão (agentes e critérios já adotados pelo signatário)
  const prof = ['perito-prev', 'extra-ltcat', 'parecer-prev'].includes(s.id) || contextoLegal(c).prev === true ? referenciaProfissao(profissaoDoCaso(c)) : '';
  return [s.foco, ctx, criteriosPara(c, s.id, perfil), prof, REGRAS_EXTRACAO, FORMATO].filter(Boolean).join('\n\n');
}

// compatibilidade
export const PROMPT_IA = montarPrompt('perito-trab');

const CAMPOS_CASO = {
  processo: ['classe', 'numero', 'juizo', 'juizoDeprecante', 'comarca', 'dataAjuizamento', 'valorCausa', 'rito', 'peritoJuizo', 'refLaudo', 'despachoRef', 'similaridade', 'empresaOriginal'],
  despacho: ['honorariosFixados', 'honorariosItem', 'honorariosTabela', 'honorariosForma', 'honorariosAdiantamento', 'honorariosDepositante', 'limiteTabelaPublico', 'itemDeposito', 'itemAceite', 'itemAlvara',
    'itemDataPericia', 'antecedenciaDias', 'itensVistoria', 'itemOficio', 'prazoLaudoDias', 'itemPrazoLaudo', 'prazoLaudo', 'prazoManifestacao', 'prazoEsclarecimentos'],
  partes: ['autorNome', 'autorCpf', 'autorNascimento', 'reuNome', 'reuCnpj'],
  sintese: ['funcoes', 'atividadesAlegadas', 'agentesAlegados', 'pedidos', 'defesa', 'preliminares', 'analiseEpi', 'roteiro', 'observacoes'],
  acidente: CAMPOS_ACIDENTE.map(([k]) => k),
  ppp: [...CAMPOS_PPP.map(([k]) => k), 'art'],
};

const DATAS_CASO = new Set(['dataAjuizamento', 'autorNascimento', 'prazoLaudo', 'prazoManifestacao', 'prazoEsclarecimentos', 'acidenteData']);

export function lerJsonIA(texto) {
  let t = String(texto || '').trim();
  const bloco = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (bloco) t = bloco[1];
  const ini = t.indexOf('{'), fim = t.lastIndexOf('}');
  if (ini < 0 || fim < ini) throw new Error('Não encontrei um JSON no texto colado.');
  const obj = JSON.parse(t.slice(ini, fim + 1));
  const s = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const lista = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
  const caso = {};
  for (const [grupo, ks] of Object.entries(CAMPOS_CASO)) for (const k of ks) {
    let v = s((obj[grupo] || {})[k]);
    // campo de data escrito dd/mm/aaaa → AAAA-MM-DD (o seletor de data só aceita ISO)
    if (v && DATAS_CASO.has(k)) { const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) v = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; else if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) v = ''; }
    if (v) caso[k] = v;
  }
  const origem = origemQuesito;
  const pegar = (o, ks) => Object.fromEntries(ks.map((k) => [k, s((o || {})[k])]).filter(([, v]) => v));
  const and = obj.andamento || {};
  for (const [k, v] of Object.entries(pegar(and, ['laudoRefPerito', 'laudoData', 'conclusaoLaudo', 'honorariosFixados', 'honorariosItem', 'dataDiligencia', 'horaDiligencia']))) caso[k] = v;
  const fase = FASE.find((f) => f.toLowerCase() === s(and.fase).toLowerCase());
  if (fase && fase !== 'A preparar') caso.fase = fase;
  Object.assign(caso, pegar(obj.diligencia, [...CAMPOS_DILIGENCIA.map(([k]) => k).filter((k) => k !== 'vistoriaGps'), 'vistoriaCnpj']));
  // PPP: emitente e sexo só com as opções do app
  if (caso.pppEmitente) caso.pppEmitente = EMITENTE_PPP.find((t) => semAc(t).startsWith(semAc(caso.pppEmitente).split(' ')[0])) || '';
  if (!caso.pppEmitente) delete caso.pppEmitente;
  if (caso.pppSexo) caso.pppSexo = /^f/i.test(caso.pppSexo) ? 'Feminino' : 'Masculino';
  // LTCAT: modalidade, documentos da empresa e autoria das fotos só com as opções do app
  for (const [k, ops] of [['modalidade', MODALIDADE_AVALIACAO], ['docsEmpresa', DOCS_EMPRESA], ['fotosAutoria', AUTORIA_FOTOS]]) {
    if (!caso[k]) continue;
    const t = semAc(caso[k]);
    caso[k] = ops.find((o) => semAc(o).startsWith(t.split(/[\s(]/)[0])) || ops.find((o) => t.includes(semAc(o).split(/[\s(]/)[0])) || '';
    if (!caso[k]) delete caso[k];
  }
  if (caso.esocialSst) { const iso = dataIso(caso.esocialSst); if (iso) caso.esocialSst = iso; else delete caso.esocialSst; }
  const categoriaOk = (x) => { const t = semAc(s(x)); if (!t) return ''; return CATEGORIAS_SEGURADO.find((c) => semAc(c).startsWith(t.split(' ')[0])) || ''; };
  if (caso.similaridade && !/^(sim|não|nao)$/i.test(caso.similaridade)) delete caso.similaridade;
  if (caso.similaridade) caso.similaridade = /^sim$/i.test(caso.similaridade) ? 'Sim' : 'Não';
  const agenteOk = agenteMedicao;
  const KS_MED = ['dataMedicao', 'horaInicio', 'horaFim', 'tempoAmostragem', 'jornada', 'dose', 'q', 'lavg', 'nen', 'relatorio', 'lmax', 'calibInicial', 'calibFinal', 'posicao',
    'tbn', 'tbs', 'tg', 'ibutgLido', 'atividade', 'regime', 'veiculo', 'aren', 'vdv', 'eixo', 'tempoExposicao', 'condicaoVia', 'carga', 'descricao', 'metodo', 'valor', 'unidade', 'limite'];
  const postos = lista(obj.postos).map((x) => ({
    ...pegar(x, CAMPOS_POSTO.map(([k]) => k)),
    medicoes: lista(x.medicoes).map((m) => {
      const r = { agente: agenteOk(m.agente), ...pegar(m, KS_MED) };
      // vibração: a jornada do aparelho vai em "tempoExposicao" (o campo da tela), não em "jornada"
      if (/Vibra/i.test(r.agente || '') && r.jornada) { if (!r.tempoExposicao) r.tempoExposicao = r.jornada; delete r.jornada; }
      if (r.q) r.q = String(r.q).trim().startsWith('3') ? '3 (NHO-01)' : '5 (NR-15, Anexo 1)';
      const obs = [s(m.equipamento) && `Equipamento: ${s(m.equipamento)}`, s(m.obs)].filter(Boolean).join('\n');
      if (obs) r.obs = obs;
      r.importadaDoLaudo = true;
      return r;
    }).filter((m) => Object.keys(m).length > 2),
  })).filter((p) => p.nome || p.medicoes.length);
  for (const k of CAMPOS_DATA_CASO) if (caso[k]) { const iso = dataIso(caso[k]); if (iso) caso[k] = iso; else delete caso[k]; }
  // limpeza do texto vindo da entrevista: reticências repetidas, aspas soltas e espaços duplos
  // reticências de citação entre colchetes ou parênteses ("[...]") ficam
  const limpar = (t) => String(t || '').replace(/(^|[^[(])\.{2,}(?![\])])/g, '$1, ').replace(/\s+,/g, ',').replace(/,\s*,+/g, ',').replace(/^['"‘“]+|['"’”]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  const limparPeriodo = (p) => Object.fromEntries(Object.entries(p).map(([k, val]) => [k, typeof val === 'string' && !['inicio', 'fim', 'cnpj'].includes(k) ? limpar(val) : val]));
  return {
    caso,
    periodos: lista(obj.periodos).map((x) => limparPeriodo({ empresa: s(x.empresa), cnpj: s(x.cnpj), inicio: dataIso(s(x.inicio)) || s(x.inicio), fim: /^(atual|em aberto|ativo)/i.test(s(x.fim)) ? '' : dataIso(s(x.fim)) || s(x.fim), ...(/^(atual|em aberto|ativo)/i.test(s(x.fim)) ? { fimAberto: true } : {}), cargo: s(x.cargo), funcao: s(x.funcao), notas: s(x.notas), setor: s(x.setor), atividades: s(x.atividades), agentes: s(x.agentes), fonte: s(x.fonte), categoriaSegurado: categoriaOk(x.categoriaSegurado), local: s(x.local), cbo: s(x.cbo), profissiografia: s(x.profissiografia), afastamentos: s(x.afastamentos),
      ...Object.fromEntries(['tipoTransporte', 'jornadaSemanal', 'noturnoPernoite', 'cargaDescarga', 'vias', 'riscoAcidente', 'cabine', 'pausas', 'pressao', 'fisiologicas', 'grupoVeiculo', 'veiculoTipo', 'veiculoMarca', 'veiculoModelo', 'veiculoAno', 'conducaoH', 'conducaoBase', 'carroceria', 'tipoCarga', 'carregaDescarrega', 'abastecimento', 'acidenteVinculo', 'assaltoVinculo', 'cambio', 'segundoMotorista', 'lavagemManutencao', 'tanqueSuplementar', 'inflamaveis'].map((k) => [k, s(x[k])]).filter(([, val]) => val)) })),
    documentos: lista(obj.documentos).map((x) => ({ tipo: s(x.tipo), identificacao: s(x.identificacao), analise: s(x.analise) })),
    // legendas das fotos já anexadas ao caso, pelo número (ordem das fotos no app)
    fotos: lista(obj.fotos).map((x) => ({ numero: parseInt(s(x.numero), 10), legenda: s(x.legenda), ...normalizarIdentFoto(x) })).filter((x) => x.numero > 0 && (x.legenda || x.identificacao)),
    produtos: lista(obj.produtos).map(produtoParaDados).filter((p) => p.nome),
    agentesAvaliados: lista(obj.agentesAvaliados).map((x) => {
      const r = pegar(x, CAMPOS_AGENTE_AVALIADO.map(([k]) => k));
      r.tipo = ['Biológico', 'Químico', 'Físico'].find((t) => semAc(t) === semAc(r.tipo)) || 'Químico';
      for (const k of ['resAte97', 'resDesde97']) if (r[k]) r[k] = RESULTADO_AGENTE.find((t) => semAc(t) === semAc(r[k])) || 'A confirmar';
      for (const k of ['epcEficaz', 'epiEficaz']) if (r[k]) r[k] = /^s/i.test(r[k]) ? 'Sim' : /^n[aã]o se/i.test(r[k]) ? 'Não se aplica' : 'Não';
      for (const k of ['expInicio', 'expFim']) if (r[k]) { const iso = dataIso(r[k]); if (iso) r[k] = iso; else delete r[k]; }
      // "excluir": true → o agente do caso com esse nome vai para a lixeira (correção de agente cadastrado por engano)
      if (x.excluir === true || /^(sim|true)$/i.test(s(x.excluir))) r.excluir = true;
      // "novoNome": renomeia o agente encontrado pelo nome (a importação não troca o nome por conta própria)
      if (s(x.novoNome)) r.novoNome = s(x.novoNome);
      // tipo não informado: na criação vale "Químico", mas não troca o tipo de um agente já cadastrado
      if (!s(x.tipo)) r.tipoPadrao = true;
      return r;
    }).filter((r) => r.nome),
    epis: lista(obj.epis).map((x) => ({ descricao: s(x.descricao), ca: s(x.ca), dataEntrega: s(x.dataEntrega), obs: s(x.obs) })),
    quesitos: lista(obj.quesitos).map((x) => ({ origem: origem(x.origem), numero: s(x.numero), texto: s(x.texto), resposta: s(x.resposta) })).filter((q) => q.texto),
    postos,
  };
}

// Campos preenchidos não são sobrescritos (a menos que "substituir" esteja marcado).
export async function aplicarIA(caseId, dados, { substituir = false, criarPeriodos = true, atualizarMedicoes = false, refazerPendentes = false } = {}) {
  const caso = await db.records.get(caseId);
  const mudancas = {};
  // anotações de outra vistoria (2ª diligência, continuação): vão para a aba dela, sem mexer na 1ª
  const dv = dados.caso.vistoriaData;
  if (dv && caso.data.vistoriaData && dv !== caso.data.vistoriaData) {
    const qtd = qtdVistorias(caso.data);
    let n = Array.from({ length: qtd }, (_, i) => i + 1).find((i) => caso.data[chaveVistoria(i, 'Data')] === dv);
    if (!n) { n = qtd + 1; mudancas.vistoriasQtd = String(n); }
    const MAPA = { vistoriaData: 'Data', vistoriaInicio: 'Inicio', vistoriaFim: 'Fim', vistoriaLocal: 'Local', vistoriaEndereco: 'Endereco',
      vistoriaPresentes: 'Presentes', vistoriaCondicoes: 'Condicoes', vistoriaNotas: 'Objetivo' };
    dados = { ...dados, caso: { ...dados.caso } };
    for (const [k, campo] of Object.entries(MAPA)) if (k in dados.caso) { dados.caso[chaveVistoria(n, campo)] = dados.caso[k]; delete dados.caso[k]; }
  }
  for (const [k, v] of Object.entries(dados.caso)) {
    const atual = String(caso.data[k] || '').trim();
    if (substituir || !atual || (k === 'fase' && atual === 'A preparar')) mudancas[k] = v;
  }
  if (Object.keys(mudancas).length) await updateFields(caseId, mudancas);
  const cont = { campos: Object.keys(mudancas).length, periodos: 0, documentos: 0, epis: 0, agentesAvaliados: 0, fotos: 0, produtos: 0, quesitos: 0, respostas: 0, postos: 0, medicoes: 0 };
  const kinds = { periodos: 'periodo', documentos: 'documento', epis: 'epi', agentesAvaliados: 'agenteAvaliado' };
  for (const [lista, kind] of Object.entries(kinds)) {
    if (!(dados[lista] || []).length) continue;
    const existentes = await caseChildren(caseId, kind);
    // o que o usuário excluiu (lixeira) não volta numa nova extração: ex.: vínculo pedido na inicial e fora do despacho
    const excluidos = (await db.records.where('[caseId+kind]').equals([caseId, kind]).toArray()).filter((r) => r.deleted);
    // identidade pelos campos essenciais; o que vier a mais completa o registro existente
    const KS = { periodos: ['empresa', 'inicio', 'fim'], documentos: ['tipo', 'identificacao'], epis: ['descricao', 'ca', 'dataEntrega'], agentesAvaliados: ['nome', 'vinculos'] }[lista];
    const chave = (d) => JSON.stringify(KS.map((k) => (k === 'empresa' ? normTxt(d[k]).slice(0, 30) : String(d[k] ?? '').toLowerCase().replace(/\s+/g, ' ').trim())));
    const vistos = new Map(existentes.map((r) => [chave(r.data), r]));
    // vínculo com o nome da empresa escrito de outro jeito: reconhece pelas datas
    const porDatas = new Map(lista === 'periodos' ? existentes.filter((r) => r.data.inicio).map((r) => [`${r.data.inicio}|${r.data.fim || ''}`, r]) : []);
    // mesma empresa e mesmo início: é o mesmo vínculo com outra data de fim (vínculos sequenciais unidos num só)
    const porInicio = new Map(lista === 'periodos' ? existentes.filter((r) => r.data.inicio).map((r) => [`${normTxt(r.data.empresa).slice(0, 30)}|${r.data.inicio}`, r]) : []);
    // agente com o nome escrito de outro jeito ("n-Pentano" × "n-Pentano (agente de expansão)"): reconhece pelo nome
    // principal (antes do parêntese ou do travessão), quando um só agente do caso tem esse nome
    const base = (n) => normTxt(String(n || '').replace(/\s+[(–-].*$/, ''));
    const contagem = new Map();
    if (lista === 'agentesAvaliados') for (const r of existentes) contagem.set(base(r.data.nome), (contagem.get(base(r.data.nome)) || 0) + 1);
    const porNome = new Map(lista === 'agentesAvaliados' ? existentes.filter((r) => contagem.get(base(r.data.nome)) === 1).map((r) => [base(r.data.nome), r]) : []);
    const chavesExcluidas = new Set(excluidos.map((r) => chave(r.data)));
    const datasExcluidas = new Set(lista === 'periodos' ? excluidos.filter((r) => r.data.inicio).flatMap((r) => [`${r.data.inicio}|${r.data.fim || ''}`, `${normTxt(r.data.empresa).slice(0, 30)}|${r.data.inicio}`]) : []);
    let ordem = existentes.length;
    for (const item of dados[lista]) {
      const ja = vistos.get(chave(item)) || (lista === 'periodos' && item.inicio
        ? porDatas.get(`${item.inicio}|${item.fim || ''}`) || porInicio.get(`${normTxt(item.empresa).slice(0, 30)}|${item.inicio}`) : undefined)
        || (lista === 'agentesAvaliados' && base(item.nome) ? porNome.get(base(item.nome)) : undefined);
      if (!ja && lista === 'periodos' && !criarPeriodos) continue;
      if (!ja && (chavesExcluidas.has(chave(item)) || (lista === 'periodos' && item.inicio
        && (datasExcluidas.has(`${item.inicio}|${item.fim || ''}`) || datasExcluidas.has(`${normTxt(item.empresa).slice(0, 30)}|${item.inicio}`))))) { cont.ignorados = (cont.ignorados || 0) + 1; continue; }
      if (lista === 'agentesAvaliados' && item.excluir) { if (ja) { await softDelete(ja.id); cont.excluidos = (cont.excluidos || 0) + 1; } continue; }
      if (ja) {
        // "substituir": o que vier preenchido corrige o registro existente; senão, só completa o que está vazio
        const novos = Object.fromEntries(Object.entries(item).filter(([k, val]) => String(val ?? '').trim()
          && (substituir ? String(val).trim() !== String(ja.data[k] ?? '').trim() : !String(ja.data[k] ?? '').trim())));
        delete novos.fimAberto;
        if (lista === 'agentesAvaliados') { if (item.tipoPadrao) delete novos.tipo; delete novos.tipoPadrao; delete novos.excluir; delete novos.novoNome; if (item.novoNome && item.novoNome !== ja.data.nome) novos.nome = item.novoNome; }
        // reconhecido pelo nome principal: o nome completo já cadastrado fica
        if (lista === 'agentesAvaliados' && ja.data.nome !== item.nome && !item.novoNome) delete novos.nome;
        // vínculo em aberto ("fim": "atual"): com "substituir", limpa a data de fim antiga
        if (item.fimAberto && substituir && String(ja.data.fim || '').trim()) novos.fim = '';
        if (Object.keys(novos).length) await updateFields(ja.id, novos);
        continue;
      }
      delete item.fimAberto; delete item.tipoPadrao; if (item.novoNome) { item.nome = item.novoNome; delete item.novoNome; }
      vistos.set(chave(item), { data: item });
      ordem += 1;
      await createRecord(kind, caseId, { ...item, ordem });
      cont[lista] += 1;
    }
  }
  // Legendas das fotos: a foto nº N (ordem do app) recebe a legenda, se ainda não tiver (ou com "substituir")
  if ((dados.fotos || []).length) {
    const fotos = await caseChildren(caseId, 'foto');
    for (const { numero, legenda, ...ident } of dados.fotos) {
      const f = fotos[numero - 1];
      if (!f) continue;
      const novos = {};
      if (legenda && (substituir || !String(f.data.legenda || '').trim())) novos.legenda = legenda;
      for (const [k, val] of Object.entries(ident)) if (val && (substituir || !String(f.data[k] || '').trim())) novos[k] = val;
      if (!Object.keys(novos).length) continue;
      await updateFields(f.id, novos);
      cont.fotos += 1;
    }
  }
  // Produtos químicos: uma ficha da FDS por produto, sem duplicar pelo nome comercial
  if ((dados.produtos || []).length) {
    const r = await aplicarFds(caseId, dados.produtos, { substituir });
    cont.produtos = r.novos + r.completados;
  }
  // Quesitos: o mesmo quesito não se repete; a resposta do laudo entra se ainda estiver vazia
  if (dados.quesitos.length) {
    const existentes = await caseChildren(caseId, 'quesito');
    const chaveQ = (d) => normTxt(d.texto).slice(0, 200);
    const mapa = new Map(existentes.map((r) => [chaveQ(r.data), r]));
    // mesmo quesito com o texto levemente diferente: reconhece pela parte e pelo número
    const porNumero = new Map(existentes.filter((r) => String(r.data.numero || '').trim()).map((r) => [`${r.data.origem}|${normTxt(r.data.numero)}`, r]));
    let ordem = existentes.length;
    for (const q of dados.quesitos) {
      const ex = mapa.get(chaveQ(q)) || (String(q.numero || '').trim() ? porNumero.get(`${q.origem}|${normTxt(q.numero)}`) : undefined);
      if (ex) {
        // "refazer pendentes": a resposta antiga com [[pendência]] é trocada pela nova, feita com os dados atuais
        if (q.resposta && (substituir || !String(ex.data.resposta || '').trim() || (refazerPendentes && /\[\[/.test(ex.data.resposta || '')))) { await updateFields(ex.id, { resposta: q.resposta }); cont.respostas += 1; }
        continue;
      }
      ordem += 1;
      const novo = await createRecord('quesito', caseId, { origem: q.origem, numero: q.numero, texto: q.texto, ...(q.resposta ? { resposta: q.resposta } : {}), ordem });
      mapa.set(chaveQ(q), novo);
      cont.quesitos += 1;
      if (q.resposta) cont.respostas += 1;
    }
  }
  // Diligência já realizada: postos e medições do laudo (não duplica pelo nome do posto)
  if ((dados.postos || []).length) {
    const existentes = await caseChildren(caseId, 'posto');
    const porNome = new Map(existentes.map((r) => [normTxt(r.data.nome), r]));
    let ordem = existentes.reduce((m, r) => Math.max(m, r.data.ordem || 0), 0);
    for (const { medicoes, ...p } of dados.postos) {
      let posto = porNome.get(normTxt(p.nome));
      if (!posto) {
        ordem += 1;
        posto = await createRecord('posto', caseId, { ...p, ordem });
        porNome.set(normTxt(p.nome), posto);
        cont.postos += 1;
      } else {
        // posto já existente: completa o vazio ou, com "substituir", corrige o texto
        const novos = Object.fromEntries(Object.entries(p).filter(([k, val]) => k !== 'nome' && String(val ?? '').trim()
          && (substituir ? String(val).trim() !== String(posto.data[k] ?? '').trim() : !String(posto.data[k] ?? '').trim())));
        if (Object.keys(novos).length) { await updateFields(posto.id, novos); cont.postos += 1; }
      }
      const meds = (await caseChildren(caseId, 'medicao')).filter((m) => m.data.postoId === posto.id);
      // equipamento da medição: pela série ou pelo modelo citados; senão, o padrão do agente (dosímetro, AxPro, iTemp)
      const equips = (await db.records.where('kind').equals('equip').toArray()).filter((e) => !e.deleted);
      const equipDe = (m) => {
        const txt = normTxt(`${m.equipamento || ''} ${m.obs || ''}`);
        const pelaSerie = equips.find((e) => e.data.serie && txt.includes(normTxt(e.data.serie)));
        if (pelaSerie) return pelaSerie.id;
        const peloModelo = equips.find((e) => e.data.modelo && txt && txt.includes(normTxt(e.data.modelo)));
        if (peloModelo) return peloModelo.id;
        const alvo = m.agente === 'Ruído' ? /dosemax|dosi/i : /^Calor/.test(m.agente || '') ? /itemp|ibutg/i : /^Vibra/.test(m.agente || '') ? /axpro|vibra/i : null;
        const e = alvo && equips.find((x) => alvo.test(normTxt(`${x.data.modelo} ${x.data.nome}`)));
        return e ? e.id : '';
      };
      const chaveM = (m) => JSON.stringify([m.agente, m.lavg, m.aren, m.tbn, m.valor, m.dataMedicao].map((v) => String(v || '')));
      const vistas = new Set(meds.map((m) => chaveM(m.data)));
      for (const m of medicoes) {
        // nova leitura do mesmo relatório (ou da mesma medição: agente, data e horário de início): atualiza, sem duplicar
        if (atualizarMedicoes) {
          const hora = (x) => String(x || '').slice(0, 5);
          const mesma = meds.find((e) => e.data.agente === m.agente && ((m.relatorio && e.data.relatorio === m.relatorio)
            || (m.horaInicio && hora(e.data.horaInicio) === hora(m.horaInicio) && (!m.dataMedicao || !e.data.dataMedicao || e.data.dataMedicao === m.dataMedicao))));
          if (mesma) {
            const novos = Object.fromEntries(Object.entries(m).filter(([k, val]) => String(val ?? '').trim() && String(val).trim() !== String(mesma.data[k] ?? '').trim()));
            if (!mesma.data.equipamentoId) novos.equipamentoId = equipDe(m);
            if (Object.keys(novos).length) { await updateFields(mesma.id, novos); cont.medicoesAtualizadas = (cont.medicoesAtualizadas || 0) + 1; }
            continue;
          }
        }
        if (vistas.has(chaveM(m))) continue;
        vistas.add(chaveM(m));
        await createRecord('medicao', caseId, { ...m, postoId: posto.id, ...(m.equipamentoId ? {} : { equipamentoId: equipDe(m) }) });
        cont.medicoes += 1;
      }
    }
    // horário da diligência ainda vazio: usa o das medições do laudo
    const { evidenciasDaDiligencia, aplicarEvidencias } = await import('./fotosLaudo.js');
    const atual = await db.records.get(caseId);
    const ev = await evidenciasDaDiligencia(caseId, atual.data.vistoriaData || '');
    const aj = await aplicarEvidencias(atual, ev);
    cont.campos += Object.keys(aj).length;
  }
  return cont;
}

// ======================================================================
// "Levar o caso para o Claude": todo o caso em texto + instrução de redação
// ======================================================================
const REDACAO = {
  laudo: 'Redija o LAUDO PERICIAL completo (perito do juízo), com a estrutura: 1 Identificação e dados da diligência; 2 Objetivo e metodologia; 3 Ambiente e atividades; 4 EPC e EPI; 5 Avaliação dos agentes; 6 Conclusão; 7 Respostas aos quesitos (todos, um a um); 8 Encerramento; Anexo I fotográfico.',
  parecerAT: 'Redija a MANIFESTAÇÃO TÉCNICA / PARECER DO ASSISTENTE TÉCNICO sobre o laudo pericial: síntese do laudo e dos pontos analisados (com quadro), análise por agente, quesitos de esclarecimento e conclusão técnica com requerimentos. Linguagem técnica, sem juridiquês, respeitosa com o perito.',
  ltcat: 'Redija o LTCAT extrajudicial (IN 128/2022, art. 276) e a minuta do PPP por subperíodo: identificação, condições da avaliação, fundamentação, ambiente e profissiografia, avaliação dos agentes, conclusão com síntese do enquadramento, recomendações e encerramento.',
  parPenosidade: 'Redija o PARECER TÉCNICO DE CONDIÇÕES DE TRABALHO E PENOSIDADE (motorista), extrajudicial, para o segurado ou o advogado, no padrão do signatário: quadro de identificação (segurado, atividade, períodos, normas, responsável técnico com ART, finalidade); 1 Objetivo e metodologia (avaliação por similaridade com o banco de paradigmas do signatário, citando processo, vara e data de cada paradigma, sem nome de segurado extrajudicial; critérios de penosidade do IAC nº 5 do TRF4 – veículo, trajetos, cargas e jornadas); 2 Marco legal por período (tempus regit actum: categoria até 28/04/1995; ruído Lavg > 80 dB(A) até 05/03/1997, Lavg > 90 dB(A) até 18/11/2003 e NEN > 85 dB(A) a partir de 19/11/2003; VCI pela ISO 2631-1 até 13/08/2014 e pela NR-15, Anexo 8, a partir de 14/08/2014; EPI: Tema 555 do STF só para o ruído); 3 Um quadro por vínculo (função e veículo, grupo do veículo, carga e trajetos, análise de penosidade com os fatos da entrevista, ruído, vibração, fonte da prova, enquadramento por subperíodo); 4 Matriz sintética de todos os vínculos; 5 Conclusão técnica por vínculo e subperíodo (o enquadramento jurídico é do INSS ou do Juízo; não use "irrefutável", "faz jus" nem adjetivos que a entrevista não traz; após 13/11/2019 não há conversão de tempo especial em comum – EC 103/2019, art. 25, § 2º); limitações (informações do segurado, similaridade); encerramento com local, data, responsável técnico, registro e ART.',
  parprev: 'Redija o PARECER TÉCNICO previdenciário por vínculo: responsabilidade técnica, objeto, identificação, fundamentação legal, metodologia, atividades por vínculo, avaliação técnica por agente, quadro conclusivo, limitações e encerramento.',
  prevent: 'Redija o PARECER TÉCNICO PREVENTIVO para a empresa: objetivo, identificação do caso, documentos analisados, fundamentação, instalações e atividades, análise crítica da documentação de SST, avaliação dos riscos de condenação, recomendações e conclusão.',
  indic: 'Redija a PETIÇÃO de indicação de assistente técnico com documentos a requerer, pedido de avaliações no local e quesitos técnicos objetivos por agente.',
  supl: 'Redija a PETIÇÃO DE RESPOSTA AOS QUESITOS SUPLEMENTARES (perito do juízo, art. 477, § 2º, I, do CPC): referência à decisão e ao laudo; para cada parte, transcrição literal de cada quesito suplementar seguida da resposta técnica, apoiada no laudo e nos registros de campo abaixo (fonte primária da diligência); retificação de erro material ("onde se lê / leia-se") quando houver divergência; ratificação das conclusões; encerramento. Sem juridiquês e sem citar o advogado.',
};

Object.assign(REDACAO, {
  laudoExtra: 'Redija o LAUDO TÉCNICO EXTRAJUDICIAL de caracterização de insalubridade e periculosidade (CLT, arts. 189 a 195; NR-15 e NR-16, na redação vigente), sem endereçamento ao Juízo: 1 Identificação (contratante, empresa, responsável técnico e ART); 2 Objetivo e metodologia; 3 Ambiente e atividades por setor/posto; 4 EPC e EPI (neutralização: item 15.4.1 da NR-15 e NR-6); 5 Avaliação dos agentes por anexo, com quadro conclusivo (agente, anexo, limite, resultado, grau ou periculosidade); 6 Conclusão por setor/função; 7 Recomendações (ordem da NR-1); 8 Encerramento. Linguagem técnica e simples.',
  acidente: 'Redija o LAUDO TÉCNICO DE ACIDENTE DO TRABALHO (perícia judicial ou laudo extrajudicial, conforme o caso): identificação; objetivo e metodologia (inspeção, entrevistas, documentos, análise de causas por árvore de causas ou método equivalente); descrição do local, da máquina/equipamento e da atividade; dinâmica do acidente com as versões de cada parte e as divergências; confronto com as normas aplicáveis em quadro (requisito / situação constatada / atendido?); análise das causas (fatores técnicos, organizacionais e humanos, sem atribuir culpa jurídica); medidas de prevenção existentes e exigíveis; capacitação e EPI; conclusão técnica e respostas aos quesitos, se houver. O nexo com a lesão e a incapacidade é matéria médica: não opine sobre ele.',
  parTrab: 'Redija o PARECER TÉCNICO TRABALHISTA DE VIABILIDADE para o trabalhador ou o advogado, antes da ação: natureza do documento, objeto, identificação e períodos, fundamentação (CLT arts. 189 a 195, NR-15, NR-16), atividades e ambiente, avaliação técnica por agente, viabilidade por pedido (favorável / desfavorável / depende de prova), documentos e provas recomendados, limitações e encerramento. Seja franco sobre os pontos fracos.',
  peticaoAT: 'Redija a PETIÇÃO do assistente técnico escolhida no app (quesitos suplementares, pedido de esclarecimentos ao perito ou manifestação sobre os esclarecimentos): objetiva, técnica, com cada ponto ligado ao item do laudo e à norma aplicável.',
});

export const OPCOES_REDACAO = [
  ['laudo', 'Laudo pericial'], ['parecerAT', 'Parecer de assistente técnico / impugnação'], ['ltcat', 'LTCAT + PPP'],
  ['parprev', 'Parecer técnico previdenciário'], ['parPenosidade', 'Parecer técnico de condições de trabalho e penosidade (motorista)'], ['prevent', 'Parecer preventivo para a empresa'], ['indic', 'Petição de indicação e quesitos'],
  ['supl', 'Resposta aos quesitos suplementares'],
  ['respostas', 'Respostas a todos os quesitos (voltam para o app)'],
];

const INSTR_RESPOSTAS = `Responda a TODOS os quesitos do caso abaixo, como perito, com base exclusiva nos dados do caso (autos, diligência, medições, paradigmas e penosidade) e nos meus critérios técnicos.
- Resposta técnica, direta e conclusiva (art. 473, IV, do CPC), em linguagem simples, citando o item do laudo ou o quadro quando houver.
- Quesito repetido entre as partes: responda uma vez e, nos demais, "Vide resposta ao quesito X do Juízo / da parte autora".
- O que depender de informação que não está no caso: escreva [[pendência: o que falta]].
- Devolva SOMENTE um bloco JSON, sem comentários, no formato:
{"quesitos": [{"origem": "Juízo | Autor / Reclamante | Réu / Reclamada | INSS | Complementares", "numero": "1", "texto": "texto do quesito exatamente como está no caso", "resposta": ""}]}
Eu vou colar esse JSON no app (etapa 1. Autos → B), que preenche as respostas dos quesitos que ainda estão em branco.`;

// Petição fora dos modelos do app, redigida pelo Claude a partir do pedido do usuário e/ou do despacho
export async function promptPeticaoLivre(caseId, pedido = '') {
  const { c, texto } = await textoDoCaso(caseId);
  const perfil = ((await db.records.get('perfil')) || {}).data || {};
  const perito = c.papel === 'Perito do Juízo';
  const quem = perito ? 'perito judicial nomeado nos autos' : c.papel === 'Assistente técnico do autor / reclamante' ? 'assistente técnico da parte autora' : /assistente/i.test(c.papel || '') ? 'assistente técnico da parte ré' : 'signatário';
  const objetivo = String(pedido || '').trim()
    ? `O que a petição precisa pedir ou informar (nas minhas palavras): ${String(pedido).trim()}`
    : 'Não descrevi o pedido: localize nos autos ou no despacho anexado a determinação mais recente dirigida a mim (perito/assistente) – intimação, pedido de esclarecimentos, de manifestação, de documentos, de nova data, de complementação – e redija a petição que a atende.';
  return `Redija uma PETIÇÃO minha (${perfil.nome || 'signatário'}, ${quem}) dirigida ao Juízo, nos autos do caso abaixo.

${objetivo}

REGRAS
- Se houver despacho ou decisão que motive a petição (anexado ou nos autos), identifique-o logo no primeiro parágrafo (evento, data e página) e atenda exatamente ao que foi determinado, item por item, no prazo indicado.
- Base factual: somente os dados do caso, os autos e os anexos. O que faltar, marque [[pendência: o que falta]]. Não invente datas, eventos, valores nem jurisprudência.
- Fundamente nos artigos do CPC pertinentes (ex.: 157, 465, 466, 473, 474, 476, 477, 95) e na norma técnica quando couber, sem juridiquês e sem adjetivos.
- Estrutura: primeiro parágrafo de apresentação ("${perfil.nome || '[[nome]]'}, ${quem} em epígrafe, vem, respeitosamente, à presença de Vossa Excelência, ..."); seções numeradas com "# 1. Título"; pedidos finais em alíneas a), b), c).
- NÃO escreva endereçamento, número do processo, "Nestes termos, pede deferimento", local, data nem assinatura: o app acrescenta no timbrado.
- Primeira linha: "Título: PETIÇÃO – <assunto curto>" (vai só para o nome do arquivo).

${CONVENCOES_CLAUDE}

---
${texto}`;
}

export async function exportarParaClaude(caseId, tipo) {
  const { c, texto } = await textoDoCaso(caseId);
  if (tipo === 'respostasPendentes') {
    const pend = (await caseChildren(caseId, 'quesito')).filter((q) => q.data.suplementar !== 'Sim' && /\[\[/.test(q.data.resposta || ''));
    return `Refaça SOMENTE as respostas dos quesitos abaixo, que ficaram com [[pendência]] porque foram escritas antes de o caso ter todos os dados. Use os dados ATUAIS do caso (medições, relatórios, entrevista, vínculos, veículos) e os meus critérios técnicos.
- Resolva toda pendência cujo dado já está no caso. Mantenha [[pendência: …]] só para o que realmente não está no caso, uma por resposta, curta e específica (ex.: "[[pendência: ano de fabricação do Scania 113 HW]]"), sem repetir a mesma pendência em vários quesitos (use "Vide resposta ao quesito X").
- Certificados de calibração e relatórios dos medidores estão nos apêndices do laudo: cite-os, não peça para anexá-los.
- Resposta técnica, direta e conclusiva (art. 473, IV, do CPC).
- Devolva SOMENTE um bloco JSON: {"quesitos": [{"origem": "", "numero": "", "texto": "texto do quesito exatamente como abaixo", "resposta": ""}]}

QUESITOS A REFAZER (${pend.length}), com a resposta atual:
${pend.map((q) => `- [${q.data.origem || ''} ${q.data.numero || ''}] ${q.data.texto || ''}\n  RESPOSTA ATUAL: ${q.data.resposta}`).join('\n')}

${criteriosPara(c, '', ((await db.records.get('perfil')) || {}).data || {})}

---
${texto}`;
  }
  if (tipo === 'respostas') {
    return `${INSTR_RESPOSTAS}\n\n${criteriosPara(c, '', ((await db.records.get('perfil')) || {}).data || {})}\n\n---\n${texto}`;
  }
  const perfilDoc = ((await db.records.get('perfil')) || {}).data || {};
  const { credencial, registrosCrq } = await import('./docx/base.js');
  const regs = [credencial(perfilDoc), registrosCrq(perfilDoc)].filter(Boolean).join('; ');
  const instr = `${REDACAO[tipo] || REDACAO.laudo}

Use os dados do caso abaixo (coletados por mim nos autos e na diligência) como base factual. Não invente dados: o que faltar, marque como [[pendência]] para eu completar.

${CONVENCOES_CLAUDE}
${regs ? `- Meus registros profissionais, se precisar citá-los: ${regs} (copie exatamente, sem reformatar o número).
` : ''}${tipo === 'ltcat' && perfilDoc.cpf ? `- Meu CPF, para o item 16 do PPP (responsável pelos registros ambientais): ${perfilDoc.cpf}.
` : ''}- Fotos: o app monta o Anexo I com as fotos na ordem da lista "Fotos" do caso, numeradas Foto 1, Foto 2… Cite-as assim ("Anexo I, Foto 3"), conferindo o número pela legenda.
- Coerência: as respostas aos quesitos repetem os mesmos valores, datas, classificações e conclusões do corpo do laudo (confira cada número antes de responder). Classificação da NHO-09 por grandeza: aren e VDVR têm faixas próprias; não atribua a um a faixa do outro.
- Entrevista: o que o segurado relatou sobre os vínculos é relato dele; o representante da empresa similar confirma só as condições da empresa e do veículo avaliado (cargas, rotas e jornada atuais), não o passado do segurado nas empregadoras.
- Datas: a data de emissão do laudo vale para o laudo, para o PPP (item 19) e para o termo de declaração e autorização; não deixe data em branco nem use outra data nesses campos.
- Pendências e documentos a apresentar: seção, item ou quadro próprio só se houver item pendente de fato; sem pendência, não crie a seção nem o quadro (nada de "Nenhuma" ou "Não há documentos pendentes") e não faça remissão a eles.
- Jurisprudência: só o que trata do enquadramento técnico (agente, metodologia, EPI, penosidade, similaridade); temas sobre concessão, DER ou pagamento do benefício ficam fora.

${criteriosPara(c, tipo === 'ltcat' || tipo === 'parprev' || tipo === 'parPenosidade' ? 'extra-ltcat' : '', ((await db.records.get('perfil')) || {}).data || {})}

---
${texto}`;
  return instr;
}

// Revisão da coleta em campo: o Claude confere o que foi registrado (cadastro, entrevista, postos, medições, fotos)
// contra os autos e os quesitos, e diz o que ainda falta coletar antes de sair do local – não redige o laudo
const INSTR_REVISAO_CAMPO = `Sou o perito e estou em campo (diligência em andamento ou recém-terminada). Revise a coleta de informações registrada no app (abaixo) e, se anexados, os autos e os relatórios dos medidores. O objetivo é saber, AINDA NO LOCAL, se falta alguma informação para responder a todos os quesitos e concluir cada vínculo/posto.

REGRAS
- Não invente dados e não redija o laudo. Não conclua o enquadramento: diga apenas se os elementos coletados são suficientes.
- Seja objetivo, em português, com listas curtas e acionáveis. Cite o vínculo, posto, agente ou quesito de cada item.
- Considere as pendências que o app já apontou (lista "Pendências do app") e acrescente as que ele não pegou.
- Perícia judicial: avaliação direta, sem paradigmas, salvo indicação do juízo ou medições de laudos juntados aos autos.

RESPONDA NESTA ORDEM
1. Coletar agora (antes de sair do local) – lista de verificação, do mais importante ao menos importante.
2. Perguntas a fazer (ao segurado, à empresa ou aos acompanhantes), com o motivo de cada uma.
3. Medições – requisitos a conferir (NHO-01: tempo de amostragem representativo da jornada, calibração antes e depois, q e critério; NHO-09: eixo dominante, posição, tempo de exposição; certificados de calibração dentro do prazo; outros agentes conforme a NHO aplicável).
4. Inconsistências entre os autos, a entrevista, as medições e o cadastro (datas, funções, setores, produtos, EPI).
5. Quesitos ainda sem elementos para resposta (número e o que falta).
6. Fotos que faltam (agentes, EPC/EPI, máquinas, produtos e rótulos, local).
7. Avaliação geral da coleta: para cada vínculo/posto, "suficiente" ou "insuficiente", em uma linha, com o motivo.`;

export async function promptRevisaoCampo(caseId, pendencias = []) {
  const { c, texto } = await textoDoCaso(caseId);
  const pend = pendencias.length ? pendencias.map((p) => `- ${p.grupo ? `${p.grupo}: ` : ''}${p.titulo}${p.explicacao ? ` – ${p.explicacao}` : ''}`).join('\n') : '- nenhuma';
  return `${INSTR_REVISAO_CAMPO}

${criteriosPara(c, '', ((await db.records.get('perfil')) || {}).data || {})}

---
## Pendências do app
${pend}

${texto}`;
}

// Todo o caso em texto (markdown), para levar ao Claude
export async function textoDoCaso(caseId) {
  const caso = await db.records.get(caseId);
  const c = caso.data;
  const [quesitos, periodos, documentos, epis, postos, medicoesTodas, fotos] = await Promise.all(
    ['quesito', 'periodo', 'documento', 'epi', 'posto', 'medicao', 'foto'].map((k) => caseChildren(caseId, k)));
  // medição aberta e não preenchida não vai para o Claude (confundiria qual é a medição do posto)
  const medicoes = medicoesTodas.filter((m) => ['lavg', 'nen', 'dose', 'aren', 'vdv', 'tbn', 'tg', 'ibutgLido', 'valor'].some((k) => String(m.data[k] ?? '').trim()));
  const equip = (await db.records.where('kind').equals('equip').toArray()).filter((e) => !e.deleted);
  const eq = new Map(equip.map((e) => [e.id, e.data]));
  const nomePosto = new Map(postos.map((p) => [p.id, p.data.nome]));
  const L = [];
  const campo = (rot, val) => { if (val && String(val).trim()) L.push(`- **${rot}:** ${String(val).trim().replace(/\n/g, '\n  ')}`); };
  L.push(`# Caso: ${c.autorNome || ''} × ${c.reuNome || ''}`);
  L.push('\n## Identificação');
  for (const [k, r] of [['tipoAtuacao', 'Tipo'], ['papel', 'Minha atuação'], ['justica', 'Justiça'], ['materia', 'Matéria'], ['numero', 'Processo'], ['juizo', 'Juízo'], ['comarca', 'Comarca'],
    ['dataAjuizamento', 'Ajuizamento'], ['peritoJuizo', 'Perito do Juízo'], ['refLaudo', 'Laudo analisado'], ['autorNome', 'Autor / segurado'], ['autorCpf', 'CPF / NIT'],
    ['reuNome', 'Réu / empresa'], ['reuCnpj', 'CNPJ']]) campo(r, c[k]);
  campo('Objeto', (c.objeto || []).join(', '));
  // ART escolhida (Configurações → ARTs): o número sai no documento; o PDF o app anexa
  const artCad = c.artId ? await db.records.get(c.artId) : null;
  campo('ART deste documento', artCad && !artCad.deleted ? `nº ${artCad.data.numero || '?'}${artCad.data.conselho ? ` (${artCad.data.conselho})` : ''} – ${artCad.data.finalidade || ''} (o PDF o app anexa; não liste)` : c.art);
  L.push('\n## Síntese dos autos');
  for (const [k, r] of [['funcoes', 'Funções e períodos'], ['atividadesAlegadas', 'Atividades alegadas'], ['agentesAlegados', 'Agentes alegados'], ['pedidos', 'Pedidos'],
    ['defesa', 'Defesa'], ['preliminares', 'Pontos de atenção'], ['analiseEpi', 'Análise dos EPIs'], ['observacoes', 'Observações'], ['conclusaoLaudo', 'Conclusão do laudo já apresentado']]) campo(r, c[k]);
  if (CAMPOS_ACIDENTE.some(([k]) => String(c[k] || '').trim())) {
    L.push('\n## Acidente do trabalho');
    for (const [k, r] of CAMPOS_ACIDENTE) campo(r, c[k]);
  }
  if (periodos.length) { L.push('\n## Períodos'); periodos.forEach((p) => L.push(`- ${p.data.empresa || ''} (${p.data.cnpj || ''}) – ${p.data.inicio || '?'} a ${p.data.fim || 'atual'} – ${p.data.cargo || ''} / ${p.data.setor || ''}. Atividades: ${p.data.atividades || ''}. Agentes: ${p.data.agentes || ''}. Fonte: ${p.data.fonte || ''}${['veiculoTipo', 'veiculoMarca', 'veiculoModelo', 'veiculoAno', 'conducaoH', 'conducaoBase', 'soPenosidadeDesde', 'veiculoDepois', 'tipoTransporte', 'jornadaSemanal', 'pausas', 'noturnoPernoite', 'cargaDescarga', 'vias', 'cabine', 'riscoAcidente', 'pressao', 'fisiologicas', 'penosidadeResultado', 'penosidadeConclusao', 'grupoVeiculo', 'carroceria', 'tipoCarga', 'carregaDescarrega', 'abastecimento', 'acidenteVinculo', 'assaltoVinculo', 'cambio', 'segundoMotorista', 'lavagemManutencao', 'tanqueSuplementar', 'inflamaveis'].filter((k) => p.data[k]).map((k) => `. ${k}: ${p.data[k]}`).join('')}`)); }
  // regras do caso e o que o app já adota por vínculo (tempo de condução, conclusão da penosidade): o Claude usa o mesmo
  if (periodos.length) {
    const [{ carregar }, pen, { capitalizarCidades }] = await Promise.all([import('./docx/base.js'), import('./docx/penosidade.js'), import('./cidades.js')]);
    const dados = await carregar(caseId);
    const vincs = pen.vinculosMotorista(dados);
    if (vincs.length) {
      L.push('\n## Regras do caso e valores adotados por vínculo (use exatamente estes)');
      if (String(c.foraDirecaoH || '').trim()) L.push(`- Regra do caso – horas por dia fora da direção (carga, descarga, paradas): ${c.foraDirecaoH}`);
      if (String(c.conducaoPadraoH || '').trim()) L.push(`- Condução padrão para vínculos sem jornada na entrevista: ${c.conducaoPadraoH} h/dia`);
      for (const r of vincs) {
        const tc = pen.tempoConducao(r, dados);
        const esc = String(r.data.penosidadeResultado || '');
        const { contradizResultado } = await import('./pendencias.js');
        const { soSimNao } = await import('./docx/penosidade.js');
        const proprio = contradizResultado(esc, r.data.penosidadeConclusao) || soSimNao(r.data.penosidadeConclusao) ? '' : String(r.data.penosidadeConclusao || '').trim();
        const conc = proprio || (/^(sim|n[ãa]o)/i.test(esc) ? pen.textoPadraoPenosidade(/^sim/i.test(esc), dados.perfil) : '');
        L.push(`- ${r.data.empresa || 'Vínculo'} (${r.data.inicio || '?'} a ${r.data.fim || 'atual'}): tempo diário de condução ${isFinite(tc.T) ? `${String(tc.T).replace('.', ',')} h${tc.base ? ` (${tc.base})` : ''}` : '[[pendente]]'}`
          + `${r.data.vias ? `; trajetos: ${capitalizarCidades(r.data.vias)}` : ''}${conc ? `; conclusão da penosidade adotada: "${conc}"` : '; conclusão da penosidade: [[escolher Sim ou Não]]'}`);
      }
    }
  }
  const comPar = periodos.filter((p) => p.data.paradigmaRuido || p.data.paradigmaVibracao || p.data.veiculoModelo || p.data.soPenosidadeDesde);
  if (comPar.length) {
    const pars = new Map((await db.records.where('kind').equals('paradigma').toArray()).filter((r) => !r.deleted).map((r) => [r.data.codigo, r.data]));
    const caso = await db.records.get(caseId);
    L.push(caso?.data?.somenteMedicoesAutos ? '\n## Veículos do requerente e paradigmas (SOMENTE medições dos laudos de outros peritos juntados aos autos – prova emprestada; não cite o banco do signatário)' : '\n## Veículos do requerente e paradigmas (banco do signatário)');
    L.push('Normalização: NEN = Lavg + 16,61·log(T/8); aren(T) = arep·√(T/8); VDVR(T) = VDVR·(T/Tlaudo)^0,25. Até 18/11/2003 compara-se o Lavg; depois, o NEN para a jornada efetiva. Fonte extrajudicial é citada sem nome do segurado.');
    comPar.forEach((p) => {
      const x = p.data;
      L.push(`- ${x.empresa || ''} (${x.inicio || '?'} a ${x.fim || 'atual'}): veículo ${[x.veiculoTipo, x.veiculoMarca, x.veiculoModelo, x.veiculoAno].filter(Boolean).join(' ') || '?'}; condução ${x.conducaoH || '?'} h (${x.conducaoBase || 'base não informada'})${x.soPenosidadeDesde ? `; A PARTIR DE ${x.soPenosidadeDesde}: ${x.veiculoDepois || 'outro veículo'}, sem similar medido – ruído e vibração NÃO avaliados nesse trecho (sem pendência), somente a penosidade` : ''}`);
      for (const [rot, cod] of [['ruído', x.paradigmaRuido], ['vibração', x.paradigmaVibracao]]) {
        if (!cod) continue;
        const q = pars.get(cod);
        L.push(q ? `  - Paradigma de ${rot} ${cod}: ${q.marca} ${q.modelo} ${q.ano || ''} (família ${q.familia || '?'}); Lavg ${q.lavg || '–'} dB(A); arep ${q.arep || '–'}; VDVR ${q.vdvrLaudo || '–'}; jornada do laudo ${q.jornadaLaudo || '?'} h; fonte: ${citacaoDe(q) || '?'}; instrumentos: ${[q.ruidoEquip && `${q.ruidoEquip} SN ${q.ruidoSerie || '?'} cert. ${q.ruidoCertData || '?'}`, q.vibEquip && `${q.vibEquip} SN ${q.vibSerie || '?'} cert. ${q.vibCertData || '?'}`].filter(Boolean).join('; ') || '?'}`
          : `  - Paradigma de ${rot} ${cod}: não encontrado no banco`);
      }
    });
  }
  if (documentos.length) { L.push('\n## Documentos analisados'); documentos.forEach((d) => L.push(`- ${d.data.tipo || ''} ${d.data.identificacao || ''}: ${d.data.analise || ''}`)); }
  const agentesAv = await caseChildren(caseId, 'agenteAvaliado');
  if (agentesAv.length) { L.push('\n## Agentes avaliados (sem medição)'); agentesAv.forEach((a) => L.push(`- [${a.data.tipo || ''}] ${a.data.nome || ''}${a.data.vinculos ? ` (vínculos ${a.data.vinculos})` : ''}: até 05/03/1997 ${a.data.resAte97 || '?'}${a.data.codAte97 ? ` (cód. ${a.data.codAte97})` : ''}; a partir de 06/03/1997 ${a.data.resDesde97 || '?'}${a.data.codDesde97 ? ` (cód. ${a.data.codDesde97})` : ''}${a.data.fundamentacao ? ` – ${a.data.fundamentacao}` : ''}`)); }
  const produtosFds = await caseChildren(caseId, 'fds');
  if (produtosFds.length) {
    L.push('\n## Produtos químicos – fichas das FDS (o app imprime uma ficha por produto; não repita a ficha no texto)');
    produtosFds.forEach((p) => L.push(`- ${p.data.nome || ''}${p.data.fabricante ? ` (${p.data.fabricante})` : ''}${p.data.revisao ? `, FDS ${p.data.revisao}` : ''}${p.data.fonteFds ? `, ${p.data.fonteFds}` : ''}; componentes: ${String(p.data.s3Componentes || '?').replace(/\n/g, ' | ')}; perigos: ${String(p.data.s2FrasesH || p.data.s2Classificacao || '?').replace(/\n/g, ' | ')}`));
  }
  if (epis.length) { L.push('\n## EPIs'); epis.forEach((e) => L.push(`- ${e.data.descricao || ''} – CA ${e.data.ca || '?'} – ${e.data.dataEntrega || ''} ${e.data.obs || ''}`)); }
  L.push('\n## Diligência');
  for (const [k, r] of [['vistoriaProprietario', 'Proprietário (pessoa física)'], ['vistoriaVeiculo', 'Veículo paradigma'], ['vistoriaIntimacao', 'Comunicação às partes'], ['vistoriaNotas', 'Anotações gerais']]) campo(r, c[k]);
  // uma seção por vistoria (1ª, 2ª…), com o que foi feito e a transcrição do ditado
  const vists = vistoriasDoCaso(c);
  for (const vi of vists) {
    if (vists.length > 1) L.push(`\n### ${vi.rotulo}`);
    campo('Data', vi.data); campo('Início', vi.inicio); campo('Término', vi.fim); campo('Local', vi.local); campo('Endereço', vi.endereco); campo('GPS', vi.gps);
    campo('O que foi feito nesta vistoria', vi.objetivo); campo('Presentes', vi.presentes); campo('Condições do dia', vi.condicoes);
    campo('Transcrição do ditado (revisar)', vi.transcricao);
  }
  const usados = equip.filter((e) => (c.equipamentos || []).includes(e.id) || medicoes.some((m) => m.data.equipamentoId === e.id));
  if (usados.length) { L.push('\n## Equipamentos'); usados.forEach((e) => L.push(`- ${e.data.nome} ${e.data.fabricante || ''} ${e.data.modelo || ''}, série ${e.data.serie || '?'}, certificado ${e.data.certificado || '?'} (${e.data.laboratorio || ''}), calibrado em ${e.data.dataCalibracao || '?'}`)); }
  if (postos.length) {
    L.push('\n## Postos avaliados');
    postos.forEach((p) => {
      L.push(`\n### ${p.data.nome || 'Posto'}`);
      for (const [k, r] of [['descricao', 'Atividade observada'], ['placa', 'Placa do veículo avaliado'], ['veiculoAvaliado', 'Veículo avaliado (marca, modelo, ano e fonte)'], ['infoTrabalhador', 'Informações do trabalhador'], ['infoEmpresa', 'Informações da empresa'],
        ['agentes', 'Agentes'], ['jornada', 'Jornada'], ['epc', 'EPC'], ['epi', 'EPI']]) campo(r, p.data[k]);
      // vínculos que o posto (veículo medido) representa: é o que liga a medição a cada período
      const vs = periodos.filter((r) => (p.data.vinculos || []).includes(r.id));
      if (vs.length) campo('Representa os vínculos (similaridade definida pelo perito)', vs.map((r) => `${r.data.empresa || ''} (${r.data.inicio || ''} a ${r.data.fim || 'atual'})${r.data.soPenosidadeDesde ? ` – só até ${r.data.soPenosidadeDesde} (exclusive); depois, ${r.data.veiculoDepois || 'outro veículo'} sem similar medido: somente penosidade` : ''}`).join('; '));
    });
  }
  // resultado que o app calcula por vínculo e subperíodo (o mesmo do laudo): o Claude usa estes números
  try {
    const { carregar } = await import('./docx/base.js');
    const { avaliarPeriodos } = await import('./docx/conclusao.js');
    const dadosApp = await carregar(caseId);
    const av = avaliarPeriodos(dadosApp);
    const linhas = [];
    av.forEach(({ segs }, i) => {
      const r = dadosApp.periodos[i];
      for (const s of segs || []) {
        const fis = (s.itens || []).filter((it) => !it.categoria && !it.agente).map((it) => it.t);
        if (fis.length) linhas.push(`- ${r.data.empresa || ''}, ${s.ini} a ${s.fim}: ${fis.join('; ')}`);
      }
    });
    if (linhas.length) L.push(`\n## Resultado calculado pelo app por vínculo (use estes números; não são pendência)\n${linhas.join('\n')}`);
  } catch { /* sem dados suficientes para o cálculo */ }
  if (medicoes.length) {
    L.push('\n## Medições');
    medicoes.forEach((m) => L.push(`- [${m.data.agente}] posto: ${nomePosto.get(m.data.postoId) || 'geral'}; equipamento: ${eq.get(m.data.equipamentoId)?.modelo || '?'}; ${resumoMedicao(m, contextoLegal(c))}${m.data.obs ? `; obs.: ${m.data.obs}` : ''}`));
  }
  // instrumentos usados, com o certificado (os PDFs anexados saem como apêndices do laudo)
  const idsEq = new Set([...(c.equipamentos || []), ...medicoes.map((m) => m.data.equipamentoId).filter(Boolean)]);
  const usadosEq = equip.filter((e) => idsEq.has(e.id));
  if (usadosEq.length) {
    L.push('\n## Instrumentos utilizados (validade adotada: até 24 meses da calibração)');
    usadosEq.forEach((e) => L.push(`- ${e.data.nome} ${e.data.fabricante || ''} ${e.data.modelo || ''}, série ${e.data.serie || '?'}; certificado ${e.data.certificado || '?'}${e.data.laboratorio ? ` (${e.data.laboratorio})` : ''}, calibrado em ${e.data.dataCalibracao || '?'}${e.data.certificadoAnexoId ? '; PDF do certificado anexado como apêndice' : ''}`));
  }
  const qIni = quesitos.filter((q) => !ehSuplementar(q)), qSup = quesitos.filter(ehSuplementar);
  if (qIni.length) {
    L.push('\n## Quesitos (texto literal) e anotações de campo');
    qIni.forEach((q) => L.push(`- [${q.data.origem || ''} ${q.data.numero || ''}] ${q.data.texto || ''}${q.data.resposta ? `\n  ANOTAÇÃO: ${q.data.resposta}` : ''}`));
  }
  if (qSup.length || c.laudoRefPerito || c.esclDecisaoRef) {
    L.push('\n## Depois do laudo – quesitos suplementares e esclarecimentos');
    for (const [k, r] of [['laudoRefPerito', 'Laudo apresentado'], ['laudoData', 'Juntada do laudo'], ['esclDecisaoRef', 'Decisão que determinou a resposta'],
      ['prazoEsclarecimentos', 'Prazo'], ['esclRetificacoes', 'Retificações já identificadas'], ['esclObservacoes', 'Considerações']]) campo(r, c[k]);
    qSup.forEach((q) => L.push(`- [SUPLEMENTAR – ${q.data.origem || ''} ${q.data.numero || ''}${q.data.refPeticao ? ` – ${q.data.refPeticao}` : ''}] ${q.data.texto || ''}${q.data.resposta ? `\n  RESPOSTA / ANOTAÇÃO: ${q.data.resposta}` : ''}`));
  }
  if (fotos.length) { L.push('\n## Fotos registradas'); fotos.forEach((f, i) => L.push(`- Foto ${i + 1}: ${f.data.legenda || '(sem legenda)'}${f.data.postoId ? ` – posto ${nomePosto.get(f.data.postoId) || ''}` : ''}${f.data.identificacao ? ` – identificação (${f.data.identSituacao === 'Conferido' ? 'conferida' : 'a conferir'}): ${f.data.identificacao}` : ''}`)); }

  return { c, texto: L.join('\n') };
}

// ======================================================================
// Quesitos suplementares (depois do laudo): instrução, leitura e aplicação
// ======================================================================
const FOCO_SUPL = `Sou o PERITO DO JUÍZO neste processo e já apresentei o laudo. O Juízo determinou que eu responda a quesitos suplementares e/ou esclareça pontos do laudo (art. 477, § 2º, I, do CPC). Vou anexar a petição com os quesitos suplementares, a decisão que determinou a resposta e o meu laudo (ou o PDF do processo inteiro).

TAREFA
1. Transcreva NA ÍNTEGRA, palavra por palavra, cada quesito suplementar e cada pedido de esclarecimento dirigido ao perito, com as alíneas a), b)... dentro do mesmo quesito, a origem, o número e o mov./evento da petição. Pontos levantados pelo próprio juiz na decisão e que não constem da petição entram com origem "Juízo".
2. Redija a minuta da RESPOSTA de cada um, em linguagem técnica, objetiva, impessoal ("este Perito"), sem juridiquês e sem citar advogados. Responda alínea por alínea quando houver. Indique o item do laudo a que a resposta remete.
3. Os REGISTROS DO APP abaixo (diligência: data, início, término, local, endereço, GPS, presentes; postos, medições e equipamentos) foram feitos por mim em campo e são a fonte primária sobre a diligência. Havendo divergência entre o laudo e esses registros, a resposta segue os registros e a divergência vai em "retificacoes", como erro material: onde se lê X, leia-se Y, com a localização no laudo (item, quadro ou resposta).
4. Não invente: o que não constar do laudo nem dos registros fica como [[confirmar: ...]] para eu completar.
5. Quesito que pede conclusão jurídica ou extrapola o objeto da perícia: registre que a matéria cabe ao Juízo e preste a informação técnica disponível.
6. Mantenha as conclusões do laudo; só se os dados demonstrarem erro técnico, explique em "observacoes" e use "ratifica": "Não".`;

const FORMATO_SUPL = `FORMATO DA RESPOSTA
Responda SOMENTE com um bloco JSON válido, sem texto antes ou depois:
{
  "esclarecimentos": {"laudoRefPerito": "mov./evento do laudo", "laudoData": "AAAA-MM-DD", "esclDecisaoRef": "ex.: decisão do mov. 71.1", "prazoEsclarecimentos": "AAAA-MM-DD só se a data final constar dos autos", "retificacoes": "uma por linha", "observacoes": "", "ratifica": "Sim"},
  "quesitos": [{"origem": "Juízo | Autor / Reclamante | Réu / Reclamada | INSS", "numero": "1", "refPeticao": "mov. 67.1", "texto": "transcrição literal", "resposta": "minuta da resposta"}]
}`;

export async function montarPromptSuplementares(caseId) {
  const { c, texto } = await textoDoCaso(caseId);
  return [FOCO_SUPL, criteriosPara(c, '', ((await db.records.get('perfil')) || {}).data || {}), FORMATO_SUPL, `---\nREGISTROS DO APP\n${texto}`].join('\n\n');
}

const CAMPOS_SUPL = { laudoRefPerito: 'laudoRefPerito', laudoData: 'laudoData', esclDecisaoRef: 'esclDecisaoRef', prazoEsclarecimentos: 'prazoEsclarecimentos',
  retificacoes: 'esclRetificacoes', observacoes: 'esclObservacoes', ratifica: 'esclRatifica' };

export function lerJsonSuplementares(texto) {
  let t = String(texto || '').trim();
  const bloco = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (bloco) t = bloco[1];
  const ini = t.indexOf('{'), fim = t.lastIndexOf('}');
  if (ini < 0 || fim < ini) throw new Error('Não encontrei um JSON no texto colado.');
  const obj = JSON.parse(t.slice(ini, fim + 1));
  const s = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const e = obj.esclarecimentos || {};
  const caso = {};
  for (const [de, para] of Object.entries(CAMPOS_SUPL)) {
    let v = s(e[de]);
    if (para === 'esclRatifica') v = /^n/i.test(v) ? 'Não' : v ? 'Sim' : '';
    if ((para === 'laudoData' || para === 'prazoEsclarecimentos') && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) v = '';
    if (v) caso[para] = v;
  }
  const origem = origemQuesito;
  const quesitos = (Array.isArray(obj.quesitos) ? obj.quesitos : []).filter((x) => x && typeof x === 'object')
    .map((x) => ({ origem: origem(x.origem), numero: s(x.numero), refPeticao: s(x.refPeticao), texto: s(x.texto), resposta: s(x.resposta) }))
    .filter((q) => q.texto);
  return { caso, quesitos };
}

const normTxt = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const semAc = (t) => normTxt(String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

// Cria os quesitos suplementares (sem duplicar) e preenche as respostas vazias.
export async function aplicarSuplementares(caseId, dados, { substituir = false } = {}) {
  const caso = await db.records.get(caseId);
  const mudancas = {};
  for (const [k, v] of Object.entries(dados.caso)) if (substituir || !String(caso.data[k] || '').trim()) mudancas[k] = v;
  if (!['Concluído', 'Arquivado', 'Respondendo quesitos suplementares'].includes(caso.data.fase) && dados.quesitos.length) mudancas.fase = 'Respondendo quesitos suplementares';
  if (Object.keys(mudancas).length) await updateFields(caseId, mudancas);
  const existentes = (await caseChildren(caseId, 'quesito'));
  const porTexto = new Map(existentes.filter(ehSuplementar).map((r) => [normTxt(r.data.texto), r]));
  let ordem = existentes.reduce((m, r) => Math.max(m, r.data.ordem || 0), 0);
  const cont = { campos: Object.keys(mudancas).filter((k) => k !== 'fase').length, novos: 0, respostas: 0 };
  for (const q of dados.quesitos) {
    const ja = porTexto.get(normTxt(q.texto));
    if (ja) {
      const upd = {};
      if (q.resposta && (substituir || !String(ja.data.resposta || '').trim())) upd.resposta = q.resposta;
      if (q.refPeticao && !ja.data.refPeticao) upd.refPeticao = q.refPeticao;
      if (Object.keys(upd).length) { await updateFields(ja.id, upd); if (upd.resposta) cont.respostas += 1; }
      continue;
    }
    ordem += 1;
    const r = await createRecord('quesito', caseId, { ...q, suplementar: 'Sim', ordem });
    porTexto.set(normTxt(q.texto), r);
    cont.novos += 1;
    if (q.resposta) cont.respostas += 1;
  }
  return cont;
}

// Remove (para a lixeira) vínculos, medições e postos repetidos por extrações seguidas,
// completando o registro mantido com o que só o repetido tinha.
export async function limparDuplicados(caseId, { aplicar = false } = {}) {
  const { softDelete } = await import('./db.js');
  const nt = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const vz = (x) => !String(x ?? '').trim();
  const res = { periodos: 0, medicoes: 0, postos: 0 };
  const grupo = async (lista, chave, maisRecente, rot) => {
    const mapa = new Map();
    const ord = [...lista].sort((a, b) => (maisRecente ? -1 : 1) * (a.createdAt - b.createdAt));
    for (const r of ord) {
      const k = JSON.stringify(chave(r.data));
      const ja = mapa.get(k);
      if (!ja) { mapa.set(k, r); continue; }
      res[rot] += 1;
      if (aplicar) {
        const novos = Object.fromEntries(Object.entries(r.data).filter(([c, val]) => !vz(val) && vz(ja.data[c]) && c !== 'postoId'));
        if (Object.keys(novos).length) { await updateFields(ja.id, novos); Object.assign(ja.data, novos); }
        await softDelete(r.id);
      }
    }
    return [...mapa.values()];
  };
  await grupo(await caseChildren(caseId, 'periodo'), (x) => [nt(x.empresa).slice(0, 30), x.inicio || '', x.fim || ''], false, 'periodos');
  const meds = await grupo(await caseChildren(caseId, 'medicao'), (x) => [x.agente, x.lavg, x.dose, x.aren, x.vdv, x.tbn, x.valor, x.dataMedicao, x.horaInicio].map((v) => String(v ?? '')), true, 'medicoes');
  const comMed = new Set(meds.map((m) => m.data.postoId));
  const postos = await caseChildren(caseId, 'posto');
  const chaveP = (x) => nt(x.nome).split(' ').slice(0, 2).join(' ');
  for (const ps of postos) {
    if (comMed.has(ps.id)) continue;
    const irmao = postos.find((o) => o !== ps && comMed.has(o.id) && chaveP(o.data) === chaveP(ps.data));
    if (!irmao) continue;
    res.postos += 1;
    if (aplicar) {
      const novos = Object.fromEntries(Object.entries(ps.data).filter(([c, val]) => !vz(val) && vz(irmao.data[c]) && c !== 'ordem'));
      if (Object.keys(novos).length) await updateFields(irmao.id, novos);
      // fotos do posto repetido passam para o posto mantido
      for (const f of (await caseChildren(caseId, 'foto')).filter((f) => f.data.postoId === ps.id)) await updateFields(f.id, { postoId: irmao.id });
      await softDelete(ps.id);
    }
  }
  return res;
}
