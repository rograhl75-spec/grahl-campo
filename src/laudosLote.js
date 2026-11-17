// Anexar laudos de origem em lote: cada PDF é ligado aos paradigmas a que pertence.
// Ordem de confiança:
//   1. código no nome do arquivo ("M07_M61 - Laudo Adao.pdf") – certo;
//   2. número do processo do paradigma nas primeiras páginas (cabeçalho do próprio laudo) – certo;
//   3. data da medição + número do modelo (ex.: 2422, 8150) no texto ou no nome – provável, o perito confirma.
// Arquivo só de relatórios (avulso, ou "relat" no nome) vai como "relatórios em arquivo separado";
// laudo completo vai como laudo de origem, com as páginas dos relatórios achadas pelo texto do aparelho.
import { paginasDeRelatorio, faixaDePaginas } from './apendices.js';

const digitos = (t) => String(t || '').replace(/\D/g, '');
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// "Proc. 5000406-87.2016.4.04.7028" → "500040687201" (nº + dígito + ano: identifica o processo)
export function chaveProcesso(p) {
  const d = digitos(p);
  return d.length >= 13 ? d.slice(0, 13) : '';
}
// números do modelo com 3 ou mais algarismos: "Cargo 2422" → ["2422"], "8.150" → ["8150"], "FH 540" → ["540"]
export function numerosDoModelo(modelo) {
  return [...new Set((String(modelo || '').replace(/(\d)\.(\d{3})\b/g, '$1$2').match(/\d{3,5}/g) || []))];
}

export function casarArquivo({ nome, textos = [] }, paradigmas) {
  const n = textos.length;
  const relPags = paginasDeRelatorio(textos);
  const soRelatorios = /relat/i.test(nome) || (n > 0 && n <= 12 && relPags.length >= Math.ceil(n * 0.6));
  const tipo = soRelatorios ? 'relatorios' : 'laudo';
  // páginas informadas no nome: "… [p 45-52].pdf"
  const noNome = (nome.match(/\[p\.?\s*([\d][\d,;\s-]*)\]/i) || [])[1];
  const paginas = tipo === 'laudo' ? (noNome ? noNome.trim().replace(/\s*,\s*/g, ', ') : faixaDePaginas(relPags)) : '';
  const porCodigo = new Map(paradigmas.map((p) => [String(p.data.codigo || '').trim().toUpperCase(), p]));

  // 1. código no nome
  const cods = (nome.toUpperCase().match(/(?<![A-Z0-9])M\d{2,3}(?!\d)/g) || []).filter((c) => porCodigo.has(c));
  if (cods.length) return { tipo, paginas, como: 'código no nome do arquivo', certo: true, ids: [...new Set(cods)].map((c) => porCodigo.get(c).id) };

  // 2. processo no cabeçalho (3 primeiras páginas)
  const cabeca = digitos(textos.slice(0, 3).join(' '));
  const porProc = paradigmas.filter((p) => { const k = chaveProcesso(p.data.processo); return k && cabeca.includes(k); });
  if (porProc.length) return { tipo, paginas, como: 'número do processo no laudo', certo: true, ids: porProc.map((p) => p.id) };

  // 3. data da medição + número do modelo
  const tudo = textos.join(' ');
  const alvo = semAcento(`${nome} ${tudo}`).replace(/(\d)\.(\d{3})\b/g, '$1$2');
  const porData = paradigmas.filter((p) => {
    const dt = String(p.data.dataMedicao || '').trim();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dt) || !tudo.includes(dt)) return false;
    const nums = numerosDoModelo(p.data.modelo);
    return nums.some((x) => new RegExp(`(^|\\D)${x}(\\D|$)`).test(alvo));
  });
  if (porData.length) return { tipo, paginas, como: 'data da medição e modelo do veículo', certo: false, ids: porData.map((p) => p.id) };

  return { tipo, paginas, como: '', certo: false, ids: [] };
}
