import { describe, it, expect } from 'vitest';
import { citacaoDe, veiculoParaDados, dadosParaVeiculo } from '../src/paradigmas.js';

describe('paradigma extrajudicial (LGPD)', () => {
  it('a citação nunca leva nomes; o cliente fica só no banco', () => {
    const d = veiculoParaDados({ id: 'M70', identificacao: { marca: 'Volvo', modelo: 'FH 540' }, fonte: { tipo: 'Extrajudicial', data: '11/07/2022', cliente: 'Fulano de Tal – Transportes X', citacao: 'Medição para Fulano de Tal' } });
    expect(d.clienteOrigem).toBe('Fulano de Tal – Transportes X');
    expect(citacaoDe({ data: { ...d, citacao: 'Medição para Fulano de Tal' } })).toBe('Medição extrajudicial – 11/07/2022');
    expect(dadosParaVeiculo(d).fonte.cliente).toBe('Fulano de Tal – Transportes X'); // exporta para o usuário saber a origem
  });
  it('judicial continua citando processo e vara', () => {
    expect(citacaoDe({ data: { fonteTipo: 'Judicial', processo: '5000317-98.2015.4.04.7028', vara: 'Vara Federal de Telêmaco Borba/PR', dataMedicao: '21/11/2025' } }))
      .toBe('Proc. 5000317-98.2015.4.04.7028 – Vara Federal de Telêmaco Borba/PR – 21/11/2025');
  });
});
