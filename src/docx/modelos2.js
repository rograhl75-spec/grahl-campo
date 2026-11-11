// Modelos acrescentados na auditoria de novembro de 2026 (v2.28.0):
// laudo de acidente do trabalho (judicial ou extrajudicial), petições avulsas do perito
// e do assistente técnico, quadro conclusivo trabalhista e confronto com o Anexo 11 da NR-15.
import { ehSuplementar } from '../schema.js';
import { doseJornada, fatorQ, fmt, ibutg, nen } from '../calc.js';
import { confrontoAnexo11, num as numQ } from '../quimicos.js';
import {
  Doc, carregar, finalizar, dataBR, partes, art, enderecamentoTexto, linhasProcesso, qualificacaoCurta, credencial,
  equipamentosUsados, quadroEquipamentos, quadroDiligencia, quadroDocumentos, quadroEpis, profissiografia, figurasDoCaso,
  respostasQuesitos, capaTecnica, blocoAssinatura, textoDeterminacao, apendicesDoCaso, textoIntegram, inserirApendices,
  nomePostoFn, prefixoQuesito, numeroPorExtenso, postosDoPeriodo, ehCasoMotorista, dataPorExtenso, quadroPeriodos, documentosARequerer, lerValor, moeda, reaisPorExtenso,
} from './base.js';
import { introPerito, fecho, contratanteDe, avaliacaoAgentes } from './modelos.js';
import { p, run } from './ooxml.js';
import { localVistoria } from '../schema.js';

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
    const res = [v(x.valor) && `${x.valor} ${x.unidade || ''}`.trim(), v(x.nAmostras) && `${x.nAmostras} ${String(x.nAmostras).trim() === '1' ? 'amostra' : 'amostras'}`, v(x.maximo) && `máx. ${x.maximo}`].filter(Boolean).join('\n');
    if (!cf) {
      const ref = ag && ag.data.acgihTwa ? `\nReferência técnica ACGIH${ag.data.acgihEdicao ? ` ${ag.data.acgihEdicao}` : ''}: TWA ${ag.data.acgihTwa}${ag.data.acgihStel ? `; ${ag.data.acgihStel}` : ''}` : '';
      return [nome(x.postoId), agente, res, `[[sem LT no Anexo 11 – Anexo 12 ou 13]]${ref}`, '[[conferir]]'];
    }
    const lt = `${f2(cf.lt)} ${cf.un}${cf.teto ? ' (teto)' : ''}${cf.pele ? '\n+ pele' : ''}${cf.grau ? `\ngrau ${cf.grau}` : ''}`;
    const sit = `${fmt(cf.pct, 0)}% do LT – ${cf.supera ? 'supera' : 'não supera'}${cf.graveIminente ? '\nacima do valor máximo (item 7)' : ''}`;
    return [nome(x.postoId), agente, res, lt, sit];
  });
  return d.quadro('Agentes químicos – confronto com o Anexo 11 da NR-15', [['Posto', 'Agente', 'Resultado', 'Limite de tolerância', 'Situação'], ...linhas],
    { larguras: [0.2, 0.22, 0.2, 0.18, 0.2], tam: 9, alinhar: 'left',
      fonte: 'Elaborado pelo signatário. NR-15, Anexo 11: média aritmética das amostras (item 8); valor teto (item 9); valor máximo = LT × fator de desvio do Quadro 2 (item 7). Limites válidos para jornada de até 48 horas semanais (item 10).' });
}

// ---------------- Quadro conclusivo trabalhista (por agente e posto) ----------------
export function linhasConclusivoTrab(dados) {
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
  if ((dados.c.objeto || []).includes('Periculosidade')) rows.push(['[[área / atividade]]', `Periculosidade (NR-16, ${anexosNR16(dados).map((x) => x.a.split(' – ')[0]).join(', ') || '[[anexo]]'})`, '[[critério do anexo]]', '[[constatação]]', '[[conferir]]', (dados.c.materia === 'Administrativa (servidor)' || /Fazenda/i.test(dados.c.justica || '')) ? '[[adicional conforme a lei do ente]]' : '[[adicional de 30%]]']);
  return rows;
}

export function quadroConclusivoTrab(d, dados, { titulo = 'Quadro conclusivo por agente', fonte } = {}) {
  const rows = linhasConclusivoTrab(dados);
  if (!rows.length) return false;
  d.quadro(titulo, [['Posto', 'Agente', 'Limite / critério', 'Resultado', 'Confronto', 'Enquadramento'], ...rows],
    { larguras: [0.19, 0.17, 0.2, 0.15, 0.12, 0.17], tam: 9, alinhar: 'left',
      fonte: fonte || 'Elaborado pelo signatário a partir das avaliações deste laudo. O enquadramento indicado considera só o confronto com o limite; a neutralização pelo EPI e a conclusão redigida abaixo prevalecem.' });
  return true;
}

// ======================================================================
// LAUDO TÉCNICO DE ACIDENTE DO TRABALHO (perito do juízo ou extrajudicial)
// ======================================================================
const NRS = [
  { n: 'NR-10', t: 'Segurança em instalações e serviços em eletricidade', re: /el[ée]tric|choque|energiz|tens[ãa]o|painel|subesta/i, req: 'Medidas de controle do risco elétrico, desenergização, habilitação e autorização dos trabalhadores' },
  { n: 'NR-11', t: 'Transporte, movimentação, armazenagem e manuseio de materiais', re: /empilhadeira|ponte rolante|guindaste|talha|i[çc]amento|paleteira|movimenta[çc]/i, req: 'Operação por trabalhador habilitado, condições do equipamento e sinalização' },
  { n: 'NR-12', t: 'Segurança no trabalho em máquinas e equipamentos', re: /m[áa]quina|prensa|serra|torno|esteira|correia|engrenagem|cilindro|picador|moedor|misturador|trator|colhedora|implemento|equipamento/i, req: 'Proteções fixas e móveis, dispositivos de segurança e de parada de emergência, procedimentos, manual e capacitação do operador' },
  { n: 'NR-13', t: 'Caldeiras, vasos de pressão e tubulações e tanques metálicos de armazenamento', re: /caldeira|vaso de press|autoclave/i, req: 'Dispositivos de segurança, inspeções periódicas e operador capacitado' },
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
    ['[[fator imediato]]', 'Técnico (máquina, proteção, ambiente)', '[[preencher]]'], ['[[fator]]', 'Organizacional (procedimento, capacitação, ritmo, supervisão)', '[[preencher]]'], ['[[fator]]', 'Individual (ação do trabalhador no contexto da tarefa)', '[[preencher]]']],
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
  if (!extra) quadroRequisitos473(d, { objeto: '2.1', analise: '4 a 9', metodo: '2.2', quesitos: String(n - 1) });
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
    // art. 476: por uma vez, pela metade do prazo originalmente fixado
    const original = Number(String(c.prazoLaudoDias || '').replace(/\D/g, ''));
    const excede = dias && original && dias > original / 2;
    d.texto(`Diante do exposto, com fundamento no art. 476 do Código de Processo Civil, requer a prorrogação do prazo para a entrega do laudo ${dias ? `por ${dias} (${numeroPorExtenso(dias)}) dias` : 'pela metade do prazo originalmente fixado'}.${excede ? ` [[VERIFICAR: o art. 476 admite a prorrogação, por uma vez, pela metade do prazo original (${original} dias → até ${Math.floor(original / 2)} dias)]]` : ''}`);
  } else if (tipo === PETICOES_PERITO[1]) {
    d.texto(introPerito(perfil, c, 'informar a impossibilidade de concluir a diligência pericial e requerer o que segue.'));
    sec('Da diligência');
    const quando = [dataBR(c.vistoriaData || c.dataDiligencia), c.vistoriaInicio || c.horaDiligencia].filter(Boolean).join(', às ');
    d.texto(`Conforme designado nos autos, este perito compareceu ${quando ? `em ${quando}` : 'em [[data e horário]]'}${v(c.vistoriaLocal) ? ` na ${c.vistoriaLocal}` : ''}${v(c.vistoriaEndereco) ? `, ${String(c.vistoriaEndereco).replace(/\n/g, ' – ')}` : ''}.`);
    if (motivo) d.texto(motivo); else d.redigir('o que ocorreu (empresa fechada ou inativa, recusa de acesso, ausência de responsável, documentos não apresentados, máquina não disponível) e quem estava presente.');
    sec('Dos requerimentos');
    d.texto('Diante do exposto, requer:\na) a intimação [[da parte / da empresa]] para que apresente os documentos necessários à perícia e franqueie o acesso ao local e aos equipamentos, no prazo que Vossa Excelência fixar (art. 473, § 3º, e, conforme o caso, art. 379, III – parte – ou art. 380 – terceiro –, do CPC);\nb) a designação de nova data para a diligência, a ser comunicada às partes e aos assistentes técnicos com antecedência (art. 474 do CPC);\nc) que o prazo para a entrega do laudo seja contado da nova diligência.');
  } else {
    d.texto(introPerito(perfil, c, 'apresentar **escusa do encargo**, com fundamento no art. 157, caput e § 1º, do Código de Processo Civil.'));
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
    d.quadro('Pontos analisados', [['Ponto', 'Esclarecimento do perito', 'Análise da assistência técnica'], ['[[preencher]]', '[[preencher]]', '[[preencher]]']], { larguras: [0.25, 0.375, 0.375], tam: 9, alinhar: 'left' });
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
    d.texto('Diante do exposto, requer-se:\ni) a intimação do Sr. Perito para responder aos quesitos de esclarecimento;\nii) [[retificação / complementação do laudo (art. 477, § 2º, do CPC) ou nova perícia (art. 480 do CPC)]];\niii) que o laudo não seja acolhido nos pontos aqui impugnados.');
  }
}


// ---------------- Síntese da conclusão logo após a identificação (item 2 da auditoria) ----------------
export function sinteseTrab(d, dados, numero, itemConclusao) {
  const rows = linhasConclusivoTrab(dados);
  d.h2(numero, 'Síntese da conclusão');
  if (!rows.length) { d.redigir(`síntese da conclusão (detalhada no item ${itemConclusao}).`); return; }
  d.quadro('Síntese da conclusão por agente', [['Posto', 'Agente', 'Enquadramento'], ...rows.map((r) => [r[0], r[1], r[4] === 'Supera' ? r[5] : r[4] === 'Não supera' ? 'Não caracteriza' : r[5] || r[4]])],
    { larguras: [0.3, 0.35, 0.35], tam: 9, alinhar: 'left', fonte: `Elaborado pelo signatário. Fundamentação e neutralização pelo EPI nos itens 4 a ${itemConclusao}.` });
}

// ---------------- Requisitos do art. 473 do CPC (item 1 da auditoria) ----------------
export function quadroRequisitos473(d, itens) {
  d.quadro('Requisitos do laudo pericial – art. 473 do CPC', [['Requisito', 'Item deste laudo'],
    ['I – exposição do objeto da perícia', itens.objeto], ['II – análise técnica ou científica realizada pelo perito', itens.analise],
    ['III – indicação do método utilizado, esclarecendo-o e demonstrando ser predominantemente aceito pelos especialistas da área do conhecimento da qual se originou', itens.metodo],
    ['IV – resposta conclusiva a todos os quesitos apresentados pelo juiz, pelas partes e pelo órgão do Ministério Público', itens.quesitos]],
  { larguras: [0.7, 0.3], tam: 9, alinhar: 'left', fonte: 'Elaborado pelo signatário com base em Brasil (2015, art. 473).' });
}

// ---------------- Recomendações a partir do nível de ação (item 9 da auditoria) ----------------
// Níveis de ação da NR-9: ruído – dose de 50%; VMB – aren 2,5 m/s²; VCI – aren 0,5 m/s² ou VDVR 9,1 m/s^1,75;
// agentes químicos – metade do limite de exposição.
export function linhasRecomendacoes(dados) {
  const nome = nomePostoFn(dados.postos);
  const rows = [];
  for (const m of dados.medicoes) {
    const x = m.data;
    const posto = nome(x.postoId);
    if (x.agente === 'Ruído') {
      const dj = doseJornada(x.dose, x.tempoAmostragem, x.jornada);
      if (isFinite(dj) && dj >= 50) rows.push([posto, 'Ruído', `dose ${fmt(dj)}% (nível de ação: 50%)`, 'Enclausuramento ou isolamento da fonte, manutenção, redução do tempo de exposição; PCA com audiometrias (NR-7); protetor auricular adequado (NRRsf), com treinamento e troca']);
    } else if (/corpo inteiro/.test(x.agente || '')) {
      const a = numQ(x.aren), vd = numQ(x.vdv);
      if ((isFinite(a) && a >= 0.5) || (isFinite(vd) && vd >= 9.1)) rows.push([posto, 'Vibração de corpo inteiro', `aren ${isFinite(a) ? f2(a) : '—'} m/s² (nível de ação: 0,5)`, 'Manutenção de suspensões e assento, conservação das vias, limitação de velocidade e do tempo de exposição, pausas']);
    } else if (/mãos e braços/.test(x.agente || '')) {
      const a = numQ(x.aren);
      if (isFinite(a) && a >= 2.5) rows.push([posto, 'Vibração de mãos e braços', `aren ${f2(a)} m/s² (nível de ação: 2,5)`, 'Ferramentas com amortecimento, manutenção, rodízio e limitação do tempo de uso']);
    } else if (x.agente === 'Agente químico') {
      const ag = agenteDaMedicao(m, dados);
      const cf = ag ? confrontoAnexo11(ag.data, x.valor, x.unidade, { maximo: x.maximo }) : null;
      if (cf && cf.pct >= 50) rows.push([posto, x.descricao || ag.data.nome, `${fmt(cf.pct, 0)}% do LT (nível de ação: 50%)`, `Substituição do produto, ventilação local exaustora, enclausuramento; proteção respiratória adequada${cf.pele ? ' e luvas (absorção pela pele)' : ''}; monitoramento biológico quando houver indicador (NR-7)`]);
    }
  }
  return rows;
}
export function quadroRecomendacoes(d, dados) {
  const rows = linhasRecomendacoes(dados);
  d.quadro('Recomendações por agente', [['Posto', 'Agente', 'Situação', 'Medidas recomendadas (ordem da NR-1)'],
    ...(rows.length ? rows : [['[[posto]]', '[[agente]]', '[[situação]]', '[[medidas]]']])],
  { larguras: [0.18, 0.17, 0.2, 0.45], tam: 9, alinhar: 'left', fonte: 'Elaborado pelo signatário. Agentes no nível de ação ou acima (NR-9: ruído – dose de 50%; VCI – aren 0,5 m/s² ou VDVR 9,1 m/s^1,75; VMB – aren 2,5 m/s²; químicos – metade do limite de exposição).' });
  return rows.length;
}

// ---------------- Dados para o PPP em papel, períodos anteriores ao eSocial (E2) ----------------
const TECNICA = (m) => {
  const a = m.data.agente || '';
  if (a === 'Ruído') return fatorQ(m) === 3 ? 'NHO-01 (dosimetria, q = 3)' : 'NR-15, Anexo 1 (dosimetria, q = 5)';
  if (/Calor/.test(a)) return 'NHO-06';
  if (/corpo inteiro/.test(a)) return 'NHO-09';
  if (/mãos e braços/.test(a)) return 'NHO-10';
  return m.data.metodo || '[[técnica]]';
};
const INTENS = (m, dados) => {
  const x = m.data;
  if (x.agente === 'Ruído') { const n = nen(x.lavg, x.jornada, fatorQ(m)); return isFinite(n) ? `${fmt(n)} dB(A) (NEN)` : x.lavg ? `${x.lavg} dB(A)` : ''; }
  if (/Calor/.test(x.agente || '')) { const ib = ibutg(x.tbn, x.tg, x.tbs, /solar direta/.test(x.condicao || '')); return isFinite(ib) ? `IBUTG ${fmt(ib)} °C` : ''; }
  if (/Vibra/.test(x.agente || '')) return [x.aren && `aren ${x.aren} m/s²`, x.vdv && `VDVR ${x.vdv} m/s^1,75`].filter(Boolean).join('; ');
  const ag = agenteDaMedicao(m, dados);
  return [v(x.valor) && `${x.valor} ${x.unidade || ''}`.trim(), ag && ag.data.cas && `CAS ${ag.data.cas}`].filter(Boolean).join(' – ');
};
export function quadroDadosPPP(d, dados) {
  const linhas = [];
  for (const r of dados.periodos) {
    const ps = postosDoPeriodo(r, dados).map((x) => x.id);
    const ms = dados.medicoes.filter((m) => ps.includes(m.data.postoId) && m.data.agente !== 'Outro');
    const per = `${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`;
    if (!ms.length) { linhas.push([per, '[[tipo]]', '[[fator de risco]]', '[[intensidade]]', '[[técnica]]', '[[S/N]]', '[[S/N – CA]]']); continue; }
    for (const m of ms) {
      const tipo = m.data.agente === 'Agente químico' ? 'Q' : 'F';
      const fator = m.data.agente === 'Agente químico' ? (m.data.descricao || (agenteDaMedicao(m, dados) || { data: {} }).data.nome || 'Agente químico') : m.data.agente;
      linhas.push([per, tipo, fator, INTENS(m, dados), TECNICA(m), '[[S/N]]', r.data.inicio && r.data.inicio < '1998-12-03' ? 'Não se aplica (antes de 03/12/1998)' : '[[S/N – CA]]']);
    }
  }
  d.quadro('Dados para o PPP – exposição a fatores de risco', [['Período', 'Tipo', 'Fator de risco', 'Intensidade / concentração', 'Técnica utilizada', 'EPC eficaz', 'EPI eficaz (CA)'],
    ...(linhas.length ? linhas : [['[[período]]', '', '', '', '', '', '']])],
  { larguras: [0.15, 0.06, 0.17, 0.17, 0.17, 0.1, 0.18], tam: 8, alinhar: 'left',
    fonte: 'Elaborado pelo signatário a partir das avaliações deste laudo. Tipo: F – físico; Q – químico; B – biológico. Para o PPP em papel dos períodos anteriores ao eSocial (SST); código GFIP 04 nos períodos com enquadramento (item 6).' });
}

// ======================================================================
// TERMO DE PRESENÇA DA DILIGÊNCIA (impresso antes da vistoria, item 15)
// ======================================================================
export async function termoPresenca(caseId) {
  const dados = await carregar(caseId);
  const { c } = dados;
  const d = new Doc();
  d.add(p([run('TERMO DE PRESENÇA – DILIGÊNCIA PERICIAL', { b: true, size: 14, color: '1B365D' })], { align: 'center', after: 60 }));
  if (c.numero) d.add(p([run(`Processo nº ${c.numero}${c.juizo ? ` – ${c.juizo}` : ''}`)], { align: 'center', after: 0 }));
  if (c.autorNome || c.reuNome) d.add(p([run([c.autorNome, c.reuNome].filter(Boolean).join(c.tipoAtuacao === 'Extrajudicial' ? ' – ' : ' × '))], { align: 'center', after: 240 }));
  d.identificacao([['Data', dataBR(c.vistoriaData || c.dataDiligencia) || '____/____/________'], ['Horário de início', c.vistoriaInicio || c.horaDiligencia || '____:____'],
    ['Horário de término', c.vistoriaFim || '____:____'], ['Local', [localVistoria(c), String(c.vistoriaEndereco || '').replace(/\n/g, ' – ')].filter(Boolean).join(' – ') || '']]);
  const pre = String(c.vistoriaPresentes || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const linhas = [...pre.map((l) => [l, '', '', '']), ...Array.from({ length: Math.max(4, 12 - pre.length) }, () => ['', '', '', ''])];
  d.quadro('Presentes', [['Nome', 'Função / quem representa', 'Doc. (RG/CPF)', 'Assinatura'], ...linhas.map(([n, ...r]) => {
    // "Nome – função – parte" do cadastro: nome na 1ª coluna, o resto na 2ª
    const [nm, ...resto] = String(n).split(/\s+[–-]\s+/);
    return [nm, resto.join(' – ') || r[0], r[1], r[2]];
  })],
    { larguras: [0.3, 0.27, 0.16, 0.27], tam: 10, alinhar: 'left', fonte: c.tipoAtuacao === 'Extrajudicial' ? 'Avaliação técnica extrajudicial.' : 'Diligência comunicada às partes e aos assistentes técnicos (art. 474 do CPC).' });
  d.texto('Observações: _______________________________________________________________\n__________________________________________________________________________', { recuo: false });
  const dataTermo = dataPorExtenso(c.vistoriaData || c.dataDiligencia);
  blocoAssinatura(d, dados, null, dataTermo ? { data: dataTermo } : {});
  return finalizar(d, { titulo: 'Termo de presença', arquivo: 'Termo_presenca', c });
}

// ======================================================================
// PARECER TÉCNICO TRABALHISTA DE VIABILIDADE (extrajudicial, para o trabalhador ou o advogado – E3)
// ======================================================================
export async function parecerTrabalhista(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const d = new Doc();
  capaTecnica(d, {
    titulo: 'PARECER TÉCNICO', subtitulo: 'Insalubridade e periculosidade – avaliação de viabilidade técnica', perfil,
    pares: [['Contratante', contratanteDe(c)], ['Trabalhador', c.autorNome], ['Empresa', c.reuNome], ['Função / período', String(c.funcoes || '').split('\n')[0]],
      ['Responsável técnico', `${perfil.nome} – ${credencial(perfil)}`]].filter(([, x]) => v(x)),
  });
  d.sumario();
  d.h1NovaPagina = false;
  d.h1('1', 'Natureza do documento');
  d.texto(`Este parecer foi elaborado por ${perfil.nome}, ${perfil.titulos}, ${credencial(perfil)}, a pedido do requerente. É uma avaliação técnica prévia, de engenharia de segurança do trabalho, sobre a viabilidade de caracterização de insalubridade e/ou periculosidade; não substitui a perícia judicial (CLT, art. 195, § 2º).`);
  d.h1('2', 'Objeto');
  if (v(c.pedidos)) d.texto(c.pedidos); else d.redigir('o que se pretende demonstrar (agentes, períodos, adicional pretendido).');
  d.h1('3', 'Identificação e períodos');
  d.identificacao([['Trabalhador', c.autorNome], ['Empresa', c.reuNome], ['CNPJ', c.reuCnpj], ['Função / período', c.funcoes]]);
  if (dados.periodos.length) quadroPeriodos(d, dados.periodos, 'Períodos avaliados');
  d.h1('4', 'Fundamentação');
  d.texto('A caracterização da insalubridade e da periculosidade observa os arts. 189 a 195 da CLT, a NR-15 e a NR-16, na redação vigente em cada período. A eliminação ou a neutralização da insalubridade pelo EPI exige equipamento adequado ao risco, com CA, fornecimento comprovado, treinamento e fiscalização do uso (NR-15, item 15.4.1, e NR-6).');
  d.h1('5', 'Atividades e ambiente');
  if (v(c.atividadesAlegadas)) d.texto(c.atividadesAlegadas);
  profissiografia(d, dados.postos, dados, { base: '5' });
  d.h1('6', 'Avaliação técnica');
  avaliacaoAgentes(d, dados, '6', { previdenciario: false });
  d.h1('7', 'Viabilidade técnica por pedido');
  const conc = linhasConclusivoTrab(dados);
  if (conc.length) quadroConclusivoTrab(d, dados, { titulo: 'Resultado das avaliações por agente', fonte: 'Elaborado pelo signatário. Indica só o confronto com o limite; a viabilidade considera também a prova da neutralização pelo EPI.' });
  d.quadro('Viabilidade por pedido', [['Pedido / agente', 'Viabilidade técnica', 'Fundamento', 'Prova a produzir'],
    ['[[pedido]]', '[[favorável / desfavorável / depende de prova]]', '[[preencher]]', '[[preencher]]']], { larguras: [0.22, 0.22, 0.3, 0.26], tam: 9, alinhar: 'left' });
  d.h1('8', 'Documentos e provas recomendados');
  d.texto(documentosARequerer({ prev: false }).map((t) => `- ${t}`).join('\n'));
  d.h1('9', 'Limitações');
  d.redigir('limitações (informações do requerente, documentos não apresentados, ambiente alterado, avaliação sem acesso à empresa).');
  d.h1('10', 'Encerramento');
  d.texto('Nada mais havendo a acrescentar, encerra-se o presente parecer técnico, elaborado com imparcialidade e sob responsabilidade do signatário.');
  blocoAssinatura(d, dados, 'Responsável técnico');
  return finalizar(d, { titulo: 'Parecer técnico trabalhista', arquivo: 'Parecer_trabalhista', c });
}

// ======================================================================
// PROPOSTA DE SERVIÇOS TÉCNICOS (extrajudicial – E5)
// ======================================================================
export async function propostaServicos(caseId) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const d = new Doc();
  const obj = (c.objeto || []).filter((o) => o !== 'Outro');
  const prev = obj.some((o) => /Aposentadoria|LTCAT|PPP/.test(o)) || (!obj.length);
  const acid = obj.includes('Acidente / doença ocupacional');
  const servico = acid ? 'laudo técnico de acidente do trabalho' : prev ? 'Laudo Técnico das Condições Ambientais do Trabalho (LTCAT), com os dados para o Perfil Profissiográfico Previdenciário (PPP)' : `laudo técnico de ${obj.filter((o) => /Insalub|Periculos/.test(o)).join(' e ').toLowerCase() || 'insalubridade e periculosidade'}`;
  d.add(p([run('PROPOSTA DE SERVIÇOS TÉCNICOS', { b: true, size: 14, color: '1B365D' })], { align: 'center', after: 240 }));
  d.identificacao([['Contratante', contratanteDe(c) || '[[contratante]]'], ['Empresa avaliada', c.reuNome], ['Trabalhador / segurado', c.autorNome], ['Data', dataBR(new Date().toISOString().slice(0, 10))]]);
  let n = 0;
  const sec = (t) => { n += 1; d.h1(`${n}.`, t, { novaPagina: false }); };
  sec('Objeto');
  d.texto(`Elaboração de ${servico}${v(c.pedidos) ? `, com a seguinte finalidade: ${v(c.pedidos).replace(/[.;\s]+$/, '')}` : ''}.`);
  sec('Escopo e etapas');
  d.texto(['- análise dos documentos fornecidos pelo contratante;', '- vistoria técnica no local, com avaliações ambientais quantitativas quando cabíveis (instrumentos calibrados);',
    acid ? '- reconstituição da dinâmica e análise das causas do acidente;' : '- avaliação dos agentes pela legislação aplicável a cada período;',
    '- elaboração do laudo, com registro fotográfico e Anotação de Responsabilidade Técnica (ART).'].join('\n'));
  sec('Documentos e condições a cargo do contratante');
  const docsP = acid
    ? ['CAT e boletim de ocorrência, se houver', 'análise do acidente feita pela empresa e registros da CIPA', 'PGR (inventário de riscos e plano de ação) e ordens de serviço da atividade',
      'manual, inventário e documentos da máquina ou equipamento envolvido (NR-12), com registros de manutenção', 'registros de capacitação e treinamento do acidentado', 'fichas de entrega de EPI com os números de CA']
    : documentosARequerer({ prev, motorista: ehCasoMotorista(dados) });
  d.texto([...docsP.map((t) => `- ${t};`), '- autorização de acesso ao local e indicação de acompanhante designado pela empresa.'].join('\n'));
  sec('Prazo');
  d.texto(`O laudo será entregue em ${v(c.propostaPrazo) || '[[nº]]'} dias corridos após a vistoria e o recebimento dos documentos.`);
  sec('Honorários e forma de pagamento');
  const val = lerValor(c.propostaValor);
  d.texto(`Valor: ${isFinite(val) ? `${moeda(val)} (${reaisPorExtenso(val)})` : '[[R$ valor]]'}. ${v(c.propostaPagamento) || '[[forma de pagamento, ex.: 50% no aceite e 50% na entrega]]'}. Despesas de deslocamento fora de ${perfil.cidade || '[[cidade]]'} ${v(c.propostaDeslocamento) || '[[inclusas / cobradas à parte]]'}.`);
  sec('Responsabilidade técnica e validade');
  d.texto(`O trabalho será executado pelo signatário, ${perfil.titulos}, ${credencial(perfil)}, com ART. O laudo retrata as condições verificadas e as informações prestadas; não há garantia de resultado em processo administrativo ou judicial. Esta proposta é válida por 30 (trinta) dias.`);
  sec('Aceite');
  d.texto('De acordo: ________________________________________   Data: ____/____/________', { recuo: false });
  blocoAssinatura(d, dados, 'Responsável técnico');
  return finalizar(d, { titulo: 'Proposta de serviços', arquivo: 'Proposta_servicos', c });
}

// ======================================================================
// Periculosidade: roteiro por anexo da NR-16 (P6)
// ======================================================================
const ANEXOS_NR16 = [
  { a: 'Anexo I – Atividades e operações perigosas com explosivos', re: /explosiv|detona|p[óo]lvora|pedreira|fogos/i,
    crit: 'Atividades do quadro do anexo (armazenamento, transporte, manuseio, carregamento e detonação) e áreas de risco correspondentes.' },
  { a: 'Anexo II – Atividades e operações perigosas com inflamáveis', re: /inflam[áa]v|combust[íi]vel|abastec|frentista|tanque|gasolina|diesel|[áa]lcool|etanol|g[áa]s|glp|solvente/i,
    crit: 'Atividades do item 1 e áreas de risco do quadro do item 3 (ex.: abastecimento, armazenamento de vasilhames, tanques, recintos com inflamáveis); verificar quantidades e as exceções do anexo.' },
  { a: 'Anexo III – Atividades e operações perigosas com exposição a roubos ou outras espécies de violência física nas atividades profissionais de segurança pessoal ou patrimonial', re: /vigilan|vigia|seguran[çc]a patrimonial|seguran[çc]a pessoal|escolta|transporte de valores/i,
    crit: 'Atividades de segurança pessoal ou patrimonial descritas no anexo.' },
  { a: 'Anexo IV – Atividades e operações perigosas com energia elétrica', re: /el[ée]tric|energiz|subesta|alta tens|linha viva|eletricist|rede de distribui/i,
    crit: 'Atividades em instalações ou equipamentos energizados em alta tensão; trabalho em proximidade (NR-10); baixa tensão no sistema elétrico de consumo quando descumprido o item 10.2.8 da NR-10; e atividades e áreas de risco do SEP do Quadro I do anexo (item 1, alíneas a a d), ressalvadas as situações do item 2.' },
  { a: 'Anexo V – Atividades perigosas em motocicleta', re: /motocicl|motoboy|motoqueir|moto\b/i,
    crit: 'Uso de motocicleta no deslocamento do trabalhador em vias abertas à circulação pública (item 3.1), observadas as exceções do item 3.2; redação da Portaria MTE nº 2.021/2025, vigente a partir de 03/04/2026 (a redação da Portaria MTE nº 1.565/2014 foi anulada judicialmente).' },
  { a: 'Anexo VI – Atividades perigosas dos agentes das autoridades de trânsito', re: /agente de tr[âa]nsito|autoridade de tr[âa]nsito|fiscaliza[çc][ãa]o de tr[âa]nsito|guarda municipal de tr[âa]nsito/i,
    crit: 'Atividades dos agentes das autoridades de trânsito com exposição ao risco de colisões, atropelamentos ou outras espécies de acidentes ou violências (itens 3.1 e 3.2.1 do anexo; Portaria MTE nº 1.411/2025).' },
  { a: 'Radiações ionizantes ou substâncias radioativas (quadro da Portaria MTE nº 518/2003)', re: /radia[çc][ãa]o ionizante|raio[s]?[- ]x|radiol|radioativ|nuclear|gamagraf/i,
    crit: 'Atividades e áreas de risco do quadro de atividades e operações perigosas com radiações ionizantes.' },
];
export function anexosNR16(dados) {
  const c = dados.c;
  const t = [c.agentesAlegados, c.atividadesAlegadas, c.funcoes, c.pedidos, ...dados.postos.map((x) => `${x.data.nome || ''} ${x.data.descricao || ''} ${x.data.agentes || ''}`)].map(v).join(' ');
  return ANEXOS_NR16.filter((x) => x.re.test(t));
}
export function roteiroPericulosidade(d, dados) {
  const c = dados.c;
  const achados = anexosNR16(dados);
  const lista = achados.length ? achados : ANEXOS_NR16;
  const servidor = c.materia === 'Administrativa (servidor)' || /Fazenda/i.test(c.justica || '');
  d.texto(servidor
    ? 'A periculosidade caracteriza-se pelo enquadramento da atividade ou da área em um dos anexos da NR-16, na redação vigente no período, por remissão da lei do ente que rege o adicional do servidor ([[lei e artigo]]); o percentual e a base de cálculo são os da lei do ente.'
    : 'A periculosidade caracteriza-se pelo enquadramento da atividade ou da área em um dos anexos da NR-16 (CLT, art. 193), na redação vigente no período, com contato permanente ou intermitente; o contato eventual ou por tempo extremamente reduzido não a caracteriza. O adicional é de 30% sobre o salário, sem os acréscimos de gratificações, prêmios ou participação nos lucros (CLT, art. 193, § 1º).');
  d.quadro('Periculosidade – roteiro por anexo da NR-16', [['Anexo', 'Critério de caracterização', 'Constatação (atividade, área, frequência e tempo)', 'Caracteriza?'],
    ...lista.map((x) => [x.a, x.crit, '[[constatação]]', '[[Sim / Não]]'])],
  { larguras: [0.24, 0.34, 0.28, 0.14], tam: 9, alinhar: 'left', fonte: achados.length ? 'Elaborado pelo signatário. Anexos selecionados pelas atividades e agentes descritos no caso.' : 'Elaborado pelo signatário. Nenhum anexo identificado pelo texto do caso: exclua os que não se aplicam.' });
}
