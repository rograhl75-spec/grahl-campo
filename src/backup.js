import JSZip from 'jszip';
import { db, setMeta, mergeIncoming } from './db.js';
import { processarFoto } from './photos.js';

export const BACKUP_SCHEMA = 'grahl-campo-backup-v1';

// Gera um ZIP com todos os registros (inclusive os da lixeira), o histórico de
// alterações e as fotos. É uma cópia completa e independente do app.
export async function exportarBackup({ caseId = null } = {}) {
  let records = await db.records.toArray();
  if (caseId) records = records.filter((r) => r.id === caseId || r.caseId === caseId);
  const ids = new Set(records.map((r) => r.id));
  const history = (await db.history.toArray()).filter((h) => ids.has(h.recordId));
  const zip = new JSZip();
  zip.file('backup.json', JSON.stringify({
    schema: BACKUP_SCHEMA, exportadoEm: new Date().toISOString(), caso: caseId,
    records: records.map(({ dirty, ...r }) => r), history,
  }, null, 1));
  const fotos = records.filter((r) => r.kind === 'foto');
  let semArquivo = 0;
  for (const f of fotos) {
    const b = await db.blobs.get(f.id);
    if (b) zip.file(`fotos/${f.id}.jpg`, b.blob);
    else semArquivo += 1;
  }
  zip.file('LEIA-ME.txt', [
    'Backup do app GRAHL Campo.',
    `Gerado em ${new Date().toLocaleString('pt-BR')}.`,
    `Registros: ${records.length}. Fotos: ${fotos.length - semArquivo} de ${fotos.length}.`,
    'Para restaurar: Configurações → Backup → Restaurar backup (nada é apagado; os dados são mesclados).',
    'As fotos estão na pasta "fotos" e podem ser abertas diretamente.',
  ].join('\r\n'));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  if (!caseId) await setMeta('ultimoBackup', Date.now());
  return { blob, total: records.length, fotos: fotos.length, semArquivo };
}

export async function importarBackup(file) {
  const zip = await JSZip.loadAsync(file);
  const jf = zip.file('backup.json');
  if (!jf) throw new Error('Arquivo não é um backup do GRAHL Campo (falta backup.json).');
  const dados = JSON.parse(await jf.async('string'));
  if (dados.schema !== BACKUP_SCHEMA) throw new Error('Versão de backup não reconhecida.');
  let novos = 0, atualizados = 0, fotos = 0;
  for (const r of dados.records) {
    const existia = await db.records.get(r.id);
    const { changed } = await mergeIncoming({ ...r, dirty: 0 }, { markDirtyIfLocalNewer: true });
    if (changed) {
      // o que veio do backup precisa subir para a nuvem também
      await db.records.update(r.id, { dirty: 1 });
      existia ? atualizados++ : novos++;
    }
  }
  for (const h of dados.history || []) {
    const { seq, ...rest } = h;
    const dup = await db.history.where('recordId').equals(rest.recordId).filter((x) => x.at === rest.at && x.field === rest.field).first();
    if (!dup) await db.history.add(rest);
  }
  for (const name of Object.keys(zip.files)) {
    const m = name.match(/^fotos\/(.+)\.jpg$/);
    if (!m) continue;
    if (await db.blobs.get(m[1])) continue;
    const blob = await zip.file(name).async('blob');
    const jpeg = new Blob([blob], { type: 'image/jpeg' });
    const { thumb } = await processarFoto(jpeg);
    await db.blobs.put({ id: m[1], blob: jpeg, thumb, uploaded: 0 });
    fotos += 1;
  }
  return { novos, atualizados, fotos };
}

export function baixarArquivo(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

export function carimbo() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
