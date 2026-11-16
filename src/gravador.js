// Gravador de áudio da vistoria, fora dos componentes: a gravação continua quando se troca de aba
// (ler um quesito, tirar foto) e cada pedaço de 10 s fica salvo no aparelho. Se o navegador fechar
// a página no meio, o que já foi gravado é recuperado como áudio da vistoria ao reabrir o app.
import { db, getMeta, setMeta } from './db.js';
import { guardarAnexo } from './paradigmas.js';
import { updateFields } from './db.js';
import { DESC_AUDIO } from './schema.js';

const PARCIAL = 'gravacaoParcial';
let atual = null; // { mr, stream, inicio, caseId, n, partes, mime, wake }
const ouvintes = new Set();
const avisar = () => ouvintes.forEach((f) => f(estado()));

export function estado() {
  return atual ? { gravando: true, caseId: atual.caseId, n: atual.n, inicio: atual.inicio } : { gravando: false };
}
export function ouvir(f) { ouvintes.add(f); f(estado()); return () => ouvintes.delete(f); }

async function pedirTelaLigada() {
  try { if (atual && navigator.wakeLock) atual.wake = await navigator.wakeLock.request('screen'); } catch { /* sem bloqueio de tela */ }
}
// o bloqueio de tela cai quando a página fica oculta: pede de novo ao voltar
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (atual && document.visibilityState === 'visible') pedirTelaLigada(); });

async function salvarAudio({ blob, mime, caseId, n, inicio, fim, recuperado = false }) {
  const quando = new Date(inicio);
  const ext = mime.includes('mp4') ? 'm4a' : 'webm';
  const nome = `Vistoria${n}_${quando.toISOString().slice(0, 10)}_${quando.toTimeString().slice(0, 5).replace(':', 'h')}${recuperado ? '_recuperado' : ''}.${ext}`;
  const id = await guardarAnexo(new File([blob], nome, { type: mime }), DESC_AUDIO, caseId);
  await updateFields(id, { vistoria: String(n), duracaoSeg: Math.round((fim - inicio) / 1000), inicioGravacao: quando.toTimeString().slice(0, 5), ...(recuperado ? { recuperado: true } : {}) });
  return { id, nome, mb: blob.size / 1048576 };
}

export async function iniciarGravacao(caseId, n) {
  if (atual) throw new Error('Já existe uma gravação em andamento.');
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Este navegador não grava áudio.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const tipo = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
  const mr = new MediaRecorder(stream, { ...(tipo ? { mimeType: tipo } : {}), audioBitsPerSecond: 32000 });
  const mime = (mr.mimeType || tipo || 'audio/webm').split(';')[0];
  atual = { mr, stream, inicio: Date.now(), caseId, n, partes: [], mime };
  mr.ondataavailable = async (e) => {
    if (!e.data?.size || !atual) return;
    atual.partes.push(e.data);
    // cópia de segurança do que já foi gravado (substitui a anterior)
    try { await setMeta(PARCIAL, { blob: new Blob(atual.partes, { type: mime }), mime, caseId, n, inicio: atual.inicio, fim: Date.now() }); } catch { /* sem espaço */ }
  };
  mr.start(10000);
  await pedirTelaLigada();
  avisar();
}

// para e salva; devolve { nome, mb, seg } ou null
export function pararGravacao() {
  const g = atual;
  if (!g) return Promise.resolve(null);
  return new Promise((resolve) => {
    g.mr.onstop = async () => {
      g.stream.getTracks().forEach((t) => t.stop());
      try { await g.wake?.release(); } catch { /* ok */ }
      atual = null;
      avisar();
      const blob = new Blob(g.partes, { type: g.mime });
      await setMeta(PARCIAL, null);
      if (!blob.size) return resolve(null);
      const fim = Date.now();
      const r = await salvarAudio({ blob, mime: g.mime, caseId: g.caseId, n: g.n, inicio: g.inicio, fim });
      resolve({ ...r, seg: (fim - g.inicio) / 1000 });
    };
    try { g.mr.requestData?.(); g.mr.stop(); } catch { g.mr.onstop(); }
  });
}

// ao abrir o app: gravação interrompida (página fechada pelo sistema) vira áudio "recuperado"
export async function recuperarGravacao() {
  if (atual) return null;
  const p = await getMeta(PARCIAL);
  if (!p || !p.blob || !p.blob.size) return null;
  await setMeta(PARCIAL, null);
  const caso = await db.records.get(p.caseId);
  if (!caso) return null;
  return salvarAudio({ ...p, recuperado: true });
}
