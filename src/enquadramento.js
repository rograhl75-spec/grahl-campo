// Enquadramento previdenciário além do ruído e da vibração medidos:
//  - categoria profissional da área da saúde (até 28/04/1995);
//  - agentes avaliados de forma qualitativa ou sem medição (biológicos, químicos, físicos), cadastrados no caso
//    com o resultado até 05/03/1997 e a partir de 06/03/1997;
//  - afastamentos por benefício que não contam como tempo especial.

import { avaliacaoPeloManual, cancerigenoAnexoIV, codigosNosDecretos } from './normas.js';

const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
const dia = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// Decreto 53.831/1964, cód. 2.1.3 (medicina, odontologia, enfermagem) e Decreto 83.080/1979, Anexo II, cód. 2.1.3
const SAUDE = [
  { re: /dentista|odont[oó]log|cirurgi[aã]o[- ]dentista/i, t: 'Categoria profissional de cirurgião-dentista – enquadramento por presunção' },
  { re: /\bm[eé]dic[oa]\b/i, t: 'Categoria profissional de médico – enquadramento por presunção' },
  { re: /enfermeir|enfermagem/i, t: 'Categoria profissional de enfermagem – enquadramento por presunção' },
];
export const COD_CAT_SAUDE = '2.1.3 do Dec. 53.831/64 e do Anexo II do Dec. 83.080/79';
export function categoriaSaude(funcao) {
  const f = SAUDE.find((x) => x.re.test(funcao || ''));
  return f ? { t: f.t, cod: COD_CAT_SAUDE, sup: true, categoria: true } : null;
}

// Biológico: códigos por época quando o cadastro deixou em branco
export const BIO_ATE97 = '1.3.2 do Dec. 53.831/64 e 1.3.4 do Anexo I do Dec. 83.080/79';
export const BIO_DESDE97 = '3.0.1, a, do Anexo IV dos Dec. 2.172/97 e 3.048/99';
export function codigosDoAgente(a) {
  const x = a.data || a;
  const bio = x.tipo === 'Biológico';
  return {
    // em branco: biológico pelos códigos da área da saúde; demais, pela tabela de agentes dos decretos
    ate97: v(x.codAte97) || (bio ? BIO_ATE97 : (codigosNosDecretos(x.nome) || {}).ate97 || ''),
    desde97: v(x.codDesde97) || (bio ? BIO_DESDE97 : (codigosNosDecretos(x.nome) || {}).desde97 || ''),
    tecnica: tecnicaDoAgente(a, false),
  };
}

// Técnica de avaliação (campo 15.6 do PPP), pelo critério do Manual de Aposentadoria Especial do INSS (2018):
// biológicos – qualitativa; químicos até 05/03/1997 – qualitativa, por presunção; a partir de 06/03/1997 –
// quantitativa (NR-15, Anexo 11) ou qualitativa (Anexos 13 e 13-A), conforme o agente; radiação ionizante –
// qualitativa até 05/03/1997 e quantitativa depois (NR-15, Anexo 5); demais físicos – quantitativa.
// O que o perito digitou no agente prevalece.
export function tecnicaDoAgente(a, ate97) {
  const x = a.data || a;
  if (v(x.tecnica)) return x.tecnica;
  const cod = `${ate97 ? x.codAte97 || '' : x.codDesde97 || ''} ${x.nome || ''}`;
  if (x.tipo === 'Biológico') return 'Qualitativa';
  if (x.tipo === 'Físico') {
    if (/radia/i.test(cod)) return ate97 ? 'Qualitativa' : 'Quantitativa – NR-15, Anexo 5 (CNEN)';
    if (/ru[ií]do/i.test(cod)) return ate97 ? 'Quantitativa – NR-15, Anexo 1' : 'Quantitativa – NHO-01';
    // eletricidade: exposição a tensão acima de 250 V, pela atividade (não há medição de intensidade)
    if (/eletric|el[ée]tric|tens[ãa]o/i.test(cod)) return 'Qualitativa';
    return 'Quantitativa';
  }
  if (ate97) return 'Qualitativa';
  // 1) o critério escrito no código pelo signatário prevalece
  if (/13-A/i.test(cod)) return 'Qualitativa – NR-15, Anexo 13-A';
  if (/quantitativ/i.test(cod)) return 'Quantitativa – NR-15, Anexo 11';
  if (/qualitativ/i.test(cod)) return 'Qualitativa – NR-15, Anexo 13';
  // 2) quadros do Manual de Aposentadoria Especial do INSS (2018), pelo nome do agente
  if (cancerigenoAnexoIV(x.nome)) return 'Qualitativa – LINACH Grupo 1';
  const m = avaliacaoPeloManual(x.nome);
  if (m) return m.forma === 'Quantitativa' ? 'Quantitativa – NR-15, Anexo 11' : 'Qualitativa – NR-15, Anexo 13';
  // 3) o anexo citado no código
  if (/Anexo 11/i.test(cod)) return 'Quantitativa – NR-15, Anexo 11';
  if (/Anexo 13/i.test(cod)) return 'Qualitativa – NR-15, Anexo 13';
  return 'Qualitativa – NR-15, Anexo 13';
}

// o agente vale para o vínculo? "V1, V3" (pela ordem cronológica) ou em branco = todos
export function agenteNoVinculo(a, idx) {
  const lst = v((a.data || a).vinculos);
  if (!lst || /todos/i.test(lst)) return true;
  const ns = (lst.match(/\d+/g) || []).map(Number);
  return ns.includes(idx + 1);
}

// período de exposição do agente dentro do vínculo (expInicio / expFim); em branco = o vínculo inteiro
export function agenteNoIntervalo(a, ini, fim) {
  const x = a.data || a;
  const de = v(x.expInicio); const ate = v(x.expFim);
  return (!de || !fim || fim >= de) && (!ate || !ini || ini <= ate);
}
// datas de corte da síntese pelos períodos de exposição (o subperíodo termina na véspera do início e no fim)
export function cortesDosAgentes(agentes, idx) {
  const out = [];
  const vespera = (iso) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };
  for (const a of agentes || []) {
    if (!agenteNoVinculo(a, idx)) continue;
    const x = a.data || a;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v(x.expInicio))) out.push(vespera(x.expInicio));
    if (/^\d{4}-\d{2}-\d{2}$/.test(v(x.expFim))) out.push(v(x.expFim));
  }
  return out;
}

// resultado do agente no subperíodo [ini, fim] (os subperíodos já são cortados em 05/03/1997)
export function resultadoNoSegmento(a, fim) {
  const x = a.data || a;
  const ate = fim <= '1997-03-05';
  const res = v(ate ? x.resAte97 : x.resDesde97);
  const cod = ate ? codigosDoAgente(a).ate97 : codigosDoAgente(a).desde97;
  return { res, cod };
}

// itens do subperíodo: os que caracterizam e os pendentes, um a um; os que não caracterizam, numa linha só
export function itensAgentes(agentes, idx, ini, fim) {
  const itens = []; const nao = []; const fora = []; const sim = new Map();
  const curto = (n) => n.replace(/\s*\(.*$/, '');
  // só o código, sem a descrição: "1.0.9 do Anexo IV (cloro…) – avaliação…" → "1.0.9 do Anexo IV"
  const codCurto = (c) => String(c || '').split(/\s+\(|\s+–\s+/)[0].trim();
  for (const a of agentes) {
    if (!agenteNoVinculo(a, idx) || !agenteNoIntervalo(a, ini, fim)) continue;
    const nome = v(a.data.nome) || 'Agente';
    const { res, cod } = resultadoNoSegmento(a, fim);
    if (res === 'Caracteriza') {
      const k = `${a.data.tipo || 'Químico'}|${tecnicaDoAgente(a, fim <= '1997-03-05').split(' ')[0].toLowerCase()}`;
      if (!sim.has(k)) sim.set(k, []);
      sim.get(k).push({ nome, cod: codCurto(cod) || '[[código]]' });
    } else if (res === 'Não caracteriza') nao.push(curto(nome));
    else if (res === 'Não enquadrável') fora.push(curto(nome));
    else itens.push({ t: `${curto(nome)}: [[resultado a confirmar]]`, cod: codCurto(cod), sup: false, pendente: true, agente: true });
  }
  // os que caracterizam, um item por tipo (vários químicos numa linha só; o detalhe está no item 5)
  const plural = { 'Biológico': 'Agentes biológicos', 'Químico': 'Agentes químicos', 'Físico': 'Agentes físicos' };
  const grupos = [...sim.entries()].map(([k, l]) => {
    const [tipo, tec] = k.split('|');
    const cods = [...new Set(l.map((x) => x.cod))].join('; ');
    if (l.length === 1) return { t: `${l[0].nome}: caracteriza (${tec})`, cod: cods, sup: true, agente: true };
    return { t: `${plural[tipo] || 'Agentes'} (${tec}): ${l.map((x) => curto(x.nome).replace(/^\p{Lu}(?=\p{Ll})/u, (c) => c.toLowerCase())).join(', ')} – caracterizam`, cod: cods, sup: true, agente: true };
  });
  itens.unshift(...grupos);
  // lista longa vira contagem: o detalhe de cada agente está no item 5
  const resumo = (l) => (l.length > 2 ? `${l.length} agentes (item 5)` : l.join('; '));
  if (nao.length) itens.push({ t: `Não caracteriza${nao.length > 1 ? 'm' : ''}: ${resumo(nao)}`, cod: '', sup: false, agente: true });
  if (fora.length) itens.push({ t: `Fora do rol do período: ${resumo(fora)}`, cod: '', sup: false, agente: true });
  return itens;
}

// ---------------- afastamentos ----------------
const iso = (t) => {
  const m = String(t).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const n = String(t).match(/\d{4}-\d{2}-\d{2}/);
  return n ? n[0] : '';
};
// Decreto 3.048/1999, art. 65, parágrafo único (redação do Decreto 10.410/2020, DOU de 01/07/2020):
// só o auxílio por incapacidade temporária acidentário conta como tempo especial
export const INICIO_DEC_10410 = '2020-07-01';
export function lerAfastamentos(texto) {
  return String(texto || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const datas = l.match(/\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/g) || [];
    if (datas.length < 2) return null;
    const ini = iso(datas[0]); const fim = iso(datas[1]);
    const acid = /B\s?91|B\s?94|acident/i.test(l);
    const prev = /B\s?31|previdenci|aux[ií]lio[- ]doen|incapacidade/i.test(l) && !acid;
    // antes do Decreto 10.410/2020, o auxílio-doença intercalado contava (Tema 998 do STJ); depois, só o acidentário
    const excluido = prev && fim >= INICIO_DEC_10410;
    return { ini: excluido && ini < INICIO_DEC_10410 ? INICIO_DEC_10410 : ini, fim, tipo: acid ? 'acidentário' : prev ? 'previdenciário' : 'outro', excluido, texto: l };
  }).filter(Boolean);
}

// divide [a, b] tirando os afastamentos excluídos; devolve os pedaços que contam e os excluídos (dentro do vínculo)
export function recortarAfastamentos(segs, afast) {
  const exc = afast.filter((x) => x.excluido);
  if (!exc.length) return { segs, excluidos: [] };
  const out = []; const excluidos = [];
  for (const [a, b] of segs) {
    let pedacos = [[a, b]];
    for (const x of exc) {
      const novo = [];
      for (const [p, q] of pedacos) {
        if (x.fim < p || x.ini > q) { novo.push([p, q]); continue; }
        if (x.ini > p) novo.push([p, dia(x.ini, -1)]);
        if (x.fim < q) novo.push([dia(x.fim, 1), q]);
        excluidos.push([x.ini > p ? x.ini : p, x.fim < q ? x.fim : q, x]);
      }
      pedacos = novo;
    }
    out.push(...pedacos);
  }
  return { segs: out, excluidos };
}

// categoria do segurado no vínculo: campo próprio ou pelo texto do vínculo
export function categoriaDoVinculo(r) {
  const x = r.data || r;
  if (v(x.categoriaSegurado)) return x.categoriaSegurado;
  const t = `${x.empresa || ''} ${x.cargo || ''} ${x.fonte || ''}`;
  if (/cooperad|cooperativa/i.test(t) && !/sem contribui/i.test(t)) return 'Cooperado (cooperativa de trabalho)';
  if (/aut[oô]nom|contribuinte individual|pr[oó]prio/i.test(t)) return 'Contribuinte individual';
  return '';
}

// Exposição para o PPP: por vínculo, os intervalos em que cada agente caracteriza (até 05/03/1997 e a partir de
// 06/03/1997, em linhas separadas, porque o código e a técnica mudam). presentes: também os agentes do rol que não
// caracterizam (presentes no ambiente, sem quantificação ou abaixo do limite) – no PPP o fator de risco consta
// com a intensidade "não quantificada"; os não enquadráveis (fora do rol) e os "a confirmar" não entram.
// quantitativo(a): o agente tem limite de tolerância nos Anexos 11 ou 12 da NR-15 (banco de químicos) – presente no
// ambiente e sem medição, consta do PPP com a intensidade "não quantificada", ainda que não caracterize
export function exposicaoNoVinculo(r, idx, agentes, { presentes = false, quantitativo = () => false, hoje = new Date().toISOString().slice(0, 10) } = {}) {
  const ini0 = (r.data || r).inicio; const fim0 = (r.data || r).fim || hoje;
  if (!ini0) return [];
  // "não caracteriza" só entra quando o agente é do Anexo IV e de avaliação quantitativa sem medição (ex.: mercúrio
  // ou ácido clorídrico após 05/03/1997); o que não caracteriza na avaliação qualitativa não vai ao PPP
  const quant = (a, ate) => /^Quantitativa/.test(tecnicaDoAgente(a, ate)) || (!ate && quantitativo(a));
  // agente fora do Anexo IV ("não enquadrável") não vai ao PPP, ainda que tenha limite na NR-15
  const conta = (res, a, ate) => res === 'Caracteriza' || (presentes && res === 'Não caracteriza' && quant(a, ate));
  const out = [];
  for (const a of agentes) {
    if (!agenteNoVinculo(a, idx)) continue;
    const x = a.data || a;
    // período de exposição do agente dentro do vínculo
    const ini = v(x.expInicio) > ini0 ? v(x.expInicio) : ini0;
    const fim = v(x.expFim) && v(x.expFim) < fim0 ? v(x.expFim) : fim0;
    if (ini > fim) continue;
    const jan = [];
    if (ini <= '1997-03-05' && conta(x.resAte97, a, true)) jan.push([ini, fim < '1997-03-05' ? fim : '1997-03-05', x.resAte97 === 'Caracteriza', true]);
    if (fim >= '1997-03-06' && conta(x.resDesde97, a, false)) {
      const a0 = ini > '1997-03-06' ? ini : '1997-03-06';
      const car = x.resDesde97 === 'Caracteriza';
      jan.push([a0, fim, car, false]); // épocas separadas: o código e a técnica mudam em 06/03/1997
    }
    for (const [p, q, car, ate] of jan) out.push({ ini: p, fim: q, agente: a, caracteriza: car, naoQuantificado: !car && quant(a, ate) });
  }
  return out;
}

// medidas de controle recomendadas para o agente que caracteriza
export function medidasDoAgente(a) {
  const x = a.data || a;
  if (x.tipo === 'Biológico') return 'NR-32: PGRSS e descarte de perfurocortantes em coletor rígido; esterilização em autoclave com registro dos ciclos; barreiras (luvas, máscara, óculos ou protetor facial, avental) com troca entre pacientes; sugador de alta potência para reduzir o aerossol; vacinação (hepatite B, com controle sorológico) e protocolo de acidente com material biológico.';
  if (x.tipo === 'Químico') return 'Substituição do produto ou da forma de apresentação, menor quantidade por aplicação, ventilação local, recipientes fechados e rotulados, FDS no local; luvas e proteção ocular compatíveis com o produto.';
  return 'Controle na fonte, redução do tempo de exposição e monitoramento periódico; EPI com CA quando as medidas coletivas não bastarem.';
}
