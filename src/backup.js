import JSZip from 'jszip';
import { db, setMeta, mergeIncoming } from './db.js';
import { processarFoto } from './photos.js';
import { obterAnexo } from './sync.js';

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
  // anexos (PDFs de laudos antigos e outros arquivos): os acima de 39 MB existem só neste aparelho
  const anexos = records.filter((r) => r.kind === 'anexo' && !r.deleted);
  let anexosSemArquivo = 0, soAqui = 0;
  const indiceAnexos = [];
  for (const a of anexos) {
    let b = await db.blobs.get(a.id);
    if (!b) {
      // anexo que está só na nuvem: baixa para entrar no backup
      try { await obterAnexo(a.id); b = await db.blobs.get(a.id); } catch (e) { /* sem internet ou sem nuvem */ }
    }
    if (!b) { anexosSemArquivo += 1; continue; }
    const nome = `anexos/${a.id}${extensao(a.data.nome, b.mime || a.data.mime)}`;
    zip.file(nome, b.blob);
    if (b.uploaded === 2) soAqui += 1;
    indiceAnexos.push({ id: a.id, arquivo: nome, nome: a.data.nome || '', mime: b.mime || a.data.mime || '', soLocal: b.uploaded === 2 });
  }
  if (indiceAnexos.length) zip.file('anexos/indice.json', JSON.stringify(indiceAnexos, null, 1));
  zip.file('LEIA-ME.txt', [
    'Backup do app GRAHL Campo.',
    `Gerado em ${new Date().toLocaleString('pt-BR')}.`,
    `Registros: ${records.length}. Fotos: ${fotos.length - semArquivo} de ${fotos.length}. Anexos: ${anexos.length - anexosSemArquivo} de ${anexos.length}${soAqui ? ` (${soAqui} grande(s) demais para a nuvem: este backup é a única cópia fora do aparelho)` : ''}.`,
    anexosSemArquivo ? `${anexosSemArquivo} anexo(s) não estavam neste aparelho e ficaram fora do ZIP (abra-os uma vez com internet e gere o backup de novo).` : '',
    'Para restaurar: Configurações → Backup → Restaurar backup (nada é apagado; os dados são mesclados).',
    'As fotos estão na pasta "fotos" e os anexos (PDFs) na pasta "anexos"; podem ser abertos diretamente. O nome original de cada anexo está em anexos/indice.json.',
  ].filter(Boolean).join('\r\n'));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  if (!caseId) await setMeta('ultimoBackup', Date.now());
  return { blob, total: records.length, fotos: fotos.length, semArquivo, anexos: anexos.length, anexosSemArquivo, anexosSoLocal: soAqui };
}

function extensao(nome, mime) {
  const m = String(nome || '').match(/\.[a-z0-9]{1,5}$/i);
  if (m) return m[0].toLowerCase();
  if (/pdf/.test(mime || '')) return '.pdf';
  if (/jpe?g/.test(mime || '')) return '.jpg';
  if (/png/.test(mime || '')) return '.png';
  return '';
}

export const LIMITE_NUVEM_BACKUP = 39 * 1024 * 1024;

export async function importarBackup(file) {
  const zip = await JSZip.loadAsync(file);
  const jf = zip.file('backup.json');
  if (!jf) throw new Error('Arquivo não é um backup do GRAHL Campo (falta backup.json).');
  const dados = JSON.parse(await jf.async('string'));
  if (dados.schema !== BACKUP_SCHEMA) throw new Error('Versão de backup não reconhecida.');
  let novos = 0, atualizados = 0, fotos = 0, anexos = 0;
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
  // anexos: voltam como estão (PDF não passa pelo tratamento de foto); os grandes continuam só no aparelho
  const ij = zip.file('anexos/indice.json');
  const indice = ij ? JSON.parse(await ij.async('string')) : [];
  for (const a of indice) {
    if (await db.blobs.get(a.id)) continue;
    const f = zip.file(a.arquivo);
    if (!f) continue;
    const mime = a.mime || 'application/pdf';
    const blob = new Blob([await f.async('blob')], { type: mime });
    await db.blobs.put({ id: a.id, blob, mime, uploaded: a.soLocal || blob.size > LIMITE_NUVEM_BACKUP ? 2 : 0 });
    anexos += 1;
  }
  return { novos, atualizados, fotos, anexos };
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
