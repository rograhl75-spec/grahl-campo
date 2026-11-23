// ======================================================================
// PERFIL PROFISSIOGRÁFICO PREVIDENCIÁRIO (PPP) – formulário em papel, com base no LTCAT do caso
// Seções do formulário do INSS: I – dados administrativos (lotação, atribuição e profissiografia);
// II – registros ambientais (exposição a fatores de risco e responsável); III – monitoração biológica;
// IV – responsáveis pelas informações. Quem emite: empresa, cooperativa de trabalho ou o próprio segurado.
// ======================================================================
import { Doc, dataBR, credencial, finalizar, carregar, fimNaEmissao, hojeLocal } from './base.js';
import { p, run } from './ooxml.js';
import { avaliarPeriodos } from './conclusao.js';
import { exposicaoNoVinculo, codigosDoAgente, tecnicaNoPeriodo, MARCOS_TECNICA, categoriaDoVinculo, lerAfastamentos } from '../enquadramento.js';
import { empresaLimpa } from '../nomes.js';
import { anexoQuantitativo } from './agentesQuadros.js';
import { codigoCbo } from '../cbo.js';
import { obsPppIntegridade } from '../integridade.js';

const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
const hoje = () => new Date().toISOString().slice(0, 10);
const fimTxt = (r, f) => (!r.data.fim && f === hoje() ? 'atual' : dataBR(f));
// "01/05/1991 a …" → "1991-05-01" (ordem cronológica das linhas)
const isoIni = (t) => String(t).replace(/^(\d{2})\/(\d{2})\/(\d{4}).*$/, '$3-$2-$1');
const cooperado = (r) => /cooperad/i.test(categoriaDoVinculo(r));
const semParenteses = (t) => v(t).replace(/\s*\([^)]*\)/g, '').trim();
// nome do fator de risco no PPP: sem a marca comercial, o CAS e as notas entre parênteses
const nomeFator = (n) => { const c = semParenteses(n).replace(/,?\s*CAS\s*[\d-]+/gi, '').trim(); return c.length >= 3 ? c : v(n); };
// CA: só o número do certificado
const numeroCa = (t) => { const m = v(t).match(/\b(?:CA\s*n?[ºo°.]?\s*)?(\d{3,6})\b/i); return m ? m[1] : '—'; };
const dia = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
// "10/01/2022" ou "2022-01-10" → ISO
const isoData = (t) => { const x = v(t); if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return x; const m = x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
// marcos do preenchimento (art. 285 da IN 128/2022): EPC dispensado até 13/10/1996; EPI, até 02/12/1998
const MARCOS_PPP = ['1996-10-13', '1998-12-02'];
function partirNosMarcos(ini, fim, extra = []) {
  const out = []; let a = ini;
  for (const m of [...new Set([...MARCOS_PPP, ...extra])].sort()) if (m >= a && m < fim) { out.push([a, m]); a = dia(m, 1); }
  out.push([a, fim]);
  return out;
}
// subperíodos seguidos com as mesmas informações (o marco não mudou nada) viram uma linha só
function juntarIguais(linhas) {
  const out = [];
  for (const l of linhas) {
    const ant = out[out.length - 1];
    if (ant && ant.slice(1, 8).join('|') === l.slice(1, 8).join('|')) { ant[9] = l[9]; continue; }
    out.push([...l]);
  }
  return out.map((l) => [`${dataBR(l[8])} a ${fimTxt(l[10], l[9])}`, ...l.slice(1, 8)]);
}
// eSocial SST: o PPP em papel do empregado, do avulso e do cooperado vai até a véspera da entrada do emitente
export function corteEsocial(c, r) {
  const ini = isoData(c.esocialSst);
  if (!ini || !/Empregado|Avulso|cooperad/i.test(categoriaDoVinculo(r))) return '';
  return dia(ini, -1);
}

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
  const dados = fimNaEmissao(dadosProntos || await carregar(caseId));
  const { c, perfil } = dados;
  const d = new Doc();
  d.h1NovaPagina = false;
  const emit = emitenteDoPpp(dados);
  const { dentro: dentro0, fora } = vinculosDoPpp(dados);
  // corte no eSocial SST: o período posterior é do PPP eletrônico
  const cortados = [];
  const dentro = dentro0.map(({ r, idx }) => {
    const corte = corteEsocial(c, r);
    if (!corte || (r.data.fim && r.data.fim <= corte)) return { r, idx };
    cortados.push({ r, corte });
    if ((r.data.inicio || '') > corte) return null;
    return { r: { ...r, data: { ...r.data, fim: corte, fimNaEmissao: false } }, idx };
  }).filter(Boolean);
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
    // risco à integridade física (fora do Anexo IV) só nas observações: não muda o código GFIP
    const segs = a.segs.filter((s) => s.caracteriza === 'SIM' && s.itens.some((i) => i.sup && !i.integridade));
    if (!segs.length) return a.segs.some((s) => /\[\[/.test(s.caracteriza)) ? '[[código]]' : '00 (sem exposição)';
    return '04 (25 anos)';
  };
  d.quadro('13 – Lotação e atribuição', [['Período', 'CNPJ / CAEPF', 'Setor', 'Cargo', 'Função', 'CBO', 'Cód. GFIP'],
    ...dentro.map(({ r, idx }) => [`${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`, (proprio ? emit.doc : v(r.data.cnpj) || emit.doc) || '—',
      semParenteses(r.data.setor) || '—', semParenteses(r.data.cargo) || '[[cargo]]', semParenteses(r.data.funcao) || semParenteses(r.data.cargo) || '—', codigoCbo(r.data.cbo) || '[[CBO]]', gfip(idx)])],
  { larguras: [0.16, 0.16, 0.16, 0.15, 0.15, 0.09, 0.13], tam: 8, alinhar: 'left', semNumero: true, fonte: 'Registros administrativos do emitente e LTCAT do signatário. Código GFIP 04: exposição a agente nocivo com aposentadoria especial aos 25 anos.' });
  d.quadro('14 – Profissiografia', [['Período', 'Descrição das atividades'],
    ...dentro.map(({ r }) => [`${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`,
      [v(r.data.profissiografia) || v(r.data.atividades) || '[[descrição das atividades]]', v(r.data.local) && `Local: ${r.data.local}.`].filter(Boolean).join(' ')])],
  { larguras: [0.2, 0.8], tam: 8.5, alinhar: 'left', semNumero: true, fonte: 'LTCAT do signatário, item 4.' });

  // ---------------- Seção II ----------------
  d.h1('', 'Seção II – Registros ambientais');
  const exps = dentro.flatMap(({ r, idx }) => exposicaoNoVinculo(r, idx, dados.agentes || [], { presentes: true, quantitativo: (a) => !!anexoQuantitativo(a, dados.quimicos) }).map((e) => ({ ...e, r })));
  // sem fichas de EPI: EPC e EPI eficazes "Não" (requisitos do art. 291 da IN 128/2022 não comprovados)
  const semEpi = !dados.epis.length;
  // medições (ruído, calor, vibração, químicos) dos postos do vínculo que superam o limite entram pela síntese
  const linhasMed = dentro.flatMap(({ r, idx }) => (av[idx]?.segs || []).flatMap((s) => s.itens.filter((i) => i.sup && !i.categoria && !i.agente)
    .map((i) => [`${dataBR(s.ini)} a ${fimTxt(r, s.fim)}`, 'F', i.t.split(':')[0], i.t.replace(/^[^:]+:\s*/, '').replace(/\s[>≤].*$/, ''), /Ruído/.test(i.t) ? (s.fim <= '2003-11-18' ? 'NR-15, Anexo 1' : 'NHO-01') : 'NHO', '[[S/N]]', s.fim < '1998-12-03' ? 'Não se aplica' : '[[S/N]]', '—'])));
  // uma linha por janela de exposição, partida em 13/10/1996 (EPC) e 02/12/1998 (EPI): antes desses marcos os campos
  // não se aplicam (art. 285 da IN 128/2022)
  const linhasExp = [
    // químicos: também em 31/12/2003 (NHO a partir de 2004) e 07/10/2014 (LINACH), quando a técnica muda
    ...exps.flatMap((e) => juntarIguais(partirNosMarcos(e.ini, e.fim, (e.agente.data.tipo || 'Químico') === 'Químico' ? MARCOS_TECNICA : []).map(([ini, fim]) => {
      const x = e.agente.data; void codigosDoAgente;
      const anexo = anexoQuantitativo(e.agente, dados.quimicos) || 'Anexo 11';
      // "Decreto 53.831/64" → "Dec. 53.831/64": a coluna é estreita e o texto se repete em todas as linhas
      const tec = (tecnicaNoPeriodo(e.agente, fim, { quantitativoSemMedicao: e.naoQuantificado ? anexo : '' }) || '[[técnica]]').replace(/\bDecretos?\s+(?=n?º?\s*\d)/g, 'Dec. ');
      const intens = (/^n[ãa]o se aplica$|^qualitativ/i.test(v(x.intensidade)) ? '' : v(x.intensidade)) || (e.naoQuantificado || /^Qualitativa/.test(tec) ? 'Não quantificada' : '[[intensidade]]');
      const epiAplica = fim > '1998-12-02';
      return [`${dataBR(ini)} a ${fimTxt(e.r, fim)}`, (x.tipo || 'Q')[0], nomeFator(x.nome), intens, tec,
        fim <= '1996-10-13' ? 'Não se aplica' : x.epcEficaz || (semEpi ? 'Não' : '[[S/N]]'),
        epiAplica ? x.epiEficaz || (semEpi ? 'Não' : '[[S/N]]') : 'Não se aplica', epiAplica && !semEpi ? numeroCa(x.ca) : '—', ini, fim, e.r];
    }))),
    ...linhasMed,
  ].sort((a, b) => isoIni(a[0]).localeCompare(isoIni(b[0])));
  d.quadro('15 – Exposição a fatores de riscos', [['Período', 'Tipo', 'Fator de risco', 'Intensidade', 'Técnica utilizada', 'EPC eficaz', 'EPI eficaz', 'CA EPI'],
    ...(linhasExp.length ? linhasExp : [['[[período]]', '', (dados.agentes || []).length ? 'Ausência de fator de risco nocivo' : '[[cadastre os agentes avaliados na etapa 2. Autos]]', '', '', '', '', '']])],
  { larguras: [0.14, 0.07, 0.15, 0.13, 0.24, 0.08, 0.09, 0.1], tam: 8, alinhar: 'left', semNumero: true,
    fonte: `LTCAT do signatário, itens 5 e 6. Tipo: F – físico; Q – químico; B – biológico. "Não quantificada": avaliação qualitativa, sem medição da intensidade ou da concentração; técnica conforme o Manual de Aposentadoria Especial do INSS (2018), com as NHO da FUNDACENTRO a partir de 01/01/2004 para os agentes de avaliação quantitativa. EPC e EPI eficazes: não se aplicam até 13/10/1996 e até 02/12/1998, respectivamente (art. 285 da IN 128/2022).${exps.some((e) => !e.caracteriza) ? ' Agente de avaliação quantitativa (NR-15, Anexos 11 e 12) sem medição: consta como presente no ambiente e não caracteriza a exposição (itens 5 e 6 do LTCAT).' : ''}` });
  const comEpi = exps.some((e) => e.caracteriza && e.agente.data.epiEficaz === 'Sim');
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
    ['—', '—', '—', 'Não preenchido', '—']], { larguras: [0.14, 0.12, 0.16, 0.34, 0.24], tam: 8.5, alinhar: 'left', semNumero: true, fonte: 'O preenchimento dos resultados de monitoração biológica não é exigido para nenhum período (Resolução CFM nº 1.715/2004; Manual de Aposentadoria Especial do INSS, 2018).' });
  d.quadro('18 – Responsável pela monitoração biológica', [['Período', 'NIT', 'Registro conselho de classe', 'Nome do profissional'], ['—', '—', '—', 'Não se aplica']],
    { larguras: [0.2, 0.15, 0.3, 0.35], tam: 8.5, alinhar: 'left', semNumero: true, fonte: 'Emitente.' });

  // ---------------- Seção IV ----------------
  d.h1('', 'Seção IV – Responsáveis pelas informações');
  d.texto('Declaramos, para todos os fins de direito, que as informações prestadas neste documento são verídicas e foram transcritas fielmente dos registros administrativos, das demonstrações ambientais e dos programas médicos de responsabilidade da empresa. É de nosso conhecimento que a prestação de informações falsas neste documento constitui crime de falsificação de documento público, nos termos do art. 297 do Código Penal, e, também, que tais informações são de caráter privativo do trabalhador, constituindo crime, nos termos da Lei nº 9.029/1995, práticas discriminatórias decorrentes de sua exigibilidade por outrem, bem como de sua divulgação para terceiros, ressalvado quando exigidas pelos órgãos públicos competentes.');
  d.identificacao([['19 – Data de emissão do PPP', dataBR(hojeLocal())], ['20.1 – NIT / CPF do representante legal', v(c.pppRepresentanteNit) || '[[NIT]]'],
    ['20.2 – Nome do representante legal', v(c.pppRepresentante) || (/Pr[oó]prio/.test(c.pppEmitente || '') ? v(c.autorNome) : '[[representante legal]]')]]);
  d.add(p([run('_____________________________________')], { align: 'center', before: 480, after: 0 }));
  d.add(p([run(/Pr[oó]prio/.test(c.pppEmitente || '') ? 'Assinatura do segurado (emitente do PPP)' : 'Carimbo e assinatura do representante legal', { size: 9, color: '475569', np: true })], { align: 'center', after: 240 }));

  // ---------------- Observações ----------------
  d.h1('', 'Observações');
  const obs = [];
  for (const { r } of dentro) {
    for (const x of lerAfastamentos(r.data.afastamentos)) {
      obs.push(`Afastamento de ${dataBR(x.ini)} a ${dataBR(x.fim)} por benefício por incapacidade temporária ${x.tipo === 'acidentário' ? 'acidentário (conta como tempo especial)' : x.excluido ? 'previdenciário – não computado como tempo especial (art. 65, parágrafo único, do Decreto nº 3.048/1999, na redação do Decreto nº 10.410/2020)' : x.tipo}.`);
    }
  }
  if (fora.length) obs.push(`Não constam deste PPP, por não serem de responsabilidade do emitente, ${fora.length > 1 ? 'os períodos' : 'o período'} ${fora.map(({ r }) => `${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`).join(', ').replace(/, ([^,]*)$/, ' e $1')}, ${fora.length > 1 ? 'demonstrados' : 'demonstrado'} pelo LTCAT do signatário.`);
  for (const { r, corte } of cortados) obs.push(`A partir de ${dataBR(dia(corte, 1))}, as informações do período ${dataBR(r.data.inicio)} a ${r.data.fim && !r.data.fimNaEmissao ? dataBR(r.data.fim) : 'atual'} constam do PPP eletrônico (eSocial, evento S-2240), de responsabilidade do emitente.`);
  obs.push(...obsPppIntegridade({ ...dados, periodos: dentro.map(({ r }) => r) }));
  if (v(c.pppObs)) obs.push(c.pppObs);
  // a mesma observação em vários vínculos (ex.: afastamento repetido) sai uma vez só
  const obsU = [...new Set(obs)];
  d.texto(obsU.length ? obsU.map((o) => `- ${o}`).join('\n') : 'Sem observações.');
  const r = await finalizar(d, { titulo: 'PPP', arquivo: 'PPP', c });
  return r;
}
