// Cálculos de apoio em campo. O app só calcula; a interpretação é sua.

export function num(v) {
  if (v === null || v === undefined) return NaN;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return NaN;
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
  const h = num(s.replace('h', ''));
  return isFinite(h) ? h * 60 : NaN;
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
