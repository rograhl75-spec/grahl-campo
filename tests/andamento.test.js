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

describe('dados repetidos por extrações seguidas', () => {
  it('documentos ignoram repetidos e a limpeza os move para a lixeira', async () => {
    const { createRecord } = await import('../src/db.js');
    const { carregar, postosDoPeriodo } = await import('../src/docx/base.js');
    const { limparDuplicados } = await import('../src/aiimport.js');
    const caso = await createRecord('caso', null, { materia: 'Previdenciária' });
    const per = { empresa: 'Transproença Transportes Ltda', inicio: '2003-09-01', fim: '2008-04-15', cargo: 'Motorista' };
    await createRecord('periodo', caso.id, per);
    await createRecord('periodo', caso.id, { ...per, atividades: 'cargas secas' });
    await createRecord('periodo', caso.id, { empresa: 'Costa Teixeira Ltda', inicio: '1999-11-04', fim: '2000-01-20' });
    const p1 = await createRecord('posto', caso.id, { nome: 'Scania 113 – paradigma Transproença', infoTrabalhador: 'Pernoite no veículo.' });
    const p2 = await createRecord('posto', caso.id, { nome: 'Scania 113 H – paradigma Transproença', descricao: 'sem ar-condicionado' });
    await createRecord('posto', caso.id, { nome: 'Volvo NH 380 – paradigma Costa Teixeira' });
    await createRecord('medicao', caso.id, { agente: 'Ruído', lavg: '87,05', postoId: p1.id, dataMedicao: '2025-11-21', horaInicio: '10:55' });
    await createRecord('medicao', caso.id, { agente: 'Ruído', lavg: '87,05', postoId: p2.id, dataMedicao: '2025-11-21', horaInicio: '10:55' });
    const d = await carregar(caso.id);
    expect(d.periodos.length).toBe(2);
    expect(d.periodos[0].data.empresa).toMatch(/Costa/); // ordem cronológica
    expect(d.periodos[1].data.atividades).toBe('cargas secas'); // completou com o repetido
    expect(d.medicoes.length).toBe(1);
    const scania = d.postos.filter((p) => /Scania/.test(p.data.nome));
    expect(scania.length).toBe(1);
    expect(scania[0].data.infoTrabalhador).toBe('Pernoite no veículo.'); // dados do repetido aproveitados
    expect(d.postos[0].data.nome).toMatch(/Volvo/); // posto do vínculo mais antigo primeiro
    expect(postosDoPeriodo(d.periodos[1], d).map((p) => p.id)).toEqual([scania[0].id]);
    expect(await limparDuplicados(caso.id)).toEqual({ periodos: 1, medicoes: 1, postos: 1 });
    await limparDuplicados(caso.id, { aplicar: true });
    expect(await limparDuplicados(caso.id)).toEqual({ periodos: 0, medicoes: 0, postos: 0 });
  });
});

describe('conclusão previdenciária calculada', () => {
  it('divide o vínculo pelos marcos e conclui por ruído e VCI', async () => {
    const { avaliarPeriodos } = await import('../src/docx/conclusao.js');
    const per = { id: 'p1', data: { empresa: 'Transproença Ltda', inicio: '2003-09-01', fim: '2008-04-15', cargo: 'Motorista', conducaoH: '15' } };
    const posto = { id: 'x1', data: { nome: 'Scania 113 – paradigma Transproença' } };
    const dados = { c: {}, perfil: {}, epis: [], periodos: [per], postos: [posto], paradigmas: new Map(),
      medicoes: [{ data: { agente: 'Ruído', lavg: '87,05', postoId: 'x1' } }, { data: { agente: 'Vibração de corpo inteiro (VCI)', aren: '1,26', vdv: '16,54', postoId: 'x1' } }] };
    const [a] = avaliarPeriodos(dados);
    expect(a.segs.map((s) => [s.ini, s.fim, s.caracteriza])).toEqual([['2003-09-01', '2003-11-18', 'SIM'], ['2003-11-19', '2008-04-15', 'SIM']]);
    expect(a.segs[0].itens[0].t).toMatch(/Lavg 87,0 dB\(A\) ≤ 90/); // até 18/11/2003 o ruído não supera
    expect(a.segs[1].itens[0].t).toMatch(/NEN 91,6 dB\(A\) > 85/); // depois, NEN para 15 h supera
    expect(a.segs[0].itens[1].t).toMatch(/acima da fronteira superior/);
  });
});
