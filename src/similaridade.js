// ======================================================================
// Similaridade de veículos para a escolha do paradigma (motorista).
// 1) Família técnica provável pelo veículo (marca, modelo, ano, grupo) – regra de engenharia, marcada "provável".
// 2) Comparação por pontos de cada paradigma do banco com o veículo do vínculo, com o motivo de cada ponto:
//    família (o critério principal), tabela de similares, marca, modelo, tipo/configuração, ar-condicionado e época.
// Famílias do banco (definidas pelo signatário):
//   F1 rígidos com motor dianteiro (bicudo); F2 ônibus com motor dianteiro; F3 leves / VUC / 3/4 / vans;
//   F4 rígidos médios e pesados com cabine avançada; F5 cavalos de cabine convencional ou semiavançada, projeto antigo;
//   F6 cavalos de cabine avançada, 1990–2008; F7 Volvo NH / FH; F8 cavalos modernos pós-2010.
// ======================================================================

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9/]+/g, ' ').trim();
// números do modelo como escritos ("8.150" = "8150"; "R 440" → "440"), sem o ano
const numerosDe = (t) => (String(t || '').match(/\d+(?:[.,]\d{3})*/g) || []).map((n) => n.replace(/[.,]/g, '')).filter((n) => !/^(19[5-9]\d|20[0-4]\d)$/.test(n));
const anoDe = (t) => { const m = String(t || '').match(/\b(19[5-9]\d|20[0-4]\d)\b/); return m ? Number(m[1]) : NaN; };

export const DESCRICAO_FAMILIAS = {
  F1: 'Rígidos com motor dianteiro (bicudo)', F2: 'Ônibus com motor dianteiro', F3: 'Leves / VUC / 3/4 / vans',
  F4: 'Rígidos médios e pesados com cabine avançada', F5: 'Cavalos com cabine convencional ou semiavançada, projeto antigo',
  F6: 'Cavalos com cabine avançada, 1990–2008', F7: 'Volvo NH / FH', F8: 'Cavalos modernos pós-2010',
};

// Família provável pelo veículo. Devolve { familia, motivo } ou { familia: '' } quando não dá para inferir.
export function familiaProvavel({ marca = '', modelo = '', ano = '', grupo = '', tipo = '' } = {}) {
  const ma = norm(marca), mo = norm(modelo), g = norm(`${grupo} ${tipo}`);
  const tudo = `${ma} ${mo}`;
  const a = anoDe(ano) || anoDe(modelo);
  const nums = numerosDe(modelo).map(Number);
  const cavalo = /cavalo|carreta|bitrem|rodotrem|trator rodoviario/.test(g);
  const r = (familia, motivo) => ({ familia, motivo: `${motivo} – provável, confirmar` });
  if (/onibus/.test(g)) return /traseir/.test(`${g} ${tudo}`) ? { familia: '', motivo: '' } : r('F2', 'ônibus (motor dianteiro, o mais comum nos urbanos antigos)');
  if (/volvo/.test(ma)) {
    if (/\bnh\b|\bfh\b|\bfm\b/.test(mo)) return r(a >= 2010 && /\bfh\b/.test(mo) ? 'F8' : 'F7', 'Volvo NH/FH/FM');
    if (/\bn ?1[02]\b|\bnl ?1[02]\b|\bn10\b|\bn12\b|\bnl10\b|\bnl12\b/.test(mo.replace(/\s/g, ' '))) return r('F5', 'Volvo N/NL (cabine convencional)');
    if (/\bvm\b/.test(mo)) return r('F4', 'Volvo VM (rígido de cabine avançada)');
  }
  if (/scania/.test(ma)) {
    if (/\bt\s?1\d\d|\bt\s?11[0-3]|\bl\s?11|\b11[0-3]\b|\b1[01][0-3]h?\b/.test(mo) && !/\br\s?\d|\bp\s?\d|\bg\s?\d/.test(mo)) return r('F5', 'Scania T/L 110–113 (cabine convencional, projeto antigo)');
    if (/\b[rpg]\s?\d{3}/.test(mo) || /\bh\d{3}/.test(mo)) return r(a >= 2010 ? 'F8' : 'F6', `Scania R/P/G (cabine avançada${a ? `, ${a}` : ''})`);
  }
  if (/mercedes|\bmb\b|benz/.test(tudo)) {
    if (/actros/.test(mo)) return r('F8', 'Mercedes-Benz Actros');
    if (/axor/.test(mo)) return r(a >= 2010 ? 'F8' : 'F6', 'Mercedes-Benz Axor');
    if (/atego|accelo|\bls\b/.test(mo) && !cavalo) return r(/accelo/.test(mo) ? 'F3' : 'F4', 'Mercedes-Benz Atego/Accelo (cabine avançada)');
    if (/\bls\b|\bls ?1[59]\d\d|\b1[69]3[0-9]\b/.test(mo) || cavalo) return r('F5', 'Mercedes-Benz LS / cavalo convencional');
    if (/\bl ?\d|\blk\b|\b(608|708|710|912|914|1111|1113|1114|1313|1314|1513|1514|1516|1518|2013|2213|2214|2215|1618|2318)\b/.test(mo)) return r(nums.some((n) => n <= 914) ? 'F3' : 'F1', 'Mercedes-Benz série L/LK (motor dianteiro, bicudo)');
  }
  if (/volkswagen|\bvw\b/.test(tudo)) {
    if (/titan|constellation|\b1[89]\.?3\d0\b|\b2[45]\.?3\d0\b/.test(mo) && cavalo) return r(a >= 2010 ? 'F8' : 'F6', 'Volkswagen cavalo (cabine avançada)');
    const peso = nums.find((n) => n >= 500 && n <= 33000);
    if (peso) return r(peso < 11000 ? 'F3' : 'F4', 'Volkswagen rígido de cabine avançada (série 6.80 a 31.xxx)');
  }
  if (/ford/.test(ma)) {
    if (/\bf ?-?\s?(4000|600|7000|11000|12000|13000|14000|22000)\b/.test(mo)) return r(/4000/.test(mo) ? 'F3' : 'F1', 'Ford série F (motor dianteiro, bicudo)');
    if (/cargo/.test(mo)) { const n = nums.find((x) => x >= 700); return r(cavalo ? (a >= 2010 ? 'F8' : 'F6') : n && n < 1100 ? 'F3' : 'F4', 'Ford Cargo (cabine avançada)'); }
  }
  if (/chevrolet|gm\b/.test(tudo) && /\bd ?-?\s?(40|60|70|11000|12000|14000)\b|\bc ?-?\s?60\b|\bd ?60\b/.test(mo)) return r(/40/.test(mo) ? 'F3' : 'F1', 'Chevrolet D/C (motor dianteiro, bicudo)');
  if (/agrale/.test(ma)) { const n = nums.find((x) => x >= 1000); return r(n && n >= 13000 ? 'F4' : 'F3', 'Agrale (cabine avançada)'); }
  if (/iveco/.test(ma)) {
    if (/daily/.test(mo)) return r('F3', 'Iveco Daily');
    if (/stralis|eurotech|eurostar|hi.?way|s.?way/.test(mo)) return r(/hi.?way|s.?way/.test(mo) || a >= 2010 ? 'F8' : 'F6', 'Iveco Stralis/Eurotech (cabine avançada)');
    if (/tector|vertis|cursor/.test(mo)) return r('F4', 'Iveco Tector/Vertis (rígido de cabine avançada)');
  }
  // sem marca/modelo reconhecidos: o grupo da entrevista
  if (/\bleve\b|\b3\/4\b|\bvuc\b|\bvan\b|\butilit/.test(g)) return r('F3', 'grupo do veículo');
  if (/convencional|semiavancada|projeto antigo/.test(g)) return r('F5', 'grupo do veículo');
  if (/cara.chata|cabine avancada/.test(g) && cavalo) return r(a >= 2010 ? 'F8' : 'F6', 'grupo do veículo');
  if (/moderno|automatizado/.test(g)) return r('F8', 'grupo do veículo');
  return { familia: '', motivo: '' };
}

// ar-condicionado a partir do texto da cabine (true, false ou null quando não informado)
const arDe = (t) => { const s = norm(t); if (/sem ar|nao tinha ar|sem climat/.test(s)) return false; if (/com ar|ar.condicionado|climatiz/.test(s)) return true; return null; };

// Pontuação de um paradigma frente ao veículo do vínculo. Devolve { pontos, motivos }.
export function pontuar(veic, p, { similar } = {}) {
  const d = p.data || p;
  const motivos = [];
  let pontos = 0;
  if (similar) { pontos += 100; motivos.push('tabela de similares'); }
  if (veic.familia && d.familia && norm(veic.familia) === norm(d.familia)) { pontos += 50; motivos.push(`mesma família ${d.familia}`); }
  else if (veic.familia && d.familia) { pontos -= 30; motivos.push(`família diferente (${d.familia})`); }
  if (veic.marca && d.marca && norm(veic.marca).split(' ')[0] === norm(d.marca).split(' ')[0]) { pontos += 15; motivos.push('mesma marca'); }
  const nv = numerosDe(veic.modelo), np = numerosDe(d.modelo);
  if (nv.length && np.length && nv.some((n) => np.includes(n))) { pontos += 20; motivos.push('mesmo modelo'); }
  const tv = norm(`${veic.tipo} ${veic.grupo}`), tp = norm(`${d.tipo} ${d.configuracao}`);
  const classe = (t) => (/onibus/.test(t) ? 'onibus' : /cavalo|carreta|bitrem/.test(t) ? 'cavalo' : /\btruck\b|\btoco\b|rigido|\b3\/4\b|\bvuc\b|\bleve\b|\bvan\b/.test(t) ? 'rigido' : '');
  if (classe(tv) && classe(tv) === classe(tp)) { pontos += 10; motivos.push(`mesmo tipo (${classe(tv)})`); }
  else if (classe(tv) && classe(tp)) { pontos -= 20; motivos.push(`tipo diferente (${d.tipo || d.configuracao})`); }
  const av = arDe(veic.cabine), ap = d.arCondicionado ? !/^n|sem/i.test(String(d.arCondicionado)) : arDe(d.cabine);
  if (av !== null && ap !== null && ap !== undefined) { if (av === ap) { pontos += 5; motivos.push(av ? 'ambos com ar' : 'ambos sem ar'); } else { pontos -= 5; motivos.push('climatização diferente'); } }
  // ano do paradigma; sem ele, o meio da época de fabricação ("1975–1987" → 1981)
  const epoca = String(d.epocaFabricacao || '').match(/(19[5-9]\d|20[0-4]\d)\D+(19[5-9]\d|20[0-4]\d)/);
  const a1 = anoDe(veic.ano), a2 = anoDe(d.ano) || (epoca ? Math.round((Number(epoca[1]) + Number(epoca[2])) / 2) : NaN);
  if (isFinite(a1) && isFinite(a2)) { const dif = Math.abs(a1 - a2); if (dif <= 5) { pontos += 10; motivos.push(`época próxima (${anoDe(d.ano) ? a2 : d.epocaFabricacao})`); } else if (dif <= 10) { pontos += 4; motivos.push(`época ${anoDe(d.ano) ? a2 : d.epocaFabricacao}`); } }
  if (/^ok$/i.test(d.situacao || '')) pontos += 3; else if (d.situacao) motivos.push(`situação ${d.situacao}`);
  return { pontos, motivos };
}

// pontuação mínima para sugerir: a família (50) ou a tabela de similares (100); só o tipo não basta
export const MINIMO_SUGESTAO = 45;
