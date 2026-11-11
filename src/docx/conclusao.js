// Conclusão previdenciária calculada pelo app, por vínculo e por subperíodo de critério:
// categoria (até 28/04/1995), ruído (Lavg até 18/11/2003; NEN depois) e vibração de corpo inteiro
// (ISO 2631-1 de 06/03/1997 a 13/08/2014; NR-15, Anexo 8, a partir de 14/08/2014).
import { dataBR, postosDoPeriodo, nomeCurto, hojeLocal, superaLimite } from './base.js';
import { comJurisprudencia } from './fontes.js';
import { avaliaPenosidade, vinculosMotorista, matrizIAC } from './penosidade.js';
import { nenParaJornada, arenParaJornada, vdvrParaJornada } from '../paradigmas.js';
import { num, fmt, nen, fatorQ } from '../calc.js';

const CORTES = ['1995-04-28', '1997-03-05', '2003-11-18', '2014-08-13'];
const dia = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
const RE_MOT = /motorista|caminh|carreteir|cobrador|ônibus|onibus/i;
// Súmula 70 da TNU: tratorista equipara-se a motorista de caminhão para o enquadramento por categoria
const RE_TRAT = /tratorist|operador de trator|operador de m[aá]quinas? agr[ií]col/i;
const RE_COBR = /cobrador/i;

function segmentos(r) {
  const ini = r.data.inicio; const fim = r.data.fim || hojeLocal();
  if (!ini) return [];
  const out = []; let a = ini;
  for (const c of CORTES) if (c >= a && c < fim) { out.push([a, c]); a = dia(c, 1); }
  out.push([a, fim]);
  return out;
}

// valores de ruído e VCI do vínculo: paradigma (normalizado para T) ou medição do posto que o representa
export function valores(r, dados) {
  const T = num(r.data.conducaoH);
  const out = { T };
  const pr = r.data.paradigmaRuido && dados.paradigmas.get(r.data.paradigmaRuido);
  const pv = r.data.paradigmaVibracao && dados.paradigmas.get(r.data.paradigmaVibracao);
  const ids = new Set(postosDoPeriodo(r, dados).map((p) => p.id));
  const mr = dados.medicoes.find((m) => m.data.agente === 'Ruído' && ids.has(m.data.postoId));
  const mv = dados.medicoes.find((m) => /corpo inteiro/.test(m.data.agente || '') && ids.has(m.data.postoId));
  if (pr) { out.lavg = num(pr.data.lavg); out.nen = isFinite(T) ? nenParaJornada(pr.data.lavg, T) : NaN; out.fonteR = `paradigma ${pr.data.codigo}`; }
  else if (mr) {
    out.q = fatorQ(mr);
    out.lavg = num(mr.data.lavg);
    out.nen = isFinite(T) ? nen(mr.data.lavg, `${T}h`, out.q) : nen(mr.data.lavg, mr.data.jornada, out.q);
    out.fonteR = nomeCurto(dados.postos.find((p) => p.id === mr.data.postoId)?.data.nome);
  }
  if (pv) {
    // arep = aceleração do período amostrado → A(T) = arep·√(T/8); sem arep, o aren do laudo já está
    // normalizado para a jornada do laudo de origem: A(T) = aren·√(T/Tlaudo)
    const tLaudoV = num(pv.data.jornadaVibracaoLaudo) || num(pv.data.jornadaLaudo) || 8;
    out.aren = !isFinite(T) ? NaN : String(pv.data.arep || '').trim() ? arenParaJornada(pv.data.arep, T) : arenParaJornada(pv.data.arenLaudo, T * 8 / tLaudoV);
    out.vdv = isFinite(T) ? vdvrParaJornada(pv.data.vdvrLaudo, T, num(pv.data.jornadaVibracaoLaudo) || num(pv.data.jornadaLaudo) || 8) : NaN;
    out.fonteV = `paradigma ${pv.data.codigo}`;
  } else if (mv) {
    out.aren = num(mv.data.aren); out.vdv = num(mv.data.vdv); // valores já normalizados para a exposição diária
    out.fonteV = nomeCurto(dados.postos.find((p) => p.id === mv.data.postoId)?.data.nome);
  }
  return out;
}

export function avaliarPeriodos(dados) {
  return dados.periodos.map((r) => {
    const val = valores(r, dados);
    const funcao = `${r.data.cargo || ''} ${r.data.atividades || ''}`;
    const tratorista = RE_TRAT.test(funcao);
    const motorista = RE_MOT.test(funcao);
    const soCobrador = RE_COBR.test(funcao) && !/motorista/i.test(funcao);
    const segs = segmentos(r).map(([a, b]) => {
      const itens = []; let algum = false; let dadosOk = false;
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
          itens.push({ t: `Ruído: medição com q = 3 (NHO-01) – [[período anterior a 19/11/2003 exige o Lavg com q = 5 (NR-15); refaça a leitura do dosímetro com q = 5]]`, cod, sup: false, ruido: true });
        } else if (isFinite(x)) {
          const sup = superaLimite(x, lim);
          itens.push({ t: `Ruído: ${crit}${crit === 'NEN' && val.q === 3 ? ' (q = 3, NHO-01)' : ''} ${fmt(x, 1)} dB(A) ${sup ? '>' : '≤'} ${lim} dB(A) – ${sup ? 'supera' : 'não supera'}`, cod, sup, ruido: true });
          if (sup) algum = true;
        }
      }
      if (isFinite(val.aren)) {
        dadosOk = true;
        const vdv = isFinite(val.vdv) ? `; VDVR ${fmt(val.vdv, 2)}` : '';
        if (b <= '1997-03-05') itens.push({ t: `VCI: aren ${fmt(val.aren, 2)} m/s²${vdv} – cód. 1.1.5 do Dec. 53.831/64 (perfuratrizes e marteletes pneumáticos, e outros; máquinas a ar comprimido acima de 120 golpes/min) e cód. 1.1.4 do Dec. 83.080/79 (perfuratrizes e marteletes pneumáticos)`, cod: '1.1.5', sup: false });
        else if (b <= '2014-08-13') {
          const sup = val.aren > 0.9 || val.vdv > 17;
          itens.push({ t: `VCI: aren ${fmt(val.aren, 2)} m/s²${vdv} – ${sup ? 'acima da' : 'até a'} fronteira superior da zona de cautela da ISO 2631-1 (0,9 m/s² ou VDV 17) – referência técnica; o cód. 2.0.2 descreve trabalhos com perfuratrizes e marteletes pneumáticos`, cod: '2.0.2', sup });
          if (sup) algum = true;
        } else {
          const sup = val.aren > 1.1 || val.vdv > 21;
          itens.push({ t: `VCI: aren ${fmt(val.aren, 2)} m/s²${vdv} – ${sup ? 'acima' : 'abaixo'} do limite da NR-15, Anexo 8 (1,1 m/s² ou VDVR 21,0)`, cod: '2.0.2', sup });
          if (sup) algum = true;
        }
      }
      return { ini: a, fim: b, itens, caracteriza: dadosOk ? (algum ? 'SIM' : 'NÃO') : '[[S/N]]', codigos: [...new Set(itens.filter((i) => i.sup).map((i) => i.cod))].join('; ') || '—' };
    });
    return { r, val, segs };
  });
}

// Quadro + texto da conclusão; penosidade descrita para auxiliar o Juízo
export function conclusaoPrevidenciaria(d, dados, { tituloQuadro = 'Conclusão por período' } = {}) {
  const av = avaliarPeriodos(dados);
  if (!av.length) { d.redigir('cadastre os vínculos na etapa 2. Autos.'); return; }
  d.quadro(tituloQuadro, [['Vínculo / período', 'Avaliação pericial', 'Código', 'Caracteriza'],
    ...av.flatMap(({ r, segs }) => segs.map((s) => [`${r.data.empresa || ''}\n${dataBR(s.ini)} a ${dataBR(s.fim)}`,
      s.itens.length ? s.itens.map((i) => i.t).join('\n') : '[[sem avaliação quantitativa para o período]]', s.codigos, s.caracteriza]))],
  { larguras: [0.27, 0.47, 0.13, 0.13], tam: 9,
    fonte: 'Elaborado pelo autor. Ruído com q = 5; NEN e aren normalizados para o tempo diário de condução de cada vínculo, quando informado.' });

  const semEpi = !dados.epis.length;
  for (const { r, val, segs } of av) {
    const sim = segs.filter((s) => s.caracteriza === 'SIM');
    const nao = segs.filter((s) => s.caracteriza === 'NÃO');
    // subperíodos contíguos com o mesmo resultado viram um só intervalo no texto
    const pl = (lst, um, varios) => (p(lst).includes(', ') ? varios : um);
    const p = (lst) => lst.reduce((acc, s) => {
      const u = acc[acc.length - 1];
      if (u && dia(u.fim, 1) === s.ini) u.fim = s.fim; else acc.push({ ini: s.ini, fim: s.fim });
      return acc;
    }, []).map((s) => `${dataBR(s.ini)} a ${dataBR(s.fim)}`).join(', ');
    const partes = [];
    // enquadramento só por categoria (até 28/04/1995) é presunção legal, não exposição avaliada
    const soCat = (s) => s.itens.filter((i) => i.sup).every((i) => i.categoria);
    const cat = sim.filter(soCat), agente = sim.filter((s) => !soCat(s));
    const cods = (l) => [...new Set(l.flatMap((s) => s.codigos.split('; ')))].join('; ');
    if (cat.length) partes.push(`enquadra-se por categoria profissional, com presunção legal de exposição, ${pl(cat, 'no período', 'nos períodos')} de ${p(cat)} (cód. ${cods(cat)})`);
    if (agente.length) partes.push(`caracteriza exposição habitual e permanente, não ocasional nem intermitente, a agentes nocivos ${pl(agente, 'no período', 'nos períodos')} de ${p(agente)} (cód. ${cods(agente)})`);
    if (nao.length) partes.push(`não caracteriza ${pl(nao, 'no período', 'nos períodos')} de ${p(nao)}, em que os valores avaliados não superam os limites da época`);
    const base = [val.fonteR && `ruído pelo ${val.fonteR}`, val.fonteV && `vibração pelo ${val.fonteV}`, isFinite(val.T) && `condução de ${String(r.data.conducaoH).replace('.', ',')} h/dia`].filter(Boolean).join(', ');
    if (partes.length) d.texto(`**${r.data.empresa || 'Vínculo'} (${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}):** a avaliação pericial${base ? ` (${base})` : ''} ${partes.join('; e ')}.`);
    else d.redigir(`conclusão do vínculo ${r.data.empresa || ''} – sem valores avaliados vinculados a ele (vincule o veículo/posto ou o paradigma).`);
  }
  const ruidoSup = av.some(({ segs }) => segs.some((s) => s.itens.some((i) => i.ruido && i.sup)));
  if (ruidoSup && !semEpi && comJurisprudencia(dados)) d.texto('Quanto ao ruído, a eventual declaração de eficácia do EPI (protetor auricular) não descaracteriza o tempo especial (STF, Tema 555 – ARE 664.335).');
  if (semEpi) d.texto('Não foram apresentados registros de fornecimento de EPI nem dos demais requisitos de responsabilidade do empregador (art. 291 da IN 128/2022); assim, não se considera neutralizada a exposição em nenhum dos períodos.');

  if (avaliaPenosidade(dados)) {
    const jur = comJurisprudencia(dados);
    const vs = vinculosMotorista(dados);
    const textos = vs.map((r) => {
      const m = matrizIAC(r, dados);
      const f = m.criterios.filter((c) => c.linhas.length).map((c) => `${c.titulo.replace(/^\d\. Análise d[oa]s? /, '').replace(/^./, (k) => k.toUpperCase())} – ${c.linhas.map((l) => l.replace(/^[^:]+: /, '')).join('; ')}`);
      if (!f.length) return '';
      return `**${r.data.empresa || 'Vínculo'} (${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}):** ${f.join('. ')}.${m.conclusao ? ` **${m.conclusao}**` : ''}`;
    }).filter(Boolean);
    if (textos.length) {
      d.texto(`Quanto à penosidade da atividade de motorista após 28/04/1995, a perícia avaliou cada vínculo por uma matriz de fatores (veículo, trajetos, cargas e jornadas)${jur ? ', em atenção ao Tema 1307 do STJ e aos IAC nº 5 e nº 12 do TRF4' : ''}, com base na entrevista do autor, na vistoria e nas medições. Em síntese:`);
      for (const t of textos) d.texto(`- ${t}`);
    }
  }
}
