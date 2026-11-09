// Listas de opções e definições de campos. Para acrescentar uma opção,
// basta editar este arquivo.

export const TIPO_ATUACAO = ['Judicial', 'Extrajudicial'];

export const JUSTICA = [
  'Justiça do Trabalho',
  'Justiça Federal',
  'Justiça Estadual – competência delegada (previdenciária)',
  'Justiça Estadual – Vara da Fazenda Pública',
  'Justiça Estadual – Vara Cível',
  'Juizado Especial Federal',
  'Outra',
];

export const MATERIA = ['Trabalhista', 'Previdenciária', 'Acidentária', 'Administrativa (servidor)', 'Cível', 'Outra'];

export const PAPEL = [
  'Perito do Juízo',
  'Assistente técnico do autor / reclamante',
  'Assistente técnico do réu / reclamada',
  'Laudo extrajudicial (contratante)',
];

export const OBJETO = [
  'Insalubridade', 'Periculosidade', 'Aposentadoria especial', 'LTCAT', 'PPP',
  'Acidente / doença ocupacional', 'Adicional (servidor público)', 'Outro',
];

export const FASE = [
  'A preparar', 'Aguardando depósito dos honorários', 'Diligência agendada', 'Diligência realizada', 'Laudo / parecer em elaboração',
  'Aguardando manifestação / esclarecimentos', 'Respondendo quesitos suplementares', 'Concluído', 'Arquivado',
];

export const ORIGEM_QUESITO = ['Juízo', 'Autor / Reclamante', 'Réu / Reclamada', 'INSS', 'Complementares', 'Outro'];

export const AGENTES_MEDICAO = [
  'Ruído', 'Calor (IBUTG)', 'Vibração de corpo inteiro (VCI)', 'Vibração de mãos e braços (VMB)',
  'Agente químico', 'Outro',
];

export const TIPO_DOC = [
  'Petição inicial', 'Contestação', 'PPP', 'LTCAT', 'PGR / PPRA', 'PCMSO / ASO', 'Ficha de EPI',
  'Laudo pericial', 'CTPS / CNIS', 'Ordem de serviço', 'Despacho / decisão', 'Outro',
];

export const CONDICAO_CALOR = [
  'Ambiente interno ou externo sem carga solar direta',
  'Ambiente externo com carga solar direta',
];

// Campos do caso agrupados para as telas (chave, rótulo, tipo)
export const CAMPOS_PROCESSO = [
  ['classe', 'Classe (ex.: Procedimento Comum, Carta Precatória, Ação Trabalhista – Rito Ordinário)', 'text'],
  ['numero', 'Número do processo', 'text'],
  ['juizo', 'Vara / Juízo (como sai no endereçamento, ex.: "6ª Vara Federal de Londrina – Seção Judiciária do Paraná")', 'text'],
  ['juizoDeprecante', 'Juízo deprecante (carta precatória)', 'text'],
  ['comarca', 'Comarca / Subseção', 'text'],
  ['dataAjuizamento', 'Data de ajuizamento', 'date'],
  ['valorCausa', 'Valor da causa', 'text'],
  ['rito', 'Rito', 'text'],
  ['peritoJuizo', 'Perito do Juízo (quando atuo como assistente)', 'text'],
  ['refLaudo', 'Laudo analisado (ID / mov. / fls.)', 'text'],
  ['despachoRef', 'Despacho de referência (ex.: "despacho do evento 56" ou "despacho/decisão de 28/09/2026")', 'text'],
];

// Honorários e itens do despacho (perito do juízo)
export const CAMPOS_HONORARIOS = [
  ['honorariosItem', 'Item do despacho que fixou os honorários (ex.: "item 1.2")', 'text'],
  ['honorariosFixados', 'Valor fixado (R$)', 'text'],
  ['honorariosTabela', 'Valor máximo da tabela (R$) – ex.: 362,00', 'text'],
  ['honorariosMultiplicador', 'Majoração pedida (vezes o máximo da tabela)', 'select', ['2', '3']],
  ['foraDomicilio', 'Perícia fora do meu domicílio profissional?', 'select', ['Sim', 'Não']],
  ['similaridade', 'Perícia por similaridade (empresa paradigma)?', 'select', ['Sim', 'Não']],
  ['empresaOriginal', 'Empregadora original (quando por similaridade)', 'text'],
  ['complexidadeExtra', 'Outros motivos de complexidade (um por linha)', 'area'],
  ['honorariosAdiantamento', 'Valor a receber no início dos trabalhos (R$) – em branco = 50% do fixado', 'text'],
  ['honorariosDepositante', 'Quem faz o depósito (ex.: "o Município de Moreira Sales")', 'text'],
  ['itemDeposito', 'Item do despacho que manda depositar (ex.: "7, b")', 'text'],
  ['itemAceite', 'Item do despacho que intima o perito a aceitar (ex.: "7, c")', 'text'],
  ['itemAlvara', 'Item do despacho sobre o alvará / levantamento (ex.: "7, d")', 'text'],
  ['limiteTabelaPublico', 'Despacho limita à tabela o pagamento com recursos públicos?', 'select', ['Sim', 'Não']],
  ['itemDataPericia', 'Item do despacho sobre a indicação da data da perícia (ex.: "7, g")', 'text'],
  ['antecedenciaDias', 'Antecedência para informar a data (dias úteis) – ex.: 10', 'text'],
  ['itensVistoria', 'Itens do despacho sobre vistoria e partes (ex.: "2 e 3")', 'text'],
  ['itemOficio', 'Item do despacho sobre o ofício à empresa (ex.: "6")', 'text'],
  ['prazoLaudoDias', 'Prazo para entrega do laudo após a vistoria (dias)', 'text'],
  ['itemPrazoLaudo', 'Item do despacho sobre o prazo do laudo (ex.: "3")', 'text'],
];

export const CAMPOS_PERFIL = [
  ['nome', 'Nome (como sai nos documentos)', 'text'],
  ['titulos', 'Formação', 'text'],
  ['crea', 'Registro principal', 'text'],
  ['vistoCrea', 'Visto', 'text'],
  ['cpf', 'CPF (sai na petição de indicação)', 'text'],
  ['rg', 'RG', 'text'],
  ['endereco', 'Endereço profissional', 'text'],
  ['telefone', 'Telefone', 'text'],
  ['email', 'E-mail', 'text'],
  ['cidade', 'Cidade (local da assinatura)', 'text'],
  ['conta1Rotulo', 'Conta 1 – nome curto (ex.: "Pessoa física – Banco do Brasil")', 'text'],
  ['conta1', 'Conta 1 – dados (banco, agência, conta, titular, CPF/CNPJ, PIX)', 'area'],
  ['conta2Rotulo', 'Conta 2 – nome curto (ex.: "Grahl Consultoria – Sicredi")', 'text'],
  ['conta2', 'Conta 2 – dados (banco, agência, conta, titular, CPF/CNPJ, PIX)', 'area'],
];

export const CAMPOS_PARTES = [
  ['autorNome', 'Autor / reclamante / segurado', 'text'],
  ['autorCpf', 'CPF / NIT', 'text'],
  ['autorNascimento', 'Data de nascimento', 'date'],
  ['autorAdv', 'Advogado do autor (uso interno, não sai nos documentos)', 'text'],
  ['reuNome', 'Réu / reclamada / INSS / empresa', 'text'],
  ['reuCnpj', 'CNPJ', 'text'],
  ['reuAdv', 'Advogado do réu (uso interno, não sai nos documentos)', 'text'],
  ['contratante', 'Contratante (extrajudicial / assistência)', 'text'],
];

export const CAMPOS_PRAZOS = [
  ['dataDiligencia', 'Data da diligência', 'date'],
  ['horaDiligencia', 'Horário marcado', 'time'],
  ['prazoLaudo', 'Prazo do laudo / parecer', 'date'],
  ['prazoManifestacao', 'Prazo de manifestação', 'date'],
  ['prazoEsclarecimentos', 'Prazo dos esclarecimentos / quesitos suplementares', 'date'],
];

// Depois do laudo: quesitos suplementares e pedidos de esclarecimento (art. 477, §§ 1º e 2º, do CPC)
export const CAMPOS_ESCLARECIMENTOS = [
  ['laudoRefPerito', 'Laudo apresentado (ex.: "mov. 64.1" ou "evento 45")', 'text'],
  ['laudoData', 'Data da juntada do laudo', 'date'],
  ['esclDecisaoRef', 'Decisão que determinou a resposta (ex.: "decisão do mov. 71.1")', 'text'],
  ['prazoEsclarecimentos', 'Prazo para responder', 'date'],
  ['esclRetificacoes', 'Retificações de erro material no laudo (uma por linha, ex.: "Resposta ao quesito 1 do INSS: onde se lê 11h00 às 13h00, leia-se 09h00 às 10h30")', 'area'],
  ['esclRatifica', 'Os esclarecimentos mantêm as conclusões do laudo?', 'select', ['Sim', 'Não']],
  ['esclObservacoes', 'Considerações adicionais (saem antes da conclusão; em branco = não sai)', 'area'],
];

// Quesito suplementar = formulado depois da apresentação do laudo
export const ehSuplementar = (q) => !!(q && q.data && q.data.suplementar === 'Sim');

export const CAMPOS_SINTESE = [
  ['funcoes', 'Cargos / funções e período alegados', 'area'],
  ['atividadesAlegadas', 'Atividades descritas na inicial', 'area'],
  ['agentesAlegados', 'Agentes nocivos / riscos alegados', 'area'],
  ['pedidos', 'Pedidos técnicos (o que precisa ser respondido)', 'area'],
  ['defesa', 'Tese técnica da defesa / contestação', 'area'],
  ['preliminares', 'Pontos de atenção / preliminares periciais', 'area'],
  ['analiseEpi', 'Análise crítica dos EPIs (fichas, CA, periodicidade)', 'area'],
  ['roteiro', 'Roteiro da vistoria / documentos a solicitar', 'area'],
  ['observacoes', 'Observações gerais', 'area'],
];

export const CAMPOS_DILIGENCIA = [
  ['vistoriaData', 'Data da vistoria', 'date'],
  ['vistoriaInicio', 'Hora de início', 'time'],
  ['vistoriaFim', 'Hora de término', 'time'],
  ['vistoriaLocal', 'Local (empresa / unidade)', 'text'],
  ['vistoriaEndereco', 'Endereço', 'text'],
  ['vistoriaGps', 'Coordenadas GPS', 'text'],
  ['vistoriaPresentes', 'Pessoas presentes (nome – função – quem representa)', 'area'],
  ['vistoriaCondicoes', 'Condições do dia (clima, produção normal?, paradas)', 'area'],
  ['vistoriaNotas', 'Anotações gerais da diligência', 'area'],
];

export const CAMPOS_POSTO = [
  ['nome', 'Posto / setor / função avaliada', 'text'],
  ['descricao', 'Descrição da atividade observada', 'area'],
  ['infoTrabalhador', 'Informações do trabalhador / segurado', 'area'],
  ['infoEmpresa', 'Informações da empresa / acompanhante', 'area'],
  ['agentes', 'Agentes identificados no local', 'area'],
  ['jornada', 'Jornada / tempo de exposição', 'text'],
  ['epc', 'EPC existentes', 'area'],
  ['epi', 'EPI observados (tipo, CA, uso efetivo)', 'area'],
];

export const CAMPOS_PERIODO = [
  ['empresa', 'Empresa', 'text'],
  ['cnpj', 'CNPJ', 'text'],
  ['inicio', 'Início', 'date'],
  ['fim', 'Fim', 'date'],
  ['cargo', 'Cargo / função', 'text'],
  ['setor', 'Setor', 'text'],
  ['atividades', 'Atividades', 'area'],
  ['agentes', 'Agentes / enquadramento pretendido', 'area'],
  ['fonte', 'Fonte (PPP, CTPS, CNIS, laudo...)', 'text'],
];

export const CAMPOS_DOC = [
  ['tipo', 'Tipo', 'select', TIPO_DOC],
  ['identificacao', 'Identificação (ID / folhas / data)', 'text'],
  ['analise', 'Análise / o que consta', 'area'],
];

export const CAMPOS_EPI = [
  ['descricao', 'EPI', 'text'],
  ['ca', 'CA', 'text'],
  ['dataEntrega', 'Data de entrega', 'text'],
  ['obs', 'Observações (validade do CA, assinatura, troca)', 'text'],
];

export const CAMPOS_EQUIP = [
  ['nome', 'Equipamento', 'text'],
  ['fabricante', 'Fabricante', 'text'],
  ['modelo', 'Modelo', 'text'],
  ['serie', 'Número de série', 'text'],
  ['certificado', 'Certificado de calibração nº', 'text'],
  ['laboratorio', 'Laboratório', 'text'],
  ['dataCalibracao', 'Data da calibração', 'date'],
  ['proximaCalibracao', 'Próxima calibração (opcional)', 'date'],
  ['obs', 'Observações', 'area'],
];

export const EQUIPAMENTOS_INICIAIS = [
  {
    nome: 'Dosímetro de ruído', fabricante: 'Inlite', modelo: 'DoseMax V2', serie: '2504040190AA',
    certificado: '0323/2025', laboratorio: 'Teslab – Calibração & Ensaio (Novo Hamburgo/RS)',
    dataCalibracao: '2025-06-26', obs: 'Calibração conforme ANSI S1.25 (1991); ABNT NBR ISO/IEC 17025.', ordem: 1,
  },
  {
    nome: 'Medidor de IBUTG (termômetro de globo digital)', fabricante: 'Inlite', modelo: 'iTemp', serie: '25021804704B',
    certificado: 'LT-600 223 R', laboratorio: 'Escala Produtos e Serviços de Calibração Ltda. (RBC)',
    dataCalibracao: '2025-06-11', obs: 'Sensores de globo, bulbo seco e bulbo úmido calibrados.', ordem: 2,
  },
  {
    nome: 'Medidor de vibração', fabricante: 'Inlite', modelo: 'AxPro', serie: '25030407607A',
    certificado: 'RBC5-12932-417', laboratorio: 'Calilab – Laboratório de Calibração e Ensaios (RBC)',
    dataCalibracao: '2025-05-29', obs: 'Acelerômetros: ACL-1 (VMB) 1462; ACL-2 (VCI) 1356.', ordem: 3,
  },
  {
    nome: 'Calibrador acústico (IEC 60942, classe 1)', fabricante: 'Inlite', modelo: 'CalPro', serie: '25098232',
    certificado: '0138/2025', laboratorio: 'Teslab – Calibração & Ensaio (RBC, CAL 0793)', dataCalibracao: '2025-03-26', obs: '', ordem: 4,
  },
];

export function tituloCaso(d) {
  const nome = d.autorNome || d.contratante || 'Caso sem nome';
  const contra = d.reuNome ? ` × ${d.reuNome}` : '';
  return nome + contra;
}

export const NOVO_CASO = {
  tipoAtuacao: 'Judicial',
  justica: 'Justiça do Trabalho',
  materia: 'Trabalhista',
  papel: 'Perito do Juízo',
  objeto: [],
  fase: 'A preparar',
};

// Finalidade do caso: decide qual legislação os documentos e as instruções usam.
// true = previdenciário (tempo especial); false = trabalhista / servidor; undefined = outro.
export function contextoLegal(c = {}) {
  if (c.tipoAtuacao === 'Extrajudicial' || c.materia === 'Previdenciária') return { prev: true };
  if (c.materia === 'Trabalhista' || c.materia === 'Administrativa (servidor)' || c.justica === 'Justiça do Trabalho' || /Fazenda/i.test(c.justica || '')) return { prev: false };
  return {};
}
