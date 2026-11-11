// Cálculos de apoio em campo. O app só calcula; a interpretação é sua.

export function num(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(/\s/g, '');
  if (!s) return NaN;
  // "1.234,5" → 1234.5; "1.234" (milhar) → 1234; "0,85" → 0.85
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
}

export function fmt(v, casas = 1) {
  if (!isFinite(v)) return '';
  return v.toFixed(casas).replace('.', ',');
}

// Converte "8", "8,8", "08:48" ou "8h48" em minutos
export function minutos(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return NaN;
  const m = s.match(/^(\d{1,2})\s*[:h]\s*(\d{1,2})/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const mi = s.match(/^(\d+(?:[.,]\d+)?)\s*(min|m)$/);
  if (mi) return num(mi[1]);
  const h = num(s.replace(/\s*h(oras?)?$/, ''));
  if (!isFinite(h)) return NaN;
  // número sem unidade acima de 24 só pode ser minutos (ex.: "480")
  return h > 24 ? h : h * 60;
}

// NEN com q = 5 (NR-15): NEN = Lavg + 16,61 × log10(TE / 480)
export function nenQ5(lavg, jornada) {
  const L = num(lavg);
  const te = minutos(jornada);
  if (!isFinite(L) || !isFinite(te) || te <= 0) return NaN;
  return L + 16.61 * Math.log10(te / 480);
}

// Lavg a partir da dose (%) e do tempo de amostragem, critério 85 dB(A), q = 5
export function lavgDaDose(dose, tempoAmostragem) {
  const D = num(dose);
  const t = minutos(tempoAmostragem);
  if (!isFinite(D) || D <= 0 || !isFinite(t) || t <= 0) return NaN;
  return 85 + 16.61 * Math.log10(D / (100 * (t / 480)));
}

export function ibutg(tbn, tg, tbs, comCargaSolar) {
  const n = num(tbn), g = num(tg), s = num(tbs);
  if (!isFinite(n) || !isFinite(g)) return NaN;
  if (comCargaSolar) {
    if (!isFinite(s)) return NaN;
    return 0.7 * n + 0.2 * g + 0.1 * s;
  }
  return 0.7 * n + 0.3 * g;
}
