// Enquadramento previdenciário além do ruído e da vibração medidos:
//  - categoria profissional da área da saúde (até 28/04/1995);
//  - agentes avaliados de forma qualitativa ou sem medição (biológicos, químicos, físicos), cadastrados no caso
//    com o resultado até 05/03/1997 e a partir de 06/03/1997;
//  - afastamentos por benefício que não contam como tempo especial.

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
    ate97: v(x.codAte97) || (bio ? BIO_ATE97 : ''),
    desde97: v(x.codDesde97) || (bio ? BIO_DESDE97 : ''),
    tecnica: v(x.tecnica) || (bio ? 'Qualitativa' : ''),
  };
}

// o agente vale para o vínculo? "V1, V3" (pela ordem cronológica) ou em branco = todos
export function agenteNoVinculo(a, idx) {
  const lst = v((a.data || a).vinculos);
  if (!lst || /todos/i.test(lst)) return true;
  const ns = (lst.match(/\d+/g) || []).map(Number);
  return ns.includes(idx + 1);
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
  const itens = []; const nao = []; const fora = [];
  for (const a of agentes) {
    if (!agenteNoVinculo(a, idx)) continue;
    const nome = v(a.data.nome) || 'Agente';
    const { res, cod } = resultadoNoSegmento(a, fim);
    if (res === 'Caracteriza') itens.push({ t: `${nome}: caracteriza (${codigosDoAgente(a).tecnica.toLowerCase() || 'avaliação'})`, cod: cod || '[[código]]', sup: true, agente: true });
    else if (res === 'Não caracteriza') nao.push(nome);
    else if (res === 'Não enquadrável') fora.push(nome);
    else itens.push({ t: `${nome}: [[resultado a confirmar]]`, cod, sup: false, pendente: true, agente: true });
  }
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
// 06/03/1997, unidos quando caracteriza nas duas épocas)
export function exposicaoNoVinculo(r, idx, agentes, hoje = new Date().toISOString().slice(0, 10)) {
  const ini = (r.data || r).inicio; const fim = (r.data || r).fim || hoje;
  if (!ini) return [];
  const out = [];
  for (const a of agentes) {
    if (!agenteNoVinculo(a, idx)) continue;
    const x = a.data || a;
    const jan = [];
    if (ini <= '1997-03-05' && x.resAte97 === 'Caracteriza') jan.push([ini, fim < '1997-03-05' ? fim : '1997-03-05']);
    if (fim >= '1997-03-06' && x.resDesde97 === 'Caracteriza') {
      const a0 = ini > '1997-03-06' ? ini : '1997-03-06';
      if (jan.length && jan[0][1] === '1997-03-05') jan[0][1] = fim; else jan.push([a0, fim]);
    }
    for (const [p, q] of jan) out.push({ ini: p, fim: q, agente: a });
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
