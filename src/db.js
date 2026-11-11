import Dexie, { liveQuery } from 'dexie';
import { mergeRecords, normalize } from './merge.js';

// Banco local do tablet/PC (IndexedDB). É a fonte primária: tudo é gravado
// aqui primeiro, e só depois sincronizado com a nuvem.
export const db = new Dexie('grahl-campo');
db.version(1).stores({
  records: 'id, kind, caseId, [caseId+kind], dirty, updatedAt, deleted',
  blobs: 'id, uploaded',
  history: '++seq, recordId, at',
  meta: 'key',
});

export { liveQuery };

let lastTs = 0;
export function now() {
  // relógio monotônico: duas alterações seguidas nunca têm o mesmo horário
  const t = Date.now();
  lastTs = t > lastTs ? t : lastTs + 1;
  return lastTs;
}

export function newId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export async function getMeta(key, fallback = null) {
  const m = await db.meta.get(key);
  return m ? m.value : fallback;
}
export async function setMeta(key, value) {
  await db.meta.put({ key, value });
}

export async function createRecord(kind, caseId, data = {}) {
  const t = now();
  const ts = {};
  for (const k of Object.keys(data)) ts[k] = t;
  const rec = normalize({ id: newId(), kind, caseId: caseId || null, createdAt: t, data: { ...data }, ts, dirty: 1 });
  await db.records.put(rec);
  return rec;
}

const HISTORY_WINDOW = 90 * 1000; // agrupa digitação contínua do mesmo campo

// opts.at: horário da alteração (padrão: agora). A recuperação do registro de segurança usa o horário
// em que a tecla foi digitada, para não vencer uma edição mais nova feita em outro aparelho.
export async function updateFields(id, changes, opts = {}) {
  return db.transaction('rw', db.records, db.history, async () => {
    const rec = await db.records.get(id);
    if (!rec) throw new Error('Registro não encontrado: ' + id);
    let changed = false;
    const data = { ...rec.data };
    const ts = { ...rec.ts };
    for (const [k, v] of Object.entries(changes)) {
      const old = data[k];
      if (JSON.stringify(old) === JSON.stringify(v)) continue;
      changed = true;
      const t = opts.at || now();
      data[k] = v;
      ts[k] = t;
      if (typeof v === 'string' || typeof old === 'string') {
        const last = await db.history.where('recordId').equals(id).reverse()
          .filter((h) => h.field === k).first();
        if (last && t - last.at < HISTORY_WINDOW) {
          await db.history.update(last.seq, { value: v, at: t });
        } else {
          await db.history.add({ recordId: id, field: k, prev: old ?? '', value: v, at: t });
        }
      }
    }
    if (!changed) return rec;
    const next = normalize({ ...rec, data, ts, dirty: 1 });
    await db.records.put(next);
    return next;
  });
}

export const updateField = (id, k, v) => updateFields(id, { [k]: v });

export async function softDelete(id) {
  await updateFields(id, { _del: true });
}
export async function restore(id) {
  await updateFields(id, { _del: false });
}

// Grava um registro vindo de fora (nuvem, backup, migração) mesclando por campo.
export async function mergeIncoming(remote, { markDirtyIfLocalNewer = true } = {}) {
  return db.transaction('rw', db.records, async () => {
    const local = await db.records.get(remote.id);
    const merged = mergeRecords(local, remote);
    let dirty = 0;
    if (local && markDirtyIfLocalNewer) {
      for (const [k, t] of Object.entries(local.ts || {})) {
        if (t > ((remote.ts || {})[k] || 0)) { dirty = 1; break; }
      }
      if (local.dirty && dirty) dirty = 1;
    }
    merged.dirty = dirty;
    if (local && JSON.stringify(local.data) === JSON.stringify(merged.data) &&
        JSON.stringify(local.ts) === JSON.stringify(merged.ts) && local.dirty === dirty) {
      return { record: local, changed: false };
    }
    await db.records.put(merged);
    return { record: merged, changed: true };
  });
}

export async function caseChildren(caseId, kind) {
  const list = await db.records.where('[caseId+kind]').equals([caseId, kind]).toArray();
  return list.filter((r) => !r.deleted).sort(byOrder);
}

export function byOrder(a, b) {
  const oa = a.data.ordem ?? a.createdAt;
  const ob = b.data.ordem ?? b.createdAt;
  return oa - ob;
}

export async function fieldHistory(recordId, field) {
  const list = await db.history.where('recordId').equals(recordId).toArray();
  return list.filter((h) => h.field === field).sort((a, b) => b.at - a.at);
}

export async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      if (already) return true;
      return await navigator.storage.persist();
    }
  } catch (e) { /* ignore */ }
  return false;
}
