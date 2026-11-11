import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { db, createRecord } from '../src/db.js';
import { mergeRecords } from '../src/merge.js';
import { adicionarParadigmas, resolverCodigosDuplicados, referenciasARevisar } from '../src/paradigmas.js';
import { exportarBackup, importarBackup } from '../src/backup.js';

describe('códigos de paradigma gerados em dois aparelhos sem internet', () => {
  it('ids diferentes: a sincronização não funde os dois veículos', async () => {
    await db.records.clear();
    const [c1] = await adicionarParadigmas([{ identificacao: { marca: 'Alfa', modelo: 'A1' }, resultados: { lavg_q5: 88 } }]);
    const a = (await db.records.where('kind').equals('paradigma').toArray())[0];
    // simula o outro aparelho: mesmo código, outro veículo, criado depois
    const b = { ...a, id: 'par-outro-aparelho', createdAt: a.createdAt + 1000, data: { ...a.data, marca: 'Beta', modelo: 'B2', lavg: '91' } };
    expect(b.id).not.toBe(a.id);
    await db.records.put(b);
    await createRecord('periodo', 'caso1', { empresa: 'Transp. X', paradigmaRuido: c1 });

    const ren = await resolverCodigosDuplicados();
    expect(ren).toHaveLength(1);
    expect(ren[0].id).toBe('par-outro-aparelho'); // o mais novo é renumerado
    const [ra, rb] = [await db.records.get(a.id), await db.records.get(b.id)];
    expect(ra.data.codigo).toBe(c1);
    expect(rb.data.codigo).not.toBe(c1);
    expect(rb.data.codigoAnterior).toBe(c1);
    expect(rb.data.marca).toBe('Beta');
    const refs = await referenciasARevisar();
    expect(refs.map((x) => x.ref.data.empresa)).toEqual(['Transp. X']);
    // idempotente
    expect(await resolverCodigosDuplicados()).toHaveLength(0);
  });
  it('mesclagem converge no empate de relógio', () => {
    const r1 = { id: 'x', kind: 'k', data: { v: 'A' }, ts: { v: 5 } };
    const r2 = { id: 'x', kind: 'k', data: { v: 'B' }, ts: { v: 5 } };
    expect(mergeRecords(r1, r2).data.v).toBe(mergeRecords(r2, r1).data.v);
  });
});

describe('backup com anexos', () => {
  it('exporta e restaura PDFs, inclusive os que ficam só no aparelho', async () => {
    await db.records.clear(); await db.blobs.clear();
    // no navegador é um Blob; o IndexedDB simulado do Node não clona Blob, então o teste usa bytes
    const pdf = new TextEncoder().encode('%PDF-1.4 teste');
    const a1 = await createRecord('anexo', null, { nome: 'laudo antigo.pdf', mime: 'application/pdf', tamanho: pdf.length });
    const a2 = await createRecord('anexo', null, { nome: 'autos', mime: 'application/pdf', tamanho: pdf.length, soLocal: true });
    await db.blobs.put({ id: a1.id, blob: pdf, uploaded: 1, mime: 'application/pdf' });
    await db.blobs.put({ id: a2.id, blob: pdf, uploaded: 2, mime: 'application/pdf' });
    const r = await exportarBackup();
    expect(r.anexos).toBe(2);
    expect(r.anexosSoLocal).toBe(1);
    const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
    expect(await zip.file(`anexos/${a1.id}.pdf`).async('string')).toBe('%PDF-1.4 teste');
    expect(zip.file(`anexos/${a2.id}.pdf`)).toBeTruthy();
    expect(await zip.file('LEIA-ME.txt').async('string')).toMatch(/única cópia/);

    await db.blobs.clear();
    const rr = await importarBackup(await r.blob.arrayBuffer());
    expect(rr.anexos).toBe(2);
    const b1 = await db.blobs.get(a1.id), b2 = await db.blobs.get(a2.id);
    expect(b1.mime).toBe('application/pdf');
    expect(b1.uploaded).toBe(0); // volta a subir para a nuvem
    expect(b2.uploaded).toBe(2); // continua só no aparelho
  });
});

describe('recuperação do registro de digitação', () => {
  it('grava com o horário da digitação e não vence edição mais nova da nuvem', async () => {
    const { walGravar, walRecuperar } = await import('../src/wal.js');
    const store = {};
    const api = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    // Object.keys(localStorage) lista as chaves gravadas, como no navegador
    globalThis.localStorage = new Proxy(api, { ownKeys: () => Object.keys(store), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
    const rec = await createRecord('caso', null, { sintese: 'antes' });
    await new Promise((r) => setTimeout(r, 5));
    const t0 = Date.now();
    walGravar(rec.id, 'sintese', 'digitado no tablet');
    expect(await walRecuperar()).toBe(1);
    const local = await db.records.get(rec.id);
    expect(local.data.sintese).toBe('digitado no tablet');
    expect(local.ts.sintese).toBeLessThanOrEqual(Date.now());
    expect(local.ts.sintese).toBeGreaterThanOrEqual(t0);
    // edição feita depois no PC chega pela nuvem e prevalece
    const remoto = { ...local, data: { ...local.data, sintese: 'editado no PC' }, ts: { ...local.ts, sintese: local.ts.sintese + 60000 } };
    expect(mergeRecords(local, remoto).data.sintese).toBe('editado no PC');
  });
});

describe('ruído com q = 3 (NHO-01)', async () => {
  const { nen, lavgDaDose, doseJornada, fatorQ } = await import('../src/calc.js');
  const { calculados } = await import('../src/medicoes.js');
  it('NEN e nível pela dose com k = 10', () => {
    expect(nen('88', '4h', 3)).toBeCloseTo(88 + 10 * Math.log10(0.5), 6);
    expect(nen('88', '4h')).toBeCloseTo(88 + 16.61 * Math.log10(0.5), 6);
    expect(lavgDaDose('100', '8h', 3)).toBeCloseTo(85, 6);
    expect(lavgDaDose('200', '8h', 3)).toBeCloseTo(88.01, 2);
    expect(fatorQ({ data: { q: '3 (NHO-01)' } })).toBe(3);
    expect(fatorQ({ data: {} })).toBe(5);
    expect(doseJornada('70', '4h', '8h')).toBeCloseTo(140, 6);
  });
  it('trabalhista com q = 3 pede nova leitura com q = 5', () => {
    const c = calculados({ agente: 'Ruído', q: '3 (NHO-01)', dose: '80', lavg: '86', jornada: '8h', tempoAmostragem: '8h' }, { prev: false });
    expect(c.find((x) => /NR-15/.test(x[0]))[1]).toMatch(/q = 5/);
  });
  it('previdenciário: q = 3 não serve antes de 19/11/2003', async () => {
    const { avaliarPeriodos } = await import('../src/docx/conclusao.js');
    const dados = { periodos: [{ id: 'p', data: { empresa: 'Usina Ômega', inicio: '2002-01-01', fim: '2004-12-31' } }],
      postos: [{ id: 'x1', data: { nome: 'Caldeira – Usina Ômega' } }], paradigmas: new Map(), epis: [], c: {}, perfil: {},
      medicoes: [{ data: { agente: 'Ruído', q: '3 (NHO-01)', lavg: '88', jornada: '8h', postoId: 'x1' } }] };
    const [a] = avaliarPeriodos(dados);
    const antes = a.segs.find((s) => s.fim === '2003-11-18');
    const depois = a.segs.find((s) => s.ini === '2003-11-19');
    expect(antes.itens[0].t).toMatch(/q = 5/);
    expect(antes.caracteriza).not.toBe('SIM');
    expect(depois.itens[0].t).toMatch(/NEN \(q = 3, NHO-01\) 88,0/);
    expect(depois.caracteriza).toBe('SIM');
  });
});
