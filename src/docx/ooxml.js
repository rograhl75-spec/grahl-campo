import JSZip from 'jszip';

// Gerador de WordprocessingML que insere o conteúdo no corpo do modelo
// timbrado (cabeçalho, rodapé e moldura do modelo são preservados).
// Padrão visual dos documentos da GRAHL: Abadi, 1,5, justificado, recuo de
// primeira linha, títulos numerados em azul-marinho, quadros com título
// acima e "Fonte" abaixo, figuras duas por linha.

export const FONTE = 'Abadi';
export const AZUL = '1B365D';
export const AZUL_CLARO = 'DCE6F2';
const CINZA = '64748B';
const LARGURA = 8504; // A4 com margens de 3 cm do modelo
const RECUO = 709; // 1,25 cm

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function rPr({ b, i, size = 12, color, caps, hl } = {}) {
  return `<w:rPr><w:rFonts w:ascii="${FONTE}" w:hAnsi="${FONTE}" w:cs="${FONTE}" w:eastAsia="${FONTE}"/>` +
    (b ? '<w:b/><w:bCs/>' : '') + (i ? '<w:i/><w:iCs/>' : '') + (caps ? '<w:caps/>' : '') +
    (color ? `<w:color w:val="${color}"/>` : '') + `<w:sz w:val="${Math.round(size * 2)}"/><w:szCs w:val="${Math.round(size * 2)}"/>` +
    (hl ? '<w:highlight w:val="yellow"/>' : '') + '</w:rPr>';
}

export function run(text, opts = {}) {
  return String(text ?? '').split(/\r?\n/).map((t, i) =>
    `<w:r>${rPr(opts)}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`).join('');
}

// Texto com marcações: **negrito**, *itálico* e [[pendência]] (amarelo, para conferir)
export function rich(text, base = {}) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*|\[\[([^\]]+)\]\]|\*([^*]+)\*)/g;
  let last = 0, m;
  const s = String(text ?? '');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(run(s.slice(last, m.index), base));
    if (m[2] !== undefined) out.push(run(m[2], { ...base, b: true }));
    else if (m[3] !== undefined) out.push(run(m[3], { ...base, b: true, hl: true }));
    else out.push(run(m[4], { ...base, i: true }));
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(run(s.slice(last), base));
  return out.join('');
}

function pPr({ style, align = 'both', before = 0, after = 120, line = 360, keepNext, keepLines, pageBreakBefore, left, hanging, first, outline } = {}) {
  return '<w:pPr>' + (style ? `<w:pStyle w:val="${style}"/>` : '') +
    (keepNext ? '<w:keepNext/>' : '') + (keepLines ? '<w:keepLines/>' : '') + (pageBreakBefore ? '<w:pageBreakBefore/>' : '') +
    `<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/>` +
    (left || hanging || first ? `<w:ind${left ? ` w:left="${left}"` : ''}${hanging ? ` w:hanging="${hanging}"` : ''}${first ? ` w:firstLine="${first}"` : ''}/>` : '') +
    `<w:jc w:val="${align}"/>` + (outline !== undefined ? `<w:outlineLvl w:val="${outline}"/>` : '') + '</w:pPr>';
}

export function p(content, opts = {}) {
  const runs = Array.isArray(content) ? content.join('') : rich(content, opts.run || {});
  return `<w:p>${pPr(opts)}${runs}</w:p>`;
}

const vazio = (t) => !t || !String(t).trim();

export class Doc {
  constructor() {
    this.x = [];
    this.nQuad = 0;
    this.nFig = 0;
    this.imagens = [];
  }
  add(...xs) { this.x.push(...xs.filter(Boolean)); return this; }
  xml() { return this.x.join(''); }

  // parágrafos de corpo: recuo de primeira linha; "- " vira marcador; "a) " vira alínea
  texto(t, { recuo = true, size } = {}) {
    if (vazio(t)) return this;
    for (const linha of String(t).split(/\r?\n/)) {
      const l = linha.trim();
      if (!l) continue;
      const run = size ? { size } : {};
      if (/^[-•▪]\s+/.test(l)) {
        this.add(p([runMarcador(), rich(l.replace(/^[-•▪]\s+/, ''), run)], { left: 1069, hanging: 360, after: 60 }));
      } else if (/^[a-z]\)\s+/i.test(l) || /^[ivx]+\)\s+/i.test(l)) {
        this.add(p(l, { left: 1069, hanging: 360, after: 60, run }));
      } else {
        this.add(p(l, { first: recuo ? RECUO : 0, run }));
      }
    }
    return this;
  }
  // texto ainda não redigido: aparece em amarelo, com a orientação do que escrever
  redigir(orientacao) {
    return this.add(p(`[[Redigir: ${orientacao}]]`, { first: RECUO }));
  }
  h1(num, titulo, { novaPagina = true } = {}) {
    return this.add(`<w:p>${pPr({ style: 'Ttulo1', align: 'left', before: novaPagina ? 0 : 360, after: 240, keepNext: true, pageBreakBefore: novaPagina, outline: 0 })}` +
      `${run(`${num ? num + ' ' : ''}${String(titulo).toUpperCase()}`, { b: true, size: 12, color: AZUL })}</w:p>`);
  }
  h2(num, titulo) {
    return this.add(`<w:p>${pPr({ style: 'Ttulo2', align: 'left', before: 240, after: 120, keepNext: true, outline: 1 })}` +
      `${run(`${num ? num + ' ' : ''}${String(titulo).toUpperCase()}`, { b: true, size: 12, color: AZUL })}</w:p>`);
  }
  h3(titulo) {
    return this.add(p([run(titulo, { b: true })], { align: 'left', before: 120, after: 60, keepNext: true }));
  }
  // Quadro numerado: título acima, tabela, fonte abaixo
  quadro(titulo, linhas, { larguras, header = true, fonte = 'Elaborado pelo autor.', tam = 10, alinhar = 'both' } = {}) {
    if (!linhas || linhas.length <= (header ? 1 : 0)) return this;
    this.nQuad += 1;
    const n = this.nQuad;
    this.add(`<w:p>${pPr({ align: 'center', before: 120, after: 60, line: 276, keepNext: true })}` +
      run('Quadro ', { b: true, size: 10 }) + campoSeq('Quadro', n, { b: true, size: 10 }) + run(` – ${titulo}`, { b: true, size: 10 }) + '</w:p>');
    this.add(tabela(linhas, { larguras, header, tam, alinhar }));
    if (fonte) this.add(p([run(`Fonte: ${fonte}`, { size: 9 })], { align: 'left', after: 200, line: 240 }));
    return this;
  }
  // tabela chave–valor da capa (rótulo em negrito azul, linhas finas)
  identificacao(pares) {
    const linhas = pares.filter(([, v]) => !vazio(v));
    if (!linhas.length) return this;
    const rows = linhas.map(([k, v]) => `<w:tr>${celula(k, 2600, { b: true, color: AZUL, tam: 10, borda: 'bottom', align: 'left' })}${celula(v, LARGURA - 2600, { tam: 10, borda: 'bottom', align: 'left' })}</w:tr>`).join('');
    return this.add(`<w:tbl><w:tblPr><w:tblW w:w="${LARGURA}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="2600"/><w:gridCol w:w="${LARGURA - 2600}"/></w:tblGrid>${rows}</w:tbl>`, p('', { after: 120, line: 240 }));
  }
  // Figuras, duas por linha, legenda acima
  figuras(lista) {
    if (!lista.length) return this;
    const meia = Math.floor(LARGURA / 2);
    for (let i = 0; i < lista.length; i += 2) {
      const par = lista.slice(i, i + 2);
      const cells = par.map((f) => {
        this.nFig += 1;
        const n = this.nFig;
        const rId = `rIdImg${n}`;
        this.imagens.push({ rId, nome: `figura${n}.jpg`, bytes: f.bytes });
        const larg = 7.2;
        let alt = (larg * f.h) / f.w;
        let lg = larg;
        if (alt > 9.5) { alt = 9.5; lg = (9.5 * f.w) / f.h; }
        const cap = `<w:p>${pPr({ align: 'center', after: 60, line: 240, keepNext: true })}${run('Figura ', { b: true, size: 9 })}${campoSeq('Figura', n, { b: true, size: 9 })}${run(' – ', { b: true, size: 9 })}${rich(f.legenda || 'Registro fotográfico.', { size: 9 })}</w:p>`;
        const det = f.detalhe ? p([run(f.detalhe, { size: 8, color: CINZA })], { align: 'center', after: 0, line: 240 }) : '';
        return `<w:tc><w:tcPr><w:tcW w:w="${meia}" w:type="dxa"/>${bordas('all')}</w:tcPr>${cap}${imagemXml(rId, 2000 + n, lg, alt)}${det}</w:tc>`;
      });
      if (cells.length === 1) cells.push(`<w:tc><w:tcPr><w:tcW w:w="${meia}" w:type="dxa"/>${bordas('all')}</w:tcPr><w:p/></w:tc>`);
      this.add(`<w:tbl><w:tblPr><w:tblW w:w="${meia * 2}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="${meia}"/><w:gridCol w:w="${meia}"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cells.join('')}</w:tr></w:tbl>`);
      this.add(p('', { after: 120, line: 240 }));
    }
    return this;
  }
  // Endereçamento ao juízo (petições, laudos e pareceres judiciais)
  enderecamento(texto, linhasProcesso = []) {
    this.add(p([run(String(texto).toUpperCase(), { b: true })], { align: 'both', after: 480 }));
    for (const [k, v] of linhasProcesso) if (!vazio(v)) this.add(p([run(`${k}: `, { b: true }), rich(v)], { align: 'left', after: 0 }));
    return this.add(p('', { after: 240 }));
  }
  assinatura({ local = 'Londrina – PR', data = dataExtenso(), nome = 'ROGÉRIO GRAHL', linhas = [] } = {}) {
    this.add(p([run(`${local}, ${data}.`)], { align: 'right', before: 240, after: 720, keepNext: true }));
    this.add(p([run(nome, { b: true })], { align: 'center', after: 0, keepNext: true }));
    linhas.forEach((l, i) => this.add(p([run(l, { size: 11 })], { align: 'center', after: 0, keepNext: i < linhas.length - 1 })));
    return this;
  }
  sumario(titulo = 'SUMÁRIO') {
    return this.add(p([run(titulo, { b: true, color: AZUL })], { align: 'center', pageBreakBefore: true, after: 240 }), campoToc('TOC \\o "1-2" \\h \\z \\u'));
  }
  listaQuadros() {
    return this.add(p([run('LISTA DE QUADROS', { b: true, color: AZUL })], { align: 'center', pageBreakBefore: true, after: 240 }), campoToc('TOC \\h \\z \\c "Quadro"'));
  }
  listaFiguras() {
    return this.add(p([run('LISTA DE FIGURAS', { b: true, color: AZUL })], { align: 'center', before: 480, after: 240 }), campoToc('TOC \\h \\z \\c "Figura"'));
  }
  quebra() { return this.add('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'); }
}

function runMarcador() {
  return run('▪\t', { color: AZUL });
}

function campoSeq(nome, n, opts) {
  return `<w:r>${rPr(opts)}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${rPr(opts)}<w:instrText xml:space="preserve"> SEQ ${nome} \\* ARABIC </w:instrText></w:r>` +
    `<w:r>${rPr(opts)}<w:fldChar w:fldCharType="separate"/></w:r>${run(String(n), opts)}<w:r>${rPr(opts)}<w:fldChar w:fldCharType="end"/></w:r>`;
}

function campoToc(instr) {
  return '<w:p><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="8494"/></w:tabs><w:spacing w:line="360" w:lineRule="auto"/></w:pPr>' +
    '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>' +
    `<w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>` +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
    run('Para montar: clique com o botão direito aqui e escolha "Atualizar campo" (ou Ctrl+A e F9).', { i: true, color: CINZA, size: 10 }) +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
}

function bordas(tipo) {
  const b = (n, cor = 'A6B4C8') => `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="${cor}"/>`;
  if (tipo === 'bottom') return `<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/>${b('bottom', 'C9D3E0')}<w:right w:val="nil"/></w:tcBorders>`;
  return `<w:tcBorders>${b('top')}${b('left')}${b('bottom')}${b('right')}</w:tcBorders>`;
}

function celula(texto, w, { b, color, tam = 10, fill, borda = 'all', align = 'both' } = {}) {
  const shade = fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '';
  const linhas = String(texto ?? '').split(/\r?\n/);
  const paras = linhas.map((l) => p([rich(l, { size: tam, b, color })], { align, after: 0, line: 264 })).join('');
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${bordas(borda)}${shade}<w:vAlign w:val="center"/></w:tcPr>${paras}</w:tc>`;
}

export function tabela(linhas, { larguras, header = true, tam = 10, alinhar = 'both' } = {}) {
  const ncol = Math.max(...linhas.map((l) => l.length));
  const ws = larguras ? larguras.map((f) => Math.round(f * LARGURA)) : Array(ncol).fill(Math.round(LARGURA / ncol));
  const grid = `<w:tblGrid>${ws.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const rows = linhas.map((l, ri) => {
    const isH = header && ri === 0;
    const cells = l.map((c, ci) => celula(c, ws[ci], {
      b: isH, color: isH ? AZUL : undefined, tam, fill: isH ? AZUL_CLARO : undefined, align: isH ? 'center' : alinhar,
    })).join('');
    return `<w:tr><w:trPr><w:cantSplit/>${isH ? '<w:tblHeader/>' : ''}</w:trPr>${cells}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${LARGURA}" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/>` +
    '<w:tblCellMar><w:top w:w="30" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="30" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
    `${grid}${rows}</w:tbl>`;
}

const EMU_CM = 360000;
function imagemXml(rId, id, larguraCm, alturaCm) {
  const cx = Math.round(larguraCm * EMU_CM), cy = Math.round(alturaCm * EMU_CM);
  return `<w:p>${pPr({ align: 'center', after: 40, line: 240 })}<w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Figura ${id}"/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="img${id}.jpg"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}

export function dataExtenso(d = new Date()) {
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Monta o .docx a partir do modelo: substitui o corpo e acrescenta as imagens.
export async function montarDocx(modeloBytes, corpoXml, { imagens = [], tituloDoc = '', comCampos = false } = {}) {
  const zip = await JSZip.loadAsync(modeloBytes);
  const docPath = 'word/document.xml';
  let xml = await zip.file(docPath).async('string');
  const ini = xml.indexOf('<w:body>') + '<w:body>'.length;
  const sect = xml.lastIndexOf('<w:sectPr');
  if (ini < 8 || sect < 0) throw new Error('Modelo timbrado inválido (corpo não encontrado).');
  xml = xml.slice(0, ini) + corpoXml + xml.slice(sect);
  zip.file(docPath, xml);

  if (imagens.length) {
    const relPath = 'word/_rels/document.xml.rels';
    let rels = await zip.file(relPath).async('string');
    rels = rels.replace('</Relationships>', imagens.map((im) =>
      `<Relationship Id="${im.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${im.nome}"/>`).join('') + '</Relationships>');
    zip.file(relPath, rels);
    for (const im of imagens) zip.file(`word/media/${im.nome}`, im.bytes);
    let ct = await zip.file('[Content_Types].xml').async('string');
    if (!/Extension="jpg"/i.test(ct)) ct = ct.replace(/(<Types[^>]*>)/, '$1<Default Extension="jpg" ContentType="image/jpeg"/>');
    zip.file('[Content_Types].xml', ct);
  }
  if (comCampos) {
    let s = await zip.file('word/settings.xml').async('string');
    if (!s.includes('w:updateFields')) s = s.replace(/(<w:settings[^>]*>)/, '$1<w:updateFields w:val="true"/>');
    zip.file('word/settings.xml', s);
  }
  const corePath = 'docProps/core.xml';
  if (zip.file(corePath) && tituloDoc) {
    let core = await zip.file(corePath).async('string');
    core = core.replace(/<dc:title>[^<]*<\/dc:title>/, '').replace('</cp:coreProperties>', `<dc:title>${esc(tituloDoc)}</dc:title></cp:coreProperties>`);
    zip.file(corePath, core);
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
