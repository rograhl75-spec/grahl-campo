// ======================================================================
// Condições de risco à integridade física fora do Anexo IV (eletricidade acima de 250 V depois de 05/03/1997,
// inflamáveis, explosivos): registradas no LTCAT como fato técnico, pelos critérios da NR-16 e da NR-10, sem
// alterar o enquadramento do período (que segue o Anexo IV) – a apreciação é da autoridade administrativa ou
// judicial, e os entendimentos dos tribunais ficam no item de jurisprudência. O PPP só remete ao LTCAT, nas
// observações, e o código GFIP não muda. A partir de 13/11/2019, a redação do art. 201, § 1º, II, da
// Constituição (EC nº 103/2019) fala só em agentes químicos, físicos e biológicos prejudiciais à saúde.
// ======================================================================
import { agenteNoVinculo } from './enquadramento.js';

const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
const semAc = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const br = (iso) => String(iso || '').replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$3/$2/$1');
const curto = (n) => v(n).replace(/\s+\(.*$/, '');

export const INTEGRIDADE = ['Caracterizada tecnicamente', 'Não caracterizada', 'Não se aplica'];
export const TITULO_INTEGRIDADE = 'Condições de risco à integridade física não previstas no Anexo IV';

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
export function secaoIntegridade(d, dados, sub) {
  const cs = condicoesIntegridade(dados);
  if (!cs.length) return false;
  sub(TITULO_INTEGRIDADE);
  d.texto('As condições abaixo não constam do Anexo IV do Decreto nº 3.048/1999 e não alteram o enquadramento dos períodos, que segue o item 6. São registradas como fato técnico, pelos critérios da NR-16 e da NR-10, para apreciação da autoridade administrativa ou judicial.');
  const varios = dados.periodos.length > 1;
  d.quadro('Condições de risco à integridade física', [['Condição', 'Critério técnico', 'Período', 'Circunstâncias, frequência e duração'],
    ...cs.map((c) => [`${curto(c.a.data.nome)}${varios ? `\nV${c.idx + 1}` : ''}`, c.criterio, `${br(c.ini)} a ${c.r.data.fim || v(c.a.data.expFim) ? br(c.fim) : 'atual'}`,
      [v(c.a.data.circunstancias), v(c.a.data.frequencia)].filter(Boolean).join(' ') || '[[circunstâncias, frequência e duração da exposição]]'])],
  { larguras: [0.18, 0.3, 0.16, 0.36], tam: 8.5, alinhar: 'left', fonte: 'Elaborado pelo signatário com base nas declarações do item 2.3 e nos critérios da NR-16 e da NR-10.' });
  if (cs.some((c) => c.posEc103)) d.texto('A partir de 13/11/2019, data de entrada em vigor da Emenda Constitucional nº 103/2019, o art. 201, § 1º, II, da Constituição refere-se apenas à efetiva exposição a agentes químicos, físicos e biológicos prejudiciais à saúde; o registro desse período é apenas informativo.');
  return true;
}

// observação do PPP: remete ao LTCAT; não altera o código GFIP
export function obsPppIntegridade(dados) {
  const cs = condicoesIntegridade(dados);
  if (!cs.length) return [];
  const lst = cs.map((c) => `${curto(c.a.data.nome).toLowerCase()} (${br(c.ini)} a ${c.r.data.fim || v(c.a.data.expFim) ? br(c.fim) : 'atual'})`);
  return [`Consta do LTCAT, no item "${TITULO_INTEGRIDADE}", o registro técnico de condição de risco à integridade física – ${lst.join('; ')} –, não prevista no Anexo IV do Decreto nº 3.048/1999 e registrada para apreciação administrativa ou judicial; não altera os fatores de risco do campo 15 nem o código GFIP.`];
}
