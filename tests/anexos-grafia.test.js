import { describe, it, expect } from 'vitest';
import { Doc, grafia } from '../src/docx/ooxml.js';

const corpo = (d) => d.xml();
const quebras = (x) => (x.match(/w:type="page"/g) || []).length;

describe('anexos e grafia', () => {
  it('páginas baixas de anexo vão duas por folha; páginas inteiras, uma por folha', () => {
    const baixa = { bytes: new Uint8Array(1), w: 842, h: 595 }; // CNIS: A4 em paisagem
    const inteira = { bytes: new Uint8Array(1), w: 1000, h: 1414 };
    const d1 = new Doc(); d1.paginasInteiras([baixa, baixa, baixa, baixa], { semLegenda: true });
    expect(quebras(corpo(d1))).toBe(1);
    const d2 = new Doc(); d2.paginasInteiras([inteira, inteira, baixa], { semLegenda: true });
    expect(quebras(corpo(d2))).toBe(2);
  });
  it('corrige grafias marcadas pelo Word em qualquer texto', () => {
    expect(grafia('contato cutâneo-mucoso; Cutâneo-mucosa')).toBe('contato cutaneomucoso; Cutaneomucosa');
    expect(grafia('Resinas (Bis-GMA, TEGDMA)')).toBe('Resinas (BIS-GMA, TEGDMA)');
    expect(grafia('no próprio consultório e também a pacientes')).toBe('no próprio consultório e a pacientes');
  });
});
