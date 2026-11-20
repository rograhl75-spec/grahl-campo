// Nomes como saem nos quadros: razão social sem anotações entre parênteses ("(CTPS: …)", "(sucessão …)")
// e, quando digitada toda em maiúsculas, com só as iniciais maiúsculas (quebra entre palavras nas colunas estreitas).
const SIGLAS = /^(ME|EPP|EIRELI|S\/?A|SA|S\.A\.|II|III|IV|SC|PR|SP|MEI)$/;
const MINUSC = /^(DE|DA|DO|DOS|DAS|E)$/;
export function empresaLimpa(nome) {
  let s = String(nome ?? '');
  for (let i = 0; i < 3; i++) s = s.replace(/\s*\([^()]*\)/g, '');
  s = s.replace(/\s*[–-]\s*(baixada|ativa|falida|inativa)\b.*$/i, '').replace(/\s{2,}/g, ' ').trim();
  if (s && s === s.toUpperCase() && /[A-Z]{3}/.test(s)) {
    s = s.split(/(\s+)/).map((w, i) => (/^\s+$/.test(w) ? w : SIGLAS.test(w) ? w : i > 0 && MINUSC.test(w) ? w.toLowerCase()
      : (w.length <= 2 && /^[A-Z&]+$/.test(w) && w !== 'E') ? w : w.charAt(0) + w.slice(1).toLowerCase())).join('');
  }
  return s.replace(/\s*-\s*ME$/, ' ME');
}
