import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut,
} from 'firebase/auth';
import {
  getFirestore, collection, doc, onSnapshot, query, where, runTransaction,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { getStorage, ref as sref, uploadBytes, getBlob } from 'firebase/storage';
import { db, getMeta, setMeta, mergeIncoming } from './db.js';
import { mergeRecords, normalize } from './merge.js';
import { processarFoto } from './photos.js';

// ---------- estado observável (mostrado no topo da tela) ----------
const state = {
  configured: false, user: null, online: typeof navigator === 'undefined' ? true : navigator.onLine, pending: 0, fotosPendentes: 0,
  lastSync: null, error: '', busy: false,
};
const listeners = new Set();
export function syncState() { return { ...state }; }
export function onSyncState(fn) { listeners.add(fn); fn(syncState()); return () => listeners.delete(fn); }
function set(patch) { Object.assign(state, patch); listeners.forEach((fn) => fn(syncState())); }

let app = null, auth = null, fs = null, st = null, unsubSnap = null, timer = null;

export function parseConfig(text) {
  // aceita o JSON puro ou o trecho "const firebaseConfig = {...}" do Console
  let t = String(text || '').trim();
  const m = t.match(/\{[\s\S]*\}/);
  if (m) t = m[0];
  let obj;
  try { obj = JSON.parse(t); } catch (e) {
    // aceita chaves sem aspas (formato JavaScript)
    const js = t.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":').replace(/'/g, '"').replace(/,\s*}/g, '}');
    obj = JSON.parse(js);
  }
  for (const k of ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'appId']) {
    if (!obj[k]) throw new Error(`Configuração incompleta: falta "${k}".`);
  }
  return obj;
}

export async function iniciarSync() {
  await refreshPending();
  const cfg = await getMeta('firebaseConfig');
  if (!cfg) { set({ configured: false }); return; }
  try {
    app = getApps()[0] || initializeApp(cfg);
    auth = getAuth(app);
    fs = getFirestore(app);
    st = getStorage(app);
    set({ configured: true, error: '' });
    getRedirectResult(auth).catch((e) => set({ error: traduzErro(e) }));
    onAuthStateChanged(auth, (user) => {
      set({ user: user ? { uid: user.uid, email: user.email, nome: user.displayName } : null });
      if (user) começar(); else parar();
    });
  } catch (e) {
    set({ configured: false, error: 'Configuração do Firebase inválida: ' + traduzErro(e) });
  }
}

export function firebaseHandles() { return { app, auth, fs, st, user: auth && auth.currentUser }; }

export async function entrar() {
  if (!auth) throw new Error('Configure o Firebase primeiro.');
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, p);
  } catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) {
      await signInWithRedirect(auth, p);
    } else throw new Error(traduzErro(e));
  }
}

export async function sair() { if (auth) await signOut(auth); }

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { set({ online: true }); agendar(500); });
  window.addEventListener('offline', () => set({ online: false }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') agendar(300); });
}

function colRef() { return collection(fs, 'usuarios', auth.currentUser.uid, 'registros'); }
function fotoRef(id) { return sref(st, `usuarios/${auth.currentUser.uid}/fotos/${id}.jpg`); }

async function começar() {
  parar();
  const lastSrv = (await getMeta('lastSrv:' + auth.currentUser.uid)) || 0;
  let maxSrv = lastSrv;
  // só baixa o que mudou desde a última sincronização (margem de 5 min)
  const q = query(colRef(), where('srv', '>', Timestamp.fromMillis(Math.max(0, lastSrv - 300000))));
  unsubSnap = onSnapshot(q, async (snap) => {
    let novos = 0;
    for (const ch of snap.docChanges()) {
      if (ch.type === 'removed') continue;
      const d = ch.doc.data({ serverTimestamps: 'estimate' });
      if (!ch.doc.metadata.hasPendingWrites && d.srv && d.srv.toMillis) maxSrv = Math.max(maxSrv, d.srv.toMillis());
      const remote = normalize({ id: ch.doc.id, kind: d.kind, caseId: d.caseId ?? null, createdAt: d.createdAt, data: d.data || {}, ts: d.ts || {} });
      const { changed } = await mergeIncoming(remote);
      if (changed) novos += 1;
    }
    if (maxSrv > lastSrv) await setMeta('lastSrv:' + auth.currentUser.uid, maxSrv);
    set({ lastSync: Date.now(), error: '' });
    await refreshPending();
    if (novos) baixarFotosFaltantes();
  }, (e) => set({ error: 'Leitura da nuvem: ' + traduzErro(e) }));
  agendar(200);
  baixarFotosFaltantes();
}

function parar() {
  if (unsubSnap) { unsubSnap(); unsubSnap = null; }
}

export function agendar(ms = 1500) {
  clearTimeout(timer);
  timer = setTimeout(rodar, ms);
}

// chamado pelo app sempre que algo é gravado localmente
export function avisarAlteracao() { refreshPending(); agendar(2000); }

let rodando = false;
async function rodar() {
  clearTimeout(timer);
  if (rodando) return;
  if (!auth || !auth.currentUser || !navigator.onLine) { await refreshPending(); return; }
  rodando = true;
  set({ busy: true });
  try {
    await enviarRegistros();
    await enviarFotos();
    set({ lastSync: Date.now(), error: '' });
  } catch (e) {
    console.error(e);
    set({ error: traduzErro(e) });
  } finally {
    rodando = false;
    set({ busy: false });
    await refreshPending();
    // nova tentativa periódica enquanto houver pendências
    if (state.pending || state.fotosPendentes) agendar(state.error ? 30000 : 3000);
    else agendar(60000);
  }
}

async function enviarRegistros() {
  const sujos = await db.records.where('dirty').equals(1).limit(100).toArray();
  for (const local of sujos) {
    const ref = doc(colRef(), local.id);
    const enviado = await runTransaction(fs, async (tx) => {
      const snap = await tx.get(ref);
      const remoto = snap.exists() ? snap.data() : null;
      const merged = remoto ? mergeRecords(local, { id: local.id, ...remoto }) : normalize(local);
      tx.set(ref, {
        kind: merged.kind, caseId: merged.caseId ?? null, createdAt: merged.createdAt,
        data: limpar(merged.data), ts: merged.ts, srv: serverTimestamp(),
      });
      return merged;
    });
    // grava de volta o resultado; se houve edição durante o envio, continua pendente
    await db.transaction('rw', db.records, async () => {
      const atual = await db.records.get(local.id);
      const merged = mergeRecords(atual, enviado);
      merged.dirty = atual && atual.updatedAt !== local.updatedAt ? 1 : 0;
      await db.records.put(merged);
    });
  }
  if (sujos.length === 100) await enviarRegistros();
}

async function enviarFotos() {
  const pend = await db.blobs.where('uploaded').equals(0).toArray();
  for (const b of pend) {
    const rec = await db.records.get(b.id);
    if (!rec) continue;
    await uploadBytes(fotoRef(b.id), b.blob, { contentType: 'image/jpeg' });
    await db.blobs.update(b.id, { uploaded: 1 });
    await refreshPending();
  }
}

let baixando = false;
async function baixarFotosFaltantes() {
  if (baixando || !auth || !auth.currentUser) return;
  baixando = true;
  try {
    const fotos = await db.records.where('kind').equals('foto').toArray();
    for (const f of fotos) {
      if (f.deleted) continue;
      if (await db.blobs.get(f.id)) continue;
      try {
        const blob = await getBlob(fotoRef(f.id));
        const { thumb } = await processarFoto(blob);
        await db.blobs.put({ id: f.id, blob, thumb, uploaded: 1 });
      } catch (e) {
        if (e.code !== 'storage/object-not-found') console.warn('foto', f.id, e);
      }
    }
  } finally { baixando = false; }
}

export async function refreshPending() {
  const pending = await db.records.where('dirty').equals(1).count();
  const fotosPendentes = await db.blobs.where('uploaded').equals(0).count();
  set({ pending, fotosPendentes, online: navigator.onLine });
}

export function sincronizarAgora() { agendar(0); }

function limpar(obj) {
  // Firestore não aceita undefined
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

export function traduzErro(e) {
  const c = String((e && e.code) || '');
  const map = {
    'permission-denied': 'Permissão negada pelo Firebase (verifique as regras de segurança).',
    'auth/unauthorized-domain': 'Este endereço não está autorizado no Firebase (Authentication → Settings → Authorized domains).',
    'auth/popup-closed-by-user': 'Janela de login fechada antes de concluir.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'unavailable': 'Nuvem indisponível no momento (sem conexão). Os dados continuam salvos no aparelho.',
    'storage/unauthorized': 'Sem permissão no Storage (verifique as regras do Storage).',
    'storage/retry-limit-exceeded': 'Conexão instável ao enviar fotos; nova tentativa em seguida.',
  };
  return map[c] || map[c.replace('firestore/', '')] || (e && e.message) || String(e);
}
