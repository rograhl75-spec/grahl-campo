// Mesclagem por campo: cada campo guarda o horário da última alteração (ts).
// Em qualquer conflito vence a alteração mais recente DAQUELE campo, então
// editar o "local" no tablet e a "síntese" no PC nunca apaga um ao outro.

export function mergeRecords(a, b) {
  if (!a) return normalize(b);
  if (!b) return normalize(a);
  const data = {};
  const ts = {};
  const keys = new Set([...Object.keys(a.data || {}), ...Object.keys(b.data || {}),
    ...Object.keys(a.ts || {}), ...Object.keys(b.ts || {})]);
  for (const k of keys) {
    const ta = (a.ts || {})[k] || 0;
    const tb = (b.ts || {})[k] || 0;
    const src = tb > ta ? b : a;
    const t = Math.max(ta, tb);
    if (k in (src.data || {})) data[k] = src.data[k];
    else if (k in (a.data || {})) data[k] = a.data[k];
    else if (k in (b.data || {})) data[k] = b.data[k];
    if (t) ts[k] = t;
  }
  return normalize({
    id: a.id || b.id,
    kind: a.kind || b.kind,
    caseId: a.caseId ?? b.caseId ?? null,
    createdAt: Math.min(a.createdAt || Infinity, b.createdAt || Infinity),
    data,
    ts,
  });
}

export function normalize(r) {
  if (!r) return r;
  const ts = r.ts || {};
  const updatedAt = Math.max(r.createdAt || 0, ...Object.values(ts), 0);
  return {
    id: r.id,
    kind: r.kind,
    caseId: r.caseId ?? null,
    createdAt: isFinite(r.createdAt) ? r.createdAt : updatedAt,
    data: r.data || {},
    ts,
    updatedAt,
    deleted: r.data && r.data._del ? 1 : 0,
    dirty: r.dirty ? 1 : 0,
  };
}

// true se "a" tem algum campo mais novo que "b" (precisa ser enviado)
export function hasNewer(a, b) {
  const tb = (b && b.ts) || {};
  for (const [k, t] of Object.entries((a && a.ts) || {})) {
    if (t > (tb[k] || 0)) return true;
  }
  return false;
}

export function sameContent(a, b) {
  return JSON.stringify(sortObj(a.data)) === JSON.stringify(sortObj(b.data)) &&
    JSON.stringify(sortObj(a.ts)) === JSON.stringify(sortObj(b.ts));
}

function sortObj(o) {
  const out = {};
  for (const k of Object.keys(o || {}).sort()) out[k] = o[k];
  return out;
}
