import { db, updateField } from './db.js';

// Registro de segurança (write-ahead log): cada tecla é copiada de forma
// SÍNCRONA para o localStorage antes da gravação no banco. Se o Android
// fechar o navegador no meio da digitação, o texto é recuperado ao reabrir.
const PREFIXO = 'grahl-wal:';

export function walGravar(id, k, v) {
  try {
    localStorage.setItem(PREFIXO + id + '\u0001' + k, JSON.stringify({ id, k, v, t: Date.now() }));
  } catch (e) { /* armazenamento cheio ou bloqueado: segue só com o banco */ }
}

export function walConfirmar(id, k, v) {
  try {
    const chave = PREFIXO + id + '\u0001' + k;
    const atual = localStorage.getItem(chave);
    if (atual && JSON.parse(atual).v === v) localStorage.removeItem(chave);
  } catch (e) { /* ignore */ }
}

// Chamado na abertura do app: aplica o que ficou pendente
export async function walRecuperar() {
  let recuperados = 0;
  let chaves = [];
  try {
    chaves = Object.keys(localStorage).filter((c) => c.startsWith(PREFIXO));
  } catch (e) { return 0; }
  for (const chave of chaves) {
    try {
      const { id, k, v, t } = JSON.parse(localStorage.getItem(chave));
      const rec = await db.records.get(id);
      if (rec && ((rec.ts || {})[k] || 0) < t && rec.data[k] !== v) {
        await updateField(id, k, v);
        recuperados += 1;
      }
      localStorage.removeItem(chave);
    } catch (e) {
      console.warn('WAL', chave, e);
    }
  }
  return recuperados;
}
