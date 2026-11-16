import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { montarDocx, FONTES_EMBUTIDAS, Doc } from '../src/docx/ooxml.js';

const pub = (n) => readFile(new URL(`../public/modelos/${n}`, import.meta.url));
// desfaz a ofuscação (ECMA-376): XOR dos 32 primeiros bytes com a chave (GUID em ordem inversa)
function desofuscar(bytes, chave) {
  const h = chave.replace(/[{}-]/g, '');
  const k = Array.from({ length: 16 }, (_, i) => parseInt(h.substr(30 - i * 2, 2), 16));
  const b = Uint8Array.from(bytes);
  for (let i = 0; i < 32; i++) b[i] ^= k[i % 16];
  return b;
}

describe('fontes embutidas (Lato e Montserrat)', () => {
  it('cada .odttf vira uma TrueType válida com a chave declarada', async () => {
    for (const f of FONTES_EMBUTIDAS) {
      const b = desofuscar(await pub(f.arquivo), f.chave);
      expect([...b.slice(0, 4)]).toEqual([0, 1, 0, 0]);
    }
  });
  it('o .docx leva as fontes, a tabela de fontes e o aviso de fontes embutidas', async () => {
    const fontes = await Promise.all(FONTES_EMBUTIDAS.map(async (f) => ({ ...f, bytes: new Uint8Array(await pub(f.arquivo)) })));
    const d = new Doc();
    d.h1('1', 'Teste'); d.fluxo('Etapas', [{ t: 'A', d: 'x' }, { t: 'B' }]); d.quadroDestaque('Linha', [['V', 'R1'], ['V1', { t: 'a', cor: 'DCE6F2' }]]);
    const blob = await montarDocx(await pub('timbrado-vertical.docx'), d.xml(), { fontes });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file('word/fonts/Lato-Regular.odttf')).toBeTruthy();
    const ft = await zip.file('word/fontTable.xml').async('string');
    expect(ft).toMatch(/<w:font w:name="Lato">[\s\S]*w:embedBold/);
    expect(ft).toMatch(/<w:font w:name="Montserrat">[\s\S]*w:embedRegular/);
    expect(await zip.file('word/_rels/fontTable.xml.rels').async('string')).toContain('fonts/Montserrat-Bold.odttf');
    expect(await zip.file('[Content_Types].xml').async('string')).toContain('Extension="odttf"');
    expect(await zip.file('word/settings.xml').async('string')).toContain('<w:embedTrueTypeFonts/>');
    const doc = await zip.file('word/document.xml').async('string');
    expect(doc).toContain('Figura ');
    expect(doc).toContain('w:fill="DCE6F2"');
  });
});
