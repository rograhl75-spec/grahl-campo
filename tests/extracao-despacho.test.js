import { describe, it, expect } from 'vitest';
import { lerJsonIA } from '../src/aiimport.js';

// Dados sintéticos.
describe('extração dos autos: classe, despacho e prazos', () => {
  it('lê a classe, os itens do despacho e converte as datas dd/mm/aaaa', () => {
    const r = lerJsonIA(JSON.stringify({
      processo: { classe: 'Procedimento Comum', numero: '5000000-00.2024.4.04.0000' },
      despacho: { honorariosFixados: 'R$ 1.000,00', itemDeposito: '7, b', itemAceite: '7, c', prazoLaudoDias: '30', prazoLaudo: '15/03/2027', prazoManifestacao: '2027-04-01', prazoEsclarecimentos: 'em 15 dias' },
      partes: { autorNascimento: '16/1/1962' },
    }));
    expect(r.caso.classe).toBe('Procedimento Comum');
    expect(r.caso.itemDeposito).toBe('7, b');
    expect(r.caso.itemAceite).toBe('7, c');
    expect(r.caso.prazoLaudoDias).toBe('30');
    expect(r.caso.prazoLaudo).toBe('2027-03-15');
    expect(r.caso.prazoManifestacao).toBe('2027-04-01');
    expect(r.caso.prazoEsclarecimentos).toBeUndefined(); // texto que não é data não entra no campo de data
    expect(r.caso.autorNascimento).toBe('1962-01-16');
  });
});
