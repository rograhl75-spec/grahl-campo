// ======================================================================
// Word do laudo (gerado pelo app, inclusive editado à mão depois) → texto nas convenções do Claude (Markdown),
// para guardar como "último texto" e aplicar correções sem redigir de novo. Lê só o corpo: do primeiro título
// numerado até antes do "Integram o presente…", do local e data, da assinatura e dos anexos/apêndices – partes
// que o app monta sozinho ao gerar o Word. Converte títulos, parágrafos (negrito, itálico, [[amarelo]]), listas,
// quadros (com título e fonte), fluxos e equações ($…$).
// ======================================================================

// ---------- XML mínimo (sem dependências): árvore de elementos ----------
function parseXml(xml) {
  const raiz = { n: '#raiz', a: {}, c: [] };
  const pilha = [raiz];
  const re = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)|<\?[^>]*\?>|<!--[\s\S]*?-->/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[5] !== undefined) { pilha[pilha.length - 1].c.push(ent(m[5])); continue; }
    if (!m[2]) continue;
    if (m[1]) { pilha.pop(); continue; }
    const a = {};
    for (const [, k, v] of (m[3] || '').matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) a[k] = ent(v);
    const el = { n: m[2], a, c: [] };
    pilha[pilha.length - 1].c.push(el);
    if (!m[4]) pilha.push(el);
  }
  return raiz;
}
const ent = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (x, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
const filhos = (el, nome) => el.c.filter((x) => typeof x === 'object' && (!nome || x.n === nome));
const um = (el, nome) => el && el.c.find((x) => typeof x === 'object' && x.n === nome);
function todos(el, nome, out = []) { for (const x of el.c) if (typeof x === 'object') { if (x.n === nome) out.push(x); todos(x, nome, out); } return out; }
const textoDe = (el) => (typeof el === 'string' ? '' : el.n === 'w:t' || el.n === 'm:t' ? el.c.filter((x) => typeof x === 'string').join('') : el.n === 'w:tab' ? ' ' : el.c.map(textoDe).join(''));

// ---------- equações (OMML) → notação simples do app ----------
const grupo = (t) => (t.length > 1 ? `{${t}}` : t);
const sub = (b, s, k) => (s.trim() ? `${b}${k}${grupo(s.trim())}` : b);
function omml(el) {
  if (typeof el === 'string') return '';
  switch (el.n) {
    case 'm:t': return textoDe(el);
    case 'm:sSub': return sub(omml(um(el, 'm:e')), omml(um(el, 'm:sub')), '_');
    case 'm:sSup': return sub(omml(um(el, 'm:e')), omml(um(el, 'm:sup')), '^');
    case 'm:bar': return `\\overline{${omml(um(el, 'm:e'))}}`;
    case 'm:acc': case 'm:box': case 'm:borderBox': return omml(um(el, 'm:e'));
    case 'm:sSubSup': return `${omml(um(el, 'm:e'))}_${grupo(omml(um(el, 'm:sub')))}^${grupo(omml(um(el, 'm:sup')))}`;
    case 'm:rad': return `\\sqrt{${omml(um(el, 'm:e'))}}`;
    case 'm:f': return `\\frac{${omml(um(el, 'm:num'))}}{${omml(um(el, 'm:den'))}}`;
    case 'm:func': { const nome = omml(um(el, 'm:fName')).trim(); return `${/^(log|ln)$/.test(nome) ? `\\${nome}` : nome}${omml(um(el, 'm:e'))}`; }
    case 'm:d': {
      const pr = um(el, 'm:dPr'); const ab = um(pr || { c: [] }, 'm:begChr')?.a['m:val'] ?? '('; const fe = um(pr || { c: [] }, 'm:endChr')?.a['m:val'] ?? ')';
      return `${ab}${filhos(el, 'm:e').map(omml).join(',')}${fe}`;
    }
    case 'm:rPr': case 'w:rPr': case 'm:dPr': case 'm:radPr': case 'm:fPr': case 'm:sSubPr': case 'm:sSupPr': case 'm:funcPr': case 'm:ctrlPr': case 'm:deg': case 'm:barPr': case 'm:accPr': return '';
    default: return el.c.map(omml).join('');
  }
}
// "overlineIBUTG": comando que saiu como texto num Word antigo → barra de média de verdade
const limpaEq = (t) => t.replace(/·/g, ' \\cdot ').replace(/(?<!\\)overline\s*([A-Za-z]+)/g, '\\overline{$1}').replace(/\s+/g, ' ').trim();

// ---------- parágrafo → texto com **negrito**, *itálico* e [[amarelo]] ----------
function runs(p) {
  const out = [];
  const visita = (el) => {
    for (const x of el.c) {
      if (typeof x !== 'object') continue;
      if (x.n === 'w:r') {
        const pr = um(x, 'w:rPr') || { c: [] };
        const on = (nome) => { const e = um(pr, nome); return !!e && !/^(0|false)$/i.test(e.a['w:val'] || ''); };
        const t = x.c.filter((y) => typeof y === 'object').map((y) => (y.n === 'w:t' ? textoDe(y) : y.n === 'w:tab' ? ' ' : y.n === 'w:br' ? ' ' : '')).join('');
        if (t) out.push({ t, b: on('w:b'), i: on('w:i'), hl: !!um(pr, 'w:highlight') });
      } else if (x.n === 'm:oMath' || x.n === 'm:oMathPara') {
        out.push({ t: `$${limpaEq(omml(x))}$`, eq: true });
      } else if (['w:hyperlink', 'w:smartTag', 'w:ins', 'w:sdt', 'w:sdtContent', 'w:fldSimple'].includes(x.n)) visita(x);
    }
  };
  visita(p);
  // junta runs vizinhos com a mesma marcação
  let s = '', cur = null, buf = '';
  const fecha = () => {
    if (!cur) return;
    let t = buf;
    if (!cur.eq && t.trim()) {
      const ini = t.match(/^\s*/)[0], fim = t.match(/\s*$/)[0], miolo = t.trim();
      t = ini + (cur.hl ? `[[${miolo}]]` : cur.b ? `**${miolo}**` : cur.i ? `*${miolo}*` : miolo) + fim;
    }
    s += t; buf = ''; cur = null;
  };
  for (const r of out) {
    const k = r.eq ? 'eq' : `${r.hl}|${r.b}|${r.i}`;
    if (!cur || cur.k !== k || r.eq) { fecha(); cur = { ...r, k }; }
    buf += r.t;
  }
  fecha();
  return s.replace(/\*\*\s*\*\*/g, '').replace(/[ \t]+/g, ' ').trim();
}
const estilo = (p) => um(um(p, 'w:pPr') || { c: [] }, 'w:pStyle')?.a['w:val'] || '';
const ehLista = (p) => !!um(um(p, 'w:pPr') || { c: [] }, 'w:numPr');
const seqDe = (p) => { const i = todos(p, 'w:instrText').map((x) => x.c.filter((y) => typeof y === 'string').join('')).join(' '); const m = i.match(/SEQ\s+(Quadro|Figura)/); return m ? m[1] : ''; };
const celulaTexto = (tc) => filhos(tc, 'w:p').map(runs).filter(Boolean).join(' ').replace(/\|/g, '/');

const RE_FIM = /^(integram? o presente|o (presente )?(laudo|parecer|documento) (segue acompanhado|é acompanhado))/i;
// local e data da assinatura ("Londrina/PR, 24 de novembro de 2026.", "Londrina – PR, …")
const RE_LOCAL_DATA = /^[\p{L}\d .'/–-]{2,90},\s*\d{1,2}(º)? de [\p{L}]+ de \d{4}\.?$/u;

export function wordParaTexto(xmlDocumento, { titulo = '' } = {}) {
  const corpo = um(um(parseXml(xmlDocumento), 'w:document'), 'w:body');
  if (!corpo) throw new Error('Arquivo sem o corpo do documento (é um .docx?).');
  const blocos = filhos(corpo).filter((x) => x.n === 'w:p' || x.n === 'w:tbl');
  const L = [];
  let comecou = false, subtitulo = '';
  const nivel = (p) => { const e = estilo(p); const m = e.match(/(?:T[ií]tulo|Ttulo|Heading)\s*([1-3])/i); return m ? +m[1] : 0; };
  // subtítulo da capa: o parágrafo logo após o título, antes do corpo
  for (let i = 0; i < blocos.length && !comecou; i++) {
    const b = blocos[i];
    if (b.n !== 'w:p') continue;
    const t = runs(b);
    if (nivel(b) === 1 && /^\d/.test(t)) break;
    if (titulo && !subtitulo && t.replace(/\*\*/g, '').trim().toUpperCase() === titulo.toUpperCase()) {
      const prox = blocos.slice(i + 1).find((x) => x.n === 'w:p' && runs(x));
      if (prox) subtitulo = runs(prox).replace(/\*\*/g, '');
    }
  }
  if (titulo) L.push(`Título: ${titulo}`);
  if (subtitulo) L.push(`Subtítulo: ${subtitulo}`);
  L.push('');
  let legenda = null; // { tipo, titulo }
  let pularFonte = false; // o fluxo já sai com a fonte; a do Word não se repete
  for (let i = 0; i < blocos.length; i++) {
    const b = blocos[i];
    if (b.n === 'w:p') {
      const t = runs(b);
      const nv = nivel(b);
      if (!comecou) { if (nv === 1 && /^\d/.test(t.replace(/\*\*/g, ''))) comecou = true; else continue; }
      const limpo = t.replace(/\*\*/g, '').trim();
      if (nv === 1 && /^(anexo|ap[êe]ndice)\b/i.test(limpo)) break;
      if (RE_FIM.test(limpo)) break;
      if (RE_LOCAL_DATA.test(limpo)) {
        // assinatura no meio do corpo (ex.: emitente ao final do PPP): pula até o próximo título numerado;
        // sem título depois, é a assinatura final do documento
        const k = blocos.findIndex((x, j) => j > i && x.n === 'w:p' && nivel(x) === 1 && /^\d/.test(runs(x).replace(/\*\*/g, '').trim()));
        if (k < 0) break;
        i = k - 1; continue;
      }
      if (!limpo) continue;
      const seq = seqDe(b);
      // legenda do quadro ou da figura (campo SEQ; no Word editado à mão, pelo texto)
      if (seq || /^(Quadro|Figura)\s+\d+\s*[–—-]\s+\S/.test(limpo) && blocos[i + 1]?.n === 'w:tbl') { legenda = { tipo: seq || limpo.split(/\s/)[0], titulo: limpo.replace(/^(Quadro|Figura)\s*\d*\s*[–—-]\s*/i, '') }; continue; }
      if (nv) { L.push(`${'#'.repeat(nv)} ${limpo}`, ''); continue; }
      if (ehLista(b)) { L.push(`- ${t}`); continue; }
      if (/^Fonte:/i.test(limpo)) { if (!pularFonte) L.push(limpo, ''); pularFonte = false; continue; }
      pularFonte = false;
      L.push(t, '');
    } else if (comecou) {
      const linhas = filhos(b, 'w:tr').map((tr) => filhos(tr, 'w:tc'));
      const ehFluxo = legenda?.tipo === 'Figura' || linhas.some((cs) => cs.some((tc) => celulaTexto(tc).replace(/\*\*/g, '').trim() === '→'));
      if (ehFluxo) {
        const etapas = [];
        for (const cs of linhas) for (const tc of cs) {
          const ps = filhos(tc, 'w:p').map(runs).map((x) => x.replace(/\*\*/g, '').trim()).filter(Boolean);
          if (!ps.length || ps[0] === '→') continue;
          const [num, tt, ...desc] = /^\d+$/.test(ps[0]) ? ps : ['', ...ps];
          if (tt) etapas.push(`${etapas.length + 1}. ${tt}${desc.length ? ` – ${desc.join(' ')}` : ''}`);
          void num;
        }
        if (etapas.length) { L.push(`Fluxo: ${legenda?.titulo || 'Etapas'}`, ...etapas, ''); pularFonte = true; }
      } else {
        const tab = linhas.map((cs, k) => `| ${cs.map((tc) => (k ? celulaTexto(tc) : celulaTexto(tc).replace(/\*\*/g, ''))).join(' | ')} |`);
        if (tab.length) {
          L.push(`Quadro: ${legenda?.tipo === 'Quadro' ? legenda.titulo : '[[título do quadro]]'}`, tab[0], `|${tab[0].split('|').slice(1, -1).map(() => '---').join('|')}|`, ...tab.slice(1));
        }
      }
      legenda = null;
    }
  }
  const md = L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  if (!comecou) throw new Error('Não achei o corpo do laudo (títulos numerados). O arquivo foi gerado pelo app?');
  return md;
}

// .docx (Blob ou ArrayBuffer) → texto; o título vem das propriedades do documento
export async function importarWordDoLaudo(arquivo) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(arquivo instanceof ArrayBuffer ? arquivo : await arquivo.arrayBuffer());
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('Arquivo sem word/document.xml – escolha o .docx do laudo.');
  const core = (await zip.file('docProps/core.xml')?.async('string')) || '';
  const titulo = ent((core.match(/<dc:title>([^<]*)<\/dc:title>/) || [])[1] || '').trim();
  return wordParaTexto(xml, { titulo });
}
