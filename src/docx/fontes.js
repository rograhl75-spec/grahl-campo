// Fontes dos documentos: registro opcional de jurisprudência e referências (ABNT).
// A conclusão técnica se apoia só na norma; a jurisprudência fica num item próprio,
// incluído ou não conforme a escolha do caso (ou o padrão em Meus dados).
// Situação dos temas conferida em novembro de 2026 – temas pendentes saem marcados para conferência.

const tem = (dados, re) => dados.medicoes.some((m) => re.test(m.data.agente || ''))
  || re.test(`${dados.c.agentesAlegados || ''} ${dados.periodos.map((p) => p.data.agentes || '').join(' ')}`);

export function comJurisprudencia(dados) {
  const caso = dados.c.jurisprudencia || '';
  if (caso === 'Incluir') return true;
  if (caso === 'Não incluir') return false;
  return (dados.perfil.jurisprudenciaPadrao || 'Incluir em seção própria') !== 'Não incluir';
}

function contexto(dados) {
  return {
    ruido: tem(dados, /ru[ií]do/i),
    calor: tem(dados, /calor|ibutg/i),
    vibracao: tem(dados, /vibra/i),
    biologico: tem(dados, /biol|lixo|esgoto|banheiro|sanit|hospital/i),
    epi: dados.epis.length > 0 || tem(dados, /ru[ií]do|qu[ií]m/i),
    paradigmas: dados.periodos.some((p) => p.data.paradigmaRuido || p.data.paradigmaVibracao) || dados.c.similaridade === 'Sim',
    tratorista: /tratorist|operador de trator|operador de m[aá]quinas? agr[ií]col/i.test(`${dados.c.funcoes || ''} ${dados.periodos.map((p) => `${p.data.cargo || ''} ${p.data.atividades || ''}`).join(' ')}`)
      && dados.periodos.some((p) => p.data.inicio && p.data.inicio <= '1995-04-28'),
    motorista: /motorista|caminh|carreteir|ônibus|onibus/i.test(`${dados.c.funcoes || ''} ${dados.periodos.map((p) => p.data.cargo || '').join(' ')}`),
    periculosidade: (dados.c.objeto || []).includes('Periculosidade'),
    eletricidade: tem(dados, /eletric|el[ée]tric|tens[ãa]o|volts?\b|\bkv\b|subesta/i) || /eletricist|eletrot[ée]cnic|linha viva/i.test(dados.periodos.map((p) => p.data.cargo || '').join(' ')),
    vigilante: /vigilant|vigia|seguran[çc]a patrimonial|guarda/i.test(`${dados.c.funcoes || ''} ${dados.periodos.map((p) => p.data.cargo || '').join(' ')}`),
  };
}

const PREV = [
  { q: (x) => x.ruido || x.epi, t: '**STF, Tema 555 (ARE 664.335):** o EPI eficaz afasta a especialidade, salvo para o ruído: a declaração de eficácia do EPI no PPP não descaracteriza o tempo especial por exposição a ruído acima do limite.' },
  { q: (x) => x.epi, t: '**STJ, Tema 1090 (julgado em 2025):** a informação de EPI eficaz no PPP afasta, em princípio, a especialidade; cabe ao segurado demonstrar a ineficácia (inadequação ao risco, CA irregular, falta de manutenção ou de treinamento) e, havendo dúvida razoável sobre a eficácia, a conclusão favorece o segurado.' },
  { q: (x) => x.ruido, t: '**STJ, Tema 694:** entre 06/03/1997 e 18/11/2003 o limite do ruído é de 90 dB(A), sem aplicação retroativa do Decreto nº 4.882/2003.' },
  { q: (x) => x.ruido, t: '**STJ, Tema 1083 (REsp 1.886.795/RS, 18/11/2021):** com níveis variáveis, a especialidade por ruído se afere pelo NEN; ausente essa informação, adota-se o nível máximo (pico), desde que a perícia judicial comprove a habitualidade e a permanência da exposição.' },
  { q: (x) => x.ruido, t: '**TNU, Tema 317 (PEDILEF 5000648-28.2020.4.02.5002/ES, novo julgamento em 18/09/2025):** para os períodos a partir de 19/11/2003, a simples menção a dose, dosímetro ou dosimetria no PPP não basta; o documento deve indicar expressamente a NHO-01 da FUNDACENTRO e/ou a NR-15 (em diálogo com o Tema 174 da TNU).' },
  { q: (x) => x.ruido, t: '**TNU, Tema 174:** a partir de 19/11/2003, para a aferição do ruído contínuo ou intermitente, é obrigatória a utilização das metodologias da NHO-01 da FUNDACENTRO ou da NR-15, que reflitam a medição da exposição durante toda a jornada de trabalho, vedada a medição pontual, devendo constar do PPP a técnica utilizada e a respectiva norma.' },
  { q: (x) => x.eletricidade, t: '**STJ, Tema 534 (REsp 1.306.113/SC):** as normas regulamentadoras que estabelecem os casos de agentes e atividades nocivos à saúde do trabalhador são exemplificativas; é possível o reconhecimento da especialidade do trabalho exposto à eletricidade (tensão superior a 250 volts) após 05/03/1997, desde que comprovada a exposição de forma permanente, não ocasional nem intermitente, por meio de prova técnica.' },
  { q: (x) => x.vigilante, t: '**STJ, Tema 1031:** é admissível o reconhecimento da especialidade da atividade de vigilante, com ou sem o uso de arma de fogo, em data posterior à Lei nº 9.032/1995 e ao Decreto nº 2.172/1997, desde que haja a comprovação da efetiva nocividade da atividade, por qualquer meio de prova até 05/03/1997 e, após essa data, mediante laudo técnico ou elemento material equivalente, para comprovar a permanente, não ocasional nem intermitente, exposição a agente nocivo que coloque em risco a integridade física do segurado.' },
  { q: (x) => x.tratorista, t: '**TNU, Súmula 70:** a atividade de tratorista pode ser equiparada à de motorista de caminhão para fins de reconhecimento de atividade especial mediante enquadramento por categoria profissional (períodos até 28/04/1995).' },
  { q: (x) => x.calor, t: '**TNU, Tema 323 (PEDILEF 0510577-41.2020.4.05.8200/PB; embargos rejeitados em 11/03/2026):** calor – de 06/03/1997 a 18/11/2003, a taxa metabólica é dispensável no trabalho intermitente com descanso no próprio local e atividades da mesma categoria, e indispensável (média ponderada) nos demais casos; a partir de 01/01/2004 (facultativamente desde 19/11/2003), a NHO-06 é obrigatória, com a taxa metabólica no PPP ou no LTCAT.' },
  { q: (x) => x.calor, t: '**TNU, PEDILEF 0506002-13.2018.4.05.8312:** até a Portaria SEPRT nº 1.359/2019, admite-se o tempo especial por calor de fonte natural, se habitual e permanente e superados os limites do Anexo 3 da NR-15, com o IBUTG calculado para ambiente externo com carga solar.' },
  { q: () => true, t: '**TNU, Súmula 68:** o laudo pericial não contemporâneo ao período trabalhado é apto à comprovação da atividade especial do segurado.' },
  { q: (x) => x.paradigmas, t: '**TNU, PEDILEF 0001323-30.2010.4.03.6318 (22/06/2017):** admite-se a perícia indireta por similaridade quando a empresa de origem está inativa ou teve o ambiente substancialmente alterado, exigida a semelhança entre a empresa paradigma e a de origem na mesma época.' },
  { q: (x, tipo) => tipo !== 'laudo', t: '**STJ, Tema 1291 (julgado em 10/09/2025):** é possível o reconhecimento de atividade especial do contribuinte individual não cooperado após a Lei nº 9.032/1995, mediante a comprovação da exposição a agentes nocivos; não se aplica a esses segurados a exigência de formulário emitido por empresa.' },
  { q: (x) => x.motorista, t: '**STJ, Tema 1307 (REsp 2.164.724/RS, rel. Min. Gurgel de Faria, julgado em 07/05/2026, acórdão publicado em 20/05/2026):** é possível o reconhecimento do caráter especial, em virtude da penosidade, das atividades de motorista ou cobrador de ônibus e de motorista de caminhão exercidas após a Lei nº 9.032/1995, desde que comprovada, por perícia técnica individualizada, a exposição habitual e permanente a condições concretas de desgaste à saúde; não basta o enquadramento presumido pela categoria profissional.' },
  { q: (x) => x.motorista, t: '**TRF4, IAC nº 5 (IAC 5033888-90.2018.4.04.0000):** é possível o reconhecimento do caráter especial das atividades de motorista ou de cobrador de ônibus em virtude da penosidade, desde que comprovada por perícia judicial individualizada, com direito do interessado à produção dessa prova; a perícia analisa o veículo efetivamente conduzido (marca, modelo, ano, esforço na direção e nas trocas de marcha, motor junto ao posto com vibração, ruído e calor), os trajetos (localidades de risco de assaltos e violência, vias sem pavimentação) e as jornadas (possibilidade de ausentar-se do veículo para as necessidades fisiológicas).' },
  { q: (x) => x.paradigmas, t: '**TRF4, Súmula 106 (D.E. de 22/09/2016):** quando impossível a realização de perícia técnica no local de trabalho do segurado, admite-se a produção dessa prova em empresa similar, a fim de aferir a exposição aos agentes nocivos e comprovar a especialidade do labor.' },
];

const TRAB = [
  { q: () => true, t: '**TST, Súmula 47:** o trabalho em condições insalubres em caráter intermitente não afasta, só por essa circunstância, o direito ao adicional.' },
  { q: () => true, t: '**TST, Súmula 80:** a eliminação da insalubridade pelo fornecimento de aparelhos protetores aprovados pelo órgão competente exclui o adicional.' },
  { q: () => true, t: '**TST, Súmula 289:** o simples fornecimento do EPI não exime o empregador do adicional; cabe-lhe tomar as medidas que conduzam à diminuição ou eliminação da nocividade, inclusive quanto ao uso efetivo.' },
  { q: (x) => x.biologico, t: '**TST, Súmula 448:** I – não basta a constatação pericial; é necessária a classificação da atividade na relação oficial; II – a higienização de instalações sanitárias de uso público ou coletivo de grande circulação, e a respectiva coleta de lixo, enseja o adicional em grau máximo (NR-15, Anexo 14).' },
  { q: (x) => x.calor, t: '**TST, OJ 173 da SDI-1:** I – é indevido o adicional pela simples exposição à radiação solar a céu aberto; II – é devido quando há exposição ao calor acima dos limites, inclusive em ambiente externo com carga solar, nas condições do Anexo 3 da NR-15 (redação anterior à Portaria SEPRT nº 1.359/2019).' },
  { q: (x) => x.periculosidade, t: '**TST, Súmula 364:** é devido o adicional de periculosidade na exposição permanente ou intermitente; é indevido quando o contato é eventual ou, sendo habitual, por tempo extremamente reduzido.' },
];

// Item próprio com os entendimentos aplicáveis; não integra o fundamento técnico.
export function registroJurisprudencia(d, dados, { numero = '', prev, tipo = 'laudo', nivel = 'h1' } = {}) {
  if (!comJurisprudencia(dados)) return false;
  const x = contexto(dados);
  const lista = (prev ? PREV : TRAB).filter((e) => e.q(x, tipo));
  if (!prev && /Fazenda|servidor/i.test(`${dados.c.justica || ''} ${dados.c.materia || ''}`)) {
    lista.length = 0;
    lista.push({ t: '[[Registrar, se houver, o entendimento do tribunal local sobre o adicional do servidor e a lei do ente.]]' });
  }
  if (!lista.length) return false;
  d[nivel](numero, 'Registro de entendimentos jurisprudenciais');
  d.texto('Os entendimentos abaixo são registrados apenas para apreciação do Juízo e não integram o fundamento técnico das conclusões deste documento, que se apoiam exclusivamente na legislação e nas normas técnicas indicadas.');
  for (const e of lista) d.texto(`- ${e.t}`);
  return true;
}

// ---------------- Referências (ABNT NBR 6023) ----------------
export function referencias(dados, { prev, judicial = true } = {}) {
  const x = contexto(dados);
  const fis = (re) => dados.medicoes.some((m) => re.test(m.data.agente || ''));
  const quimico = fis(/qu[ií]m/i) || /qu[ií]m|poeira|s[ií]lica|solvente|hidrocarb|óleo|oleo/i.test(dados.c.agentesAlegados || '');
  const vmb = fis(/mãos|maos|VMB/i);
  const r = [];
  if (judicial) r.push('BRASIL. Lei nº 13.105, de 16 de março de 2015. Código de Processo Civil. Brasília, DF: Presidência da República, 2015.');
  if (prev) {
    r.push(
      'BRASIL. Decreto nº 53.831, de 25 de março de 1964. Brasília, DF: Presidência da República, 1964.',
      'BRASIL. Decreto nº 83.080, de 24 de janeiro de 1979. Brasília, DF: Presidência da República, 1979.',
      'BRASIL. Lei nº 8.213, de 24 de julho de 1991. Planos de Benefícios da Previdência Social. Brasília, DF: Presidência da República, 1991.',
      'BRASIL. Decreto nº 2.172, de 5 de março de 1997. Brasília, DF: Presidência da República, 1997.',
      'BRASIL. Decreto nº 3.048, de 6 de maio de 1999. Regulamento da Previdência Social. Brasília, DF: Presidência da República, 1999.',
      'BRASIL. Decreto nº 4.882, de 18 de novembro de 2003. Brasília, DF: Presidência da República, 2003.',
      'BRASIL. Lei nº 9.032, de 28 de abril de 1995. Brasília, DF: Presidência da República, 1995.',
      'BRASIL. Lei nº 9.732, de 11 de dezembro de 1998. Brasília, DF: Presidência da República, 1998.',
      'BRASIL. [Constituição (1988)]. Emenda Constitucional nº 103, de 12 de novembro de 2019. Brasília, DF: Presidência da República, 2019.',
      'BRASIL. Ministério do Trabalho. Norma Regulamentadora nº 15 (NR-15): Atividades e Operações Insalubres. Brasília, DF, redação vigente em cada período.',
      'INSTITUTO NACIONAL DO SEGURO SOCIAL (Brasil). Instrução Normativa PRES/INSS nº 128, de 28 de março de 2022. Brasília, DF: INSS, 2022.',
    );
  } else {
    r.push(
      'BRASIL. Decreto-Lei nº 5.452, de 1º de maio de 1943. Consolidação das Leis do Trabalho. Rio de Janeiro: Presidência da República, 1943.',
      'BRASIL. Ministério do Trabalho. Norma Regulamentadora nº 6 (NR-6): Equipamento de Proteção Individual. Brasília, DF, redação vigente.',
      'BRASIL. Ministério do Trabalho. Norma Regulamentadora nº 15 (NR-15): Atividades e Operações Insalubres. Brasília, DF, redação vigente em cada período.',
    );
    if (x.periculosidade) r.push('BRASIL. Ministério do Trabalho. Norma Regulamentadora nº 16 (NR-16): Atividades e Operações Perigosas. Brasília, DF, redação vigente em cada período.');
  }
  if (x.ruido || x.calor || x.vibracao || vmb || quimico) r.push('BRASIL. Secretaria Especial de Previdência e Trabalho. Portaria SEPRT nº 6.735, de 10 de março de 2020. Aprova a nova redação da Norma Regulamentadora nº 9 (NR-9). Diário Oficial da União, Brasília, DF, 12 mar. 2020.');
  if (x.ruido) r.push('FUNDACENTRO. NHO 01: avaliação da exposição ocupacional ao ruído. São Paulo: FUNDACENTRO, 2001.');
  if (x.calor) {
    r.push('FUNDACENTRO. NHO 06: avaliação da exposição ocupacional ao calor. 2. ed. São Paulo: FUNDACENTRO, 2017.');
    r.push('BRASIL. Secretaria Especial de Previdência e Trabalho. Portaria SEPRT nº 1.359, de 9 de dezembro de 2019. Diário Oficial da União, Brasília, DF, 11 dez. 2019.');
  }
  if (x.vibracao) {
    r.push('FUNDACENTRO. NHO 09: avaliação da exposição ocupacional a vibrações de corpo inteiro. São Paulo: FUNDACENTRO, 2013.');
    r.push('BRASIL. Ministério do Trabalho e Emprego. Portaria MTE nº 1.297, de 13 de agosto de 2014. Diário Oficial da União, Brasília, DF, 14 ago. 2014.');
    r.push('INTERNATIONAL ORGANIZATION FOR STANDARDIZATION. ISO 2631-1: mechanical vibration and shock – evaluation of human exposure to whole-body vibration – part 1: general requirements. Geneva: ISO, 1997.');
  }
  if (vmb) {
    r.push('FUNDACENTRO. NHO 10: avaliação da exposição ocupacional a vibrações em mãos e braços. São Paulo: FUNDACENTRO, 2013.');
    r.push('INTERNATIONAL ORGANIZATION FOR STANDARDIZATION. ISO 5349-1: mechanical vibration – measurement and evaluation of human exposure to hand-transmitted vibration – part 1: general requirements. Geneva: ISO, 2001.');
  }
  if (quimico) {
    if (/poeira|s[ií]lica|particulad|fumos? met|asbesto|amianto|carv[ãa]o/i.test(`${dados.c.agentesAlegados || ''} ${dados.medicoes.map((m) => `${m.data.descricao || ''} ${m.data.metodo || ''}`).join(' ')}`)) r.push('FUNDACENTRO. NHO 08: coleta de material particulado sólido suspenso no ar de ambientes de trabalho. São Paulo: FUNDACENTRO, 2009.');
    r.push('AMERICAN CONFERENCE OF GOVERNMENTAL INDUSTRIAL HYGIENISTS (ACGIH). TLVs and BEIs: threshold limit values for chemical substances and physical agents. Cincinnati: ACGIH, edição vigente. (Referência técnica complementar; NR-9, item 9.6.1.1.)');
  }
  // ABNT: ordem alfabética por autor; do mesmo autor, ordem cronológica (ordem de inserção)
  const autor = (t) => t.split('.')[0];
  const ano = (t) => Number((t.match(/\b(19|20)\d{2}\b/) || ['9999'])[0]);
  return r.map((t, i) => [t, i]).sort((a, b) => autor(a[0]).localeCompare(autor(b[0]), 'pt') || ano(a[0]) - ano(b[0]) || a[1] - b[1]).map(([t]) => t);
}

export function secaoReferencias(d, dados, opts) {
  d.h1('', 'Referências');
  for (const t of referencias(dados, opts)) d.texto(t, { recuo: false });
}
