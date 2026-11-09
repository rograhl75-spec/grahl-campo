// Fotos vindas de arquivos (galeria, Word ou PDF de laudos antigos):
// lê data, hora e GPS gravados na própria foto (EXIF) quando ainda existem,
// e recupera as legendas "Foto n – …" / "Figura n – …" do laudo.
import JSZip from 'jszip';
import { db, createRecord, caseChildren, updateFields } from './db.js';
import { processarFoto } from './photos.js';

const RE_LEGENDA = /^\s*(foto(grafia)?|figura|imagem)\s*(n[º°o.]*\s*)?\d+/i;

// ---------- EXIF ----------
export async function lerExif(blob) {
  try {
    const exifr = (await import('exifr')).default;
    const t = (await exifr.parse(blob, ['DateTimeOriginal', 'CreateDate']).catch(() => null)) || {};
    const g = (await exifr.gps(blob).catch(() => null)) || {};
    const dt = t.DateTimeOriginal || t.CreateDate;
    const out = {};
    if (dt instanceof Date && !isNaN(dt)) out.tiradaEm = isoLocal(dt);
    if (isFinite(g.latitude) && isFinite(g.longitude) && (g.latitude || g.longitude)) out.gps = `${g.latitude.toFixed(6)}, ${g.longitude.toFixed(6)}`;
    return out;
  } catch (e) { return {}; }
}

// EXIF guarda a hora local da câmera, sem fuso: mantém como hora local
function isoLocal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ---------- Word (.docx) ----------
const textoDoParagrafo = (xml) => (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map((x) => x.replace(/<[^>]+>/g, '')).join('')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();

export async function imagensDoDocx(file) {
  const zip = await JSZip.loadAsync(file);
  const doc = await zip.file('word/document.xml')?.async('string');
  if (!doc) throw new Error('Arquivo Word sem conteúdo legível.');
  const relsXml = (await zip.file('word/_rels/document.xml.rels')?.async('string')) || '';
  const rels = Object.fromEntries([...relsXml.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const itens = [];
  let legendaPendente = '';
  for (const par of doc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []) {
    const ids = [...par.matchAll(/r:embed="([^"]+)"/g)].map((m) => m[1]);
    const txt = textoDoParagrafo(par);
    for (const id of ids) {
      const alvo = rels[id];
      if (!alvo || !/\.(jpe?g|png)$/i.test(alvo)) continue;
      const caminho = alvo.startsWith('/') ? alvo.slice(1) : `word/${alvo.replace(/^\.\//, '')}`;
      const f = zip.file(caminho);
      if (!f) continue;
      const blob = new Blob([await f.async('uint8array')], { type: /png$/i.test(alvo) ? 'image/png' : 'image/jpeg' });
      itens.push({ blob, legenda: legendaPendente, nome: alvo.split('/').pop() });
      legendaPendente = '';
    }
    if (txt && RE_LEGENDA.test(txt)) {
      const semLegenda = [...itens].reverse().find((x) => !x.legenda);
      if (semLegenda && !ids.length) semLegenda.legenda = txt; else legendaPendente = txt;
    }
  }
  return itens;
}

// ---------- PDF ----------
async function assinatura(blob) {
  const buf = await crypto.subtle.digest('SHA-1', await blob.arrayBuffer());
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function carregarPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  return pdfjs;
}

function objImagem(page, nome) {
  return new Promise((res) => {
    const pega = (o) => res(o || null);
    try { (nome.startsWith('g_') ? page.commonObjs : page.objs).get(nome, pega); } catch (e) { res(null); }
    setTimeout(() => res(null), 8000);
  });
}

function imagemParaCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  if (img.bitmap) { ctx.drawImage(img.bitmap, 0, 0); return c; }
  if (!img.data) return null;
  const id = ctx.createImageData(img.width, img.height);
  const src = img.data, dst = id.data, n = img.width * img.height;
  if (img.kind === 3) dst.set(src.subarray(0, n * 4));
  else if (img.kind === 2) for (let i = 0, j = 0; i < n; i++, j += 3) { dst[i * 4] = src[j]; dst[i * 4 + 1] = src[j + 1]; dst[i * 4 + 2] = src[j + 2]; dst[i * 4 + 3] = 255; }
  else return null;
  ctx.putImageData(id, 0, 0);
  return c;
}

export async function imagensDoPdf(file, onProgresso = () => {}) {
  const pdfjs = await carregarPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const brutos = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    onProgresso(n, pdf.numPages);
    const page = await pdf.getPage(n);
    const ops = await page.getOperatorList();
    const nomes = [];
    ops.fnArray.forEach((fn, i) => { if (fn === pdfjs.OPS.paintImageXObject) nomes.push(ops.argsArray[i][0]); });
    // monta as linhas do texto (os pedaços vêm separados) e pega as que são legenda
    const linhas = new Map();
    for (const t of (await page.getTextContent()).items) {
      if (!t.str) continue;
      const y = Math.round(t.transform[5] / 3);
      if (!linhas.has(y)) linhas.set(y, []);
      linhas.get(y).push([t.transform[4], t.str]);
    }
    const legendas = [...linhas.entries()].sort((a, b) => b[0] - a[0])
      .map(([, l]) => l.sort((a, b) => a[0] - b[0]).map((x) => x[1]).join('').replace(/\s+/g, ' ').trim())
      .filter((t) => RE_LEGENDA.test(t));
    const daPagina = [];
    for (const nome of [...new Set(nomes)]) {
      const img = await objImagem(page, nome);
      if (!img || img.width < 250 || img.height < 180) continue; // ícones, logotipos, assinaturas
      const c = imagemParaCanvas(img); // converte já: a imagem é liberada ao sair da página
      if (!c) continue;
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
      if (blob) daPagina.push({ pagina: n, global: nome.startsWith('g_'), assinatura: await assinatura(blob), blob });
    }
    brutos.push({ daPagina, legendas });
    page.cleanup();
  }
  // a mesma imagem em 2 ou mais páginas = timbrado / cabeçalho / rodapé
  const paginasPor = {};
  for (const { daPagina } of brutos) for (const x of daPagina) (paginasPor[x.assinatura] ||= new Set()).add(x.pagina);
  const itens = [];
  for (const { daPagina, legendas } of brutos) {
    const fotos = daPagina.filter((x) => !x.global && paginasPor[x.assinatura].size < 2);
    fotos.forEach((x, i) => itens.push({ blob: x.blob, legenda: legendas[i] || '', nome: `pág. ${x.pagina}` }));
  }
  return itens;
}

// ---------- gravação ----------
const limparLegenda = (t) => String(t || '').replace(RE_LEGENDA, '').replace(/^\s*[-–—:.]\s*/, '').trim();

export async function importarImagens(caseId, itens, { origem = '', postoId = '' } = {}) {
  const existentes = await caseChildren(caseId, 'foto');
  let ordem = existentes.reduce((m, f) => Math.max(m, f.data.ordem || 0), 0);
  let comExif = 0;
  for (const it of itens) {
    const exif = await lerExif(it.blob);
    if (exif.tiradaEm || exif.gps) comExif += 1;
    const { blob, thumb, w, h } = await processarFoto(it.blob);
    ordem += 1;
    const rec = await createRecord('foto', caseId, {
      postoId, legenda: limparLegenda(it.legenda), ordem, largura: w, altura: h,
      tiradaEm: exif.tiradaEm || '', tiradaEmFonte: exif.tiradaEm ? 'foto' : '', gps: exif.gps || '', gpsFonte: exif.gps ? 'foto' : '',
      nomeArquivo: it.nome || '', origem,
    });
    await db.blobs.put({ id: rec.id, blob, thumb, uploaded: 0 });
  }
  return { fotos: itens.length, comExif };
}

// ---------- horários e local da diligência pelas medições e fotos ----------
const hm = (iso) => (iso && iso.length >= 16 ? iso.slice(11, 16) : '');

export async function evidenciasDaDiligencia(caseId, dataVistoria = '') {
  const filhos = (await db.records.where('caseId').equals(caseId).toArray()).filter((r) => !r.deleted);
  // só horários confiáveis: gravados na própria foto (EXIF) ou fotos antigas tiradas pelo app
  const fotos = filhos.filter((r) => r.kind === 'foto' && r.data.tiradaEm && r.data.tiradaEmFonte !== 'arquivo');
  const meds = filhos.filter((r) => r.kind === 'medicao' && (r.data.horaInicio || r.data.horaFim));
  // data de referência: a da vistoria ou a mais frequente nas fotos/medições
  const freq = {};
  for (const f of fotos) freq[f.data.tiradaEm.slice(0, 10)] = (freq[f.data.tiradaEm.slice(0, 10)] || 0) + 1;
  for (const m of meds) if (m.data.dataMedicao) freq[m.data.dataMedicao] = (freq[m.data.dataMedicao] || 0) + 1;
  const data = dataVistoria || Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const fDia = fotos.filter((f) => !data || f.data.tiradaEm.startsWith(data));
  const mDia = meds.filter((m) => !data || !m.data.dataMedicao || m.data.dataMedicao === data);
  const horasF = fDia.map((f) => hm(f.data.tiradaEm)).filter(Boolean).sort();
  const horasM = [...mDia.map((m) => m.data.horaInicio), ...mDia.map((m) => m.data.horaFim)].filter(Boolean).sort();
  const todas = [...horasF, ...horasM].sort();
  const gps = fDia.find((f) => f.data.gps && f.data.gpsFonte === 'foto')?.data.gps || '';
  return {
    data, fotos: fDia.length, medicoes: mDia.length,
    fotosDe: horasF[0] || '', fotosAte: horasF[horasF.length - 1] || '',
    medDe: horasM[0] || '', medAte: horasM[horasM.length - 1] || '',
    inicio: todas[0] || '', fim: todas[todas.length - 1] || '', gps,
    outrasDatas: Object.keys(freq).filter((d) => d !== data),
  };
}

export async function aplicarEvidencias(caso, ev, { substituir = false } = {}) {
  const m = {};
  const vazio = (k) => substituir || !String(caso.data[k] || '').trim();
  if (ev.data && vazio('vistoriaData')) m.vistoriaData = ev.data;
  if (ev.inicio && vazio('vistoriaInicio')) m.vistoriaInicio = ev.inicio;
  if (ev.fim && vazio('vistoriaFim')) m.vistoriaFim = ev.fim;
  if (ev.gps && vazio('vistoriaGps')) m.vistoriaGps = `${ev.gps} (GPS das fotos)`;
  if (Object.keys(m).length) await updateFields(caso.id, m);
  return m;
}
