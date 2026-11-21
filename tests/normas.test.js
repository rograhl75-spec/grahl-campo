import { describe, it, expect } from 'vitest';
import { avaliacaoPeloManual, cancerigenoAnexoIV, codigosNosDecretos, entradasNormas, buscarNormas } from '../src/normas.js';
import { tecnicaDoAgente, codigosDoAgente } from '../src/enquadramento.js';
import NORMAS from '../src/data/caracterizador/normas.json';

describe('bases do Caracterizador Pericial', () => {
  it('forma de avaliação pelos quadros do Manual do INSS (2018)', () => {
    expect(avaliacaoPeloManual('Ácido clorídrico').forma).toBe('Quantitativa');
    expect(avaliacaoPeloManual('Benzeno').forma).toBe('Qualitativa');
    expect(avaliacaoPeloManual('Mercúrio orgânico (metilmercúrio)').forma).toBe('Qualitativa');
    expect(avaliacaoPeloManual('Hipoclorito de sódio (irrigação)')).toBeNull(); // "cloro" só como palavra inteira
    expect(cancerigenoAnexoIV('Benzeno e seus compostos tóxicos')).not.toBeNull();
  });
  it('códigos dos decretos pelo nome do agente', () => {
    const m = codigosNosDecretos('Mercúrio (amálgama)');
    expect(m.ate97).toContain('1.2.8 do Dec. 53.831/64');
    expect(m.desde97).toBe('1.0.15 do Anexo IV');
    expect(codigosDoAgente({ data: { tipo: 'Químico', nome: 'Chumbo' } }).desde97).toBe('1.0.8 do Anexo IV');
    expect(codigosDoAgente({ data: { tipo: 'Químico', nome: 'Chumbo', codDesde97: 'digitado' } }).desde97).toBe('digitado');
  });
  it('técnica: o critério do signatário no código prevalece sobre o Manual', () => {
    expect(tecnicaDoAgente({ data: { tipo: 'Químico', nome: 'Ácido clorídrico' } }, false)).toBe('Quantitativa – NR-15, Anexo 11');
    expect(tecnicaDoAgente({ data: { tipo: 'Químico', nome: 'Hipoclorito', codDesde97: '1.0.9 – avaliação qualitativa (NR-15, Anexo 13)' } }, false)).toBe('Qualitativa – NR-15, Anexo 13');
  });
  it('consulta normativa: entradas e busca', () => {
    const e = entradasNormas(NORMAS);
    expect(e.length).toBeGreaterThan(500);
    expect(buscarNormas(e, 'odontológica').some((x) => /53\.831/.test(x.fonte))).toBe(true);
    expect(buscarNormas(e, 'art. 291', 'IN PRES/INSS 128/2022').length).toBeGreaterThan(0);
  });
});
