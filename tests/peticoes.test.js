import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { db } from '../src/db.js';
import { peticaoAceiteArbitrados } from '../src/docx/modelos.js';
import { PERFIL_ID } from '../src/docx/base.js';

// Dados sintéticos (nunca usar dados reais de processos nos testes do repositório)
const CASO = 'caso-aceite-teste';

beforeAll(async () => {
  globalThis.fetch = async (url) => {
    const nome = String(url).split('/').pop();
    const buf = await readFile(new URL(`../public/modelos/${nome}`, import.meta.url));
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  await db.records.put({ id: PERFIL_ID, kind: 'perfil', caseId: null, data: { conta1Rotulo: 'Conta A', conta1: 'Banco X – Ag. 1 – CC 2' }, ts: {} });
  await db.records.put({
    id: CASO, kind: 'caso', caseId: null, ts: {},
    data: {
      papel: 'Perito do Juízo', justica: 'Justiça Estadual – Vara da Fazenda Pública', numero: '0000000-00.2026.8.16.0000',
      juizo: 'Juizado Especial da Fazenda Pública de Cidade A', autorNome: 'Autor Teste', reuNome: 'Município Teste',
      despachoRef: 'decisão de mov. 41.1', honorariosItem: '7, a', honorariosFixados: '2.700,00',
      honorariosDepositante: 'o Município Teste', itemDeposito: '7, b', itemAceite: '7, c', itemAlvara: '7, d',
      limiteTabelaPublico: 'Sim', itemDataPericia: '7, g', antecedenciaDias: '10',
    },
  });
});

async function textoDoDocx(blob) {
  const buf = blob.arrayBuffer ? await blob.arrayBuffer() : blob;
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');
  return xml.replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
}

describe('aceite dos honorários arbitrados', () => {
  it('aceita o valor, divide adiantamento e saldo, indica a conta e a antecedência da data', async () => {
    const r = await peticaoAceiteArbitrados(CASO, { conta: 'conta1' });
    const t = await textoDoDocx(r.blob);
    expect(r.nome).toMatch(/^Peticao_aceite_honorarios_arbitrados_/);
    expect(t).toContain('R$ 2.700,00 (dois mil e setecentos reais)');
    expect(t).toContain('R$ 1.350,00 (mil trezentos e cinquenta reais)');
    expect(t).toContain('o saldo de R$ 1.350,00');
    expect(t).toContain('50% dos honorários');
    expect(t).toContain('pelo Município Teste');
    expect(t).toContain('no item 7, c');
    expect(t).toContain('limite da tabela');
    expect(t).toContain('Banco X – Ag. 1 – CC 2');
    expect(t).toContain('10 (dez) dias úteis');
    expect(t).toContain('conforme o item 7, g');
  });
});
