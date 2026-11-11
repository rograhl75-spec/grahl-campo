// Modelos acrescentados na auditoria de novembro de 2026 (v2.28.0):
// laudo de acidente do trabalho (judicial ou extrajudicial), petições avulsas do perito
// e do assistente técnico, quadro conclusivo trabalhista e confronto com o Anexo 11 da NR-15.
import { ehSuplementar } from '../schema.js';
import { doseJornada, fatorQ, fmt, ibutg } from '../calc.js';
import { confrontoAnexo11, num as numQ } from '../quimicos.js';
import {
  Doc, carregar, finalizar, dataBR, partes, art, enderecamentoTexto, linhasProcesso, qualificacaoCurta, credencial,
  equipamentosUsados, quadroEquipamentos, quadroDiligencia, quadroDocumentos, quadroEpis, profissiografia, figurasDoCaso,
  respostasQuesitos, capaTecnica, blocoAssinatura, textoDeterminacao, apendicesDoCaso, textoIntegram, inserirApendices,
  nomePostoFn, prefixoQuesito, numeroPorExtenso,
} from './base.js';
import { introPerito, fecho, contratanteDe } from './modelos.js';

const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
const GRAU = { 'mínimo': 'mínimo (10%)', 'médio': 'médio (20%)', 'máximo': 'máximo (40%)' };
const f2 = (x) => fmt(x, x < 10 ? 2 : 1);

// ---------------- Agentes químicos: confronto com o Anexo 11 ----------------
export function agenteDaMedicao(m, dados) {
  return (dados.quimicos || []).find((r) => r.id === m.data.agenteBanco) || null;
}

// Quadro de confronto das medições de agentes químicos com o Anexo 11 (itens 7 a 9 e Quadros 1 e 2)
export function quadroQuimicosAnexo11(d, ms, dados, nome) {
  const linhas = ms.map((m) => {
    const x = m.data;
    const ag = agenteDaMedicao(m, dados);
    const manual = numQ(x.limite);
    let cf = ag ? confrontoAnexo11(ag.data, x.valor, x.unidade, { maximo: x.maximo }) : null;
    if (!cf && isFinite(manual) && isFinite(numQ(x.valor))) {
      cf = { lt: manual, un: x.unidade || '', c: numQ(x.valor), pct: (numQ(x.valor) / manual) * 100, supera: numQ(x.valor) > manual, grau: '', teto: false, pele: false, graveIminente: false };
    }
    const agente = [x.descricao || (ag && ag.data.nome) || '', ag && ag.data.cas ? `CAS ${ag.data.cas}` : ''].filter(Boolean).join('\n');
    const res = [v(x.valor) && `${x.valor} ${x.unidade || ''}`.trim(), v(x.nAmostras) && `${x.nAmostras} amostra(s)`, v(x.maximo) && `máx. ${x.maximo}`].filter(Boolean).join('\n');
    if (!cf) return [nome(x.postoId), agente, res, '[[limite – Anexo 11, 12 ou 13]]', '[[conferir]]'];
    const lt = `${f2(cf.lt)} ${cf.un}${cf.teto ? ' (teto)' : ''}${cf.pele ? '\n+ pele' : ''}${cf.grau ? `\ngrau ${cf.grau}` : ''}`;
    const sit = `${fmt(cf.pct, 0)}% do LT – ${cf.supera ? 'supera' : 'não supera'}${cf.graveIminente ? '\nacima do valor máximo (item 7)' : ''}`;
    return [nome(x.postoId), agente, res, lt, sit];
  });
  return d.quadro('Agentes químicos – confronto com o Anexo 11 da NR-15', [['Posto', 'Agente', 'Resultado', 'Limite de tolerância', 'Situação'], ...linhas],
    { larguras: [0.2, 0.22, 0.2, 0.18, 0.2], tam: 9, alinhar: 'left',
      fonte: 'Elaborado pelo autor. NR-15, Anexo 11: média aritmética das amostras (item 8); valor teto (item 9); valor máximo = LT × fator de desvio do Quadro 2 (item 7). Limites válidos para jornada de até 48 horas semanais (item 10).' });
}

// ---------------- Quadro conclusivo trabalhista (por agente e posto) ----------------
export function quadroConclusivoTrab(d, dados, { titulo = 'Quadro conclusivo por agente', fonte } = {}) {
  const nome = nomePostoFn(dados.postos);
  const rows = [];
  for (const m of dados.medicoes) {
    const x = m.data;
    const posto = nome(x.postoId);
    if (x.agente === 'Ruído') {
      if (fatorQ(m) === 3) { rows.push([posto, 'Ruído (Anexo 1)', 'dose 100% (85 dB(A), 8 h)', `${x.dose ? `${x.dose}%` : ''} (q = 3)`, '[[refazer com q = 5]]', '']); continue; }
      const dj = doseJornada(x.dose, x.tempoAmostragem, x.jornada);
      if (!isFinite(dj)) continue;
      const sup = Math.round(dj * 10) / 10 > 100;
      rows.push([posto, 'Ruído (Anexo 1)', 'dose 100% (85 dB(A), 8 h)', `dose ${fmt(dj)}%`, sup ? 'Supera' : 'Não supera', sup ? GRAU['médio'] : '—']);
    } else if (/corpo inteiro|mãos e braços/.test(x.agente || '')) {
      const vmb = /mãos/.test(x.agente);
      const a = numQ(x.aren), vd = numQ(x.vdv);
      if (!isFinite(a)) continue;
      const sup = vmb ? a > 5 : (a > 1.1 || (isFinite(vd) && vd > 21));
      rows.push([posto, `${vmb ? 'VMB' : 'VCI'} (Anexo 8)`, vmb ? 'aren 5 m/s²' : 'aren 1,1 m/s² ou VDVR 21 m/s^1,75',
        `aren ${f2(a)} m/s²${!vmb && isFinite(vd) ? `\nVDVR ${f2(vd)}` : ''}`, sup ? 'Supera' : 'Não supera', sup ? GRAU['médio'] : '—']);
    } else if (/Calor/.test(x.agente || '')) {
      const ib = ibutg(x.tbn, x.tg, x.tbs, /solar direta/.test(x.condicao || ''));
      rows.push([posto, 'Calor (Anexo 3)', '[[limite conforme taxa metabólica e regime]]', isFinite(ib) ? `IBUTG ${fmt(ib)} °C` : (x.ibutgLido || ''), '[[conferir]]', '[[grau médio (20%), se superar]]']);
    } else if (x.agente === 'Agente químico') {
      const ag = agenteDaMedicao(m, dados);
      const cf = ag ? confrontoAnexo11(ag.data, x.valor, x.unidade, { maximo: x.maximo }) : null;
      const nomeAg = x.descricao || (ag && ag.data.nome) || 'Agente químico';
      if (!cf) { rows.push([posto, `${nomeAg} (Anexo 11/13)`, '[[limite]]', v(x.valor) ? `${x.valor} ${x.unidade || ''}` : '', '[[conferir]]', '[[grau]]']); continue; }
      rows.push([posto, `${nomeAg} (Anexo 11)`, `${f2(cf.lt)} ${cf.un}${cf.teto ? ' (teto)' : ''}`, `${f2(cf.c)} ${cf.un}`, cf.supera ? 'Supera' : 'Não supera', cf.supera ? (GRAU[cf.grau] || '[[grau]]') : '—']);
    }
  }
  if ((dados.c.objeto || []).includes('Periculosidade')) rows.push(['[[área / atividade]]', 'Periculosidade (NR-16, Anexo [[ ]])', '[[critério do anexo]]', '[[constatação]]', '[[conferir]]', '[[adicional de 30%]]']);
  if (!rows.length) return false;
  d.quadro(titulo, [['Posto', 'Agente', 'Limite / critério', 'Resultado', 'Confronto', 'Enquadramento'], ...rows],
    { larguras: [0.19, 0.17, 0.2, 0.15, 0.12, 0.17], tam: 9, alinhar: 'left',
      fonte: fonte || 'Elaborado pelo autor a partir das avaliações deste laudo. O enquadramento indicado considera só o confronto com o limite; a neutralização pelo EPI e a conclusão redigida abaixo prevalecem.' });
  return true;
}

// ======================================================================
// LAUDO TÉCNICO DE ACIDENTE DO TRABALHO (perito do juízo ou extrajudicial)
// ======================================================================
const NRS = [
  { n: 'NR-10', t: 'Segurança em instalações e serviços em eletricidade', re: /el[ée]tric|choque|energiz|tens[ãa]o|painel|subesta/i, req: 'Medidas de controle do risco elétrico, desenergização, habilitação e autorização dos trabalhadores' },
  { n: 'NR-11', t: 'Transporte, movimentação, armazenagem e manuseio de materiais', re: /empilhadeira|ponte rolante|guindaste|talha|i[çc]amento|paleteira|movimenta[çc]/i, req: 'Operação por trabalhador habilitado, condições do equipamento e sinalização' },
  { n: 'NR-12', t: 'Segurança no trabalho em máquinas e equipamentos', re: /m[áa]quina|prensa|serra|torno|esteira|correia|engrenagem|cilindro|picador|moedor|misturador|trator|colhedora|implemento|equipamento/i, req: 'Proteções fixas e móveis, dispositivos de segurança e de parada de emergência, procedimentos, manual e capacitação do operador' },
  { n: 'NR-13', t: 'Caldeiras, vasos de pressão, tubulações e tanques metálicos de armazenamento', re: /caldeira|vaso de press|autoclave/i, req: 'Dispositivos de segurança, inspeções periódicas e operador capacitado' },
  { n: 'NR-18', t: 'Segurança e saúde no trabalho na indústria da construção', re: /obra|constru[çc]|andaime|escava|canteiro|demoli/i, req: 'Proteções coletivas, organização do canteiro, escavações e capacitação' },
  { n: 'NR-20', t: 'Segurança e saúde no trabalho com inflamáveis e combustíveis', re: /inflam[áa]v|combust[íi]vel|tanque|abastec|g[áa]s/i, req: 'Controle de fontes de ignição, procedimentos e capacitação' },
  { n: 'NR-31', t: 'Segurança e saúde no trabalho na agricultura, pecuária, silvicultura, exploração florestal e aquicultura', re: /rural|agr[íi]col|lavoura|trator|colhedora|silo|fazenda|florest|motosserra/i, req: 'Máquinas e implementos com proteções, capacitação e organização do trabalho rural' },
  { n: 'NR-33', t: 'Segurança e saúde nos trabalhos em espaços confinados', re: /espa[çc]o confinado|silo|tanque|galeria|cisterna|po[çc]o/i, req: 'Permissão de entrada, monitoramento da atmosfera, vigia e plano de resgate' },
  { n: 'NR-35', t: 'Trabalho em altura', re: /altura|queda|telhado|escada|andaime|plataforma|carroceria|cobertura/i, req: 'Análise de risco, permissão de trabalho, sistema de proteção contra quedas e capacitação' },
];

export function normasDoAcidente(c) {
  const t = [c.acidenteMaquina, c.acidenteAtividade, c.acidenteLocal, c.acidenteRelato, c.acidenteRelatoEmpresa, c.funcoes, c.atividadesAlegadas].map(v).join(' ');
  return [
    { n: 'NR-1', t: 'Disposições gerais e gerenciamento de riscos ocupacionais', req: 'Identificação de perigos, avaliação dos riscos, plano de ação e capacitação (GRO/PGR)' },
    ...NRS.filter((x) => x.re.test(t)),
    { n: 'NR-6', t: 'Equipamentos de proteção individual – EPI', req: 'EPI adequado ao risco, com CA, orientação e fiscalização do uso' },
  ];
}

export async function laudoAcidente(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const pt = partes(c);
  const extra = c.tipoAtuacao === 'Extrajudicial';
  const d = new Doc();
  const resp = `${perfil.nome} – ${credencial(perfil)}`;
  if (extra) {
    capaTecnica(d, {
      titulo: 'LAUDO TÉCNICO DE ACIDENTE DO TRABALHO', subtitulo: 'Análise técnica das condições e das causas do acidente', perfil,
      pares: [['Contratante', contratanteDe(c)], ['Acidentado', c.autorNome], ['Empresa', c.reuNome], ['CNPJ', c.reuCnpj],
        ['Data do acidente', dataBR(c.acidenteData)], ['Local', c.acidenteLocal], ['Responsável técnico', resp], ['ART', v(c.art) || '[[nº da ART]]']].filter(([, x]) => v(x)),
    });
  } else {
    capaTecnica(d, {
      titulo: 'LAUDO TÉCNICO PERICIAL', subtitulo: 'Acidente do trabalho – análise técnica das condições e das causas', perfil,
      orgao: c.justica ? `Poder Judiciário – ${c.justica}` : '',
      pares: [['Processo', c.numero], ['Juízo', [c.juizo, c.comarca].filter(Boolean).join(' – ')], [pt.autor, c.autorNome], [pt.reu, c.reuNome],
        ['Data do acidente', dataBR(c.acidenteData)], ['Vistoria', dataBR(c.vistoriaData)], ['Perito do Juízo', resp]].filter(([, x]) => v(x)),
    });
    d.quebra();
    d.enderecamento(enderecamentoTexto(c), linhasProcesso(c));
    d.texto(`${qualificacaoCurta(perfil)}, perito nomeado e compromissado nos autos do processo em epígrafe, tendo realizado a vistoria, os levantamentos técnicos e as diligências necessárias, vem, respeitosamente, à presença de Vossa Excelência, apresentar o presente **LAUDO TÉCNICO PERICIAL**, destinado à análise técnica do acidente do trabalho objeto da ação.`);
  }
  d.sumario();

  d.h1('1', 'Identificação');
  d.h2('1.1', extra ? 'Dados do trabalho' : 'Dados do processo');
  d.identificacao(extra
    ? [['Contratante', contratanteDe(c)], ['Acidentado', c.autorNome], ['Função', c.funcoes], ['Empresa', c.reuNome], ['CNPJ', c.reuCnpj], ['ART', v(c.art) || '[[nº da ART]]']]
    : [['Processo', c.numero], ['Juízo', [c.juizo, c.comarca].filter(Boolean).join(' – ')], [pt.autor, c.autorNome], [pt.reu, c.reuNome], ['Função', c.funcoes]]);
  d.h2('1.2', 'Dados do acidente');
  d.identificacao([['Data e horário', [dataBR(c.acidenteData), c.acidenteHora].filter(Boolean).join(' às ') || '[[data do acidente]]'], ['Local / setor', c.acidenteLocal],
    ['Máquina / equipamento', c.acidenteMaquina], ['Lesão informada', c.acidenteLesao], ['CAT / registros', c.acidenteCat]]);
  d.h2('1.3', 'Vistoria');
  quadroDiligencia(d, c);
  const eqs = equipamentosUsados(dados);
  if (eqs.length) { d.h2('1.4', 'Instrumentos utilizados'); quadroEquipamentos(d, eqs); }

  d.h1('2', 'Objetivo e metodologia');
  d.h2('2.1', extra ? 'Objeto' : 'Determinação judicial (objeto da perícia)');
  const det = !extra && textoDeterminacao(dados, false);
  if (det) d.texto(det); else if (v(c.pedidos)) d.texto(c.pedidos); else d.redigir(extra ? 'objeto contratado (o que deve ser respondido).' : 'transcrever ou resumir o despacho que determinou a perícia (ID / mov.).');
  d.h2('2.2', 'Metodologia');
  d.texto(`${extra ? 'A' : 'Em atendimento ao art. 473, inciso III, do Código de Processo Civil, a'} metodologia consistiu em análise dos documentos, inspeção do local e da máquina ou equipamento envolvido, entrevistas com os presentes e reconstituição da dinâmica do acidente. As causas foram analisadas pelo método da árvore de causas, que parte do fato e identifica os antecedentes técnicos, organizacionais e individuais que concorreram para ele, sem atribuir culpa jurídica. As condições foram confrontadas com as Normas Regulamentadoras na redação vigente na data do acidente.`);
  d.texto(`O nexo entre o acidente e a lesão, a extensão do dano e a incapacidade são matéria médica e não são objeto deste laudo${extra ? '' : ', que se limita à Engenharia de Segurança do Trabalho'}.`);

  d.h1('3', 'Documentos analisados');
  if (dados.documentos.length) quadroDocumentos(d, dados.documentos);
  else d.redigir('documentos analisados (CAT, análise de acidente da empresa, PGR, ordens de serviço, treinamentos, manual da máquina, fichas de EPI).');

  d.h1('4', 'Local, máquina e atividade');
  d.h2('4.1', 'Local do acidente');
  if (v(c.acidenteLocal)) d.texto(c.acidenteLocal); else d.redigir('descrição do local.');
  if (v(c.acidenteAlteracoes)) d.texto(`Alterações posteriores ao acidente: ${c.acidenteAlteracoes}`);
  d.h2('4.2', 'Máquina, equipamento ou estrutura envolvida');
  if (v(c.acidenteMaquina)) d.texto(c.acidenteMaquina); else d.redigir('identificação (marca, modelo, ano, nº de série), estado de conservação e dispositivos de segurança existentes.');
  d.h2('4.3', 'Atividade em execução');
  if (v(c.acidenteAtividade)) d.texto(c.acidenteAtividade); else d.redigir('atividade executada no momento do acidente e sua frequência na rotina.');
  if (dados.postos.length) { d.h2('4.4', 'Constatações da vistoria'); profissiografia(d, dados.postos, dados, { base: '4.4' }); }

  d.h1('5', 'Dinâmica do acidente');
  d.h2('5.1', 'Versão do acidentado'); if (v(c.acidenteRelato)) d.texto(c.acidenteRelato); else d.redigir('relato do acidentado (inicial, entrevista).');
  d.h2('5.2', 'Versão da empresa e das testemunhas'); if (v(c.acidenteRelatoEmpresa)) d.texto(c.acidenteRelatoEmpresa); else d.redigir('versão da empresa (contestação, CAT, análise interna) e das testemunhas.');
  d.h2('5.3', 'Dinâmica tecnicamente compatível com os vestígios');
  d.redigir('reconstituição da sequência de eventos compatível com o local, a máquina e os registros; indicar as divergências entre as versões e qual delas os vestígios técnicos sustentam.');

  d.h1('6', 'Normas aplicáveis e situação constatada');
  d.texto('O quadro relaciona os requisitos das Normas Regulamentadoras aplicáveis à atividade, na redação vigente na data do acidente, com a situação constatada.');
  const nrs = normasDoAcidente(c);
  d.quadro('Requisitos normativos e situação constatada', [['Norma', 'Requisito aplicável', 'Situação constatada', 'Atende?'],
    ...nrs.map((x) => [x.n, x.req, '[[constatação]]', '[[Sim / Não / Parcial]]'])], { larguras: [0.1, 0.4, 0.35, 0.15], tam: 9, alinhar: 'left' });

  d.h1('7', 'Análise das causas');
  d.texto('A árvore de causas foi construída a partir do fato (a lesão), identificando, para cada antecedente, o que foi necessário para que ele ocorresse. Os fatores estão agrupados abaixo pela natureza.');
  d.quadro('Fatores que concorreram para o acidente', [['Fator', 'Natureza', 'Evidência (item do laudo / documento)'],
    ['[[fator imediato]]', 'Técnico (máquina, proteção, ambiente)', '[[ ]]'], ['[[fator]]', 'Organizacional (procedimento, capacitação, ritmo, supervisão)', '[[ ]]'], ['[[fator]]', 'Individual (ação do trabalhador no contexto da tarefa)', '[[ ]]']],
  { larguras: [0.35, 0.3, 0.35], tam: 9, alinhar: 'left' });
  d.redigir('discussão das causas: quais fatores, se eliminados, teriam impedido o acidente.');

  d.h1('8', 'Medidas de prevenção');
  d.h2('8.1', 'Medidas existentes na data do acidente');
  quadroEpis(d, dados.epis, { extra });
  d.redigir('proteções coletivas, procedimentos, capacitação e EPI existentes, com as evidências.');
  d.h2('8.2', 'Medidas exigíveis');
  d.redigir('medidas que a norma exigia e não estavam implantadas, na ordem de prioridade da NR-1 (eliminação, proteção coletiva, medidas administrativas, EPI).');

  d.h1('9', 'Conclusão');
  d.redigir(extra ? 'conclusão técnica sobre as causas e o atendimento às normas.' : 'conclusão técnica sobre as causas e o atendimento às normas; a apreciação da responsabilidade cabe ao Juízo.');

  let n = 9;
  if (!extra || dados.quesitos.some((q) => !ehSuplementar(q))) {
    n += 1;
    d.h1(String(n), 'Respostas aos quesitos');
    if (!extra) d.texto('Em atendimento ao art. 473, inciso IV, do Código de Processo Civil, passa-se a responder aos quesitos formulados, com remissão às análises do corpo deste laudo.');
    respostasQuesitos(d, dados.quesitos, String(n), c);
  }
  n += 1;
  d.h1(String(n), 'Encerramento');
  d.texto(extra
    ? 'Este laudo foi elaborado com imparcialidade técnica, sob a responsabilidade do signatário, com base nos documentos e na vistoria descritos.'
    : 'Nada mais havendo a relatar no âmbito da Engenharia de Segurança do Trabalho, este Perito dá por encerrados os trabalhos periciais, colocando-se à disposição do Juízo e das partes para os esclarecimentos que se fizerem necessários.');
  const { lista, faltando } = await figurasDoCaso(dados);
  const { apendices, falhasApendice } = await apendicesDoCaso(dados);
  textoIntegram(d, { fotos: lista.length > 0, apendices });
  blocoAssinatura(d, dados, extra ? `Responsável técnico – ART nº ${v(c.art) || '[[nº]]'}` : 'Perito do Juízo');
  d.h1('', 'Referências');
  const refs = [
    ...(!extra ? ['BRASIL. Lei nº 13.105, de 16 de março de 2015. Código de Processo Civil. Brasília, DF: Presidência da República, 2015.'] : []),
    ...nrs.map((x) => `BRASIL. Ministério do Trabalho e Emprego. Norma Regulamentadora ${x.n.replace('NR-', 'nº ')} – ${x.t}. Redação vigente na data do acidente.`),
  ];
  d.texto(refs.join('\n'), { recuo: false });
  if (lista.length) { d.h1('', 'Anexo I – Relatório fotográfico'); d.figuras(lista); }
  inserirApendices(d, apendices);
  const r = await finalizar(d, { titulo: 'Laudo técnico de acidente do trabalho', arquivo: 'Laudo_acidente', c });
  return { ...r, faltando, falhasApendice };
}

// ======================================================================
// PETIÇÕES AVULSAS DO PERITO (prorrogação, diligência frustrada, escusa)
// ======================================================================
export const PETICOES_PERITO = [
  'Prorrogação do prazo do laudo (art. 476 do CPC)',
  'Diligência frustrada / documentos não apresentados',
  'Escusa do encargo (art. 157 do CPC)',
];

export async function peticaoPeritoAvulsa(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const tipo = c.peticaoPerito || PETICOES_PERITO[0];
  const d = new Doc();
  d.enderecamento(enderecamentoTexto(c), linhasProcesso(c));
  let n = 0;
  const sec = (t) => { n += 1; d.h1(`${n}.`, t, { novaPagina: false }); };
  const motivo = v(c.peticaoMotivo);
  if (tipo === PETICOES_PERITO[0]) {
    d.texto(introPerito(perfil, c, 'requerer a **prorrogação do prazo para a entrega do laudo pericial**, pelos fundamentos a seguir expostos.'));
    sec('Do prazo em curso');
    d.texto(`O prazo para a entrega do laudo ${c.prazoLaudo ? `vence em ${dataBR(c.prazoLaudo)}` : 'vence em [[data]]'}${c.vistoriaData ? `, contado da vistoria realizada em ${dataBR(c.vistoriaData)}` : ''}.`);
    sec('Dos motivos');
    if (motivo) d.texto(motivo); else d.redigir('motivo justificado (ex.: documentos requisitados ainda não apresentados pela empresa, necessidade de nova diligência, complexidade das avaliações).');
    sec('Do pedido');
    const dias = Number(String(c.prorrogacaoDias || '').replace(/\D/g, ''));
    d.texto(`Diante do exposto, com fundamento no art. 476 do Código de Processo Civil, requer a prorrogação do prazo para a entrega do laudo ${dias ? `por ${dias} (${numeroPorExtenso(dias)}) dias` : 'pela metade do prazo originalmente fixado'}.`);
  } else if (tipo === PETICOES_PERITO[1]) {
    d.texto(introPerito(perfil, c, 'informar a impossibilidade de concluir a diligência pericial e requerer o que segue.'));
    sec('Da diligência');
    const quando = [dataBR(c.vistoriaData || c.dataDiligencia), c.vistoriaInicio || c.horaDiligencia].filter(Boolean).join(', às ');
    d.texto(`Conforme designado nos autos, este perito compareceu ${quando ? `em ${quando}` : 'em [[data e horário]]'}${v(c.vistoriaLocal) ? ` na ${c.vistoriaLocal}` : ''}${v(c.vistoriaEndereco) ? `, ${String(c.vistoriaEndereco).replace(/\n/g, ' – ')}` : ''}.`);
    if (motivo) d.texto(motivo); else d.redigir('o que ocorreu (empresa fechada ou inativa, recusa de acesso, ausência de responsável, documentos não apresentados, máquina não disponível) e quem estava presente.');
    sec('Dos requerimentos');
    d.texto('Diante do exposto, requer:\na) a intimação [[da parte / da empresa]] para que apresente os documentos necessários à perícia e franqueie o acesso ao local e aos equipamentos, no prazo que Vossa Excelência fixar (arts. 380 e 473, § 3º, do CPC);\nb) a designação de nova data para a diligência, a ser comunicada às partes e aos assistentes técnicos com antecedência (art. 474 do CPC);\nc) que o prazo para a entrega do laudo seja contado da nova diligência.');
  } else {
    d.texto(introPerito(perfil, c, 'apresentar **escusa do encargo**, com fundamento no art. 157, § 1º, do Código de Processo Civil.'));
    sec('Do motivo');
    if (motivo) d.texto(motivo); else d.redigir('motivo legítimo (art. 157) ou causa de impedimento ou suspeição (arts. 148, II, e 467 do CPC), sem expor fatos além do necessário.');
    sec('Do pedido');
    d.texto('Diante do exposto, requer seja acolhida a escusa, com a dispensa do signatário e a nomeação de outro perito, colocando-se à disposição deste Juízo para futuras nomeações.');
  }
  fecho(d, dados);
  return finalizar(d, { titulo: 'Petição do perito', arquivo: tipo.startsWith('Prorrog') ? 'Peticao_prorrogacao_prazo' : tipo.startsWith('Dilig') ? 'Peticao_diligencia_frustrada' : 'Peticao_escusa', c });
}

// ======================================================================
// PETIÇÕES AVULSAS DO ASSISTENTE TÉCNICO
// ======================================================================
export const PETICOES_AT = [
  'Quesitos suplementares (art. 469 do CPC)',
  'Pedido de esclarecimentos ao perito (art. 477, § 2º, do CPC)',
  'Manifestação sobre os esclarecimentos do perito',
];
export const POSICOES_AT = ['Concorda com o laudo', 'Impugna em parte', 'Impugna'];

export function ladoAT(c) {
  const pt = partes(c);
  const reu = /réu/i.test(c.papel || '');
  return { lado: reu ? pt.reuCurto : pt.autorCurto, origem: reu ? 'Réu / Reclamada' : 'Autor / Reclamante' };
}

export async function peticaoAssistente(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const tipo = c.peticaoAT || PETICOES_AT[0];
  const { lado, origem } = ladoAT(c);
  const d = new Doc();
  const refLaudo = v(c.refLaudo) ? `laudo pericial (${c.refLaudo})` : 'laudo pericial [[ID / mov.]]';
  d.enderecamento(enderecamentoTexto(c), linhasProcesso(c, [['Perito do Juízo', c.peritoJuizo]]));
  const quem = `${qualificacaoCurta(perfil)}, assistente técnico indicado ${art(lado).pelo} ${lado}, vem, respeitosamente, à presença de Vossa Excelência,`;
  let n = 0;
  const sec = (t) => { n += 1; d.h1(`${n}.`, t, { novaPagina: false }); };
  const listar = (qs) => qs.forEach((q, i) => d.texto(`${q.data.numero ? prefixoQuesito(q, '. ') : `${i + 1}. `}${q.data.texto}`, { recuo: false }));
  if (tipo === PETICOES_AT[0]) {
    d.texto(`${quem} apresentar **QUESITOS SUPLEMENTARES**, nos termos do art. 469 do Código de Processo Civil.`);
    sec('Dos quesitos suplementares');
    d.texto('Requer que o Sr. Perito responda aos quesitos abaixo, que decorrem do que foi verificado na diligência:');
    const qs = dados.quesitos.filter((q) => q.data.origem === origem && ehSuplementar(q));
    if (qs.length) listar(qs); else d.redigir(`quesitos (cadastre na aba Quesitos com origem "${origem}" e marque "Suplementar").`);
    sec('Do requerimento');
    d.texto('Diante do exposto, requer a intimação do Sr. Perito para responder aos quesitos suplementares, previamente ou na audiência de instrução e julgamento (art. 469 do CPC).');
  } else if (tipo === PETICOES_AT[1]) {
    d.texto(`${quem} requerer **ESCLARECIMENTOS** sobre o ${refLaudo}, nos termos do art. 477, § 2º, do Código de Processo Civil.`);
    sec('Dos pontos a esclarecer');
    d.redigir('pontos de divergência ou dúvida, cada um ligado ao item do laudo e à norma aplicável.');
    const qs = dados.quesitos.filter((q) => q.data.origem === 'Complementares');
    if (qs.length) { sec('Dos quesitos de esclarecimento'); listar(qs); }
    sec('Do requerimento');
    d.texto(`Diante do exposto, requer a intimação do Sr. Perito para, no prazo legal de 15 (quinze) dias, esclarecer os pontos acima${qs.length ? ' e responder aos quesitos de esclarecimento' : ''} (art. 477, § 2º, do CPC).`);
  } else {
    d.texto(`${quem} apresentar **MANIFESTAÇÃO TÉCNICA SOBRE OS ESCLARECIMENTOS** prestados pelo Sr. Perito.`);
    sec('Dos esclarecimentos prestados');
    d.redigir('síntese dos esclarecimentos (mov. / data) e do que mudou em relação ao laudo.');
    sec('Da análise técnica');
    d.quadro('Pontos analisados', [['Ponto', 'Esclarecimento do perito', 'Análise da assistência técnica'], ['[[ ]]', '[[ ]]', '[[ ]]']], { larguras: [0.25, 0.375, 0.375], tam: 9, alinhar: 'left' });
    sec('Da conclusão');
    conclusaoAT(d, c.posicaoAT);
  }
  fecho(d, dados, null);
  return finalizar(d, { titulo: 'Petição do assistente técnico', arquivo: tipo.startsWith('Quesitos') ? 'Quesitos_suplementares_AT' : tipo.startsWith('Pedido') ? 'Pedido_esclarecimentos_AT' : 'Manifestacao_esclarecimentos_AT', c });
}

// Conclusão e requerimentos do assistente técnico conforme a posição sobre o laudo
export function conclusaoAT(d, posicao) {
  if (posicao === POSICOES_AT[0]) {
    d.texto('Esta assistência técnica concorda com as conclusões do laudo pericial, que estão tecnicamente fundamentadas, e requer o seu acolhimento.');
    d.redigir('fundamentos da concordância (pontos do laudo que confirmam a tese da parte).');
    return;
  }
  d.redigir('conclusão técnica por agente / período (a), b), c)...).');
  if (posicao === POSICOES_AT[1]) {
    d.texto('Diante do exposto, requer-se:\ni) a intimação do Sr. Perito para esclarecer os pontos impugnados;\nii) a retificação do laudo nos pontos [[indicar]];\niii) o acolhimento do laudo nos pontos não impugnados e o seu afastamento nos pontos aqui impugnados.');
  } else {
    d.texto('Diante do exposto, requer-se:\ni) a intimação do Sr. Perito para responder aos quesitos de esclarecimento;\nii) [[retificação / complementação do laudo ou nova perícia (art. 480 do CPC)]];\niii) que o laudo não seja acolhido nos pontos aqui impugnados.');
  }
}

