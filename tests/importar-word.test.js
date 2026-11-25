import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { db } from '../src/db.js';
import { PERFIL_ID } from '../src/docx/base.js';
import { documentoDoClaude } from '../src/docx/claudeDoc.js';
import { importarWordDoLaudo } from '../src/docx/importarWord.js';

// Dados sintéticos: o Word gerado pelo app volta a texto e é montado de novo igual
const MD = `Título: Laudo técnico pericial
Subtítulo: Avaliação de teste

# 1 Identificação
Texto **importante** com [[pendência]] e fórmula $NEN = L_{avg} + 16,61 \\cdot \\log(T/8)$ no meio.

## 1.1 Resultados
Quadro: Resultados por agente
| Agente | Resultado |
|---|---|
| Ruído | 88,4 dB(A) |
Fonte: Medições do signatário.

Fluxo: Etapas da avaliação
1. Autos – despacho e quesitos
2. Diligência – vistoria

- item um
- item dois

# 2 Conclusão
Conclui-se tecnicamente que o ruído supera o limite.
`;
beforeAll(async () => {
  globalThis.fetch = async (url) => {
    const buf = await readFile(new URL(`../public/modelos/${String(url).split('/').pop()}`, import.meta.url));
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  await db.records.put({ id: PERFIL_ID, kind: 'perfil', caseId: null, data: { nome: 'Perito Teste', titulos: 'Engenheiro', crea: 'CREA 1', cidade: 'Cidade A' }, ts: {} });
  await db.records.put({ id: 'iw1', kind: 'caso', caseId: null, ts: {}, data: { tipoAtuacao: 'Judicial', papel: 'Perito do Juízo', numero: '1', autorNome: 'Fulano Teste' } });
});

describe('importar o Word do laudo', () => {
  it('lê o corpo de volta (títulos, negrito, amarelo, fórmula, quadro, fluxo, lista) e para antes da assinatura', async () => {
    const r = await documentoDoClaude('iw1', MD);
    const md = await importarWordDoLaudo(await r.blob.arrayBuffer());
    expect(md).toContain('Título: Laudo técnico pericial');
    expect(md).toContain('Subtítulo: Avaliação de teste');
    expect(md).toMatch(/^# 1 /m);
    expect(md).toMatch(/^## 1\.1 /m);
    expect(md).toContain('**importante**');
    expect(md).toContain('[[pendência]]');
    expect(md).toMatch(/\$NEN = L_\{avg\} \+ 16,61 \\cdot (\\log|log)/);
    expect(md).toContain('Quadro: Resultados por agente');
    expect(md).toContain('| Ruído | 88,4 dB(A) |');
    expect(md).toContain('Fonte: Medições do signatário.');
    expect(md).toContain('Fluxo: Etapas da avaliação');
    expect(md).toContain('1. Autos – despacho e quesitos');
    expect(md).toContain('- item dois');
    expect(md).toContain('Conclui-se tecnicamente');
    expect(md).not.toContain('Perito Teste');
    // e monta de novo, com o mesmo quadro e a mesma fórmula
    const r2 = await documentoDoClaude('iw1', md);
    const xml = await (await JSZip.loadAsync(await r2.blob.arrayBuffer())).file('word/document.xml').async('string');
    expect(xml).toContain('<m:oMath>');
    expect(xml.replace(/<[^>]+>/g, '')).toContain('Resultados por agente');
  });
});
