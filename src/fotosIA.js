// ======================================================================
// Fotos: legenda pelo nome do arquivo e identificação pelo Claude
//
// 1. Nome do arquivo → legenda: quem já nomeia as fotos ("Área 1 - 03a, bancada de testes…")
//    não precisa redigitar. Nomes automáticos de câmera (IMG_…, DSC…, PXL_…, WhatsApp Image…)
//    são ignorados.
// 2. Identificação: o app gera a instrução com a lista numerada das fotos e entrega as fotos
//    numeradas (compartilhamento do Android ou ZIP) e as folhas de contato; o Claude devolve,
//    por foto, a legenda sugerida e o que está legível (plaqueta, rótulo, display, CA), além
//    da ficha da FDS dos produtos cujo rótulo aparece. Tudo entra "a conferir".
// ======================================================================
import { REGRAS_FDS, FORMATO_PRODUTO, produtoParaDados } from './fds.js';

const s = (x) => (x === undefined || x === null ? '' : String(x).trim());
const semAc = (t) => s(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const CAMERA = /^(img|dsc|dscn|dscf|pxl|mvimg|vid|pano|burst|screenshot|captura|whatsapp image|image|imagem|photo|foto|picture|snapchat|signal|telegram|p\d{6,}|cimg|sam|gopr|dji)[\s_-]*[\d_ ().-]*$/i;

// "Area 1 - 05a, chamada suja - Bancada de testes hidraulicos de bombas.jpeg" → legenda; nome de câmera → ''
export function legendaDoNomeArquivo(nome) {
  let t = s(nome).replace(/\.[a-z0-9]{2,5}$/i, ''); // extensão
  t = t.replace(/^[0-9a-f]{8}-/i, ''); // prefixo de upload (hash)
  if (!t || CAMERA.test(t) || /^[\d\s_().-]+$/.test(t) || /^[0-9a-f-]{16,}$/i.test(t)) return '';
  if (/^(whatsapp image|img[-_]\d|screenshot|captura de tela)/i.test(t)) return '';
  t = t.replace(/[_]+/g, ' ')
    .replace(/\.{2,}_*\s*$/, '') // nome truncado pelo sistema ("peça.._")
    .replace(/\s*\(\d+\)\s*$/, '') // "(1)" de cópia
    .replace(/\s{2,}/g, ' ').replace(/\s+([,;.])/g, '$1').trim();
  if (t.length < 4 || !/[a-zà-ú]{3}/i.test(t)) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export const TIPOS_IDENT = ['Máquina / veículo', 'Equipamento de medição', 'Produto químico (rótulo)', 'EPI', 'Posto / ambiente', 'Documento', 'Outro'];

// campos de identificação de uma foto vindos do JSON → dados do registro da foto
export function normalizarIdentFoto(x = {}) {
  const id = x.identificacao;
  const texto = id && typeof id === 'object'
    ? Object.entries(id).filter(([, v]) => s(v)).map(([k, v]) => `${k}: ${s(v)}`).join('; ')
    : s(id);
  const tipo = TIPOS_IDENT.find((t) => semAc(t).split(' ')[0] === semAc(x.tipo).split(' ')[0]) || (s(x.tipo) ? 'Outro' : '');
  const out = {};
  if (tipo) out.identTipo = tipo;
  if (texto) { out.identificacao = texto; out.identSituacao = 'A conferir'; }
  if (s(x.confianca)) out.identConfianca = s(x.confianca);
  if (s(x.observacao)) out.identObs = s(x.observacao);
  return out;
}

const dataHora = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); };

// instrução ao Claude com a lista numerada (numero = ordem da foto no app)
export function promptFotos(fotos = [], { nomePosto = {}, contexto = '' } = {}) {
  const lista = fotos.map((f, i) => `- Foto ${f.numero ?? i + 1}${f.data.postoId && nomePosto[f.data.postoId] ? ` · posto: ${nomePosto[f.data.postoId]}` : ''}${f.data.tiradaEm ? ` · ${dataHora(f.data.tiradaEm)}` : ''}${f.data.nomeArquivo ? ` · arquivo: ${f.data.nomeArquivo}` : ''}${f.data.legenda ? ` · legenda atual: ${f.data.legenda}` : ''}`).join('\n');
  return `Anexei fotos de uma vistoria técnica (engenharia de segurança do trabalho)${contexto ? ` – ${contexto}` : ''}. Os arquivos se chamam "Foto N" (N = número da foto no meu app); nas folhas de contato, o número aparece no canto de cada foto.
Para cada foto:
1. "legenda": uma frase objetiva do que a foto mostra (máquina, posto, atividade, produto, EPI), no estilo de legenda de laudo. Se a legenda atual já estiver boa, repita-a.
2. "tipo": Máquina / veículo | Equipamento de medição | Produto químico (rótulo) | EPI | Posto / ambiente | Documento | Outro.
3. "identificacao": SOMENTE o que estiver legível na imagem – marca, modelo, nº de série e ano (plaqueta), nome comercial, fabricante e lote (rótulo), nº do CA (EPI), valor e unidade mostrados no display de um equipamento de medição. Não deduza nem complete de memória; o que não estiver legível fica de fora.
4. "confianca": alta | média | baixa (legibilidade).
Leitura de display serve só para conferência com o relatório do equipamento; nunca é resultado de medição.

${REGRAS_FDS}
Aqui, os produtos são os que aparecem nos rótulos das fotos (indique em "observacoes" o número da foto); use "fonte": "Rótulo do produto (foto)" quando não achar a FDS e "Pesquisada na internet" quando achar.

Responda SOMENTE com um bloco JSON:
{"fotos": [{"numero": 1, "legenda": "", "tipo": "", "identificacao": {"marca": "", "modelo": "", "serie": "", "ano": "", "produto": "", "fabricante": "", "lote": "", "ca": "", "leitura": "valor e unidade no display"}, "confianca": "", "observacao": ""}],
 "produtos": [${FORMATO_PRODUTO.replace(/\s*\n\s*/g, ' ')}]}

Fotos:
${lista}`;
}

export function lerJsonFotos(texto) {
  let t = s(texto);
  const bloco = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (bloco) t = bloco[1];
  const i = t.indexOf('{'), f = t.lastIndexOf('}');
  if (i < 0 || f < i) throw new Error('Não encontrei um JSON no texto colado.');
  const obj = JSON.parse(t.slice(i, f + 1));
  const lista = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
  return {
    fotos: lista(obj.fotos).map((x) => ({ numero: parseInt(s(x.numero).replace(/\D+/g, ''), 10), legenda: s(x.legenda), ...normalizarIdentFoto(x) }))
      .filter((x) => x.numero > 0 && (x.legenda || x.identificacao)),
    produtos: lista(obj.produtos).map(produtoParaDados).filter((p) => p.nome),
  };
}

// aplica no caso: legenda só onde está vazia (ou com "substituir"); identificação sempre "a conferir"
export async function aplicarFotosIA(caseId, dados, { substituir = false } = {}) {
  const { updateFields, caseChildren } = await import('./db.js');
  const { aplicarFds } = await import('./fds.js');
  const fotos = (await caseChildren(caseId, 'foto')).sort((a, b) => (a.data.ordem ?? 0) - (b.data.ordem ?? 0) || a.createdAt - b.createdAt);
  let n = 0;
  for (const { numero, legenda, ...ident } of dados.fotos || []) {
    const f = fotos[numero - 1];
    if (!f) continue;
    const novos = {};
    if (legenda && (substituir || !s(f.data.legenda))) novos.legenda = legenda;
    for (const [k, v] of Object.entries(ident)) if (v && (substituir || !s(f.data[k]))) novos[k] = v;
    if (Object.keys(novos).length) { await updateFields(f.id, novos); n += 1; }
  }
  const p = (dados.produtos || []).length ? await aplicarFds(caseId, dados.produtos, { substituir }) : { novos: 0, completados: 0 };
  return { fotos: n, produtos: p.novos + p.completados };
}

// ---------------- arquivos para o Claude (navegador) ----------------
const nn = (i) => String(i).padStart(2, '0');

// fotos numeradas como File ("Foto 03.jpg"), na resolução gravada no aparelho
export async function arquivosNumerados(fotos) {
  const { db } = await import('./db.js');
  const out = [];
  for (const f of fotos) {
    const b = await db.blobs.get(f.id);
    if (!b || !b.blob) continue;
    out.push(new File([b.blob], `Foto ${nn(f.numero)}.jpg`, { type: 'image/jpeg' }));
  }
  return out;
}

// folhas de contato: até 12 fotos por folha (3 × 4), com o número em destaque
export async function folhasDeContato(fotos, { porFolha = 12, colunas = 3, largura = 2400 } = {}) {
  const { db } = await import('./db.js');
  const folhas = [];
  for (let k = 0; k < fotos.length; k += porFolha) {
    const grupo = fotos.slice(k, k + porFolha);
    const linhas = Math.ceil(grupo.length / colunas);
    const cel = Math.floor(largura / colunas), alt = Math.round(cel * 0.75);
    const c = document.createElement('canvas');
    c.width = largura; c.height = linhas * alt;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < grupo.length; i++) {
      const f = grupo[i];
      const b = await db.blobs.get(f.id);
      const x = (i % colunas) * cel, y = Math.floor(i / colunas) * alt;
      if (b && b.blob) {
        try {
          const img = await createImageBitmap(b.blob);
          const esc = Math.min((cel - 8) / img.width, (alt - 8) / img.height);
          const w = img.width * esc, h = img.height * esc;
          g.drawImage(img, x + (cel - w) / 2, y + (alt - h) / 2, w, h);
          if (img.close) img.close();
        } catch (e) { /* foto ilegível: fica a célula em branco com o número */ }
      }
      g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(x + 6, y + 6, 150, 64);
      g.fillStyle = '#ffffff'; g.font = 'bold 48px sans-serif'; g.textBaseline = 'top';
      g.fillText(nn(f.numero), x + 20, y + 14);
    }
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
    folhas.push(new File([blob], `Folha de contato ${Math.floor(k / porFolha) + 1} (fotos ${nn(grupo[0].numero)} a ${nn(grupo[grupo.length - 1].numero)}).jpg`, { type: 'image/jpeg' }));
  }
  return folhas;
}

// entrega os arquivos: compartilhamento do aparelho (Android → app do Claude) ou ZIP para baixar
export async function entregarArquivos(arquivos, nomeZip = 'fotos-numeradas.zip') {
  if (!arquivos.length) return 'nada';
  try {
    if (navigator.canShare && navigator.canShare({ files: arquivos })) {
      await navigator.share({ files: arquivos, title: 'Fotos da vistoria' });
      return 'compartilhado';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelado';
  }
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (const a of arquivos) zip.file(a.name, a);
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url; el.download = nomeZip; document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'zip';
}
