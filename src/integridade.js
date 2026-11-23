// ======================================================================
// Condições de risco à integridade física fora do Anexo IV (eletricidade acima de 250 V depois de 05/03/1997,
// inflamáveis, explosivos): registradas no LTCAT como fato técnico, pelos critérios da NR-16 e da NR-10, sem
// alterar o enquadramento do período (que segue o Anexo IV) – a apreciação é da autoridade administrativa ou
// judicial, e os entendimentos dos tribunais ficam no item de jurisprudência. O PPP só remete ao LTCAT, nas
// observações, e o código GFIP não muda. A partir de 13/11/2019, a redação do art. 201, § 1º, II, da
// Constituição (EC nº 103/2019) fala só em agentes químicos, físicos e biológicos prejudiciais à saúde.
// ======================================================================
import { agenteNoVinculo } from './enquadramento.js';
import { bancoDoAgente, agentesDoArt68 } from './docx/agentesQuadros.js';

const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
const semAc = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const br = (iso) => String(iso || '').replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$3/$2/$1');
// "Habitual e permanente, não ocasional nem intermitente: o agente…" → até os dois-pontos ou o primeiro ponto
const primeiraFrase = (t) => { const x = v(t); if (!x) return ''; const m = x.match(/^[^:.]+/); return `${m ? m[0] : x}.`; };
const curto = (n) => v(n).replace(/\s+\(.*$/, '');

export const INTEGRIDADE = ['Caracterizada tecnicamente', 'Não caracterizada', 'Não se aplica'];
export const TITULO_INTEGRIDADE = 'Riscos à integridade física (NR-16 e NR-10)';

// ---------------- candidatos (sugestão automática) ----------------
// Inflamável: nome conhecido, ponto de fulgor até 60 °C no banco de químicos (NR-20) ou frases H220 a H226 / classificação
// "inflamável" na FDS de um produto que contém o agente; eletricidade e explosivos, pelo nome.
const RE_INFLAMAVEL = /pentano|hexano|heptano|octano|gasolina|etanol|alcool|metanol|isopropanol|acetona|tolueno|xileno|thinner|solvente|nafta|aguarras|querosene|glp|gas liquefeito|butano|propano|acetileno|hidrogenio|metano|eter|acetato de (etila|butila)|metiletilcetona|\bmek\b|inflamave/;
const RE_INFLAMAVEL_INICIO = new RegExp(`^(?:ciclo|iso)?(?:${RE_INFLAMAVEL.source})`);
const fulgor = (t) => { const m = String(t || '').replace(',', '.').match(/(-?\d+(?:\.\d+)?)\s*°?\s*C/i); return m ? Number(m[1]) : NaN; };
export function tipoDeRisco(a, dados = {}) {
  const x = a.data || a;
  const n = semAc(`${x.nome || ''} ${x.criterioIntegridade || ''}`);
  if (/eletric|tensao|energiz/.test(n)) return 'eletricidade';
  if (/explosiv/.test(n)) return 'explosivos';
  // o nome tem de começar pelo inflamável ("Tolueno", "n-Pentano", "Vapores de gasolina"): "Diisocianato de tolueno"
  // e "Fluortriclorometano" não são inflamáveis
  const principal = semAc(x.nome).replace(/\s*\(.*$/, '').trim().replace(/^(?:n-|iso-|vapores? de |inflamaveis? ?[-–:]? ?)/, '');
  if (/inflamave/.test(semAc(x.nome).slice(0, 12)) || RE_INFLAMAVEL_INICIO.test(principal)) return 'inflamáveis';
  const q = bancoDoAgente(a, dados.quimicos || []);
  if (q && (fulgor(q.data.pontoFulgor) <= 60 || /H22[0-6]/.test(v(q.data.frasesH)))) return 'inflamáveis';
  const cas = v(x.cas); const nome = semAc(x.nome).replace(/\s*\(.*$/, '').trim();
  const naFds = (dados.produtos || []).some((p) => {
    const d = p.data; const comp = semAc(`${d.nome || ''}\n${d.s3Componentes || ''}`);
    return ((cas && comp.includes(cas)) || (nome.length >= 4 && comp.includes(nome)))
      && (/H22[0-6]/.test(v(d.s2FrasesH)) || /inflamave/.test(semAc(d.s2Classificacao)) || fulgor(d.s9Fulgor) <= 60);
  });
  return naFds ? 'inflamáveis' : '';
}
// agentes ainda sem resposta que podem representar risco à integridade física fora do Anexo IV, em período
// posterior a 05/03/1997 (antes, o decreto já trata eletricidade e os químicos por presunção)
export function candidatosIntegridade(dados, hoje = new Date().toISOString().slice(0, 10)) {
  const depois97 = (a) => (dados.periodos || []).some((r, i) => agenteNoVinculo(a, i) && (r.data.fim || hoje) >= '1997-03-06' && (!v(a.data.expFim) || v(a.data.expFim) >= '1997-03-06'));
  return (dados.agentes || []).filter((a) => !v(a.data.integridadeFisica) && a.data.resDesde97 !== 'Caracteriza' && depois97(a))
    .map((a) => ({ a, risco: tipoDeRisco(a, dados) })).filter((c) => c.risco);
}

// critério técnico pelo tipo de risco (o digitado no agente prevalece)
export function criterioIntegridade(a) {
  const x = a.data || a;
  if (v(x.criterioIntegridade)) return v(x.criterioIntegridade);
  const n = semAc(x.nome);
  if (/eletric|tensao|energiz/.test(n)) return 'NR-16, Anexo 4 (energia elétrica), e NR-10 – trabalho em instalações ou equipamentos energizados, com tensão acima de 250 V';
  if (/explosiv/.test(n)) return 'NR-16, Anexo 1 (explosivos) – área de risco';
  if (/inflamave|combustive|pentano|gasolina|etanol|alcool|glp|gas liquefeito|solvente/.test(n)) return 'NR-16, Anexo 2 (inflamáveis) – operação ou permanência em área de risco';
  if (/radia/.test(n)) return 'NR-16, anexo sem número (radiações ionizantes)';
  return 'NR-16 – [[anexo e item aplicáveis]]';
}

// condições registradas: período em cada vínculo (depois de 05/03/1997 quando o decreto já enquadrava antes)
export function condicoesIntegridade(dados, hoje = new Date().toISOString().slice(0, 10)) {
  const out = [];
  for (const a of dados.agentes || []) {
    if (v(a.data.integridadeFisica) !== INTEGRIDADE[0]) continue;
    dados.periodos.forEach((r, i) => {
      if (!agenteNoVinculo(a, i) || !r.data.inicio) return;
      let ini = r.data.inicio; let fim = r.data.fim || hoje;
      if (v(a.data.expInicio) > ini) ini = v(a.data.expInicio);
      if (v(a.data.expFim) && v(a.data.expFim) < fim) fim = v(a.data.expFim);
      // até 05/03/1997 o agente que já caracteriza pelo decreto (ex.: eletricidade, cód. 1.1.8) não precisa do registro
      if (a.data.resAte97 === 'Caracteriza' && ini <= '1997-03-05') ini = '1997-03-06';
      if (ini > fim) return;
      out.push({ a, r, idx: i, ini, fim, criterio: criterioIntegridade(a), posEc103: fim > '2019-11-13' });
    });
  }
  return out;
}

// item do LTCAT (dentro do item 5): texto, quadro e nota da EC 103/2019
// "n-Pentano (inflamáveis)"; "Eletricidade" sem repetir o tipo de risco
const rotuloPend = (c) => (semAc(curto(c.a.data.nome)).includes(semAc(c.risco).slice(0, 7)) ? curto(c.a.data.nome) : `${curto(c.a.data.nome)} (${c.risco})`);
export function secaoIntegridade(d, dados, sub) {
  const cs = condicoesIntegridade(dados);
  const pend = candidatosIntegridade(dados);
  if (!cs.length && !pend.length) return false;
  if (!cs.length) {
    sub(TITULO_INTEGRIDADE);
    d.texto(`[[Avaliar o risco à integridade física a partir de 06/03/1997 (${pend.map(rotuloPend).join('; ')}): responda nas pendências se a exposição é habitual e permanente ("Caracterizada tecnicamente") ou eventual ("Não caracterizada").]]`);
    return true;
  }
  sub(TITULO_INTEGRIDADE);
  if (pend.length) d.texto(`[[Avaliar também o risco à integridade física de: ${pend.map(rotuloPend).join('; ')} (pendências).]]`);
  d.texto('As condições abaixo não constam do Anexo IV do Decreto nº 3.048/1999, mas expõem o segurado a risco à integridade física, que o art. 57 da Lei nº 8.213/1991 equipara às condições prejudiciais à saúde. Caracterizadas pelos critérios da NR-16 e da NR-10, com exposição habitual e permanente, não ocasional nem intermitente, elas são enquadradas neste laudo e constam da síntese do item 6; o entendimento sobre o rol dos regulamentos está no item de jurisprudência.');
  const varios = dados.periodos.length > 1;
  // o agente já descrito no quadro do art. 68 (item anterior): aqui só a frequência, sem repetir as circunstâncias
  const noArt68 = new Set(agentesDoArt68(dados.agentes || []).map((a) => a.id));
  d.quadro('Condições de risco à integridade física', [['Condição', 'Critério técnico', 'Período', 'Circunstâncias, frequência e duração'],
    ...cs.map((c) => [`${curto(c.a.data.nome)}${varios ? `\nV${c.idx + 1}` : ''}`, c.criterio, `${br(c.ini)} a ${c.r.data.fim || v(c.a.data.expFim) ? br(c.fim) : 'atual'}`,
      noArt68.has(c.a.id) ? `${primeiraFrase(c.a.data.frequencia) || '[[frequência]]'} Circunstâncias e fontes: quadro do art. 68, § 2º (item anterior).`
        : [v(c.a.data.circunstancias), v(c.a.data.frequencia)].filter(Boolean).join(' ') || '[[circunstâncias, frequência e duração da exposição]]'])],
  { larguras: [0.18, 0.3, 0.16, 0.36], tam: 8.5, alinhar: 'left', fonte: 'Elaborado pelo signatário com base nas declarações do item 2.3 e nos critérios da NR-16 e da NR-10.' });
  if (cs.some((c) => c.posEc103)) d.texto('A partir de 13/11/2019, data de entrada em vigor da Emenda Constitucional nº 103/2019, o art. 201, § 1º, II, da Constituição refere-se apenas à efetiva exposição a agentes químicos, físicos e biológicos prejudiciais à saúde; para esse período, o enquadramento por risco à integridade física, mantido neste laudo pelos mesmos critérios técnicos, deve ser apreciado à luz dessa redação.');
  return true;
}

// observação do PPP: remete ao LTCAT; não altera o código GFIP
export function obsPppIntegridade(dados) {
  const cs = condicoesIntegridade(dados);
  if (!cs.length) return [];
  const lst = cs.map((c) => `${curto(c.a.data.nome).toLowerCase()} (${br(c.ini)} a ${c.r.data.fim || v(c.a.data.expFim) ? br(c.fim) : 'atual'})`);
  return [`Consta do LTCAT, no item "${TITULO_INTEGRIDADE}", a exposição habitual e permanente a risco à integridade física – ${lst.join('; ')} –, enquadrada com fundamento no art. 57 da Lei nº 8.213/1991 e nos critérios da NR-16 e da NR-10. Por não constar do Anexo IV do Decreto nº 3.048/1999, a condição não integra os fatores de risco do campo 15 nem o código GFIP.`];
}

// itens da síntese (conclusao.js): condições registradas no vínculo que alcançam o subperíodo [ini, fim]
export function itensIntegridade(dados, idx, ini, fim) {
  return condicoesIntegridade(dados).filter((c) => c.idx === idx && c.ini <= fim && c.fim >= ini)
    .map((c) => ({ t: curto(c.a.data.nome), cod: c.criterio.replace(/\s+[–(].*$/, ''), sup: true, integridade: true }));
}
