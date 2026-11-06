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
  'A preparar', 'Diligência agendada', 'Diligência realizada', 'Laudo / parecer em elaboração',
  'Aguardando manifestação / esclarecimentos', 'Concluído', 'Arquivado',
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
  ['numero', 'Número do processo', 'text'],
  ['juizo', 'Vara / Juízo', 'text'],
  ['comarca', 'Comarca / Subseção', 'text'],
  ['dataAjuizamento', 'Data de ajuizamento', 'date'],
  ['valorCausa', 'Valor da causa', 'text'],
  ['rito', 'Rito', 'text'],
  ['peritoJuizo', 'Perito do Juízo (quando atuo como assistente)', 'text'],
  ['refLaudo', 'Laudo analisado (ID / mov. / fls.)', 'text'],
  ['despachoRef', 'Despacho / ata de referência (ex.: "ata de audiência de 27/10/2026 (fls. 2704)")', 'text'],
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
  ['dadosBancarios', 'Dados bancários para honorários', 'area'],
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
];

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
