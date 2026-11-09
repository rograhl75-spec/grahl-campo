import { db, createRecord, caseChildren } from './db.js';

const MAX_LADO = 2560;
const QUALIDADE = 0.88;
const THUMB = 360;

async function decode(file) {
  // createImageBitmap aplica a orientação EXIF (fotos de celular não ficam giradas)
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

function toBlob(src, w, h, q) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(src, 0, 0, w, h);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Falha ao converter foto'))), 'image/jpeg', q));
}

export async function processarFoto(file) {
  const img = await decode(file);
  const w0 = img.width, h0 = img.height;
  const k = Math.min(1, MAX_LADO / Math.max(w0, h0));
  const w = Math.round(w0 * k), h = Math.round(h0 * k);
  const blob = await toBlob(img, w, h, QUALIDADE);
  const kt = Math.min(1, THUMB / Math.max(w0, h0));
  const thumb = await toBlob(img, Math.round(w0 * kt), Math.round(h0 * kt), 0.75);
  if (img.close) img.close();
  return { blob, thumb, w, h };
}

let gpsCache = { at: 0, value: '' };
export function lerGps(timeout = 8000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve('');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const v = `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)} (±${Math.round(p.coords.accuracy)} m)`;
        gpsCache = { at: Date.now(), value: v };
        resolve(v);
      },
      () => resolve(''),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 },
    );
  });
}

async function gpsRapido() {
  if (Date.now() - gpsCache.at < 120000) return gpsCache.value;
  return Promise.race([lerGps(4000), new Promise((r) => setTimeout(() => r(''), 4500))]);
}

// Salva cada foto no tablet ANTES de qualquer envio à nuvem.
export async function adicionarFotos(caseId, files, { postoId = '', legenda = '' } = {}) {
  const existentes = await caseChildren(caseId, 'foto');
  let ordem = existentes.reduce((m, f) => Math.max(m, f.data.ordem || 0), 0);
  const gps = await gpsRapido();
  const criadas = [];
  const { lerExif } = await import('./fotosLaudo.js');
  for (const file of files) {
    const exif = await lerExif(file); // data, hora e GPS gravados pela câmera, quando houver
    const { blob, thumb, w, h } = await processarFoto(file);
    ordem += 1;
    const rec = await createRecord('foto', caseId, {
      postoId, legenda, ordem, largura: w, altura: h,
      gps: exif.gps || gps, gpsFonte: exif.gps ? 'foto' : (gps ? 'aparelho' : ''),
      tiradaEm: exif.tiradaEm || new Date(file.lastModified || Date.now()).toISOString(),
      tiradaEmFonte: exif.tiradaEm ? 'foto' : 'arquivo',
      nomeArquivo: file.name || '',
    });
    await db.blobs.put({ id: rec.id, blob, thumb, uploaded: 0 });
    criadas.push(rec);
  }
  return criadas;
}

const urlCache = new Map();
export async function urlMiniatura(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const b = await db.blobs.get(id);
  if (!b) return null;
  const url = URL.createObjectURL(b.thumb || b.blob);
  urlCache.set(id, url);
  return url;
}

export async function urlCompleta(id) {
  const b = await db.blobs.get(id);
  return b ? URL.createObjectURL(b.blob) : null;
}

export function esquecerMiniatura(id) {
  urlCache.delete(id);
}
