// Apêndices do laudo: relatórios das medições (dosimetria de ruído, vibração, IBUTG, certificados de
// calibração...) anexados na aba Campo. Cada página do PDF (ou cada imagem) vira uma página do documento.
import { db } from './db.js';

export const DESC_APENDICE = 'apendice';
// documentos de terceiros que acompanham o laudo (ART, CNIS, certidões, declarações): saem como Anexo A, B, C…
export const DESC_ANEXO_DOC = 'anexoDoc';
export const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export async function carregarPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  return pdfjs;
}

const paraJpeg = (canvas, q = 0.72) => new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', q));

// recorta o branco abaixo do conteúdo (páginas com meia folha preenchida, como as do CNIS)
function recortarBranco(canvas) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const dados = ctx.getImageData(0, 0, w, h).data;
  let fim = h - 1;
  for (; fim > 0; fim--) {
    let escuro = 0;
    for (let x = 0, i = fim * w * 4; x < w; x++, i += 4) if (dados[i] < 200 || dados[i + 1] < 200 || dados[i + 2] < 200) escuro++;
    if (escuro > 2) break;
  }
  const alt = Math.min(h, fim + Math.round(h * 0.02));
  if (alt > h * 0.9) return canvas;
  const c = document.createElement('canvas');
  c.width = w; c.height = alt;
  c.getContext('2d').drawImage(canvas, 0, 0, w, alt, 0, 0, w, alt);
  return c;
}

async function canvasParaPagina(canvas, { recortar = false } = {}) {
  if (recortar) { try { canvas = recortarBranco(canvas); } catch { /* sem recorte */ } }
  const b = await paraJpeg(canvas);
  return { bytes: new Uint8Array(await b.arrayBuffer()), w: canvas.width, h: canvas.height };
}

// ---------- Relatórios de medição dentro do laudo de origem ----------
// "45-52, 60" → [45..52, 60]
export function lerFaixaPaginas(t) {
  const out = [];
  for (const parte of String(t || '').split(/[,;]\s*/)) {
    const m = parte.trim().match(/^(\d+)(?:\s*[-–a]\s*(\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]), b = Number(m[2] || m[1]);
    for (let i = Math.min(a, b); i <= Math.max(a, b) && out.length < 200; i++) if (!out.includes(i)) out.push(i);
  }
  return out;
}
// [45,46,47,52] → "45-47, 52"
export function faixaDePaginas(lst) {
  const l = [...new Set(lst)].sort((a, b) => a - b); const out = [];
  for (let i = 0; i < l.length; i++) { let j = i; while (j + 1 < l.length && l[j + 1] === l[j] + 1) j++; out.push(j > i ? `${l[i]}-${l[j]}` : `${l[i]}`); i = j; }
  return out.join(', ');
}
// Páginas que são relatório de medidor (dosimetria, vibração, calor) ou certificado de calibração: o texto do
// aparelho tem várias "assinaturas" (configuração, resultados, funcionário avaliado, fabricante, série…).
// Procura da metade do laudo para o fim (os relatórios ficam no final) e inclui as páginas de continuação
// (tabelas de leituras) logo depois de uma página de relatório.
// do próprio aparelho (não aparecem no texto do laudo) e termos de norma (aparecem também na metodologia)
const DO_APARELHO = [/configura[çc][ãa]o (de|da) medi[çc][ãa]o/i, /funcion[áa]rio avaliado/i, /data da avalia[çc][ãa]o:?\s*\d/i, /empresa (do avaliador|avaliada)/i,
  /\b[NS]S:\s*\w{5,}|n[ºo°] de s[ée]rie:?\s*\w{4,}/i, /relat[óo]rio (de )?dosimetria|configura[çc][ãa]o dos dos[íi]metros|relat[óo]rio geral\s*-\s*dos[íi]metro/i, /tempo (de )?avalia[çc][ãa]o:?\s*\d/i];
const DA_NORMA = [/inlite|criffer|instrutherm|chrompack|smartvib|sonus|dosemax|axpro|quest technolog|larson davis|svantek|3m detection|01db|bruel/i, /certificado de calibra[çc][ãa]o/i, /resultados? da (avalia[çc][ãa]o|medi[çc][ãa]o)/i, /dose projetada/i, /taxa de troca|fator de duplica/i, /crit[ée]rio de refer[êe]ncia/i, /n[íi]vel limiar/i, /histograma/i,
  /\bVDV\s*[XYZR]\b|VDVR/i, /\bAREN\b|\bAREP\b|acelera[çc][ãa]o resultante/i, /pondera[çc][ãa]o (temporal|em frequ)|curva de pondera[çc][ãa]o/i, /\bIBUTG\b.*\bTBN\b|\bTBN\b.*\bTG\b/i, /\bL(avg|eq|max|pico)\b/i];
export function paginasDeRelatorio(textos) {
  const n = textos.length;
  const ini = Math.floor(n * 0.4);
  const conta = (lst, t) => lst.filter((re) => re.test(t || '')).length;
  // cabeçalho corrido do laudo (a 1ª linha que se repete em mais da metade das páginas): página com ele é do corpo
  const primeira = (t) => String(t || '').trim().split(/\s{2,}|\n/)[0].trim().slice(0, 40).toLowerCase();
  const freq = {};
  textos.forEach((t) => { const k = primeira(t); if (k) freq[k] = (freq[k] || 0) + 1; });
  const [cab, nCab] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0] || ['', 0];
  const cabAparelho = conta(DO_APARELHO, cab) + conta(DA_NORMA, cab) > 0;
  const doCorpo = (t) => nCab > n / 2 && n >= 6 && !cabAparelho && primeira(t) === cab;
  const marca = textos.map((t, i) => { const a = conta(DO_APARELHO, t); return i >= ini && !doCorpo(t) && (a >= 2 || (a >= 1 && conta(DA_NORMA, t) >= 2)); });
  const out = [];
  for (let i = 0; i < n; i++) {
    if (marca[i]) { out.push(i + 1); continue; }
    // continuação: logo depois de uma página de relatório, com muitas leituras (dB, m/s², horários)
    const leituras = ((textos[i] || '').match(/\d+[.,]\d+\s*(dBA?|m\/s)|\d{2}:\d{2}(:\d{2})?/g) || []).length;
    // ou com o mesmo cabeçalho do aparelho (fabricante / número de série) da página anterior
    const ns = (t) => ((t || '').match(/\b[NS]S:\s*(\w+)/i) || [])[1];
    const mesmoAparelho = ns(textos[i]) && ns(textos[i]) === ns(textos[i - 1]);
    if (i > 0 && out.includes(i) && (leituras >= 15 || mesmoAparelho)) out.push(i + 1);
  }
  return out;
}
// texto de cada página de um PDF (para achar os relatórios)
export async function textosDoPdf(blob) {
  const pdfjs = await carregarPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    out.push(tc.items.map((x) => x.str).join(' '));
    page.cleanup();
  }
  await pdf.destroy();
  return out;
}

// páginas de um arquivo (PDF ou imagem) como JPEG; paginas: só essas (números a partir de 1)
export async function paginasDoArquivo(blob, mime = '', { paginas = null, recortar = false } = {}) {
  const tipo = mime || blob.type || '';
  if (/pdf/i.test(tipo)) {
    const pdfjs = await carregarPdfjs();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const out = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      if (paginas && !paginas.includes(i)) continue;
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1.5 }); // ~110 dpi: tabelas legíveis e arquivo leve (limite do eproc: 11 MB por arquivo)
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      out.push(await canvasParaPagina(c, { recortar }));
      page.cleanup();
    }
    await pdf.destroy();
    return out;
  }
  const bmp = await createImageBitmap(blob);
  const f = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return [await canvasParaPagina(c)];
}

export async function apendicesRegistros(caseId, desc = DESC_APENDICE) {
  return (await db.records.where('[caseId+kind]').equals([caseId, 'anexo']).toArray())
    .filter((r) => !r.deleted && r.data.descricao === desc)
    .sort((a, b) => (Number(a.data.ordem) || 0) - (Number(b.data.ordem) || 0) || a.createdAt - b.createdAt);
}

// título padrão a partir do nome do arquivo
export function tituloSugerido(nome = '') {
  const n = nome.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
  if (/ru[ií]do|dosim|dose/i.test(n)) return `Relatório de dosimetria de ruído – ${n}`;
  if (/vibra|vci|vmb|axpro/i.test(n)) return `Relatório de vibração – ${n}`;
  if (/ibutg|calor|itemp/i.test(n)) return `Relatório de calor (IBUTG) – ${n}`;
  if (/calibra|certific/i.test(n)) return `Certificado de calibração – ${n}`;
  return n;
}

// fotos do relatório: no máximo 1600 px no lado maior (sobra para a impressão em meia página)
export async function reduzirFoto(blob, max = 1600, q = 0.8) {
  try {
    const bmp = await createImageBitmap(blob);
    const f = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (f === 1 && blob.size < 600000) return { bytes: new Uint8Array(await blob.arrayBuffer()), w: bmp.width, h: bmp.height };
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const b = await paraJpeg(c, q);
    return { bytes: new Uint8Array(await b.arrayBuffer()), w: c.width, h: c.height };
  } catch (e) { return null; }
}
