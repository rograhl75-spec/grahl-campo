import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';

describe('leitura de processo com laudo já protocolado', () => {
  it('traz diligência, postos, medições, respostas e fase sem duplicar', async () => {
    const { lerJsonIA, aplicarIA } = await import('../src/aiimport.js');
    const { createRecord, db: dbx } = await import('../src/db.js');
    const caso = await createRecord('caso', null, { fase: 'A preparar', papel: 'Perito do Juízo' });
    await dbx.records.update(caso.id, { caseId: caso.id });
    await createRecord('quesito', caso.id, { origem: 'Juízo', numero: '1', texto: 'Há exposição a ruído?' });
    const json = JSON.stringify({
      processo: { numero: '0001' }, quesitos: [{ origem: 'Juízo', numero: '1', texto: 'Há exposição a ruído?', resposta: 'Sim, Lavg 88,2 dB(A).' }],
      andamento: { fase: 'Aguardando manifestação / esclarecimentos', laudoRefPerito: 'mov. 64.1', laudoData: '2025-03-10', conclusaoLaudo: 'Insalubre em grau médio.' },
      diligencia: { vistoriaData: '2025-02-20', vistoriaInicio: '09:00', vistoriaPresentes: 'Fulano – técnico – reclamada' },
      postos: [{ nome: 'Prensa', agentes: 'Ruído', medicoes: [{ agente: 'ruído', lavg: '88,2', dose: '150', equipamento: 'Dosímetro X SN 1' }] }],
    });
    const d = lerJsonIA(json);
    expect(d.caso.fase).toBe('Aguardando manifestação / esclarecimentos');
    expect(d.postos[0].medicoes[0].agente).toBe('Ruído');
    let r = await aplicarIA(caso.id, d);
    expect(r.respostas).toBe(1); expect(r.quesitos).toBe(0); expect(r.postos).toBe(1); expect(r.medicoes).toBe(1);
    r = await aplicarIA(caso.id, d);
    expect(r.postos + r.medicoes + r.quesitos + r.respostas).toBe(0);
    const c = (await dbx.records.get(caso.id)).data;
    expect(c.fase).toBe('Aguardando manifestação / esclarecimentos');
    expect(c.vistoriaData).toBe('2025-02-20');
    const med = (await dbx.records.where('kind').equals('medicao').toArray()).find((m) => m.caseId === caso.id);
    expect(med.data.obs).toContain('Dosímetro X');
  });
});

describe('horários da diligência pelas medições e fotos', () => {
  it('usa o menor início e o maior término do dia e o GPS da foto', async () => {
    const { createRecord, db: dbx } = await import('../src/db.js');
    const { evidenciasDaDiligencia, aplicarEvidencias } = await import('../src/fotosLaudo.js');
    const caso = await createRecord('caso', null, { vistoriaInicio: '09:00' });
    await createRecord('medicao', caso.id, { agente: 'Ruído', dataMedicao: '2025-02-20', horaInicio: '08:40', horaFim: '14:55' });
    await createRecord('foto', caso.id, { tiradaEm: '2025-02-20T15:02:00', tiradaEmFonte: 'foto', gps: '-23.31, -51.16', gpsFonte: 'foto' });
    await createRecord('foto', caso.id, { tiradaEm: '2026-11-09T10:00:00', tiradaEmFonte: 'arquivo' });
    const ev = await evidenciasDaDiligencia(caso.id);
    expect([ev.data, ev.inicio, ev.fim, ev.fotos, ev.medicoes]).toEqual(['2025-02-20', '08:40', '15:02', 1, 1]);
    const m = await aplicarEvidencias(await dbx.records.get(caso.id), ev);
    expect(m).toEqual({ vistoriaData: '2025-02-20', vistoriaFim: '15:02', vistoriaGps: '-23.31, -51.16 (GPS das fotos)' });
  });
});
