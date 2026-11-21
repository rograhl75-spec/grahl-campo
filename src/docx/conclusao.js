// Conclusão previdenciária calculada pelo app, por vínculo e por subperíodo de critério:
// categoria (até 28/04/1995), ruído (Lavg até 18/11/2003; NEN depois) e vibração de corpo inteiro
// (ISO 2631-1 de 06/03/1997 a 13/08/2014; NR-15, Anexo 8, a partir de 14/08/2014).
import { dataBR, postosDoPeriodo, nomeCurto, hojeLocal, superaLimite } from './base.js';
import { comJurisprudencia } from './fontes.js';
import { avaliaPenosidade, vinculosMotorista, matrizIAC, tempoConducao } from './penosidade.js';
import { nenParaJornada, vibracaoDoParadigma } from '../paradigmas.js';
import { num, fmt, nen, fatorQ, horasDia, fmtHoras, lavgDaDose } from '../calc.js';
import { categoriaSaude, itensAgentes, lerAfastamentos, recortarAfastamentos } from '../enquadramento.js';

const CORTES = ['1995-04-28', '1997-03-05', '2003-11-18', '2014-08-13', '2019-11-13'];
const dia = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
const RE_MOT = /motorista|caminh|carreteir|cobrador|ônibus|onibus/i;
// Súmula 70 da TNU: tratorista equipara-se a motorista de caminhão para o enquadramento por categoria
const RE_TRAT = /tratorist|operador de trator|operador de m[aá]quinas? agr[ií]col/i;
const RE_COBR = /cobrador/i;

// cortes: os marcos do ruído (18/11/2003) e da vibração (13/08/2014) só entram quando o vínculo tem esses agentes
function segmentos(r, cortes = CORTES) {
  const ini = r.data.inicio; const fim = r.data.fim || hojeLocal();
  if (!ini) return [];
  const out = []; let a = ini;
  for (const c of cortes) if (c >= a && c < fim) { out.push([a, c]); a = dia(c, 1); }
  out.push([a, fim]);
  return out;
}

// valores de ruído e VCI do vínculo: paradigma (normalizado para T) ou medição do posto que o representa
export function valores(r, dados) {
  const tc = tempoConducao(r, dados);
  const T = tc.T;
  const out = { T, baseT: tc.base, regraT: tc.regra };
  const pr = r.data.paradigmaRuido && dados.paradigmas.get(r.data.paradigmaRuido);
  const pv = r.data.paradigmaVibracao && dados.paradigmas.get(r.data.paradigmaVibracao);
  const ids = new Set(postosDoPeriodo(r, dados).map((p) => p.id));
  const mr = dados.medicoes.find((m) => m.data.agente === 'Ruído' && ids.has(m.data.postoId));
  const mv = dados.medicoes.find((m) => /corpo inteiro/.test(m.data.agente || '') && ids.has(m.data.postoId));
  // paradigma sem o tempo diário de condução: não há como normalizar (NEN, aren) – fica pendente, não "NÃO"
  out.semT = !isFinite(T) && !!(pr || pv);
  if (pr) { out.lavg = num(pr.data.lavg); out.nen = isFinite(T) ? nenParaJornada(pr.data.lavg, T) : NaN; out.fonteR = `paradigma ${pr.data.codigo}`; }
  else if (mr) {
    out.q = fatorQ(mr);
    // sem o Lavg digitado, usa o nível equivalente calculado pela dose e pelo tempo de amostragem
    const lv = isFinite(num(mr.data.lavg)) ? num(mr.data.lavg) : lavgDaDose(mr.data.dose, mr.data.tempoAmostragem, out.q);
    out.lavg = lv;
    out.nen = isFinite(T) ? nen(lv, `${T}h`, out.q) : nen(lv, mr.data.jornada, out.q);
    if (!isFinite(num(mr.data.lavg)) && isFinite(lv)) out.lavgPelaDose = true;
    out.fonteR = nomeCurto(dados.postos.find((p) => p.id === mr.data.postoId)?.data.nome);
  }
  if (pv) {
    // arep = aceleração do período amostrado → A(T) = arep·√(T/8); sem arep, o aren do laudo já está
    // normalizado para a jornada do laudo de origem: A(T) = aren·√(T/Tlaudo)
    const vb = vibracaoDoParadigma(pv, T);
    out.aren = vb.aren; out.vdv = vb.vdv;
    out.fonteV = `paradigma ${pv.data.codigo}`;
  } else if (mv) {
    out.aren = num(mv.data.aren); out.vdv = num(mv.data.vdv); // valores já normalizados para a exposição diária
    out.fonteV = nomeCurto(dados.postos.find((p) => p.id === mv.data.postoId)?.data.nome);
  }
  return out;
}

const empresaCurta = (r) => String(r.data.empresa || 'vínculo').replace(/\s*\([^)]*\)/g, '').trim();
// nota de rodapé da síntese: só fala de ruído e vibração quando houver
function fonteSintese(dados, av) {
  const ruido = av.some(({ segs }) => segs.some((s) => s.itens.some((i) => i.ruido)));
  const vib = av.some(({ segs }) => segs.some((s) => s.itens.some((i) => /^VCI/.test(i.t))));
  const quali = (dados.agentes || []).length > 0;
  const partes = ['Elaborado pelo signatário.'];
  if (ruido) partes.push('Ruído com o fator de duplicação de cada medição (q = 5, salvo indicação de q = 3).');
  if (ruido || vib) partes.push(`NEN${vib ? ' e aren' : ''} normalizados para o tempo diário de exposição${/motorista|caminh|ônibus|carreteir/i.test(`${dados.c.funcoes || ''} ${dados.periodos.map((r) => r.data.cargo || '').join(' ')}`) ? ' (condução)' : ''} de cada vínculo, quando informado.`);
  if (quali) partes.push('Agentes sem medição: resultado da avaliação qualitativa do item 5, pelo código vigente em cada época.');
  return partes.join(' ');
}

export function avaliarPeriodos(dados) {
  const agentes = dados.agentes || [];
  return dados.periodos.map((r, idx) => {
    const val = valores(r, dados);
    const funcao = `${r.data.cargo || ''} ${r.data.atividades || ''}`;
    const tratorista = RE_TRAT.test(funcao);
    const motorista = RE_MOT.test(funcao);
    const soCobrador = RE_COBR.test(funcao) && !/motorista/i.test(funcao);
    const saude = categoriaSaude(r.data.cargo || funcao);
    // afastamentos por benefício que não contam como tempo especial saem dos subperíodos
    const temRuido = isFinite(val.lavg) || !!r.data.paradigmaRuido || motorista || tratorista;
    const temVib = isFinite(val.aren) || !!r.data.paradigmaVibracao || motorista || tratorista;
    const cortes = CORTES.filter((c) => (c !== '2003-11-18' || temRuido) && (c !== '2014-08-13' || temVib));
    const { segs: partes, excluidos } = recortarAfastamentos(segmentos(r, cortes), lerAfastamentos(r.data.afastamentos));
    const segs = partes.map(([a, b]) => {
      const itens = []; let algum = false; let dadosOk = false;
      if (b <= '1995-04-28' && saude && !motorista && !tratorista) { itens.push({ ...saude }); algum = true; dadosOk = true; }
      for (const it of itensAgentes(agentes, idx, a, b)) {
        itens.push(it); dadosOk = true;
        if (it.sup) algum = true;
      }
      if (b <= '1995-04-28' && (motorista || tratorista)) {
        if (tratorista && !motorista) itens.push({ t: 'Categoria profissional de tratorista, equiparada à de motorista de caminhão (Súmula 70 da TNU) – enquadramento por presunção', cod: '2.4.4 (Dec. 53.831/64) / 2.4.2 (Dec. 83.080/79)', sup: true, categoria: true });
        else if (soCobrador) itens.push({ t: 'Categoria profissional de cobrador de ônibus – enquadramento por presunção', cod: '2.4.4 (Dec. 53.831/64)', sup: true, categoria: true });
        else itens.push({ t: 'Categoria profissional de motorista – enquadramento por presunção', cod: '2.4.4 (Dec. 53.831/64) / 2.4.2 (Dec. 83.080/79)', sup: true, categoria: true });
        algum = true; dadosOk = true;
      }
      if (isFinite(val.lavg)) {
        dadosOk = true;
        const [crit, lim, cod] = b <= '1997-03-05' ? ['Lavg', 80, '1.1.6'] : b <= '2003-11-18' ? ['Lavg', 90, '2.0.1'] : ['NEN', 85, '2.0.1'];
        const x = crit === 'Lavg' ? val.lavg : val.nen;
        // antes de 19/11/2003 a metodologia é a da NR-15 (q = 5): Leq com q = 3 não serve de Lavg
        if (crit === 'Lavg' && val.q === 3) {
          itens.push({ t: `Ruído: medição com q = 3 (NHO-01) – [[período anterior a 19/11/2003 exige o Lavg com q = 5 (NR-15); refaça a leitura do dosímetro com q = 5]]`, cod, sup: false, ruido: true, pendente: true });
        } else if (!isFinite(x) && val.semT) {
          itens.push({ t: 'Ruído: [[informe o tempo diário de condução do vínculo para calcular o NEN do paradigma]]', cod, sup: false, ruido: true, pendente: true });
        } else if (isFinite(x)) {
          const sup = superaLimite(x, lim);
          itens.push({ t: `Ruído: ${crit}${crit === 'NEN' && val.q === 3 ? ' (q = 3, NHO-01)' : ''} ${fmt(x, 1)} dB(A) ${sup ? '>' : '≤'} ${lim} dB(A) – ${sup ? 'supera' : 'não supera'}`, cod, sup, ruido: true });
          if (sup) algum = true;
        }
      }
      if (!isFinite(val.aren) && val.semT && r.data.paradigmaVibracao && b > '1997-03-05') {
        dadosOk = true;
        itens.push({ t: 'VCI: [[informe o tempo diário de condução do vínculo para normalizar a vibração do paradigma]]', cod: '2.0.2', sup: false, pendente: true });
      }
      if (isFinite(val.aren)) {
        dadosOk = true;
        const vdv = isFinite(val.vdv) ? `; VDVR ${fmt(val.vdv, 2)}` : '';
        if (b <= '1997-03-05') itens.push({ t: `VCI: aren ${fmt(val.aren, 2)} m/s²${vdv} – cód. 1.1.5 (Dec. 53.831/64) e 1.1.4 (Dec. 83.080/79): perfuratrizes e marteletes pneumáticos`, cod: '1.1.5', sup: false });
        else if (b <= '2014-08-13') {
          const sup = superaLimite(val.aren, 0.86, 2) || superaLimite(val.vdv, 17, 2);
          itens.push({ t: `VCI: aren ${fmt(val.aren, 2)} m/s²${vdv} – ${sup ? 'acima da' : 'até a'} fronteira superior da zona de cautela da ISO 2631-1 (0,86 m/s² – Nota Técnica ASPEJUDI 001/2013 – ou VDV 17) – referência técnica; o cód. 2.0.2 descreve trabalhos com perfuratrizes e marteletes pneumáticos`, cod: '2.0.2', sup });
          if (sup) algum = true;
        } else {
          const sup = superaLimite(val.aren, 1.1, 2) || superaLimite(val.vdv, 21, 2);
          itens.push({ t: `VCI: aren ${fmt(val.aren, 2)} m/s²${vdv} – ${sup ? 'acima' : 'abaixo'} do limite da NR-15, Anexo 8 (1,1 m/s² ou VDVR 21,0)`, cod: '2.0.2', sup });
          if (sup) algum = true;
        }
      }
      // medição inválida para o período (q = 3 antes de 19/11/2003) sem outro agente que caracterize: fica pendente, não "NÃO"
      const pend = !algum && itens.some((i) => i.pendente);
      return { ini: a, fim: b, itens, caracteriza: pend ? '[[pendente]]' : dadosOk ? (algum ? 'SIM' : 'NÃO') : '[[S/N]]', codigos: [...new Set(itens.filter((i) => i.sup).map((i) => i.cod))].join('; ') || '—' };
    });
    return { r, val, segs, excluidos };
  });
}

// Quadro + texto da conclusão; penosidade descrita para auxiliar o Juízo
// de onde vieram os fatores de penosidade (extrajudicial sem vistoria não fala em "autor", "vistoria" nem "medições")
function fontesPenosidade(dados) {
  const quem = dados.c.tipoAtuacao === 'Extrajudicial' ? 'do segurado' : 'do autor';
  const vist = !!(dados.c.vistoriaData || dados.postos.length);
  const med = dados.medicoes.some((m) => /Ru[ií]do|corpo inteiro/.test(m.data.agente || ''));
  const par = dados.periodos.some((r) => r.data.paradigmaRuido || r.data.paradigmaVibracao);
  return [`na entrevista ${quem}`, vist && 'na vistoria', med && 'nas medições', par && 'nos paradigmas de medição'].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' e $1');
}

// fim do subperíodo: vínculo em aberto termina "atual" (não na data de geração do documento)
export const fimSeg = (r, s) => (!r.data.fim && s.fim === hojeLocal() ? 'atual' : dataBR(s.fim));

// resumoPenosidade: false quando o documento já traz a penosidade vínculo a vínculo (parecer de penosidade)
// Resultado técnico do subperíodo juntando agentes nocivos, categoria (até 28/04/1995) e penosidade (a partir de
// 29/04/1995, quando a matriz de fatores a caracteriza): o mesmo critério na matriz, no vínculo e na conclusão
export function resultadoSubperiodo(s, penoso) {
  const soCatS = s.caracteriza === 'SIM' && s.itens.filter((i) => i.sup).every((i) => i.categoria);
  const pen = penoso === true && s.fim > '1995-04-28';
  if (s.caracteriza === 'SIM') return soCatS ? 'SIM – categoria profissional' : pen ? 'SIM – agentes nocivos e penosidade' : 'SIM – agentes nocivos';
  if (pen) return s.caracteriza === 'NÃO' ? 'SIM – penosidade' : `SIM – penosidade (agentes: ${String(s.caracteriza).replace(/\[\[|\]\]/g, '')})`;
  return s.caracteriza;
}

// penosidade: (r) => true | false | null – quando informada, a penosidade entra no resultado de cada subperíodo
export function conclusaoPrevidenciaria(d, dados, { tituloQuadro = 'Conclusão por período', resumoPenosidade = true, penosidade = null } = {}) {
  const av = avaliarPeriodos(dados);
  if (!av.length) { d.redigir('cadastre os vínculos na etapa 2. Autos.'); return; }
  const penDe = (r) => (penosidade ? penosidade(r) : null);
  // uma linha por item avaliado, com o código ao lado do próprio item; período e resultado só na primeira linha
  const linhasSintese = av.flatMap(({ r, segs }) => segs.flatMap((s) => {
    const its = s.itens.length ? s.itens.map((i) => [i.t, i.sup ? (i.cod || '—') : '—']) : [['[[sem avaliação quantitativa para o período]]', '—']];
    if (penDe(r) === true && s.fim > '1995-04-28') its.push(['Penosidade: caracterizada na matriz de fatores (item 3)', s.caracteriza !== 'SIM' ? 'penosidade (IAC nº 5 do TRF4; Tema 1307 do STJ)' : '—']);
    const res = penosidade ? resultadoSubperiodo(s, penDe(r)) : s.caracteriza;
    return its.map(([t, cod], k) => [k ? '' : `${empresaCurta(r)}\n${dataBR(s.ini)} a ${fimSeg(r, s)}`, t, cod, k ? '' : res]);
  }));
  d.quadro(tituloQuadro, [['Vínculo / período', dados.c.tipoAtuacao === 'Extrajudicial' ? 'Avaliação' : 'Avaliação pericial', 'Código', 'Caracteriza'], ...linhasSintese],
  { larguras: [0.19, 0.43, 0.23, 0.15], tam: 9, alinhar: 'left',
    fonte: fonteSintese(dados, av) });
  // afastamentos que não contam como tempo especial
  const excl = av.flatMap(({ r, excluidos }) => (excluidos || []).map(([a, b, x]) => `${dataBR(a)} a ${dataBR(b)} (${empresaCurta(r)})`));
  if (excl.length) d.texto(`Não ${excl.length > 1 ? 'são computados' : 'é computado'} como tempo especial o afastamento por benefício por incapacidade temporária de natureza previdenciária – ${excl.join('; ')} –, pois, a partir do Decreto nº 10.410/2020, somente o afastamento decorrente de benefício acidentário é considerado tempo de trabalho permanente (art. 65, parágrafo único, do Decreto nº 3.048/1999).`);

  const semEpi = !dados.epis.length;
  const pendentes = [];
  for (const { r, val, segs } of av) {
    const sim = segs.filter((s) => s.caracteriza === 'SIM');
    const nao = segs.filter((s) => s.caracteriza === 'NÃO');
    // subperíodos contíguos com o mesmo resultado viram um só intervalo no texto
    const pl = (lst, um, varios) => (/, | e \d/.test(p(lst)) ? varios : um);
    const p = (lst) => lst.reduce((acc, s) => {
      const u = acc[acc.length - 1];
      if (u && dia(u.fim, 1) === s.ini) u.fim = s.fim; else acc.push({ ini: s.ini, fim: s.fim });
      return acc;
    }, []).map((s) => `${dataBR(s.ini)} a ${fimSeg(r, s)}`).join(', ').replace(/, ([^,]*)$/, ' e $1');
    const partes = [];
    // enquadramento só por categoria (até 28/04/1995) é presunção legal, não exposição avaliada
    const soCat = (s) => s.itens.filter((i) => i.sup).every((i) => i.categoria);
    const cat = sim.filter(soCat), agente = sim.filter((s) => !soCat(s));
    const cods = (l) => [...new Set(l.flatMap((s) => s.codigos.split('; ')))].join('; ');
    if (cat.length) partes.push(`enquadra-se por categoria profissional, com presunção legal de exposição, ${pl(cat, 'no período', 'nos períodos')} de ${p(cat)} (cód. ${cods(cat)})`);
    if (agente.length) partes.push(`caracteriza exposição habitual e permanente, não ocasional nem intermitente, a agentes nocivos ${pl(agente, 'no período', 'nos períodos')} de ${p(agente)} (cód. ${cods(agente)})`);
    // penosidade caracterizada onde os agentes não superam os limites: o resultado é especial pela penosidade
    const penR = penDe(r) === true;
    const naoPen = penR ? nao.filter((s) => s.fim > '1995-04-28') : [];
    const naoSo = nao.filter((s) => !naoPen.includes(s));
    if (naoPen.length) partes.push(`caracteriza condições penosas ${pl(naoPen, 'no período', 'nos períodos')} de ${p(naoPen)}, pela matriz de fatores (veículo, trajetos, cargas e jornadas), embora os agentes avaliados não superem os limites da época`);
    if (naoSo.length) partes.push(`não caracteriza ${pl(naoSo, 'no período', 'nos períodos')} de ${p(naoSo)}, em que os valores avaliados não superam os limites da época`);
    const base = [val.fonteR && `ruído pelo ${val.fonteR}`, val.fonteV && `vibração pelo ${val.fonteV}`, isFinite(val.T) && `condução de ${fmtHoras(val.T)}/dia`].filter(Boolean).join(', ');
    if (!partes.length && segs.some((sg) => sg.caracteriza === '[[pendente]]')) { pendentes.push(`${r.data.empresa || 'Vínculo'} (tempo diário de condução)`); continue; }
    if (partes.length) d.texto(`**${empresaCurta(r)} (${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}):** a avaliação${dados.c.tipoAtuacao === 'Extrajudicial' ? '' : ' pericial'}${base ? ` (${base})` : ''} ${partes.join('; e ')}.`);
    else pendentes.push(`${r.data.empresa || 'Vínculo'}${isFinite(val.T) || !RE_MOT.test(`${r.data.cargo || ''} ${r.data.atividades || ''}`) ? '' : ' (e o tempo diário de condução)'}`);
  }
  // um aviso só para todos os vínculos ainda sem valores (antes, um "Redigir" por vínculo)
  if (pendentes.length) d.redigir(`conclusão ${pendentes.length === 1 ? 'do vínculo' : 'dos vínculos'} ${pendentes.join('; ')} – sem valores avaliados (${(dados.agentes || []).length ? 'complete o resultado dos agentes avaliados na etapa 2. Autos' : 'cadastre os agentes avaliados na etapa 2. Autos, ou vincule o paradigma ou a medição do veículo/posto'}).`);
  const ruidoSup = av.some(({ segs }) => segs.some((s) => s.itens.some((i) => i.ruido && i.sup)));
  if (ruidoSup && !semEpi && comJurisprudencia(dados)) d.texto('Quanto ao ruído, a eventual declaração de eficácia do EPI (protetor auricular) não descaracteriza o tempo especial (STF, Tema 555 – ARE 664.335).');
  if (semEpi) d.texto(/Pr[oó]prio/.test(dados.c.pppEmitente || '')
    ? 'Sem a comprovação dos requisitos cumulativos do art. 291 da IN 128/2022, o EPI informado pelo segurado não é considerado eficaz, e não se considera neutralizada a exposição em nenhum dos períodos.'
    : 'Não foram apresentados registros de fornecimento de EPI nem dos demais requisitos de responsabilidade do empregador (art. 291 da IN 128/2022); assim, não se considera neutralizada a exposição em nenhum dos períodos.');

  if (resumoPenosidade && avaliaPenosidade(dados)) {
    const jur = comJurisprudencia(dados);
    // até 28/04/1995 o enquadramento é por categoria: o vínculo encerrado até essa data não entra na síntese de penosidade
    const vs = vinculosMotorista(dados).filter((r) => !r.data.fim || r.data.fim > '1995-04-28');
    const textos = vs.map((r) => {
      const m = matrizIAC(r, dados);
      const f = m.criterios.filter((c) => c.linhas.length).map((c) => `${c.titulo.replace(/^\d\. Análise d[oa]s? /, '').replace(/^./, (k) => k.toUpperCase())} – ${c.linhas.map((l) => l.replace(/^[^:]+: /, '')).join('; ')}`);
      if (!f.length) return '';
      return `**${r.data.empresa || 'Vínculo'} (${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}):** ${f.join('. ')}.${m.conclusao ? ` **${m.conclusao}**` : ''}`;
    }).filter(Boolean);
    if (textos.length) {
      d.texto(`Quanto à penosidade da atividade de motorista após 28/04/1995, a perícia avaliou cada vínculo por uma matriz de fatores (veículo, trajetos, cargas e jornadas)${jur ? ', em atenção ao Tema 1307 do STJ e aos IAC nº 5 e nº 12 do TRF4' : ''}, com base ${fontesPenosidade(dados)}. Em síntese:`);
      for (const t of textos) d.texto(`- ${t}`);
    }
  }
}
