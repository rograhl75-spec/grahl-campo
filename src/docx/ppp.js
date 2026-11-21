// ======================================================================
// PERFIL PROFISSIOGRÁFICO PREVIDENCIÁRIO (PPP) – formulário em papel, com base no LTCAT do caso
// Seções do formulário do INSS: I – dados administrativos (lotação, atribuição e profissiografia);
// II – registros ambientais (exposição a fatores de risco e responsável); III – monitoração biológica;
// IV – responsáveis pelas informações. Quem emite: empresa, cooperativa de trabalho ou o próprio segurado.
// ======================================================================
import { Doc, dataBR, credencial, finalizar, carregar } from './base.js';
import { p, run } from './ooxml.js';
import { avaliarPeriodos } from './conclusao.js';
import { exposicaoNoVinculo, codigosDoAgente, categoriaDoVinculo, lerAfastamentos } from '../enquadramento.js';
import { empresaLimpa } from '../nomes.js';

const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
const hoje = () => new Date().toISOString().slice(0, 10);
const fimTxt = (r, f) => (!r.data.fim && f === hoje() ? 'atual' : dataBR(f));
const cooperado = (r) => /cooperad/i.test(categoriaDoVinculo(r));

// vínculos que entram no PPP: a cooperativa emite só os períodos de cooperado; empresa e segurado, todos
export function vinculosDoPpp(dados) {
  const em = v(dados.c.pppEmitente);
  const todos = dados.periodos.map((r, idx) => ({ r, idx }));
  if (/Cooperativa/.test(em)) return { dentro: todos.filter(({ r }) => cooperado(r)), fora: todos.filter(({ r }) => !cooperado(r)) };
  return { dentro: todos, fora: [] };
}

export function emitenteDoPpp(dados) {
  const { c } = dados;
  const em = v(c.pppEmitente);
  const coop = dados.periodos.find((r) => cooperado(r));
  if (/Pr[oó]prio/.test(em)) return { nome: v(c.pppEmitenteNome) || v(c.autorNome), doc: v(c.pppEmitenteCnpj) || v(c.autorCpf) };
  if (/Cooperativa/.test(em) && coop) return { nome: v(c.pppEmitenteNome) || empresaLimpa(coop.data.empresa), doc: v(c.pppEmitenteCnpj) || v(coop.data.cnpj) };
  return { nome: v(c.pppEmitenteNome) || v(c.reuNome) || empresaLimpa(dados.periodos[0]?.data.empresa || ''), doc: v(c.pppEmitenteCnpj) || v(c.reuCnpj) || v(dados.periodos[0]?.data.cnpj) };
}

export async function ppp(caseId, dadosProntos) {
  const dados = dadosProntos || await carregar(caseId);
  const { c, perfil } = dados;
  const d = new Doc();
  d.h1NovaPagina = false;
  const emit = emitenteDoPpp(dados);
  const { dentro, fora } = vinculosDoPpp(dados);
  const av = avaliarPeriodos(dados);
  const proprio = /Pr[oó]prio/.test(c.pppEmitente || '');

  d.add(p([run('PERFIL PROFISSIOGRÁFICO PREVIDENCIÁRIO – PPP', { b: true, size: 14, color: '1B365D', tit: true })], { align: 'center', after: 60 }));
  d.add(p([run('Art. 58, § 4º, da Lei nº 8.213/1991 – emitido com base no LTCAT do signatário dos registros ambientais', { size: 10, color: '475569' })], { align: 'center', after: 240 }));

  // ---------------- Seção I ----------------
  d.h1('', 'Seção I – Dados administrativos');
  const primeiro = dentro[0]?.r;
  d.identificacao([
    ['1 – CNPJ / CAEPF / CPF do emitente', emit.doc || '[[CNPJ]]'],
    ['2 – Nome empresarial', emit.nome || '[[emitente]]'],
    ['3 – CNAE', v(c.pppCnae) || (/Pr[oó]prio/.test(c.pppEmitente || '') ? 'Não se aplica' : '[[CNAE]]')],
    ['4 – Nome do trabalhador', v(c.autorNome) || '[[segurado]]'],
    ['5 – BR / PDH', 'Não'],
    ['6 – NIT', v(c.pppNit) || '[[NIT]]'],
    ['7 – Data do nascimento', dataBR(c.autorNascimento) || '[[data]]'],
    ['8 – Sexo (F/M)', v(c.pppSexo) ? c.pppSexo[0] : '[[F/M]]'],
    ['9 – CTPS (nº, série, UF)', dentro.some(({ r }) => /Empregado/.test(categoriaDoVinculo(r))) ? '[[CTPS]]' : 'Não se aplica (contribuinte individual)'],
    ['10 – Data de admissão', primeiro ? dataBR(primeiro.data.inicio) : '[[data]]'],
    ['11 – Regime de revezamento', 'Não'],
    ['12 – CAT registrada', 'Não consta'],
  ]);
  const gfip = (idx) => {
    const a = av[idx];
    if (!a) return '[[código]]';
    const segs = a.segs.filter((s) => s.caracteriza === 'SIM');
    if (!segs.length) return a.segs.some((s) => /\[\[/.test(s.caracteriza)) ? '[[código]]' : '00 (sem exposição)';
    return '04 (25 anos)';
  };
  d.quadro('13 – Lotação e atribuição', [['Período', 'CNPJ / CAEPF', 'Setor', 'Cargo', 'Função', 'CBO', 'Cód. GFIP'],
    ...dentro.map(({ r, idx }) => [`${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`, (proprio ? emit.doc : v(r.data.cnpj) || emit.doc) || '—',
      v(r.data.setor) || '—', v(r.data.cargo) || '[[cargo]]', v(r.data.cargo) || '—', v(r.data.cbo) || '[[CBO]]', gfip(idx)])],
  { larguras: [0.16, 0.16, 0.16, 0.15, 0.15, 0.09, 0.13], tam: 8, alinhar: 'left', semNumero: true, fonte: 'Registros administrativos do emitente e LTCAT do signatário. Código GFIP 04: exposição a agente nocivo com aposentadoria especial aos 25 anos.' });
  d.quadro('14 – Profissiografia', [['Período', 'Descrição das atividades'],
    ...dentro.map(({ r }) => [`${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`,
      [v(r.data.profissiografia) || v(r.data.atividades) || '[[descrição das atividades]]', v(r.data.local) && `Local: ${r.data.local}.`].filter(Boolean).join(' ')])],
  { larguras: [0.2, 0.8], tam: 8.5, alinhar: 'left', semNumero: true, fonte: 'LTCAT do signatário, item 4.' });

  // ---------------- Seção II ----------------
  d.h1('', 'Seção II – Registros ambientais');
  const exps = dentro.flatMap(({ r, idx }) => exposicaoNoVinculo(r, idx, dados.agentes || []).map((e) => ({ ...e, r })));
  // medições (ruído, calor, vibração, químicos) dos postos do vínculo que superam o limite entram pela síntese
  const linhasMed = dentro.flatMap(({ r, idx }) => (av[idx]?.segs || []).flatMap((s) => s.itens.filter((i) => i.sup && !i.categoria && !i.agente)
    .map((i) => [`${dataBR(s.ini)} a ${fimTxt(r, s.fim)}`, 'F', i.t.split(':')[0], i.t.replace(/^[^:]+:\s*/, '').replace(/\s[>≤].*$/, ''), /Ruído/.test(i.t) ? (s.fim <= '2003-11-18' ? 'NR-15, Anexo 1' : 'NHO-01') : 'NHO', '[[S/N]]', s.fim < '1998-12-03' ? 'Não se aplica' : '[[S/N]]', '—'])));
  const linhasExp = [
    ...exps.map((e) => {
      const x = e.agente.data; const k = codigosDoAgente(e.agente);
      return [`${dataBR(e.ini)} a ${fimTxt(e.r, e.fim)}`, (x.tipo || 'Q')[0], x.nome, v(x.intensidade) || 'Não se aplica', k.tecnica || '[[técnica]]',
        x.epcEficaz || '[[S/N]]', e.fim < '1998-12-03' ? 'Não se aplica' : x.epiEficaz || '[[S/N]]', v(x.ca) || '—'];
    }),
    ...linhasMed,
  ].sort((a, b) => a[0].split('/').reverse().join('').localeCompare(b[0].split('/').reverse().join('')));
  d.quadro('15 – Exposição a fatores de riscos', [['Período', 'Tipo', 'Fator de risco', 'Intensidade', 'Técnica utilizada', 'EPC eficaz', 'EPI eficaz', 'CA EPI'],
    ...(linhasExp.length ? linhasExp : [['[[período]]', '', (dados.agentes || []).length ? 'Ausência de fator de risco nocivo' : '[[cadastre os agentes avaliados na etapa 2. Autos]]', '', '', '', '', '']])],
  { larguras: [0.14, 0.07, 0.23, 0.13, 0.12, 0.09, 0.11, 0.11], tam: 8, alinhar: 'left', semNumero: true,
    fonte: 'LTCAT do signatário, itens 5 e 6. Tipo: F – físico; Q – químico; B – biológico. EPI só considerado a partir de 03/12/1998.' });
  const comEpi = exps.some((e) => e.agente.data.epiEficaz === 'Sim');
  d.quadro('15.9 – Atendimento aos requisitos das NR-06 e NR-09 (EPI)', [['Requisito', 'S/N'],
    ...['Foi tentada a implementação de medidas de proteção coletiva, de caráter administrativo ou de organização, optando-se pelo EPI por inviabilidade técnica, insuficiência ou interinidade, ou ainda em caráter complementar ou emergencial?',
      'Foram observadas as condições de funcionamento e do uso ininterrupto do EPI ao longo do tempo, conforme especificação técnica do fabricante, ajustada às condições de campo?',
      'Foi observado o prazo de validade, conforme Certificado de Aprovação do MTE?', 'Foi observada a periodicidade de troca definida pelos programas ambientais, comprovada mediante recibo assinado pelo usuário em época própria?',
      'Foi observada a higienização?'].map((q) => [q, comEpi ? '[[S/N]]' : 'Não se aplica'])],
  { larguras: [0.85, 0.15], tam: 8.5, alinhar: 'left', semNumero: true, fonte: comEpi ? 'Emitente.' : 'EPI eficaz não declarado para os fatores de risco do campo 15.' });
  d.quadro('16 – Responsável pelos registros ambientais', [['Período', 'NIT', 'Registro conselho de classe', 'Nome do profissional legalmente habilitado'],
    ...dentro.map(({ r }) => [`${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`, v(perfil.nit) || '[[NIT]]', credencial(perfil), perfil.nome])],
  { larguras: [0.2, 0.15, 0.35, 0.3], tam: 8, alinhar: 'left', semNumero: true,
    fonte: `LTCAT elaborado pelo signatário${c.vistoriaData ? `, com vistoria em ${dataBR(c.vistoriaData)}` : ''}; para os períodos anteriores à vistoria, avaliação extemporânea.` });

  // ---------------- Seção III ----------------
  d.h1('', 'Seção III – Resultados de monitoração biológica');
  d.quadro('17 – Exames médicos clínicos e complementares', [['Data', 'Tipo', 'Natureza', 'Exame', 'Indicação de resultados'],
    ['—', '—', '—', 'Não há registros de exames apresentados', '—']], { larguras: [0.14, 0.12, 0.16, 0.34, 0.24], tam: 8.5, alinhar: 'left', semNumero: true, fonte: 'Emitente.' });
  d.quadro('18 – Responsável pela monitoração biológica', [['Período', 'NIT', 'Registro conselho de classe', 'Nome do profissional'], ['—', '—', '—', 'Não se aplica']],
    { larguras: [0.2, 0.15, 0.3, 0.35], tam: 8.5, alinhar: 'left', semNumero: true, fonte: 'Emitente.' });

  // ---------------- Seção IV ----------------
  d.h1('', 'Seção IV – Responsáveis pelas informações');
  d.texto('Declaramos, para todos os fins de direito, que as informações prestadas neste documento são verídicas e foram transcritas fielmente dos registros administrativos, das demonstrações ambientais e dos programas médicos de responsabilidade da empresa. É de nosso conhecimento que a prestação de informações falsas neste documento constitui crime de falsificação de documento público, nos termos do art. 297 do Código Penal, e, também, que tais informações são de caráter privativo do trabalhador, constituindo crime, nos termos da Lei nº 9.029/1995, práticas discriminatórias decorrentes de sua exigibilidade por outrem, bem como de sua divulgação para terceiros, ressalvado quando exigidas pelos órgãos públicos competentes.');
  d.identificacao([['19 – Data de emissão do PPP', '____/____/________'], ['20.1 – NIT / CPF do representante legal', v(c.pppRepresentanteNit) || '[[NIT]]'],
    ['20.2 – Nome do representante legal', v(c.pppRepresentante) || (/Pr[oó]prio/.test(c.pppEmitente || '') ? v(c.autorNome) : '[[representante legal]]')]]);
  d.add(p([run('_____________________________________')], { align: 'center', before: 480, after: 0 }));
  d.add(p([run('Carimbo e assinatura do representante legal', { size: 9, color: '475569', np: true })], { align: 'center', after: 240 }));

  // ---------------- Observações ----------------
  d.h1('', 'Observações');
  const obs = [];
  for (const { r } of dentro) {
    for (const x of lerAfastamentos(r.data.afastamentos)) {
      obs.push(`Afastamento de ${dataBR(x.ini)} a ${dataBR(x.fim)} por benefício por incapacidade temporária ${x.tipo === 'acidentário' ? 'acidentário (conta como tempo especial)' : x.excluido ? 'previdenciário – não computado como tempo especial (art. 65, parágrafo único, do Decreto nº 3.048/1999, na redação do Decreto nº 10.410/2020)' : x.tipo}.`);
    }
  }
  if (fora.length) obs.push(`Não constam deste PPP, por não serem de responsabilidade do emitente, ${fora.length > 1 ? 'os períodos' : 'o período'} ${fora.map(({ r }) => `${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`).join(', ').replace(/, ([^,]*)$/, ' e $1')}, ${fora.length > 1 ? 'demonstrados' : 'demonstrado'} pelo LTCAT do signatário.`);
  if (dentro.some(({ r }) => (r.data.fim || '9999') > '2019-11-13')) obs.push('A partir de 14/11/2019, o tempo especial não é convertido em comum (art. 25, § 2º, da EC nº 103/2019).');
  if (v(c.pppObs)) obs.push(c.pppObs);
  d.texto(obs.length ? obs.map((o) => `- ${o}`).join('\n') : 'Sem observações.');
  const r = await finalizar(d, { titulo: 'PPP', arquivo: 'PPP', c });
  return r;
}
