import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { db } from '../src/db.js';
import { peticaoAgendamento } from '../src/docx/modelos.js';

// Dados sintéticos (nunca usar dados reais de processos nos testes do repositório)
const CASO_PF = 'caso-agenda-pf';
const CASO_PJ = 'caso-agenda-pj';
const base = {
  papel: 'Perito do Juízo', justica: 'Justiça Federal', numero: '0000000-00.2026.4.04.0000', juizo: 'Vara Federal Teste',
  autorNome: 'Autor Teste', reuNome: 'Instituto Nacional do Seguro Social – INSS', similaridade: 'Sim',
  empresaOriginal: 'Empregadora Original Ltda.', dataDiligencia: '2099-01-26', horaDiligencia: '11:00',
  vistoriaEndereco: 'Rua Teste, 100, Bairro Teste, Cidade/UF',
};

beforeAll(async () => {
  globalThis.fetch = async (url) => {
    const nome = String(url).split('/').pop();
    const buf = await readFile(new URL(`../public/modelos/${nome}`, import.meta.url));
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  await db.records.put({ id: CASO_PF, kind: 'caso', caseId: null, ts: {},
    data: { ...base, vistoriaLocal: 'Veículo paradigma de pessoa física (texto antigo)', despachoRef: 'Ev107 DESPADEC1 (2025-10-24) – quesitos; Ev194 DESPADEC1 – veículo indicado no Ev192', vistoriaProprietario: 'Fulano de Tal da Silva', vistoriaVeiculo: 'Marca X Modelo Y, ano 1999', vistoriaContato: '(00) 90000-0000' } });
  await db.records.put({ id: CASO_PJ, kind: 'caso', caseId: null, ts: {}, data: { ...base, vistoriaLocal: 'Empresa Paradigma Ltda.' } });
});

async function texto(r) {
  const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
  return (await zip.file('word/document.xml').async('string')).replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
}

describe('agendamento – vistoria em bem de pessoa física', () => {
  it('traz o nome completo do proprietário e pedidos próprios do veículo', async () => {
    const t = await texto(await peticaoAgendamento(CASO_PF));
    expect(t).toContain('FULANO DE TAL DA SILVA (pessoa física, proprietário do veículo paradigma Marca X Modelo Y, ano 1999)');
    expect(t).toContain('no endereço de seu proprietário');
    expect(t).toContain('ofício ao(à) Sr.(a) Fulano de Tal da Silva');
    expect(t).toContain('(00) 90000-0000');
    expect(t).toContain('condutor habilitado');
    expect(t).not.toContain('empresa paradigma');
    expect(t).not.toContain('processo produtivo');
    expect(t).not.toContain('LTCAT');
    expect(t).not.toContain('texto antigo');
    expect(t).toContain('às decisões dos eventos 107 e 194,');
  });
  it('com empresa, mantém o texto de empresa paradigma', async () => {
    const t = await texto(await peticaoAgendamento(CASO_PJ));
    expect(t).toContain('nas dependências da empresa paradigma');
    expect(t).toContain('EMPRESA PARADIGMA LTDA.');
    expect(t).toContain('processo produtivo');
  });
});
