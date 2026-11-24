import { describe, it, expect } from 'vitest';
import { trechosPendentes } from '../src/pendencias.js';

describe('trechos de pendência da resposta', () => {
  it('lista só o que está entre [[ ]]', () => {
    expect(trechosPendentes('Sim. O NEN foi [[pendência: relatório de ruído]] e a VDVR [[ conferir\n certificado ]].'))
      .toEqual(['pendência: relatório de ruído', 'conferir certificado']);
    expect(trechosPendentes('Resposta completa.')).toEqual([]);
  });
});
