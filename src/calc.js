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

// Fator de duplicação: q = 5 (NR-15, Anexo 1) ou q = 3 (NHO-01 da FUNDACENTRO).
// k = q / log10(2): 16,61 para q = 5; 10 (9,97) para q = 3.
export const fatorQ = (m) => (String((m && (m.data || m).q) || '').trim().startsWith('3') ? 3 : 5);
const kQ = (q) => (q === 3 ? 10 : 16.61);

// NEN = Lavg (q = 5) ou Leq (q = 3) + k × log10(TE / 480)
export function nen(nivel, jornada, q = 5) {
  const L = num(nivel);
  const te = minutos(jornada);
  if (!isFinite(L) || !isFinite(te) || te <= 0) return NaN;
  return L + kQ(q) * Math.log10(te / 480);
}
export const nenQ5 = (lavg, jornada) => nen(lavg, jornada, 5);

// Nível médio a partir da dose (%) e do tempo de amostragem, critério 85 dB(A)
export function lavgDaDose(dose, tempoAmostragem, q = 5) {
  const D = num(dose);
  const t = minutos(tempoAmostragem);
  if (!isFinite(D) || D <= 0 || !isFinite(t) || t <= 0) return NaN;
  return 85 + kQ(q) * Math.log10(D / (100 * (t / 480)));
}

// Dose projetada para a jornada (mesma condição de exposição): D × TE / T amostrado
export function doseJornada(dose, tempoAmostragem, jornada) {
  const D = num(dose), ta = minutos(tempoAmostragem), te = minutos(jornada);
  if (!isFinite(D)) return NaN;
  return isFinite(ta) && isFinite(te) && ta > 0 && Math.abs(te - ta) > 1 ? D * (te / ta) : D;
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
