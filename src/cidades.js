// Nomes de cidade como saem nos documentos: "cambé para paisandu, cornelio procopio, maringa"
// → "Cambé para Paiçandu, Cornélio Procópio, Maringá". Só troca o que é município (lista do IBGE);
// o resto do texto fica como foi digitado. UFs soltas em minúsculas viram sigla ("pr" → "PR").
import { MUNICIPIOS } from './data/municipios.js';

const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'");
let mapa = null;
let maxPalavras = 1;
function carregar() {
  if (mapa) return;
  mapa = new Map();
  for (const n of MUNICIPIOS.split(';')) {
    mapa.set(norm(n), n);
    maxPalavras = Math.max(maxPalavras, n.split(/\s+/).length);
  }
  // grafias comuns diferentes da oficial
  for (const [k, v] of [['paisandu', 'Paiçandu'], ['paicandu', 'Paiçandu'], ['borrazopolis', 'Borrazópolis'], ['sao paulo', 'São Paulo']]) mapa.set(k, v);
}
// palavras comuns que também são nome de município: só viram cidade dentro de um nome composto
const COMUNS = new Set(['serra', 'areia', 'vitoria', 'esperanca', 'estrela', 'uniao', 'liberdade', 'paraiso', 'progresso', 'triunfo', 'natal', 'mercedes', 'planalto',
  'cruzeiro', 'bonito', 'central', 'pinhal', 'salto', 'colorado', 'prata', 'ouro', 'palmital', 'jardim', 'formosa', 'bom', 'boa', 'nova', 'novo', 'rio', 'campo',
  'canoas', 'parana', 'para', 'bandeira', 'brasil', 'industrial', 'aurora', 'sertao', 'divisa', 'tupi', 'alvorada', 'amparo', 'barreiras', 'caridade', 'descanso', 'iracema']);
const UFS = new Set(['pr', 'sp', 'sc', 'rs', 'ms', 'mg', 'go', 'mt', 'rj', 'df', 'ba', 'ro', 'pe', 'ce', 'rn', 'pb', 'pi', 'am', 'ac', 'rr', 'ap']);

export function capitalizarCidades(texto) {
  const s = String(texto ?? '');
  if (!s.trim()) return s;
  carregar();
  // tokens: palavras (com acento, hífen e apóstrofo) e o que há entre elas
  const partes = s.split(/([A-Za-zÀ-ÿ'’-]+)/);
  const ehPalavra = (i) => i % 2 === 1;
  const out = [...partes];
  for (let i = 1; i < partes.length; i += 2) {
    let feito = false;
    for (let n = maxPalavras; n >= 1 && !feito; n--) {
      // n palavras seguidas, separadas só por espaço
      const idx = [];
      let ok = true;
      for (let k = 0; k < n; k++) {
        const j = i + 2 * k;
        if (j >= partes.length || !ehPalavra(j)) { ok = false; break; }
        if (k > 0 && !/^\s+$/.test(partes[j - 1])) { ok = false; break; }
        idx.push(j);
      }
      if (!ok) continue;
      const orig = idx.map((j) => partes[j]).join(' ');
      const chave = norm(orig);
      if (n === 1 && COMUNS.has(chave)) continue;
      const nome = mapa.get(chave);
      if (!nome) continue;
      const pal = nome.split(/\s+/);
      if (pal.length !== n) continue;
      idx.forEach((j, k) => { out[j] = pal[k]; });
      i = idx[idx.length - 1];
      feito = true;
    }
    if (!feito && UFS.has(partes[i]) && /[\s,/–-]$|^$/.test(partes[i - 1] || '')) out[i] = partes[i].toUpperCase();
  }
  return out.join('');
}
