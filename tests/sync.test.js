import { describe, it, expect, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

// ---- Firestore simulado (um "servidor" compartilhado pelos dois aparelhos) ----
const server = globalThis.__srv = globalThis.__srv || { docs: new Map(), listeners: new Set(), clock: 1000 };
function snapDoc(id, data) {
  return { id, data: () => JSON.parse(JSON.stringify(data, (k, v) => v)) && { ...structuredClone({ ...data, srv: undefined }), srv: data.srv }, metadata: { hasPendingWrites: false } };
}
vi.mock('firebase/app', () => ({ initializeApp: () => ({}), getApps: () => [] }));
vi.mock('firebase/auth', () => {
  const auth = { currentUser: { uid: 'u1', email: 'x@x' } };
  return { getAuth: () => auth, GoogleAuthProvider: class {}, signInWithPopup: async () => {}, signInWithRedirect: async () => {},
    getRedirectResult: async () => null, onAuthStateChanged: (a, cb) => { setTimeout(() => cb(a.currentUser), 0); return () => {}; }, signOut: async () => {} };
});
vi.mock('firebase/storage', () => ({ getStorage: () => ({}), ref: () => ({}), uploadBytes: async () => {}, getBlob: async () => { throw Object.assign(new Error('x'), { code: 'storage/object-not-found' }); } }));
vi.mock('firebase/firestore', () => {
  const S = globalThis.__srv;
  const mkTs = (ms) => ({ ms, toMillis: () => ms });
  const cl = (d) => ({ ...structuredClone({ ...d, srv: null }), srv: d.srv });
  const notify = (path) => {
    const d = S.docs.get(path);
    for (const l of S.listeners) if (path.startsWith(l.col + '/') && d.srv.ms > l.after) {
      setTimeout(() => l.next({ docChanges: () => [{ type: 'modified', doc: { id: path.split('/').pop(), data: () => cl(d), metadata: { hasPendingWrites: false } } }] }), 0);
    }
  };
  return {
    getFirestore: () => ({}),
    collection: (fs, ...p) => ({ path: p.join('/') }),
    doc: (col, id) => ({ path: col.path + '/' + id }),
    where: (f, op, v) => ({ f, op, v }),
    query: (col, w) => ({ col: col.path, after: w.v.ms }),
    Timestamp: { fromMillis: mkTs },
    serverTimestamp: () => '__SRV__',
    onSnapshot: (q, next) => {
      const l = { col: q.col, after: q.after, next };
      S.listeners.add(l);
      const iniciais = [...S.docs.entries()].filter(([p, d]) => p.startsWith(q.col + '/') && d.srv.ms > q.after)
        .map(([p, d]) => ({ type: 'added', doc: { id: p.split('/').pop(), data: () => cl(d), metadata: { hasPendingWrites: false } } }));
      setTimeout(() => next({ docChanges: () => iniciais }), 0);
      return () => S.listeners.delete(l);
    },
    runTransaction: async (fs, fn) => {
      const writes = [];
      const tx = {
        get: async (ref) => { const d = S.docs.get(ref.path); return { exists: () => !!d, data: () => cl(d) }; },
        set: (ref, data) => writes.push([ref.path, data]),
      };
      const r = await fn(tx);
      for (const [p, data] of writes) { S.docs.set(p, { ...structuredClone({ ...data, srv: null }), srv: mkTs(++S.clock) }); notify(p); }
      return r;
    },
  };
});

Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.window = { addEventListener() {} }; globalThis.document = { addEventListener() {}, visibilityState: 'visible' };

async function aparelho(nome) {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
  const dbm = await import('../src/db.js');
  const sync = await import('../src/sync.js');
  await dbm.setMeta('firebaseConfig', { apiKey: 'k' });
  await sync.iniciarSync();
  return { nome, ...dbm, sync };
}
const espera = (ms = 300) => new Promise((r) => setTimeout(r, ms));
async function sincroniza(...aps) { for (let i = 0; i < 3; i++) { for (const a of aps) a.sync.sincronizarAgora(); await espera(150); } }

describe('sincronização entre dois aparelhos', () => {
  it('edições simultâneas em campos diferentes chegam aos dois aparelhos', async () => {
    const tablet = await aparelho('tablet');
    const caso = await tablet.createRecord('caso', null, { autorNome: 'João', fase: 'A preparar' });
    await tablet.createRecord('quesito', caso.id, { texto: 'Q1' });
    await sincroniza(tablet);
    expect(server.docs.size).toBe(2);
    expect(await tablet.db.records.where('dirty').equals(1).count()).toBe(0);

    const pc = await aparelho('pc');
    await espera(200);
    expect((await pc.db.records.get(caso.id)).data.autorNome).toBe('João');

    // os dois editam ao mesmo tempo, campos diferentes, tablet sem internet
    navigator.onLine = false;
    await tablet.updateField(caso.id, 'vistoriaLocal', 'Fábrica (digitado offline)');
    navigator.onLine = true;
    await pc.updateField(caso.id, 'defesa', 'Tese da defesa (no PC)');
    await sincroniza(pc, tablet);
    await espera(300);
    for (const ap of [tablet, pc]) {
      const r = await ap.db.records.get(caso.id);
      expect(r.data.vistoriaLocal).toBe('Fábrica (digitado offline)');
      expect(r.data.defesa).toBe('Tese da defesa (no PC)');
      expect(r.dirty).toBe(0);
    }

    // mesmo campo: vence a edição mais recente
    await pc.updateField(caso.id, 'autorNome', 'João (PC)');
    await espera(5);
    await tablet.updateField(caso.id, 'autorNome', 'João da Silva (tablet, mais recente)');
    await sincroniza(pc, tablet);
    await espera(300);
    expect((await pc.db.records.get(caso.id)).data.autorNome).toBe('João da Silva (tablet, mais recente)');

    // exclusão em um aparelho chega no outro como "lixeira", não apagamento
    const q = (await tablet.db.records.where('kind').equals('quesito').toArray())[0];
    await tablet.softDelete(q.id);
    await sincroniza(tablet, pc);
    await espera(300);
    const qpc = await pc.db.records.get(q.id);
    expect(qpc.deleted).toBe(1);
    expect(qpc.data.texto).toBe('Q1');
  }, 20000);
});
