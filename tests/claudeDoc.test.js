import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { db } from '../src/db.js';
import { PERFIL_ID } from '../src/docx/base.js';
import { documentoDoClaude } from '../src/docx/claudeDoc.js';
import { exportarParaClaude } from '../src/aiimport.js';

// Dados sintéticos.
const MD = `Título: Laudo técnico pericial
Subtítulo: Caracterização de insalubridade

# 1 Identificação
Texto **importante** com [[pendência]].

## 1.1 Dados do processo
Parágrafo em
duas linhas.

Quadro: Resultados por agente
| Agente | Resultado | Limite |
|---|---|---|
| Ruído | 88,4 dB(A) | 85 dB(A) |
| Calor | 27,1 °C | 26,7 °C |
Fonte: Medições do signatário.

Fluxo: Etapas da avaliação
1. Autos – despacho e quesitos
2. Diligência – vistoria
3. Conclusão

- item um
- item dois
`;

async function texto(r) {
  const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
  return (await zip.file('word/document.xml').async('string')).replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
}
beforeAll(async () => {
  globalThis.fetch = async (url) => {
    const buf = await readFile(new URL(`../public/modelos/${String(url).split('/').pop()}`, import.meta.url));
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  await db.records.put({ id: PERFIL_ID, kind: 'perfil', caseId: null, data: { nome: 'Perito Teste', titulos: 'Engenheiro', crea: 'CREA 1', cidade: 'Cidade A' }, ts: {} });
  await db.records.put({ id: 'cd1', kind: 'caso', caseId: null, ts: {}, data: { tipoAtuacao: 'Judicial', papel: 'Perito do Juízo', justica: 'Justiça do Trabalho', numero: '0000000-00.2026.5.09.0000', autorNome: 'Trabalhadora Teste', reuNome: 'Empresa Teste', vistoriaData: '2026-09-01' } });
});

describe('texto do Claude montado no timbrado', () => {
  it('capa, sumário, títulos, quadro e fluxo numerados, lista e assinatura', async () => {
    const r = await documentoDoClaude('cd1', MD);
    const t = await texto(r);
    expect(t).toContain('LAUDO TÉCNICO PERICIAL');
    expect(t).toContain('Caracterização de insalubridade');
    expect(t).toContain('SUMÁRIO');
    expect(t).toContain('1 IDENTIFICAÇÃO');
    expect(t).toContain('1.1 DADOS DO PROCESSO');
    expect(t).toContain('Parágrafo em duas linhas.');
    expect(t).toContain('Quadro 1 – Resultados por agente');
    expect(t).toContain('88,4 dB(A)');
    expect(t).toContain('Fonte: Medições do signatário.');
    expect(t).toContain('Figura 1 – Etapas da avaliação');
    expect(t).toContain('LISTA DE QUADROS');
    expect(t).toContain('item dois');
    expect(t).toContain('Perito Teste');
    expect(t).not.toContain('Título:');
    expect(r.nome).toMatch(/^Laudo_t/);
  });
  it('a instrução para o Claude traz as convenções de formato', async () => {
    const p = await exportarParaClaude('cd1', 'laudo');
    expect(p).toContain('"Quadro: título do quadro"');
    expect(p).toContain('Fluxo: título');
  });
});
