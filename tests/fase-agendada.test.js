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
