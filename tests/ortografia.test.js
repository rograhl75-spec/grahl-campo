import { describe, it, expect } from 'vitest';
import { acentuar, semInstrucoes, revisarCampo } from '../src/ortografia.js';

describe('revisão do texto digitado', () => {
  it('acentos, maiúsculas preservadas e terminações', () => {
    expect(acentuar('bau refrigerado; Bau carga seca; BAU')).toBe('baú refrigerado; Baú carga seca; BAÚ');
    expect(acentuar('textos de periodos anteriores, nao havia caçamba')).toBe('textos de períodos anteriores, não havia caçamba');
    expect(acentuar('distribuicao e conducao, condicoes ruins')).toBe('distribuição e condução, condições ruins');
    expect(acentuar('Faxinal, Calore, Pitanga')).toBe('Faxinal, Kaloré, Pitanga');
  });
  it('crase nos horários e concordância', () => {
    expect(acentuar('05h00 as 20h00')).toBe('05h00 às 20h00');
    expect(acentuar('das 5 as 18 horas')).toBe('das 5 às 18 horas');
    expect(acentuar('além dos anterior, Curitiba')).toBe('além dos anteriores, Curitiba');
    expect(acentuar('as cargas')).toBe('as cargas');
  });
  it('linhas de instrução não vão para o documento; campos de horas e nomes ficam como estão', () => {
    expect(semInstrucoes('6 h seguidas sem pausa\nadotar os textos de penosidade de periodos anteriores')).toBe('6 h seguidas sem pausa');
    expect(revisarCampo('pausas', 'utilizar sempre 10 horas de condução e 5 horas de carga e descarga')).toBe('');
    expect(revisarCampo('conducaoH', 'utilizar sempre 10 horas')).toBe('utilizar sempre 10 horas');
    expect(revisarCampo('empresa', 'CLOPAN PRESTADORA DE SERVICOS LTDA')).toBe('CLOPAN PRESTADORA DE SERVIÇOS LTDA');
    expect(revisarCampo('empresa', 'G GONCALVES DE SOUZA DOCES - PANIFICACAO')).toBe('G GONÇALVES DE SOUZA DOCES - PANIFICAÇÃO');
    expect(revisarCampo('autorNome', 'JOAO DA SILVA')).toBe('JOAO DA SILVA');
  });
  it('vínculo que pede para adotar o anterior herda os campos de penosidade e soma o trajeto', async () => {
    const { herdarDoAnterior } = await import('../src/heranca.js');
    const r = herdarDoAnterior([
      { id: 1, data: { vias: 'Cambé, Maringá', tipoCarga: 'farinha', penosidadeResultado: 'Sim – caracteriza', pausas: '6 h seguidas' } },
      { id: 2, data: { vias: 'além dos anteriores, Curitiba', pausas: 'utilizar sempre 10 horas de condução\nadotar os textos de penosidade de periodos anteriores' } },
      { id: 3, data: { vias: 'Londrina', cabine: 'considerando o vínculo anterior, cabine sem ar' } },
    ]);
    expect(r[1].data).toMatchObject({ vias: 'Cambé, Maringá; Curitiba', tipoCarga: 'farinha', penosidadeResultado: 'Sim – caracteriza', pausas: '6 h seguidas' });
    expect(r[2].data.tipoCarga).toBeUndefined(); // texto narrativo não é pedido de herança
  });
});
