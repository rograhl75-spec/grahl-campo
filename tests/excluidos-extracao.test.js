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

describe('medições lidas dos relatórios', () => {
  it('cada medição fica ligada ao equipamento (pela série ou pelo padrão do agente)', async () => {
    await db.records.put({ id: 'cm', kind: 'caso', caseId: null, ts: {}, data: { papel: 'Perito do Juízo' } });
    await db.records.put({ id: 'eqd', kind: 'equip', caseId: null, ts: {}, data: { nome: 'Dosímetro de ruído', modelo: 'DoseMax V2', serie: 'SN111' } });
    await db.records.put({ id: 'eqv', kind: 'equip', caseId: null, ts: {}, data: { nome: 'Medidor de vibração', modelo: 'AxPro', serie: 'SN222' } });
    const dados = lerJsonIA(JSON.stringify({ postos: [{ nome: 'Motorista – carreta', medicoes: [
      { agente: 'Ruído', lavg: '86.1', equipamento: 'DoseMax V2 SN111' },
      { agente: 'Vibração de corpo inteiro (VCI)', aren: '0.9', vdv: '15.2' },
    ] }] }));
    await aplicarIA('cm', dados, { criarPeriodos: false });
    const meds = (await db.records.where('[caseId+kind]').equals(['cm', 'medicao']).toArray()).filter((x) => !x.deleted);
    expect(meds.find((m) => m.data.agente === 'Ruído').data.equipamentoId).toBe('eqd');
    expect(meds.find((m) => /Vibra/.test(m.data.agente)).data.equipamentoId).toBe('eqv');
  });
  it('critérios para o Claude: calibração até 24 meses, aferição só se registrada, veículo só da entrevista', () => {
    const p = montarPrompt('perito-prev', {}, {});
    expect(p).toContain('até 24 meses');
    expect(p).toContain('sem registro, não mencione');
    expect(p).toContain('não confirmados na entrevista');
  });
});

describe('nova leitura dos relatórios atualiza a medição, sem duplicar', () => {
  it('mesma medição (agente e horário de início): completa o VDVR e corrige o AREN', async () => {
    await db.records.put({ id: 'cu', kind: 'caso', caseId: null, ts: {}, data: { papel: 'Perito do Juízo' } });
    const ler = (med) => lerJsonIA(JSON.stringify({ postos: [{ nome: 'Motorista – carreta', medicoes: [med] }] }));
    await aplicarIA('cu', ler({ agente: 'Vibração de corpo inteiro (VCI)', aren: '1.20', horaInicio: '11:35:03', dataMedicao: '2026-09-29' }), { criarPeriodos: false, atualizarMedicoes: true });
    const r = await aplicarIA('cu', ler({ agente: 'Vibração de corpo inteiro (VCI)', aren: '1.07', vdv: '15.74', horaInicio: '11:35', dataMedicao: '2026-09-29' }), { criarPeriodos: false, atualizarMedicoes: true });
    const meds = (await db.records.where('[caseId+kind]').equals(['cu', 'medicao']).toArray()).filter((x) => !x.deleted);
    expect(meds).toHaveLength(1);
    expect(r.medicoesAtualizadas).toBe(1);
    expect(meds[0].data.aren).toBe('1.07');
    expect(meds[0].data.vdv).toBe('15.74');
  });
});
