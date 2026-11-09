// Apêndices do laudo: relatórios das medições (dosimetria de ruído, vibração, IBUTG, certificados de
// calibração...) anexados na aba Campo. Cada página do PDF (ou cada imagem) vira uma página do documento.
import { db } from './db.js';

export const DESC_APENDICE = 'apendice';
export const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

async function carregarPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  return pdfjs;
}

const paraJpeg = (canvas) => new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.85));

async function canvasParaPagina(canvas) {
  const b = await paraJpeg(canvas);
  return { bytes: new Uint8Array(await b.arrayBuffer()), w: canvas.width, h: canvas.height };
}

// páginas de um arquivo (PDF ou imagem) como JPEG
export async function paginasDoArquivo(blob, mime = '') {
  const tipo = mime || blob.type || '';
  if (/pdf/i.test(tipo)) {
    const pdfjs = await carregarPdfjs();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const out = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 2 }); // ~144 dpi: legível e leve
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      out.push(await canvasParaPagina(c));
      page.cleanup();
    }
    await pdf.destroy();
    return out;
  }
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0);
  return [await canvasParaPagina(c)];
}

export async function apendicesRegistros(caseId) {
  return (await db.records.where('[caseId+kind]').equals([caseId, 'anexo']).toArray())
    .filter((r) => !r.deleted && r.data.descricao === DESC_APENDICE)
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
