import { describe, it, expect } from 'vitest';
import { excluirTomCalibracao, suspeitaTomCalibracao } from '../src/medicoes.js';
import { lerJsonIA } from '../src/aiimport.js';

// Dados sintéticos: 54 intervalos de 15 s; o 1º tem o tom de 114 dB do calibrador.
const L = [107.66, 77.73, 78.22, 83.73, 85.32, 86.23, 87.91, 86.27, 95.92, 89.49, 92.85, 89.12, 87.46, 89.88, 90.69, 93.83, 88.73, 96.00, 90.61, 88.51, 90.17, 95.50, 94.74, 90.44, 94.02, 89.94, 88.31, 87.29, 78.88, 88.90, 90.54, 92.47, 93.27, 92.44, 93.15, 92.38, 93.27, 96.15, 97.65, 95.08, 92.81, 91.13, 89.75, 88.18, 87.92, 87.12, 90.17, 93.71, 90.35, 88.80, 88.82, 87.90, 90.74, 92.34];
const ints = L.map((l, i) => [l, i === 0 ? 114.01 : i === 8 ? 104.79 : l + 4]);
const med = { agente: 'Ruído', intervalos: ints, tempoAmostragem: '00:13:30', jornada: '6h00', dose: '7.50', lavg: '92.08', nen: '90.00', lmax: '114.01', calibInicial: '114.00', calibFinal: '114.03', q: '5 (NR-15, Anexo 1)' };

describe('tom do calibrador dentro da dosimetria', () => {
  it('tira o intervalo do tom e refaz Lavg, NEN, dose, Lmax e tempo', () => {
    const r = excluirTomCalibracao(med);
    expect(r.campos).toMatchObject({ lavg: '91.08', nen: '89.00', dose: '6.41', lmax: '104.79', tempoAmostragem: '00:13:15', tomCalibracao: '1º intervalo' });
    expect(r.campos.obs).toMatch(/Lavg 92,1 dB\(A\); NEN 90,0/);
    expect(r.aviso).toMatch(/excluído do cálculo: Lavg 91,1 dB\(A\), NEN 89,0/);
  });
  it('não mexe quando o 1º intervalo é ruído do trabalho', () => {
    expect(excluirTomCalibracao({ ...med, intervalos: ints.slice(1) })).toBeNull();
  });
  it('tom no fim do registro também sai', () => {
    const r = excluirTomCalibracao({ ...med, intervalos: [...ints.slice(1), [108.2, 114.02]], tempoAmostragem: '00:13:30' });
    expect(r.campos.tomCalibracao).toBe('último intervalo');
  });
  it('a leitura do Claude aplica a regra e devolve o aviso', () => {
    const d = lerJsonIA(JSON.stringify({ postos: [{ nome: 'Torno', medicoes: [{ ...med, lavg: '92.08' }] }] }));
    expect(d.postos[0].medicoes[0].lavg).toBe('91.08');
    expect(d.alertasCalibracao.length).toBe(1);
  });
  it('medição gravada com Lmax igual ao calibrador vira aviso', () => {
    expect(suspeitaTomCalibracao({ agente: 'Ruído', lmax: '114.01', calibInicial: '114.00' })).toBe(true);
    expect(suspeitaTomCalibracao({ agente: 'Ruído', lmax: '104.79', calibInicial: '114.00' })).toBe(false);
    expect(suspeitaTomCalibracao({ agente: 'Ruído', lmax: '114.0', tomCalibracao: '1º intervalo' })).toBe(false);
  });
});
