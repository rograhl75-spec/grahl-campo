import { db, createRecord, updateFields, caseChildren } from './db.js';
import { ORIGEM_QUESITO, contextoLegal, ehSuplementar, FASE, CAMPOS_DILIGENCIA, CAMPOS_POSTO, AGENTES_MEDICAO } from './schema.js';
import { resumoMedicao } from './medicoes.js';

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
- Equipamentos do signatário: dosímetro Inlite DoseMax V2, medidor de IBUTG Inlite iTemp, medidor de vibração Inlite AxPro, calibrador acústico Inlite CalPro.`;

export const CRITERIOS_TRAB = `FINALIDADE TRABALHISTA (insalubridade / periculosidade – CLT arts. 189 a 195, NR-15 e NR-16; para servidor estatutário, a lei do ente, que em regra remete à NR-15/NR-16 – cite a lei local)
- Use SOMENTE a legislação trabalhista, na redação vigente em cada período analisado (período imprescrito: ajuizamento – 5 anos). NÃO use decretos previdenciários, códigos do Anexo IV, IN INSS, PPP/LTCAT como critério de enquadramento, nem NEN.
- Ruído: NR-15, Anexo 1 – limite de 85 dB(A) para 8 h, q = 5; caracteriza com dose diária acima de 100%. Neutralização pelo protetor (item 15.4.1, "b", da NR-15 e NR-6: CA válido, NRRsf, fichas de entrega, troca, treinamento).
- Calor: NR-15, Anexo 3 – até 10/12/2019 redação original (IBUTG; taxa metabólica entre linhas do quadro → linha imediatamente superior, sem interpolar); a partir de 11/12/2019, Portaria SEPRT 1.359/2019 (NHO-06, IBUTG ajustado pela vestimenta); calor a céu aberto sem fonte artificial depois de 11/12/2019 não caracteriza.
- Vibração: NR-15, Anexo 8 – a partir de 13/08/2014 (Portaria MTE 1.297/2014, NHO-09/10); antes, redação original.
- Químicos: Anexo 11 (quantitativo; jornada > 48 h: correção do limite por Brief & Scala), Anexo 13 (qualitativo); álcali cáustico: referência pH 11,5 (NBR 14725:2023).
- Biológicos: NR-15, Anexo 14; área de isolamento: adequação mês a mês – havendo no mês frequência intermitente na área de isolamento, grau máximo naquele mês.
- Periculosidade: NR-16, anexos escritos em algarismos romanos; troca de cilindro de GLP de empilhadeira não está listada no Anexo II (enquadramento só por jurisprudência, que fica apenas registrada).`;

export const CRITERIOS_PREV = `FINALIDADE PREVIDENCIÁRIA (tempo especial – Lei 8.213/1991, Decretos 53.831/1964, 83.080/1979, 2.172/1997 e 3.048/1999, IN PRES/INSS 128/2022)
- Use a legislação previdenciária vigente À ÉPOCA de cada período (tempus regit actum). A NR-15 entra apenas como referência técnica de limites quando o decreto do período a ela remete. NÃO use conceitos trabalhistas como critério: grau de insalubridade, adicional, período imprescrito, neutralização da NR-15, Súmulas do TST.
- Ruído: q = 5 sempre. Até 05/03/1997: Lavg > 80 dB(A) (cód. 1.1.6 do Decreto 53.831/64). De 06/03/1997 a 18/11/2003: Lavg > 90 dB(A) (cód. 2.0.1) – a legislação remetia ao Anexo 1 da NR-15 na íntegra, compara-se o Lavg. A partir de 19/11/2003: somente o NEN > 85 dB(A), calculado conforme a jornada com q = 5. TWA não é usado. EPI não descaracteriza o ruído (STF, Tema 555).
- Calor: até 05/03/1997, cód. 1.1.1 do Decreto 53.831/64 (fonte artificial, TE acima de 28 °C); depois, cód. 2.0.4 do Decreto 3.048/99 com os limites do Anexo 3 da NR-15 na redação do período (original até 10/12/2019; Portaria SEPRT 1.359/2019 depois). O Decreto 3.048/99 prevalece sobre a IN INSS mais restritiva (hierarquia normativa). IBUTG ajustado pela vestimenta (NHO-06).
- Vibração: até 05/03/1997, cód. 1.1.5 do Decreto 53.831/64 (perfuratrizes e marteletes); de 06/03/1997 a 12/08/2014, cód. 2.0.2 – fora de perfuratriz/martelete, apresentar as duas leituras, inclusive pela ISO (VCI: fronteira superior da zona de cautela da ISO 2631-1; VMB: 5 m/s², Diretiva 2002/44/CE); a partir de 13/08/2014, limites do Anexo 8 da NR-15.
- Agentes biológicos: não usar o Anexo 14 da NR-15; somente o rol de atividades do cód. 3.0.1 do Anexo IV do Decreto 3.048/99.
- Óleos minerais / diesel: citar somente o cód. 1.0.17 do Anexo IV.
- Medidas de controle: EPC (art. 290) e EPI somente a partir de 03/12/1998, com os requisitos cumulativos do art. 291 da IN 128/2022.
- Marcos: 28/04/1995 (fim do enquadramento por categoria), 05/03/1997, 03/12/1998, 18/11/2003, 13/08/2014, 13/11/2019 (EC 103/2019).
- Datas de vínculo: a CTPS prevalece sobre o CNIS. PPP: código GFIP 04 quando houver enquadramento; o PPP em papel vai só até a entrada do eSocial (SST). Laudo de outro segurado usado como paradigma: não citar o nome desse segurado.`;

export function criteriosPara(c = {}, situacaoId = '') {
  const prev = situacaoId === 'perito-prev' || situacaoId === 'extra-ltcat' || contextoLegal(c).prev === true;
  return [CRITERIOS_GERAIS, prev ? CRITERIOS_PREV : CRITERIOS_TRAB].join('\n\n');
}

// compatibilidade
export const CRITERIOS = [CRITERIOS_GERAIS, CRITERIOS_TRAB, CRITERIOS_PREV].join('\n\n');

const REGRAS_EXTRACAO = `REGRAS DE EXTRAÇÃO
1. Fidelidade aos autos: extraia apenas o que está nos documentos. Não invente, não deduza, não presuma. O que não estiver nos documentos fica vazio ("").
2. Cite sempre a localização (ID, mov., fls. ou página do PDF) dos dados relevantes.
3. Quesitos: TRANSCREVA TODOS NA ÍNTEGRA, palavra por palavra, um item por quesito, com origem e número.
4. EPIs: liste cada item das fichas (descrição, CA, data de entrega, observações sobre periodicidade, assinatura e validade do CA).
5. Datas no formato AAAA-MM-DD. Não inclua nomes de advogados.
6. PROCESSO EM ANDAMENTO: se os autos já contêm laudo pericial, parecer, registro ou ata de diligência, preencha também "andamento", "diligencia", "postos" (com as medições de cada posto) e, em cada quesito, a "resposta" dada no laudo, transcrita fielmente (sem resumir). Se não houver laudo nem diligência, deixe esses blocos vazios. Medições: um item por medição, com os valores exatamente como no laudo (número com vírgula ou ponto, sem unidade) e o equipamento (marca, modelo, série, certificado) em "equipamento". Traga a data e os horários de início e fim de cada medição como constam no laudo ou no relatório do equipamento: eles são usados para conferir o horário da diligência.`;

const FORMATO = `FORMATO DA RESPOSTA
Responda SOMENTE com um bloco JSON válido, sem texto antes ou depois, neste formato:
{
  "processo": {"numero": "", "juizo": "", "comarca": "", "dataAjuizamento": "", "valorCausa": "", "rito": "", "peritoJuizo": "", "refLaudo": "", "despachoRef": ""},
  "partes": {"autorNome": "", "autorCpf": "", "autorNascimento": "", "reuNome": "", "reuCnpj": ""},
  "sintese": {
    "funcoes": "cargos, funções, admissão, demissão, períodos",
    "atividadesAlegadas": "", "agentesAlegados": "", "pedidos": "",
    "defesa": "", "preliminares": "pontos de atenção e pendências, um por linha começando com '- '",
    "analiseEpi": "", "roteiro": "roteiro da vistoria e documentos a solicitar, um por linha começando com '- '",
    "observacoes": ""
  },
  "periodos": [{"empresa": "", "cnpj": "", "inicio": "", "fim": "", "cargo": "", "setor": "", "atividades": "", "agentes": "", "fonte": ""}],
  "documentos": [{"tipo": "PPP | LTCAT | PGR / PPRA | Laudo pericial | Ficha de EPI | CTPS / CNIS | Outro", "identificacao": "", "analise": ""}],
  "epis": [{"descricao": "", "ca": "", "dataEntrega": "", "obs": ""}],
  "quesitos": [{"origem": "Juízo | Autor / Reclamante | Réu / Reclamada | INSS | Complementares", "numero": "1", "texto": "", "resposta": "resposta dada no laudo, se já houver"}],
  "andamento": {"fase": "A preparar | Diligência agendada | Diligência realizada | Laudo / parecer em elaboração | Aguardando manifestação / esclarecimentos | Respondendo quesitos suplementares | Concluído", "laudoRefPerito": "ID/mov. do laudo", "laudoData": "", "conclusaoLaudo": "conclusão do laudo por agente e período, com as folhas", "honorariosFixados": "", "honorariosItem": "", "dataDiligencia": "", "horaDiligencia": ""},
  "diligencia": {"vistoriaData": "", "vistoriaInicio": "HH:MM", "vistoriaFim": "HH:MM", "vistoriaLocal": "", "vistoriaEndereco": "", "vistoriaPresentes": "nome – função – quem representa, um por linha", "vistoriaCondicoes": "", "vistoriaNotas": "outras anotações da diligência e a folha do laudo onde está"},
  "postos": [{"nome": "", "descricao": "", "infoTrabalhador": "", "infoEmpresa": "", "agentes": "", "jornada": "", "epc": "", "epi": "",
    "medicoes": [{"agente": "Ruído | Calor (IBUTG) | Vibração de corpo inteiro (VCI) | Vibração de mãos e braços (VMB) | Agente químico | Outro", "dataMedicao": "", "horaInicio": "", "horaFim": "", "equipamento": "",
      "tempoAmostragem": "", "jornada": "", "dose": "", "lavg": "", "lmax": "", "calibInicial": "", "calibFinal": "", "posicao": "",
      "tbn": "", "tbs": "", "tg": "", "ibutgLido": "", "atividade": "", "regime": "",
      "veiculo": "", "aren": "", "vdv": "", "eixo": "", "tempoExposicao": "",
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
FOCO: segurado e categoria (empregado / contribuinte individual – STJ, Tema 1291), vínculos com datas da CTPS, lacunas do CNIS, empresa ativa ou extinta (similaridade – art. 277 da IN 128/2022 e Súmula 106 do TRF4), atividades e agentes por subperíodo, marcos legais e EC 103/2019, laudos existentes da empresa e suas falhas.
Em "preliminares", as pendências e documentos a pedir ao segurado antes da vistoria. Em "roteiro", o checklist de campo (o que perguntar, observar, medir e fotografar).`,
  },
];

export function situacaoDoCaso(c) {
  if (c.tipoAtuacao === 'Extrajudicial' || /extrajudicial/i.test(c.papel || '')) return 'extra-ltcat';
  if (/Assistente/i.test(c.papel || '')) return c.refLaudo || /laudo|manifesta|esclarec/i.test(c.fase || '') ? 'at-laudo' : 'at-estudo';
  // (os critérios do assistente técnico seguem a matéria do caso: trabalhista ou previdenciária)
  if (/Fazenda/i.test(c.justica || '') || c.materia === 'Administrativa (servidor)') return 'perito-faz';
  if (c.materia === 'Previdenciária' || c.materia === 'Acidentária') return 'perito-prev';
  return 'perito-trab';
}

export function montarPrompt(situacaoId, c = {}) {
  const s = SITUACOES.find((x) => x.id === situacaoId) || SITUACOES[0];
  const ctx = [c.papel && `Minha atuação neste caso: ${c.papel}.`, c.numero && `Processo: ${c.numero}.`].filter(Boolean).join(' ');
  return [s.foco, ctx, criteriosPara(c, s.id), REGRAS_EXTRACAO, FORMATO].filter(Boolean).join('\n\n');
}

// compatibilidade
export const PROMPT_IA = montarPrompt('perito-trab');

const CAMPOS_CASO = {
  processo: ['numero', 'juizo', 'comarca', 'dataAjuizamento', 'valorCausa', 'rito', 'peritoJuizo', 'refLaudo', 'despachoRef'],
  partes: ['autorNome', 'autorCpf', 'autorNascimento', 'reuNome', 'reuCnpj'],
  sintese: ['funcoes', 'atividadesAlegadas', 'agentesAlegados', 'pedidos', 'defesa', 'preliminares', 'analiseEpi', 'roteiro', 'observacoes'],
};

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
    const v = s((obj[grupo] || {})[k]);
    if (v) caso[k] = v;
  }
  const origem = (o) => ORIGEM_QUESITO.find((x) => x.toLowerCase().startsWith(s(o).toLowerCase().slice(0, 4))) || 'Outro';
  const pegar = (o, ks) => Object.fromEntries(ks.map((k) => [k, s((o || {})[k])]).filter(([, v]) => v));
  const and = obj.andamento || {};
  for (const [k, v] of Object.entries(pegar(and, ['laudoRefPerito', 'laudoData', 'conclusaoLaudo', 'honorariosFixados', 'honorariosItem', 'dataDiligencia', 'horaDiligencia']))) caso[k] = v;
  const fase = FASE.find((f) => f.toLowerCase() === s(and.fase).toLowerCase());
  if (fase && fase !== 'A preparar') caso.fase = fase;
  Object.assign(caso, pegar(obj.diligencia, CAMPOS_DILIGENCIA.map(([k]) => k).filter((k) => k !== 'vistoriaGps')));
  const agenteOk = (a) => AGENTES_MEDICAO.find((x) => x.toLowerCase().slice(0, 12) === s(a).toLowerCase().slice(0, 12)) || 'Outro';
  const KS_MED = ['dataMedicao', 'horaInicio', 'horaFim', 'tempoAmostragem', 'jornada', 'dose', 'lavg', 'lmax', 'calibInicial', 'calibFinal', 'posicao',
    'tbn', 'tbs', 'tg', 'ibutgLido', 'atividade', 'regime', 'veiculo', 'aren', 'vdv', 'eixo', 'tempoExposicao', 'descricao', 'metodo', 'valor', 'unidade', 'limite'];
  const postos = lista(obj.postos).map((x) => ({
    ...pegar(x, CAMPOS_POSTO.map(([k]) => k)),
    medicoes: lista(x.medicoes).map((m) => {
      const r = { agente: agenteOk(m.agente), ...pegar(m, KS_MED) };
      const obs = [s(m.equipamento) && `Equipamento: ${s(m.equipamento)}`, s(m.obs)].filter(Boolean).join('\n');
      if (obs) r.obs = obs;
      r.importadaDoLaudo = true;
      return r;
    }).filter((m) => Object.keys(m).length > 2),
  })).filter((p) => p.nome || p.medicoes.length);
  return {
    caso,
    periodos: lista(obj.periodos).map((x) => ({ empresa: s(x.empresa), cnpj: s(x.cnpj), inicio: s(x.inicio), fim: s(x.fim), cargo: s(x.cargo), setor: s(x.setor), atividades: s(x.atividades), agentes: s(x.agentes), fonte: s(x.fonte) })),
    documentos: lista(obj.documentos).map((x) => ({ tipo: s(x.tipo), identificacao: s(x.identificacao), analise: s(x.analise) })),
    epis: lista(obj.epis).map((x) => ({ descricao: s(x.descricao), ca: s(x.ca), dataEntrega: s(x.dataEntrega), obs: s(x.obs) })),
    quesitos: lista(obj.quesitos).map((x) => ({ origem: origem(x.origem), numero: s(x.numero), texto: s(x.texto), resposta: s(x.resposta) })).filter((q) => q.texto),
    postos,
  };
}

// Campos preenchidos não são sobrescritos (a menos que "substituir" esteja marcado).
export async function aplicarIA(caseId, dados, { substituir = false } = {}) {
  const caso = await db.records.get(caseId);
  const mudancas = {};
  for (const [k, v] of Object.entries(dados.caso)) {
    const atual = String(caso.data[k] || '').trim();
    if (substituir || !atual || (k === 'fase' && atual === 'A preparar')) mudancas[k] = v;
  }
  if (Object.keys(mudancas).length) await updateFields(caseId, mudancas);
  const cont = { campos: Object.keys(mudancas).length, periodos: 0, documentos: 0, epis: 0, quesitos: 0, respostas: 0, postos: 0, medicoes: 0 };
  const kinds = { periodos: 'periodo', documentos: 'documento', epis: 'epi' };
  for (const [lista, kind] of Object.entries(kinds)) {
    if (!dados[lista].length) continue;
    const existentes = await caseChildren(caseId, kind);
    const ks = Object.keys(dados[lista][0]);
    const chave = (d) => JSON.stringify(ks.map((k) => String(d[k] ?? '').toLowerCase().replace(/\s+/g, ' ').trim()));
    const vistos = new Set(existentes.map((r) => chave(r.data)));
    let ordem = existentes.length;
    for (const item of dados[lista]) {
      if (vistos.has(chave(item))) continue;
      vistos.add(chave(item));
      ordem += 1;
      await createRecord(kind, caseId, { ...item, ordem });
      cont[lista] += 1;
    }
  }
  // Quesitos: o mesmo quesito não se repete; a resposta do laudo entra se ainda estiver vazia
  if (dados.quesitos.length) {
    const existentes = await caseChildren(caseId, 'quesito');
    const chaveQ = (d) => normTxt(d.texto).slice(0, 200);
    const mapa = new Map(existentes.map((r) => [chaveQ(r.data), r]));
    let ordem = existentes.length;
    for (const q of dados.quesitos) {
      const ex = mapa.get(chaveQ(q));
      if (ex) {
        if (q.resposta && (substituir || !String(ex.data.resposta || '').trim())) { await updateFields(ex.id, { resposta: q.resposta }); cont.respostas += 1; }
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
      }
      const meds = (await caseChildren(caseId, 'medicao')).filter((m) => m.data.postoId === posto.id);
      const chaveM = (m) => JSON.stringify([m.agente, m.lavg, m.aren, m.tbn, m.valor, m.dataMedicao].map((v) => String(v || '')));
      const vistas = new Set(meds.map((m) => chaveM(m.data)));
      for (const m of medicoes) {
        if (vistas.has(chaveM(m))) continue;
        vistas.add(chaveM(m));
        await createRecord('medicao', caseId, { ...m, postoId: posto.id });
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
  parprev: 'Redija o PARECER TÉCNICO previdenciário por vínculo: responsabilidade técnica, objeto, identificação, fundamentação legal, metodologia, atividades por vínculo, avaliação técnica por agente, quadro conclusivo, limitações e encerramento.',
  prevent: 'Redija o PARECER TÉCNICO PREVENTIVO para a empresa: objetivo, identificação do caso, documentos analisados, fundamentação, instalações e atividades, análise crítica da documentação de SST, avaliação dos riscos de condenação, recomendações e conclusão.',
  indic: 'Redija a PETIÇÃO de indicação de assistente técnico com documentos a requerer, pedido de avaliações no local e quesitos técnicos objetivos por agente.',
  supl: 'Redija a PETIÇÃO DE RESPOSTA AOS QUESITOS SUPLEMENTARES (perito do juízo, art. 477, § 2º, I, do CPC): referência à decisão e ao laudo; para cada parte, transcrição literal de cada quesito suplementar seguida da resposta técnica, apoiada no laudo e nos registros de campo abaixo (fonte primária da diligência); retificação de erro material ("onde se lê / leia-se") quando houver divergência; ratificação das conclusões; encerramento. Sem juridiquês e sem citar o advogado.',
};

export const OPCOES_REDACAO = [
  ['laudo', 'Laudo pericial'], ['parecerAT', 'Parecer de assistente técnico / impugnação'], ['ltcat', 'LTCAT + PPP'],
  ['parprev', 'Parecer técnico previdenciário'], ['prevent', 'Parecer preventivo para a empresa'], ['indic', 'Petição de indicação e quesitos'],
  ['supl', 'Resposta aos quesitos suplementares'],
];

export async function exportarParaClaude(caseId, tipo) {
  const { c, texto } = await textoDoCaso(caseId);
  const instr = `${REDACAO[tipo] || REDACAO.laudo}

Use os dados do caso abaixo (coletados por mim nos autos e na diligência) como base factual. Não invente dados: o que faltar, marque como [[pendência]] para eu completar. Formatação: documento técnico no meu papel timbrado, fonte Abadi, espaçamento 1,5, texto justificado, títulos numerados em azul, cada título principal em página nova, sumário, quadros numerados com título acima e fonte abaixo.

${criteriosPara(c, tipo === 'ltcat' || tipo === 'parprev' ? 'extra-ltcat' : '')}

---
${texto}`;
  return instr;
}

// Todo o caso em texto (markdown), para levar ao Claude
export async function textoDoCaso(caseId) {
  const caso = await db.records.get(caseId);
  const c = caso.data;
  const [quesitos, periodos, documentos, epis, postos, medicoes, fotos] = await Promise.all(
    ['quesito', 'periodo', 'documento', 'epi', 'posto', 'medicao', 'foto'].map((k) => caseChildren(caseId, k)));
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
  L.push('\n## Síntese dos autos');
  for (const [k, r] of [['funcoes', 'Funções e períodos'], ['atividadesAlegadas', 'Atividades alegadas'], ['agentesAlegados', 'Agentes alegados'], ['pedidos', 'Pedidos'],
    ['defesa', 'Defesa'], ['preliminares', 'Pontos de atenção'], ['analiseEpi', 'Análise dos EPIs'], ['observacoes', 'Observações'], ['conclusaoLaudo', 'Conclusão do laudo já apresentado']]) campo(r, c[k]);
  if (periodos.length) { L.push('\n## Períodos'); periodos.forEach((p) => L.push(`- ${p.data.empresa || ''} (${p.data.cnpj || ''}) – ${p.data.inicio || '?'} a ${p.data.fim || 'atual'} – ${p.data.cargo || ''} / ${p.data.setor || ''}. Atividades: ${p.data.atividades || ''}. Agentes: ${p.data.agentes || ''}. Fonte: ${p.data.fonte || ''}`)); }
  const comPar = periodos.filter((p) => p.data.paradigmaRuido || p.data.paradigmaVibracao || p.data.veiculoModelo);
  if (comPar.length) {
    const pars = new Map((await db.records.where('kind').equals('paradigma').toArray()).filter((r) => !r.deleted).map((r) => [r.data.codigo, r.data]));
    L.push('\n## Veículos do requerente e paradigmas (banco do signatário)');
    L.push('Normalização: NEN = Lavg + 16,61·log(T/8); aren(T) = arep·√(T/8); VDVR(T) = VDVR·(T/Tlaudo)^0,25. Até 18/11/2003 compara-se o Lavg; depois, o NEN para a jornada efetiva. Fonte extrajudicial é citada sem nome do segurado.');
    comPar.forEach((p) => {
      const x = p.data;
      L.push(`- ${x.empresa || ''} (${x.inicio || '?'} a ${x.fim || 'atual'}): veículo ${[x.veiculoTipo, x.veiculoMarca, x.veiculoModelo, x.veiculoAno].filter(Boolean).join(' ') || '?'}; condução ${x.conducaoH || '?'} h (${x.conducaoBase || 'base não informada'})`);
      for (const [rot, cod] of [['ruído', x.paradigmaRuido], ['vibração', x.paradigmaVibracao]]) {
        if (!cod) continue;
        const q = pars.get(cod);
        L.push(q ? `  - Paradigma de ${rot} ${cod}: ${q.marca} ${q.modelo} ${q.ano || ''} (família ${q.familia || '?'}); Lavg ${q.lavg || '–'} dB(A); arep ${q.arep || '–'}; VDVR ${q.vdvrLaudo || '–'}; jornada do laudo ${q.jornadaLaudo || '?'} h; fonte: ${q.citacao || '?'}; instrumentos: ${[q.ruidoEquip && `${q.ruidoEquip} SN ${q.ruidoSerie || '?'} cert. ${q.ruidoCertData || '?'}`, q.vibEquip && `${q.vibEquip} SN ${q.vibSerie || '?'} cert. ${q.vibCertData || '?'}`].filter(Boolean).join('; ') || '?'}`
          : `  - Paradigma de ${rot} ${cod}: não encontrado no banco`);
      }
    });
  }
  if (documentos.length) { L.push('\n## Documentos analisados'); documentos.forEach((d) => L.push(`- ${d.data.tipo || ''} ${d.data.identificacao || ''}: ${d.data.analise || ''}`)); }
  if (epis.length) { L.push('\n## EPIs'); epis.forEach((e) => L.push(`- ${e.data.descricao || ''} – CA ${e.data.ca || '?'} – ${e.data.dataEntrega || ''} ${e.data.obs || ''}`)); }
  L.push('\n## Diligência');
  for (const [k, r] of [['vistoriaData', 'Data'], ['vistoriaInicio', 'Início'], ['vistoriaFim', 'Término'], ['vistoriaLocal', 'Local'], ['vistoriaEndereco', 'Endereço'],
    ['vistoriaGps', 'GPS'], ['vistoriaPresentes', 'Presentes'], ['vistoriaCondicoes', 'Condições do dia'], ['vistoriaNotas', 'Anotações gerais']]) campo(r, c[k]);
  const usados = equip.filter((e) => (c.equipamentos || []).includes(e.id) || medicoes.some((m) => m.data.equipamentoId === e.id));
  if (usados.length) { L.push('\n## Equipamentos'); usados.forEach((e) => L.push(`- ${e.data.nome} ${e.data.fabricante || ''} ${e.data.modelo || ''}, série ${e.data.serie || '?'}, certificado ${e.data.certificado || '?'} (${e.data.laboratorio || ''}), calibrado em ${e.data.dataCalibracao || '?'}`)); }
  if (postos.length) {
    L.push('\n## Postos avaliados');
    postos.forEach((p) => {
      L.push(`\n### ${p.data.nome || 'Posto'}`);
      for (const [k, r] of [['descricao', 'Atividade observada'], ['infoTrabalhador', 'Informações do trabalhador'], ['infoEmpresa', 'Informações da empresa'],
        ['agentes', 'Agentes'], ['jornada', 'Jornada'], ['epc', 'EPC'], ['epi', 'EPI']]) campo(r, p.data[k]);
    });
  }
  if (medicoes.length) {
    L.push('\n## Medições');
    medicoes.forEach((m) => L.push(`- [${m.data.agente}] posto: ${nomePosto.get(m.data.postoId) || 'geral'}; equipamento: ${eq.get(m.data.equipamentoId)?.modelo || '?'}; ${resumoMedicao(m, contextoLegal(c))}${m.data.obs ? `; obs.: ${m.data.obs}` : ''}`));
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
  if (fotos.length) { L.push('\n## Fotos registradas'); fotos.forEach((f, i) => L.push(`- Foto ${i + 1}: ${f.data.legenda || '(sem legenda)'}${f.data.postoId ? ` – posto ${nomePosto.get(f.data.postoId) || ''}` : ''}`)); }

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
  return [FOCO_SUPL, criteriosPara(c), FORMATO_SUPL, `---\nREGISTROS DO APP\n${texto}`].join('\n\n');
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
  const origem = (o) => ORIGEM_QUESITO.find((x) => x.toLowerCase().startsWith(s(o).toLowerCase().slice(0, 4))) || 'Outro';
  const quesitos = (Array.isArray(obj.quesitos) ? obj.quesitos : []).filter((x) => x && typeof x === 'object')
    .map((x) => ({ origem: origem(x.origem), numero: s(x.numero), refPeticao: s(x.refPeticao), texto: s(x.texto), resposta: s(x.resposta) }))
    .filter((q) => q.texto);
  return { caso, quesitos };
}

const normTxt = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

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
