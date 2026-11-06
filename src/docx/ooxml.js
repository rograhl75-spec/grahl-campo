import JSZip from 'jszip';

// Gerador mínimo de WordprocessingML que insere o conteúdo no corpo do
// modelo timbrado (cabeçalho, rodapé e moldura do modelo são preservados).

const FONTE = 'Abadi';
const AZUL = '1B365D';
const LARGURA_UTIL_TWIPS = 8504; // A4 com margens de 3 cm (1701 twips) do modelo

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // remove caracteres de controle inválidos em XML
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function rPr({ b, i, size = 11, color, caps } = {}) {
  return `<w:rPr><w:rFonts w:ascii="${FONTE}" w:hAnsi="${FONTE}" w:cs="${FONTE}" w:eastAsia="${FONTE}"/>` +
    (b ? '<w:b/><w:bCs/>' : '') + (i ? '<w:i/><w:iCs/>' : '') + (caps ? '<w:caps/>' : '') +
    (color ? `<w:color w:val="${color}"/>` : '') +
    `<w:sz w:val="${size * 2}"/><w:szCs w:val="${size * 2}"/></w:rPr>`;
}

export function run(text, opts = {}) {
  const partes = String(text ?? '').split(/\r?\n/);
  return partes.map((p, idx) =>
    `<w:r>${rPr(opts)}${idx ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(p)}</w:t></w:r>`).join('');
}

function pPr({ style, align = 'both', before = 0, after = 120, line = 360, keepNext, pageBreakBefore, indent } = {}) {
  return '<w:pPr>' + (style ? `<w:pStyle w:val="${style}"/>` : '') +
    (keepNext ? '<w:keepNext/>' : '') + (pageBreakBefore ? '<w:pageBreakBefore/>' : '') +
    `<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/>` +
    (indent ? `<w:ind w:left="${indent}"/>` : '') +
    `<w:jc w:val="${align}"/></w:pPr>`;
}

// p('texto') ou p([run(...), run(...)])
export function p(content, opts = {}) {
  // texto com várias linhas vira vários parágrafos (evita o "esticado" do justificado)
  if (!Array.isArray(content) && /\r?\n/.test(String(content ?? ''))) {
    const linhas = String(content).split(/\r?\n/);
    return linhas.map((l, i) => p(l, { ...opts, after: i === linhas.length - 1 ? (opts.after ?? 120) : 0 })).join('');
  }
  const runs = Array.isArray(content) ? content.join('') : run(content, opts.run || {});
  return `<w:p>${pPr(opts)}${runs}</w:p>`;
}

export function rotuloValor(rotulo, valor, opts = {}) {
  return p([run(`${rotulo}: `, { b: true }), run(valor || '—')], opts);
}

export function titulo(text, nivel = 1, { novaPagina = false } = {}) {
  const size = nivel === 1 ? 13 : nivel === 2 ? 12 : 11;
  return `<w:p>${pPr({ style: `Ttulo${nivel}`, align: 'left', before: nivel === 1 ? 240 : 180, after: 120, keepNext: true, pageBreakBefore: novaPagina })}` +
    `${run(text, { b: true, size, color: AZUL, caps: nivel === 1 })}</w:p>`;
}

export function quebraPagina() {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

export function sumario() {
  return titulo('Sumário', 1, { novaPagina: true }).replace('w:pStyle w:val="Ttulo1"', 'w:pStyle w:val="Normal"') +
    '<w:p><w:pPr><w:spacing w:line="360" w:lineRule="auto"/></w:pPr>' +
    '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>' +
    '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
    `${run('Clique com o botão direito aqui e escolha "Atualizar campo" para montar o sumário.', { i: true, color: '64748B' })}` +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
}

function tcBorders() {
  const b = (n) => `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/>`;
  return `<w:tcBorders>${b('top')}${b('left')}${b('bottom')}${b('right')}</w:tcBorders>`;
}

// linhas: array de arrays de texto; primeira linha é cabeçalho se header=true
export function tabela(linhas, { larguras, header = true, fonte = 10, alinhar = 'both' } = {}) {
  if (!linhas.length) return '';
  const ncol = Math.max(...linhas.map((l) => l.length));
  const total = LARGURA_UTIL_TWIPS;
  const ws = larguras ? larguras.map((f) => Math.round(f * total)) : Array(ncol).fill(Math.round(total / ncol));
  const grid = `<w:tblGrid>${ws.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const rows = linhas.map((l, ri) => {
    const isH = header && ri === 0;
    const cells = l.map((c, ci) => {
      const shade = isH ? `<w:shd w:val="clear" w:color="auto" w:fill="${AZUL}"/>` : '';
      return `<w:tc><w:tcPr><w:tcW w:w="${ws[ci]}" w:type="dxa"/>${tcBorders()}${shade}</w:tcPr>` +
        p(String(c ?? ''), { align: isH ? 'center' : alinhar, after: 0, line: 276, run: { size: fonte, b: isH, color: isH ? 'FFFFFF' : undefined } }) +
        '</w:tc>';
    }).join('');
    return `<w:tr>${isH ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
    '<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
    `${grid}${rows}</w:tbl>` + p('', { after: 60, line: 240 });
}

const EMU_CM = 360000;
export function imagem(rId, docPrId, larguraCm, alturaCm) {
  const cx = Math.round(larguraCm * EMU_CM), cy = Math.round(alturaCm * EMU_CM);
  return `<w:p>${pPr({ align: 'center', after: 60, keepNext: true })}<w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${docPrId}" name="Foto ${docPrId}"/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:nvPicPr><pic:cNvPr id="${docPrId}" name="foto${docPrId}.jpg"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}

// Monta o .docx a partir do modelo: substitui o corpo e acrescenta as imagens.
export async function montarDocx(modeloBytes, corpoXml, { imagens = [], tituloDoc = '', comSumario = false } = {}) {
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
    const novas = imagens.map((im) =>
      `<Relationship Id="${im.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${im.nome}"/>`).join('');
    rels = rels.replace('</Relationships>', novas + '</Relationships>');
    zip.file(relPath, rels);
    for (const im of imagens) zip.file(`word/media/${im.nome}`, im.bytes);
    let ct = await zip.file('[Content_Types].xml').async('string');
    if (!/Extension="jpg"/i.test(ct)) ct = ct.replace('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="jpg" ContentType="image/jpeg"/>');
    zip.file('[Content_Types].xml', ct);
  }

  if (comSumario) {
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
