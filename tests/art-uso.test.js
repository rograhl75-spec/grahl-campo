import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { createRecord } from '../src/db.js';
import { trabalhosPrevistos, usosDaArt, situacaoArt, linhaDoUso, relatorioUsoArt } from '../src/artUso.js';

// Dados sintéticos.
beforeAll(() => {
  globalThis.fetch = async (url) => {
    const buf = await readFile(new URL(`../public/modelos/${String(url).split('/').pop()}`, import.meta.url));
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
});
describe('controle de uso da ART', () => {
  it('conta um uso por caso, avisa quando acaba e monta o relatório', async () => {
    const art = await createRecord('artCad', null, { numero: '1720000000000', finalidade: 'LTCAT / PPP', conselho: 'CREA-PR', trabalhos: '3' });
    const outra = await createRecord('artCad', null, { numero: '999', descricao: 'Laudos extrajudiciais – 30 trabalhos' });
    expect(trabalhosPrevistos(outra)).toBe(30);
    await createRecord('caso', null, { tipoAtuacao: 'Extrajudicial', autorNome: 'Segurado A', artId: art.id, artUsoEm: '2026-11-20' });
    await createRecord('caso', null, { tipoAtuacao: 'Judicial', materia: 'Previdenciária', autorNome: 'Autor B', reuNome: 'INSS', numero: '0000001-00.2025.4.04.7001', juizo: '1ª Vara Federal', artId: art.id, artUsoEm: '2026-11-25' });
    let usos = await usosDaArt(art.id);
    expect(usos.length).toBe(2);
    expect(situacaoArt(art, usos.length)).toMatchObject({ restantes: 1, nivel: 'acabando' });
    await createRecord('caso', null, { tipoAtuacao: 'Extrajudicial', autorNome: 'Segurado C', artId: art.id, artUsoEm: '2026-11-27' });
    usos = await usosDaArt(art.id);
    const s = situacaoArt(art, usos.length);
    expect(s).toMatchObject({ restantes: 0, nivel: 'esgotada' });
    expect(s.texto).toMatch(/solicite nova ART/);
    expect(linhaDoUso(usos[1], 1)).toMatchObject({ n: 2, data: '25/11/2026', tipo: 'Judicial – previdenciário', quem: 'Autor B', contra: 'INSS', processo: '0000001-00.2025.4.04.7001' });
    const r = await relatorioUsoArt(art);
    expect(r.blob.size).toBeGreaterThan(1000);
    expect(r.nome).toMatch(/Relatorio_uso_ART/);
    const t = (await (await JSZip.loadAsync(await r.blob.arrayBuffer())).file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ');
    for (const x of ['RELATÓRIO DE USO DA ART', 'Autor B', '0000001-00.2025.4.04.7001', 'Segurado C', 'solicite nova ART']) expect(t).toContain(x);
  });
});
