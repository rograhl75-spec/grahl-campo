import { db, createRecord, updateFields, caseChildren } from './db.js';
import { ORIGEM_QUESITO } from './schema.js';
import { resumoMedicao } from './medicoes.js';

// ======================================================================
// Biblioteca de instruções para o Claude, uma por situação.
// Todas carregam os critérios técnicos fixos do signatário e pedem a
// resposta num JSON que o app lê e distribui pelas abas do caso.
// ======================================================================

export const CRITERIOS = `CRITÉRIOS TÉCNICOS FIXOS DO SIGNATÁRIO (aplicar sempre)
- Ruído (previdenciário): q = 5 sempre. Até 05/03/1997: Lavg > 80 dB(A) (cód. 1.1.6 do Decreto 53.831/64). De 06/03/1997 a 18/11/2003: Lavg > 90 dB(A) — a legislação remetia ao Anexo 1 da NR-15 na íntegra, compara-se o Lavg. A partir de 19/11/2003: somente o NEN > 85 dB(A), calculado conforme a jornada com q = 5. TWA não é usado. Valores com uma casa decimal.
- Calor (previdenciário): Decreto 3.048/99, cód. 2.0.4, que prevalece sobre a IN INSS mais restritiva (hierarquia normativa). IBUTG ajustado pela vestimenta (NHO-06). Anexo 3 antigo da NR-15: taxa metabólica entre linhas → linha imediatamente superior, sem interpolar. Trabalhista: calor a céu aberto sem fonte artificial após 11/12/2019 não caracteriza.
- Agentes biológicos (previdenciário): não usar o Anexo 14 da NR-15; aplicar somente o rol de atividades do cód. 3.0.1 do Anexo IV do Decreto 3.048/99.
- Óleos minerais / diesel (previdenciário): citar somente o cód. 1.0.17 do Anexo IV.
- Vibração: Anexo 8 da NR-15 a partir de 13/08/2014; de 1997 a 2014 (fora de perfuratriz/martelete) apresentar as duas leituras, inclusive pela ISO (VCI: fronteira superior da zona de cautela da ISO 2631-1; VMB: 5 m/s², Diretiva 2002/44/CE).
- Químicos com jornada > 48 h: corrigir o limite (Brief & Scala). Álcali cáustico: referência pH 11,5 (NBR 14725:2023).
- Anexos da NR-16 em algarismos romanos.
- O laudo conclui sempre pela norma técnica, nunca pela jurisprudência; súmulas e temas ficam apenas registrados para o juiz decidir.
- Não usar testemunhas. Não citar o advogado do segurado. Datas de vínculo: a CTPS prevalece sobre o CNIS.
- PPP: código GFIP 04 quando houver enquadramento como especial; o PPP em papel vai só até a entrada do eSocial (SST).
- Ao usar laudo extrajudicial de outro segurado como paradigma, não citar o nome desse segurado.
- Equipamentos do signatário: dosímetro Inlite DoseMax V2, medidor de IBUTG Inlite iTemp, medidor de vibração Inlite AxPro, calibrador acústico Inlite CalPro.`;

const REGRAS_EXTRACAO = `REGRAS DE EXTRAÇÃO
1. Fidelidade aos autos: extraia apenas o que está nos documentos. Não invente, não deduza, não presuma. O que não estiver nos documentos fica vazio ("").
2. Cite sempre a localização (ID, mov., fls. ou página do PDF) dos dados relevantes.
3. Quesitos: TRANSCREVA TODOS NA ÍNTEGRA, palavra por palavra, um item por quesito, com origem e número.
4. EPIs: liste cada item das fichas (descrição, CA, data de entrega, observações sobre periodicidade, assinatura e validade do CA).
5. Datas no formato AAAA-MM-DD. Não inclua nomes de advogados.`;

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
  "quesitos": [{"origem": "Juízo | Autor / Reclamante | Réu / Reclamada | INSS | Complementares", "numero": "1", "texto": ""}]
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
FOCO: cargo e lotação do servidor, unidades onde trabalhou no período discutido, atividades, agentes alegados, legislação local do adicional citada nas peças (sem concluir por ela), laudos e documentos do ente. Em "preliminares", os pontos controvertidos; em "roteiro", as unidades a vistoriar e os documentos a solicitar.`,
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
  if (/Fazenda/i.test(c.justica || '') || c.materia === 'Administrativa (servidor)') return 'perito-faz';
  if (c.materia === 'Previdenciária' || c.materia === 'Acidentária') return 'perito-prev';
  return 'perito-trab';
}

export function montarPrompt(situacaoId, c = {}) {
  const s = SITUACOES.find((x) => x.id === situacaoId) || SITUACOES[0];
  const ctx = [c.papel && `Minha atuação neste caso: ${c.papel}.`, c.numero && `Processo: ${c.numero}.`].filter(Boolean).join(' ');
  return [s.foco, ctx, CRITERIOS, REGRAS_EXTRACAO, FORMATO].filter(Boolean).join('\n\n');
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
  return {
    caso,
    periodos: lista(obj.periodos).map((x) => ({ empresa: s(x.empresa), cnpj: s(x.cnpj), inicio: s(x.inicio), fim: s(x.fim), cargo: s(x.cargo), setor: s(x.setor), atividades: s(x.atividades), agentes: s(x.agentes), fonte: s(x.fonte) })),
    documentos: lista(obj.documentos).map((x) => ({ tipo: s(x.tipo), identificacao: s(x.identificacao), analise: s(x.analise) })),
    epis: lista(obj.epis).map((x) => ({ descricao: s(x.descricao), ca: s(x.ca), dataEntrega: s(x.dataEntrega), obs: s(x.obs) })),
    quesitos: lista(obj.quesitos).map((x) => ({ origem: origem(x.origem), numero: s(x.numero), texto: s(x.texto) })).filter((q) => q.texto),
  };
}

// Campos preenchidos não são sobrescritos (a menos que "substituir" esteja marcado).
export async function aplicarIA(caseId, dados, { substituir = false } = {}) {
  const caso = await db.records.get(caseId);
  const mudancas = {};
  for (const [k, v] of Object.entries(dados.caso)) {
    if (substituir || !String(caso.data[k] || '').trim()) mudancas[k] = v;
  }
  if (Object.keys(mudancas).length) await updateFields(caseId, mudancas);
  const cont = { campos: Object.keys(mudancas).length, periodos: 0, documentos: 0, epis: 0, quesitos: 0 };
  const kinds = { periodos: 'periodo', documentos: 'documento', epis: 'epi', quesitos: 'quesito' };
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
};

export const OPCOES_REDACAO = [
  ['laudo', 'Laudo pericial'], ['parecerAT', 'Parecer de assistente técnico / impugnação'], ['ltcat', 'LTCAT + PPP'],
  ['parprev', 'Parecer técnico previdenciário'], ['prevent', 'Parecer preventivo para a empresa'], ['indic', 'Petição de indicação e quesitos'],
];

export async function exportarParaClaude(caseId, tipo) {
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
    ['defesa', 'Defesa'], ['preliminares', 'Pontos de atenção'], ['analiseEpi', 'Análise dos EPIs'], ['observacoes', 'Observações']]) campo(r, c[k]);
  if (periodos.length) { L.push('\n## Períodos'); periodos.forEach((p) => L.push(`- ${p.data.empresa || ''} (${p.data.cnpj || ''}) – ${p.data.inicio || '?'} a ${p.data.fim || 'atual'} – ${p.data.cargo || ''} / ${p.data.setor || ''}. Atividades: ${p.data.atividades || ''}. Agentes: ${p.data.agentes || ''}. Fonte: ${p.data.fonte || ''}`)); }
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
    medicoes.forEach((m) => L.push(`- [${m.data.agente}] posto: ${nomePosto.get(m.data.postoId) || 'geral'}; equipamento: ${eq.get(m.data.equipamentoId)?.modelo || '?'}; ${resumoMedicao(m)}${m.data.obs ? `; obs.: ${m.data.obs}` : ''}`));
  }
  if (quesitos.length) {
    L.push('\n## Quesitos (texto literal) e anotações de campo');
    quesitos.forEach((q) => L.push(`- [${q.data.origem || ''} ${q.data.numero || ''}] ${q.data.texto || ''}${q.data.resposta ? `\n  ANOTAÇÃO: ${q.data.resposta}` : ''}`));
  }
  if (fotos.length) { L.push('\n## Fotos registradas'); fotos.forEach((f, i) => L.push(`- Foto ${i + 1}: ${f.data.legenda || '(sem legenda)'}${f.data.postoId ? ` – posto ${nomePosto.get(f.data.postoId) || ''}` : ''}`)); }

  const instr = `${REDACAO[tipo] || REDACAO.laudo}

Use os dados do caso abaixo (coletados por mim nos autos e na diligência) como base factual. Não invente dados: o que faltar, marque como [[pendência]] para eu completar. Formatação: documento técnico no meu papel timbrado, fonte Abadi, espaçamento 1,5, texto justificado, títulos numerados em azul, cada título principal em página nova, sumário, quadros numerados com título acima e fonte abaixo.

${CRITERIOS}

---
${L.join('\n')}`;
  return instr;
}
