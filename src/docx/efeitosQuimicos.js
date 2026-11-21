// Efeitos à saúde dos agentes químicos, em português, para o quadro de características (todos os documentos):
//  1) o que o perito escreveu no agente;
//  2) os sintomas do NIOSH Pocket Guide (banco de químicos), traduzidos pelo vocabulário abaixo;
//  3) para os agentes do banco sem dados no NIOSH, o resumo das fichas oficiais (FDS/FISPQ, IARC, LINACH).

// órgãos depois de "irritation" (irritação dos olhos, da pele…)
const ORGAO = { eyes: 'dos olhos', eye: 'dos olhos', skin: 'da pele', nose: 'do nariz', throat: 'da garganta', 'respiratory system': 'do sistema respiratório',
  'upper respiratory system': 'das vias respiratórias superiores', 'resp system': 'do sistema respiratório', 'upper resp system': 'das vias respiratórias superiores',
  'mucous membrane': 'das mucosas', 'mucous membranes': 'das mucosas', larynx: 'da laringe', mouth: 'da boca', 'gastrointestinal tract': 'do trato gastrointestinal',
  bladder: 'da bexiga', lungs: 'dos pulmões', lung: 'dos pulmões', 'resp tract': 'das vias respiratórias', 'upper resp tract': 'das vias respiratórias superiores', lips: 'dos lábios', face: 'da face' };
// termos do NIOSH → português (os que não estão aqui não vão ao documento)
const T = {
  headache: 'cefaleia', nausea: 'náusea', dizziness: 'tontura', dermatitis: 'dermatite', vomiting: 'vômitos', lassitude: 'fraqueza e exaustão', exhaustion: 'fraqueza e exaustão',
  drowsiness: 'sonolência', 'kidney damage': 'lesão renal', 'kidney injury': 'lesão renal', 'kidney disease': 'doença renal', dyspnea: 'dispneia', cough: 'tosse', convulsions: 'convulsões',
  'pulmonary edema': 'edema pulmonar', 'delayed pulmonary edema': 'edema pulmonar tardio', frostbite: 'congelamento (contato com o líquido)', 'skin burns': 'queimaduras na pele', 'eye burns': 'queimaduras oculares',
  burns: 'queimaduras', 'caustic burns': 'queimaduras cáusticas', narcosis: 'narcose', diarrhea: 'diarreia', 'central nervous system depression': 'depressão do sistema nervoso central',
  cyanosis: 'cianose', incoordination: 'incoordenação motora', confusion: 'confusão mental', 'mental confusion': 'confusão mental', lacrimation: 'lacrimejamento', 'abdominal pain': 'dor abdominal',
  wheezing: 'sibilância', tremor: 'tremores', anorexia: 'anorexia', 'liver damage': 'lesão hepática', 'liver injury': 'lesão hepática', asphyxia: 'asfixia', hematuria: 'hematúria', ataxia: 'ataxia',
  'chest pain': 'dor torácica', conjunctivitis: 'conjuntivite', malaise: 'mal-estar', 'cardiac arrhythmias': 'arritmias cardíacas', 'chest tightness': 'aperto no peito', insomnia: 'insônia',
  bronchitis: 'bronquite', 'chronic bronchitis': 'bronquite crônica', pneumonitis: 'pneumonite', 'chemical pneumonitis': 'pneumonite química', 'reproductive effects': 'efeitos sobre a reprodução',
  coma: 'coma', jaundice: 'icterícia', salivation: 'salivação', 'weight loss': 'perda de peso', 'teratogenic effects': 'efeitos teratogênicos', methemoglobinemia: 'metemoglobinemia',
  'abdominal cramps': 'cólicas abdominais', 'skin sensitization': 'sensibilização da pele', 'sensitization dermatitis': 'dermatite de sensibilização', 'blurred vision': 'visão turva',
  rhinorrhea: 'coriza', anxiety: 'ansiedade', 'visual disturbance': 'distúrbios visuais', stupor: 'estupor', 'decreased pulmonary function': 'redução da função pulmonar', 'enlarged liver': 'aumento do fígado',
  anoxia: 'anóxia', 'cardiac arrest': 'parada cardíaca', miosis: 'miose', 'laryngeal spasm': 'espasmo da laringe', 'laryngeal spasms': 'espasmo da laringe', paresthesia: 'parestesia', asthma: 'asma',
  'allergic asthma': 'asma alérgica', anemia: 'anemia', fever: 'febre', restlessness: 'agitação', sweating: 'sudorese', 'corneal damage': 'lesão da córnea', leukopenia: 'leucopenia', hallucinations: 'alucinações',
  emphysema: 'enfisema', proteinuria: 'proteinúria', 'slurred speech': 'fala arrastada', irritability: 'irritabilidade', 'gastrointestinal disturbance': 'distúrbios gastrointestinais',
  'gastrointestinal disturbances': 'distúrbios gastrointestinais', 'dental erosion': 'erosão dentária', choking: 'sensação de sufocação', hepatitis: 'hepatite', psychosis: 'psicose', delirium: 'delírio',
  sneezing: 'espirros', 'pulmonary congestion': 'congestão pulmonar', photophobia: 'fotofobia', epistaxis: 'epistaxe', 'lung fibrosis': 'fibrose pulmonar', 'nasal septum perforation': 'perfuração do septo nasal',
  'perforation nasal septum': 'perfuração do septo nasal', 'ulceration of nasal septum': 'ulceração do septo nasal', 'skin ulcer': 'úlceras na pele', 'peripheral neuropathy': 'neuropatia periférica',
  tachycardia: 'taquicardia', 'skin blisters': 'bolhas na pele', alopecia: 'alopecia', edema: 'edema', necrosis: 'necrose', 'contact dermatitis': 'dermatite de contato', 'eye injury': 'lesão ocular',
  'corneal opacity': 'opacidade da córnea', stomatitis: 'estomatite', erythema: 'eritema', 'bone marrow depression': 'depressão da medula óssea', 'aplastic anemia': 'anemia aplástica',
  manganism: 'manganismo', 'metallic taste': 'gosto metálico', 'metal fume fever': 'febre dos fumos metálicos', 'interstitial fibrosis': 'fibrose intersticial', chloracne: 'cloracne', rash: 'erupções cutâneas',
  hypotension: 'hipotensão', hypertension: 'hipertensão', unconsciousness: 'perda de consciência', paralysis: 'paralisia', encephalopathy: 'encefalopatia', 'hearing loss': 'perda auditiva',
  'kidney': 'efeitos renais', liver: 'efeitos hepáticos', 'respiratory system': 'efeitos respiratórios', 'skin irritation': 'irritação da pele', 'irritation skin': 'irritação da pele',
  'cutaneous hypersensitivity': 'hipersensibilidade cutânea', 'resp sensitization': 'sensibilização respiratória', 'thyroid': 'efeitos na tireoide', 'blood changes': 'alterações sanguíneas',
  'gingival lead line': 'linha gengival de chumbo', 'peripheral neuropathy: numb extremities': 'neuropatia periférica', 'kidney disturbance': 'distúrbios renais', 'heart damage': 'lesão cardíaca',
  'lung damage': 'lesão pulmonar', 'testicular atrophy': 'atrofia testicular', 'hemolytic anemia': 'anemia hemolítica', 'eye pain': 'dor ocular', 'dry cracking skin': 'ressecamento e fissuras da pele',
  'skin cracking': 'fissuras na pele', 'defatting dermatitis': 'dermatite por desengorduramento', 'bronchospasm': 'broncoespasmo', 'leukocytosis': 'leucocitose', 'cirrhosis': 'cirrose',
};
const CARCINOGENO = 'potencial cancerígeno ocupacional (NIOSH)';

export function sintomasEmPortugues(t) {
  let s = String(t || '');
  if (!s.trim()) return '';
  const cancer = /carcinogen/i.test(s);
  s = s.replace(/\[[^\]]*\]/g, '').replace(/\((?:potential occupational carcinogen|carc)[^)]*\)/gi, '').replace(/lassitude \(weakness, exhaustion\)/gi, 'lassitude');
  const out = [];
  for (let g of s.split(/;\s*/)) {
    g = g.replace(/^(in animals|solution|liquid|vapor|dust|fume|gas|in presence of[^:]*):\s*/i, '').trim();
    const itens = g.split(/,\s*|\s+and\s+/).map((x) => x.replace(/\([^)]*\)/g, '').trim().toLowerCase()).filter(Boolean);
    let irrit = false; const orgs = [];
    for (const it of itens) {
      const m = it.match(/^irritation\s+(.*)$/);
      if (m) { irrit = true; if (ORGAO[m[1]]) orgs.push(ORGAO[m[1]]); continue; }
      if (irrit && ORGAO[it]) { orgs.push(ORGAO[it]); continue; }
      irrit = false;
      if (T[it]) out.push(T[it]);
    }
    if (orgs.length) out.push(`irritação ${[...new Set(orgs)].join(', ').replace(/, ([^,]*)$/, ' e $1')}`);
  }
  const u = [...new Set(out)];
  if (cancer) u.push(CARCINOGENO);
  if (!u.length) return '';
  const txt = u.join('; ');
  return `${txt.charAt(0).toUpperCase()}${txt.slice(1)}.`;
}

// agentes do banco sem sintomas no NIOSH: resumo das fichas oficiais (FDS/FISPQ, IARC e LINACH)
export const EFEITOS_PT = {
  'oxido-de-ferro-fumos': 'Siderose (pneumoconiose benigna, com sombras radiológicas semelhantes às da pneumoconiose fibrótica); irritação das vias respiratórias.',
  glifosato: 'Irritação dos olhos e da pele; a formulação comercial pode irritar as vias respiratórias. IARC Grupo 2A.',
  mancozebe: 'Irritação dos olhos, da pele e das vias respiratórias; sensibilização da pele; efeitos na tireoide (etilenotioureia, produto de degradação).',
  cipermetrina: 'Parestesia da face e das mãos; irritação dos olhos e da pele; em exposição elevada, tontura, cefaleia e náusea.',
  acefato: 'Inibição da colinesterase (organofosforado): miose, sudorese, salivação, náusea, cólicas, tremores e fraqueza muscular.',
  xilenos: 'Irritação dos olhos, do nariz e da garganta; tontura, cefaleia, sonolência e incoordenação; dermatite por desengorduramento.',
  tgic: 'Sensibilização da pele e respiratória (dermatite e asma); irritação dos olhos; suspeito de efeitos mutagênicos.',
  'oleo-diesel': 'Irritação da pele (dermatite por desengorduramento) e dos olhos; a névoa e os vapores irritam as vias respiratórias; aspiração causa pneumonite química; exaustão de diesel: IARC Grupo 1.',
  'hipoclorito-de-sodio': 'Álcali cáustico, corrosivo e irritante: queimaduras e dermatite de contato, lesões oculares, irritação das vias respiratórias; libera cloro em contato com ácidos.',
  'hcfc-141b': 'Depressão do sistema nervoso central em concentrações elevadas (tontura, sonolência); arritmias cardíacas; congelamento no contato com o líquido.',
  trietilenodiamina: 'Corrosivo para os olhos e irritante da pele e das vias respiratórias; sensibilização respiratória.',
  dietilenoglicol: 'Tóxico por ingestão (lesão renal e hepática); irritação leve dos olhos e da pele.',
  propilenoglicol: 'Baixa toxicidade; irritação leve dos olhos e da pele; a névoa pode irritar as vias respiratórias.',
  ouro: 'Fumos e reagentes do processo (cianetos, mercúrio, ácidos): irritação respiratória e intoxicações conforme o reagente.',
  creosoto: 'Irritação e queimaduras da pele, fotossensibilização; cancerígeno (IARC Grupo 2A; LINACH).',
  'benzo-a-pireno': 'Cancerígeno para humanos (IARC Grupo 1; LINACH Grupo 1); dermatite e fotossensibilização.',
  'sulfato-de-dietila': 'Corrosivo para a pele, os olhos e as vias respiratórias; provável cancerígeno (IARC Grupo 2A).',
  auramina: 'Produção de auramina: cancerígena para humanos (bexiga – IARC Grupo 1); irritação dos olhos e da pele.',
  metano: 'Asfixiante simples (reduz o oxigênio do ar); inflamável e explosivo.',
  azatioprina: 'Imunossupressor; cancerígeno para humanos (IARC Grupo 1); mielossupressão.',
  ciclofosfamida: 'Antineoplásico; cancerígeno para humanos (IARC Grupo 1); efeitos sobre a reprodução e a medula óssea.',
  clorambucil: 'Antineoplásico; cancerígeno para humanos (IARC Grupo 1); mielossupressão.',
  dietilestilbestrol: 'Estrogênio sintético; cancerígeno para humanos (IARC Grupo 1); efeitos sobre a reprodução.',
  bussulfano: 'Antineoplásico; cancerígeno para humanos (IARC Grupo 1); mielossupressão.',
  fenacetina: 'Analgésico; misturas com fenacetina são cancerígenas (IARC Grupo 1); lesão renal.',
  oximetolona: 'Esteroide anabolizante; provável cancerígeno (IARC Grupo 2A); lesão hepática.',
  procarbazina: 'Antineoplásico; provável cancerígeno (IARC Grupo 2A); mielossupressão.',
  argonio: 'Asfixiante simples (reduz o oxigênio do ar).',
  etano: 'Asfixiante simples (reduz o oxigênio do ar); inflamável.',
  etileno: 'Asfixiante simples; em concentrações elevadas, efeito anestésico; inflamável.',
  helio: 'Asfixiante simples (reduz o oxigênio do ar).',
  hidrogenio: 'Asfixiante simples; altamente inflamável e explosivo.',
  neonio: 'Asfixiante simples (reduz o oxigênio do ar).',
  propileno: 'Asfixiante simples; em concentrações elevadas, efeito anestésico; inflamável.',
  antraceno: 'Irritação e fotossensibilização da pele; irritação dos olhos e das vias respiratórias.',
  cresol: 'Corrosivos para a pele, os olhos e as mucosas; absorção pela pele com lesão hepática e renal.',
  naftois: 'Irritação dos olhos e da pele; absorção pela pele; em exposição elevada, lesão renal.',
  ddd: 'Organoclorado: efeitos sobre o sistema nervoso e o fígado; suspeito de ser cancerígeno.',
  emetina: 'Irritação das mucosas e das vias respiratórias; efeitos cardíacos (miocardite) em exposição repetida.',
  enxofre: 'Poeira irritante dos olhos e das vias respiratórias; sulfitos podem desencadear asma; dióxido de enxofre na combustão.',
  'escoria-de-thomas': 'Poeira alcalina irritante dos olhos e das vias respiratórias; pneumonite em exposição intensa.',
  'bagaco-de-cana': 'Poeira orgânica: bagaçose (pneumonite por hipersensibilidade); irritação das vias respiratórias.',
  'oleo-queimado': 'Dermatite e foliculite; contém hidrocarbonetos policíclicos aromáticos (óleos minerais não tratados: IARC Grupo 1).',
  'mostardas-nitrogenadas': 'Vesicantes: queimaduras e bolhas na pele, lesões oculares e respiratórias; cancerígenas.',
  'butadieno-estireno': 'Monômeros residuais (butadieno – IARC Grupo 1; estireno – Grupo 2A): irritação e efeitos no sistema nervoso.',
  nitronaftilamina: 'Amina aromática: suspeita de câncer de bexiga; metemoglobinemia; irritação da pele.',
  etilnitrosoureias: 'Agente alquilante; provável cancerígeno (IARC Grupo 2A); efeitos mutagênicos.',
};
// id do registro do banco ("qui-hipoclorito-de-sodio") → texto
export function efeitosDoBanco(q) {
  if (!q) return '';
  const id = String(q.id || '').replace(/^qui-/, '');
  return EFEITOS_PT[id] || sintomasEmPortugues(q.data?.sintomas);
}
