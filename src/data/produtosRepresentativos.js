// ======================================================================
// Produtos representativos (base técnica): FDS públicas de produtos de uso comum, para quando a marca usada
// no local não foi identificada (gasolina e diesel de lavagem de peças, fluido de corte, graxa…). Entram no
// caso como ficha da FDS, com a observação de que são representativos – o perito confere e ajusta.
// Dados transcritos das FDS lidas nos endereços indicados (consulta em 26/11/2026).
// ======================================================================

const CONSULTA = '2026-11-26';
const REP = 'Produto representativo: a marca usada no local não foi identificada; ficha de produto similar de fabricante nacional, para a classificação de perigo e a composição típicas.';

export const PRODUTOS_REPRESENTATIVOS = [
  {
    id: 'rep-gasolina-c',
    para: 'Gasolina automotiva (combustível; solvente na lavagem de peças)',
    nome: 'Gasolina C Comum',
    fabricante: 'Vibra Energia S.A.',
    revisao: 'FDS nº 1017, versão 02, revisão de 31/07/2026 (ABNT NBR 14725:2023)',
    url: 'https://www.vibraenergia.com.br/sites/default/files/2026-08/FDS_PT_BR_Gasolina%20C%20Comum_0.pdf',
    uso: 'Combustível',
    s2Classificacao: 'Líquidos inflamáveis, Cat. 2\nToxicidade aguda (oral, dérmica e inalação – vapores), Cat. 3\nLesões oculares graves/irritação ocular, Cat. 2A\nCarcinogenicidade, Cat. 1A\nPerigoso ao ambiente aquático – agudo e crônico, Cat. 3',
    s2Advertencia: 'Perigo',
    s2FrasesH: 'H225 – Líquido e vapores altamente inflamáveis\nH301+H311+H331 – Tóxico se ingerido, em contato com a pele ou se inalado\nH319 – Provoca irritação ocular grave\nH350 – Pode provocar câncer\nH412 – Nocivo para os organismos aquáticos, com efeitos prolongados',
    s3Tipo: 'Mistura',
    s3Componentes: 'Gasolina A; 86290-81-5; 68 %; Líq. Inflam. 1 H224, Irrit. Pele 2 H315, Muta. 1B H340, Carc. 1B H350, Per. Aspiração 1 H304\nEtanol; 64-17-5; 32 %; Líq. Inflam. 2\nBenzeno; 71-43-2; < 0,01 % (FDS atual); componente da gasolina',
    s8Limites: 'Gasolina: ACGIH TLV-TWA 300 ppm; TLV-STEL 500 ppm; A3\nBenzeno: NR-15, Anexo 13-A – VRT-MPT 1,0 ppm; NR-7 – ácido trans,trans-mucônico e S-PMA; ACGIH TLV-TWA 0,02 ppm, Skin, A1',
    s8Engenharia: 'Não informado na FDS',
    s8Epi: 'Luvas de proteção; óculos de segurança herméticos; roupas de proteção adequadas; proteção respiratória quando houver possibilidade de inalação',
    s9Estado: 'Líquido límpido, incolor a amarelado, odor característico',
    s9Ph: 'Não disponível', s9Ebulicao: '> 35 °C', s9Fulgor: '< -43 °C', s9PressaoVapor: '76 kPa', s9Densidade: '0,73 a 0,77',
    s9Solubilidade: 'Insolúvel em água', s9Outros: 'Autoignição > 250 °C; limites de inflamabilidade 1,3 a 7,1 %',
    observacoes: `${REP} O teor de benzeno informado na FDS atual (< 0,01 %) é da gasolina de hoje; a especificação da ANP admite até 1,0 % em volume. O benzeno (LINACH, Grupo 1, CAS 71-43-2) está presente na composição.`,
  },
  {
    id: 'rep-diesel-s10',
    para: 'Óleo diesel (combustível; solvente na lavagem de peças)',
    nome: 'Óleo Diesel B S10',
    fabricante: 'Vibra Energia S.A.',
    revisao: 'FDS nº 11009, versão 01, revisão de 20/08/2025 (ABNT NBR 14725:2023)',
    url: 'https://www.vibraenergia.com.br/sites/default/files/2025-08/FDS_PT_BR_%C3%93leo%20Diesel%20B%20S10.pdf',
    uso: 'Combustível para motores de ignição por compressão',
    s2Classificacao: 'Líquidos inflamáveis, Cat. 3\nToxicidade aguda (inalação – vapores), Cat. 4\nCorrosão/irritação à pele, Cat. 2\nCarcinogenicidade, Cat. 2\nToxicidade para órgãos-alvo – exposição repetida, Cat. 2\nPerigo por aspiração, Cat. 1\nPerigoso ao ambiente aquático – agudo e crônico, Cat. 2',
    s2Advertencia: 'Perigo',
    s2FrasesH: 'H226 – Líquido e vapores inflamáveis\nH304 – Pode ser fatal se ingerido e penetrar nas vias respiratórias\nH315 – Provoca irritação à pele\nH332 – Nocivo se inalado\nH351 – Suspeito de provocar câncer\nH373 – Pode provocar danos aos órgãos por exposição repetida ou prolongada\nH411 – Tóxico para os organismos aquáticos, com efeitos prolongados',
    s3Tipo: 'Mistura',
    s3Componentes: 'Óleo diesel A (hidrocarbonetos de petróleo); 68334-30-5; 85 %; Líq. Inflam. 3, Carc. 2 H351, STOT RE 2 H373, Per. Aspiração 1 H304\nBiodiesel; 68990-52-3; 15 %; Aq. Agudo 1 H400\nEnxofre; 7704-34-9; ≤ 0,001 %; Irrit. Pele 2 H315',
    s8Limites: 'Óleo diesel: ACGIH TLV-TWA 100 mg/m³ (fração inalável e vapor, como hidrocarbonetos totais), Skin, A3',
    s8Engenharia: 'Exaustão local ou ventilação adequada; lava-olhos e chuveiro de segurança',
    s8Epi: 'Luvas de proteção; óculos de segurança; roupas e avental resistentes a produtos químicos; calçados de segurança',
    s9Estado: 'Líquido límpido, incolor, odor característico',
    s9Ph: 'Não disponível', s9Ebulicao: '150 a 471 °C', s9Fulgor: '≥ 60 °C', s9PressaoVapor: 'cerca de 0,4 kPa a 40 °C', s9Densidade: 'cerca de 853 kg/m³ a 15 °C',
    s9Solubilidade: 'Insolúvel em água', s9Outros: 'Autoignição ≥ 225 °C; viscosidade a 40 °C cerca de 4,15 mm²/s',
    observacoes: `${REP} Derivado de petróleo (cód. 1.0.17 do Anexo IV).`,
  },
  {
    id: 'rep-fluido-corte',
    para: 'Fluido de corte solúvel (óleo emulsionável de base mineral para usinagem e retífica)',
    nome: 'LUBRAX UTILE PE',
    fabricante: 'Vibra Energia S.A. (marca Lubrax)',
    revisao: 'FISPQ nº 1002342, revisão de 23/08/2023 (ABNT NBR 14725-4:2014)',
    url: 'https://www.lubrax.com.br/sites/default/files/fichas-de-seguranca/FISPQ_BR_PT_LUBRAX_UTILE_PE.pdf',
    uso: 'Óleo emulsionável para operações de usinagem de metais',
    s2Classificacao: 'Sensibilização à pele, Cat. 1\nToxicidade para órgãos-alvo – exposição repetida, Cat. 1',
    s2Advertencia: 'Perigo',
    s2FrasesH: 'H317 – Pode provocar reações alérgicas na pele\nH372 – Provoca danos aos órgãos por exposição repetida ou prolongada',
    s3Tipo: 'Mistura',
    s3Componentes: 'Destilados de petróleo, naftênicos leves hidrotratados (óleo mineral); 64742-53-6; 80 a 90 %; Per. Aspiração 1 H304\nPacote de aditivos; não informado; 10 a 20 %; Tox. Aguda 4 H332, Sens. Pele 1 H317, STOT RE 1 H372',
    s8Limites: 'Névoas de óleo mineral: ACGIH TLV-TWA 5 mg/m³ (a FISPQ imprime "5 ppm")',
    s8Engenharia: 'Boa ventilação do local de trabalho',
    s8Epi: 'Luvas de borracha nitrílica; óculos de segurança com proteções laterais; roupas de mangas compridas e avental resistente a produtos químicos; proteção respiratória quando houver possibilidade de inalação',
    s9Estado: 'Líquido castanho, odor leve característico de óleo lubrificante',
    s9Ph: 'Não disponível', s9Ebulicao: 'Não disponível', s9Fulgor: '152 °C (vaso aberto)', s9PressaoVapor: 'Não disponível', s9Densidade: '0,92 (20/4 °C)',
    s9Solubilidade: 'Solúvel em água (emulsionável)', s9Outros: 'Viscosidade a 40 °C 37,5 cSt; óleo mineral altamente refinado (< 3 % de extrato em DMSO, IP 346)',
    observacoes: `${REP} Base de óleo mineral (cód. 1.0.7, b, do Anexo IV – utilização de óleos minerais).`,
  },
  {
    id: 'rep-graxa-litio',
    para: 'Graxa lubrificante de uso geral (sabão de lítio e óleo mineral)',
    nome: 'LUBRAX LITH 2',
    fabricante: 'Vibra Energia S.A. (marca Lubrax)',
    revisao: 'FISPQ nº 1002241, revisão de 29/08/2023 (ABNT NBR 14725-4:2014)',
    url: 'https://www.lubrax.com.br/sites/default/files/fichas-de-seguranca/FISPQ_BR_PT_LUBRAX_LITH_2.pdf',
    uso: 'Graxa lubrificante',
    s2Classificacao: 'Toxicidade aguda (oral), Cat. 4\nPerigoso ao ambiente aquático – agudo, Cat. 3',
    s2Advertencia: 'Atenção',
    s2FrasesH: 'H302 – Nocivo se ingerido\nH402 – Nocivo para os organismos aquáticos',
    s3Tipo: 'Mistura',
    s3Componentes: 'Óleo mineral altamente refinado (< 3 % de extrato em DMSO, IP 346); não informado; teor não informado\nHidróxido de lítio; 1310-65-2; 0,5 a 5 %; Aq. Agudo 3 H402',
    s8Limites: 'Não informado na FISPQ',
    s8Engenharia: 'Boa ventilação do local de trabalho',
    s8Epi: 'Luvas de proteção; óculos de segurança com proteções laterais; roupas de proteção adequadas',
    s9Estado: 'Pastoso, amarelo, odor característico',
    s9Ph: 'Não disponível', s9Ebulicao: 'Não disponível', s9Fulgor: '220 °C (óleo básico, vaso aberto)', s9PressaoVapor: 'Não disponível', s9Densidade: 'Não disponível',
    s9Solubilidade: 'Insolúvel em água', s9Outros: 'Demais propriedades não disponíveis',
    observacoes: `${REP} Base de óleo mineral (cód. 1.0.7, b, do Anexo IV – utilização de óleos minerais).`,
  },
];

// dados da ficha do caso a partir do produto da base (sem os campos internos)
export function fichaDoRepresentativo(p) {
  const { id, para, ...dados } = p; void id; void para;
  return { ...dados, fonteFds: 'Pesquisada na internet', consultadoEm: CONSULTA, situacao: 'A conferir' };
}
