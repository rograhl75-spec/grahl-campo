import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { db, createRecord, softDelete } from '../src/db.js';
import { aplicarIA, lerJsonIA, montarPrompt } from '../src/aiimport.js';

// Dados sintéticos.
describe('nova extração dos autos não recria o que foi excluído', () => {
  it('vínculo excluído (fora do despacho) não volta; os demais são completados', async () => {
    await db.records.put({ id: 'cx', kind: 'caso', caseId: null, ts: {}, data: { papel: 'Perito do Juízo' } });
    const a = await createRecord('periodo', 'cx', { empresa: 'Transportes Alfa', inicio: '2000-01-01', fim: '2004-12-31' });
    const b = await createRecord('periodo', 'cx', { empresa: 'Transportes Beta', inicio: '2012-09-01', fim: '2013-11-30' });
    await softDelete(b.id);
    const dados = lerJsonIA(JSON.stringify({ periodos: [
      { empresa: 'Transportes Alfa', inicio: '2000-01-01', fim: '2004-12-31', cargo: 'Motorista' },
      { empresa: 'Transportes Beta Ltda', inicio: '2012-09-01', fim: '2013-11-30', cargo: 'Motorista' },
    ] }));
    const r = await aplicarIA('cx', dados);
    expect(r.periodos).toBe(0);
    expect(r.ignorados).toBe(1);
    const ativos = (await db.records.where('[caseId+kind]').equals(['cx', 'periodo']).toArray()).filter((x) => !x.deleted);
    expect(ativos).toHaveLength(1);
    expect(ativos[0].data.cargo).toBe('Motorista');
    expect(ativos[0].id).toBe(a.id);
  });
  it('a instrução manda listar só os vínculos delimitados pelo despacho', () => {
    expect(montarPrompt('perito-prev', {}, {})).toContain('VÍNCULOS OBJETO DA PERÍCIA');
  });
});
