import { describe, it, expect } from 'vitest';
import { faseComVistoriaMarcada } from '../src/schema.js';

describe('fase muda sozinha com a vistoria marcada', () => {
  const hoje = '2026-11-25';
  it('data de hoje ou adiante, antes da diligência: Diligência agendada', () => {
    expect(faseComVistoriaMarcada({ dataDiligencia: '2026-12-10', fase: 'A preparar' }, hoje)).toBe('Diligência agendada');
    expect(faseComVistoriaMarcada({ dataDiligencia: '2026-11-25', fase: '' }, hoje)).toBe('Diligência agendada');
    expect(faseComVistoriaMarcada({ dataDiligencia: '2026-12-10', fase: 'Aguardando depósito dos honorários' }, hoje)).toBe('Diligência agendada');
  });
  it('não mexe em data passada, sem data ou fase já adiante', () => {
    expect(faseComVistoriaMarcada({ dataDiligencia: '2026-10-01', fase: 'A preparar' }, hoje)).toBe(null);
    expect(faseComVistoriaMarcada({ fase: 'A preparar' }, hoje)).toBe(null);
    expect(faseComVistoriaMarcada({ dataDiligencia: '2026-12-10', fase: 'Laudo / parecer em elaboração' }, hoje)).toBe(null);
    expect(faseComVistoriaMarcada({ dataDiligencia: '2026-12-10', fase: 'Diligência agendada' }, hoje)).toBe(null);
  });
});

describe('campos do posto conforme o caso', () => {
  it('placa e veículo só para motorista; via e periodicidade só no extrajudicial; preenchido aparece sempre', async () => {
    const { CAMPOS_POSTO, camposDoPosto } = await import('../src/schema.js');
    const ks = (o) => camposDoPosto(CAMPOS_POSTO, o).map(([k]) => k);
    expect(ks({ motorista: false, ltcat: false })).not.toEqual(expect.arrayContaining(['placa']));
    expect(ks({ motorista: false, ltcat: false })).not.toContain('veiculoAvaliado');
    expect(ks({ motorista: false, ltcat: false })).not.toContain('viaPeriodicidade');
    expect(ks({ motorista: true, ltcat: false })).toContain('placa');
    expect(ks({ motorista: false, ltcat: true })).toContain('viaPeriodicidade');
    expect(ks({ motorista: false, ltcat: false, dados: { placa: 'ABC1D23' } })).toContain('placa');
  });
});
