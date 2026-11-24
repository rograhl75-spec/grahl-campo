import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { db } from '../src/db.js';
import { PERFIL_ID } from '../src/docx/base.js';
import { peticaoDoClaude } from '../src/docx/claudeDoc.js';
import { promptPeticaoLivre } from '../src/aiimport.js';

// Dados sintéticos.
async function texto(r) {
  const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
  return (await zip.file('word/document.xml').async('string')).replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
}
beforeAll(async () => {
  globalThis.fetch = async (url) => {
    const buf = await readFile(new URL(`../public/modelos/${String(url).split('/').pop()}`, import.meta.url));
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  await db.records.put({ id: PERFIL_ID, kind: 'perfil', caseId: null, data: { nome: 'Perito Teste', cidade: 'Cidade A' }, ts: {} });
  await db.records.put({ id: 'pl', kind: 'caso', caseId: null, ts: {}, data: { papel: 'Perito do Juízo', justica: 'Justiça Federal', materia: 'Previdenciária', numero: '5000000-00.2024.4.04.0000', juizo: '1ª Vara Federal de Cidade A', autorNome: 'Segurado Teste', reuNome: 'INSS' } });
});

describe('outra petição, redigida pelo Claude', () => {
  it('instrução: com pedido descrito ou, em branco, pela última determinação do despacho; sem fecho e assinatura', async () => {
    const com = await promptPeticaoLivre('pl', 'pedir a juntada do certificado de calibração');
    expect(com).toContain('pedir a juntada do certificado de calibração');
    expect(com).toContain('NÃO escreva endereçamento');
    const sem = await promptPeticaoLivre('pl', '');
    expect(sem).toContain('determinação mais recente dirigida a mim');
    expect(sem).toContain('Segurado Teste');
  });
  it('Word no padrão das petições: endereçamento, processo, corpo, um só fecho e assinatura', async () => {
    const md = 'Título: PETIÇÃO – Juntada de documento\n\nPerito Teste, perito judicial nomeado nos autos em epígrafe, vem, respeitosamente, requerer a juntada.\n\n# 1. Do pedido\n\na) a juntada do certificado.\n\nNestes termos,\npede deferimento.\n\nCidade A, 1º de dezembro de 2026.';
    const r = await peticaoDoClaude('pl', md);
    expect(r.nome).toMatch(/^Peticao_/);
    const t = await texto(r);
    expect(t).toContain('5000000-00.2024.4.04.0000');
    expect(t).toContain('requerer a juntada');
    expect(t.match(/Nestes termos/g)).toHaveLength(1);
    expect(t).toContain('Perito Judicial');
    expect(t).not.toContain('SUMÁRIO');
  });
});
