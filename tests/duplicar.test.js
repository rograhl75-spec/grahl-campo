import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { db, createRecord } from '../src/db.js';
import { duplicarCaso } from '../src/duplicar.js';

// Dados sintéticos.
describe('duplicar o caso para outro segurado', () => {
  it('copia os registros e os arquivos, refaz as referências e limpa os dados pessoais', async () => {
    const c = await createRecord('caso', null, { tipoAtuacao: 'Extrajudicial', autorNome: 'Segurado A', autorCpf: '000', pppNit: '111', reuNome: 'Empresa X', gerado_ltcat: 'x' });
    const posto = await createRecord('posto', c.id, { nome: 'Retífica' });
    const med = await createRecord('medicao', c.id, { agente: 'Ruído', postoId: posto.id, lavg: '95,3' });
    const foto = await createRecord('foto', c.id, { legenda: 'Máquina', postoId: posto.id });
    await db.blobs.put({ id: foto.id, blob: new Blob(['x']), uploaded: 1 });
    await createRecord('redacao', c.id, { md: '# 1 Texto', doc: 'ltcat' });
    const r = await duplicarCaso(c.id, { nome: 'Segurado B' });
    const novo = await db.records.get(r.id);
    expect(novo.data.autorNome).toBe('Segurado B');
    expect(novo.data.autorCpf).toBeUndefined();
    expect(novo.data.pppNit).toBeUndefined();
    expect(novo.data.gerado_ltcat).toBeUndefined();
    expect(novo.data.reuNome).toBe('Empresa X');
    const filhos = await db.records.where('caseId').equals(r.id).toArray();
    expect(filhos.map((x) => x.kind).sort()).toEqual(['foto', 'medicao', 'posto', 'redacao']);
    const p2 = filhos.find((x) => x.kind === 'posto');
    expect(filhos.find((x) => x.kind === 'medicao').data.postoId).toBe(p2.id);
    const f2 = filhos.find((x) => x.kind === 'foto');
    expect(f2.data.postoId).toBe(p2.id);
    expect((await db.blobs.get(f2.id)).uploaded).toBe(0);
    void med;
  });
});
