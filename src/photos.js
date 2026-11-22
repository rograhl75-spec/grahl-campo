import { db, createRecord, caseChildren } from './db.js';
import { legendaDoNomeArquivo } from './fotosIA.js';

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
// Localização com o motivo da falha: { valor, erro } – erro: 'permissao' | 'indisponivel' | 'tempo' | 'sem-suporte' | 'inseguro'.
// Tenta o GPS (alta precisão) e, sem sinal (local fechado, GPS frio), a localização aproximada da rede.
export async function lerGpsDetalhado({ timeout = 20000 } = {}) {
  if (typeof window !== 'undefined' && window.isSecureContext === false) return { valor: '', erro: 'inseguro' };
  if (!navigator.geolocation) return { valor: '', erro: 'sem-suporte' };
  const tentar = (alta, t) => new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ p }),
      (e) => resolve({ erro: e && e.code === 1 ? 'permissao' : e && e.code === 3 ? 'tempo' : 'indisponivel' }),
      { enableHighAccuracy: alta, timeout: t, maximumAge: alta ? 60000 : 300000 },
    );
  });
  let r = await tentar(true, timeout);
  if (r.erro && r.erro !== 'permissao') r = await tentar(false, 15000);
  if (r.erro) return { valor: '', erro: r.erro };
  const v = `${r.p.coords.latitude.toFixed(6)}, ${r.p.coords.longitude.toFixed(6)} (±${Math.round(r.p.coords.accuracy)} m)`;
  gpsCache = { at: Date.now(), value: v };
  return { valor: v, erro: '' };
}

// O que fazer em cada falha (mostrado na tela)
export const AJUDA_GPS = {
  permissao: 'O celular negou a localização para o app. Android/Chrome: toque no cadeado (ou nos três pontos ⋮ → ⓘ) ao lado do endereço → Permissões → Localização → Permitir. Se o app foi instalado na tela inicial: Configurações do Android → Apps → Chrome → Permissões → Localização → Permitir durante o uso. iPhone: Ajustes → Privacidade → Serviços de Localização → Safari/Chrome → Durante o uso.',
  indisponivel: 'O celular não informou a posição. Confira se a Localização do aparelho está ligada (puxe a barra de notificações → Localização) e, no Android, se o modo de precisão (Google Location Accuracy) está ativo. Depois toque em GPS de novo.',
  tempo: 'Sem sinal de GPS a tempo (comum em local fechado ou com o GPS recém-ligado). Vá para perto de uma janela ou ao ar livre e toque em GPS de novo; ou digite as coordenadas.',
  'sem-suporte': 'Este navegador não informa a localização. Use o Chrome ou o Safari atualizados.',
  inseguro: 'A localização só funciona no endereço seguro (https). Abra o app pelo endereço oficial.',
};

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
      postoId, legenda: legenda || legendaDoNomeArquivo(file.name), ordem, largura: w, altura: h,
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
  // libera a memória da miniatura (antes a URL ficava presa até fechar o app)
  const url = urlCache.get(id);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(id);
}
