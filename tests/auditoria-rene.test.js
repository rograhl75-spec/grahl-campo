import { describe, it, expect } from 'vitest';
import { tituloApendice, tituloSugerido } from '../src/apendices.js';
import { semPartesDoApp } from '../src/docx/claudeDoc.js';

// Dados sintéticos.
describe('títulos de apêndices', () => {
  it('nome de arquivo do aparelho vira título descritivo; palavra final repetida sai', () => {
    expect(tituloApendice('Inlite Report 2026 11 24T12 35 25.793Z')).toBe('Relatório de medição de vibração');
    expect(tituloApendice('Relatório de dosimetria de ruído – Fulano Teste   ruido')).toBe('Relatório de dosimetria de ruído – Fulano Teste');
    expect(tituloApendice('Certificado de calibração – Dosímetro')).toBe('Certificado de calibração – Dosímetro');
    expect(tituloSugerido('Inlite_Report_2026-11-24T12_35_25.793Z.pdf')).toBe('Relatório de medição de vibração');
  });
});

describe('encerramento escrito pelo Claude', () => {
  it('a frase "Integram o laudo…" sai do parágrafo (o app escreve a lista)', () => {
    expect(semPartesDoApp('Encerra-se o presente laudo pericial. Integram o laudo o registro fotográfico (Anexo I) e os apêndices com os relatórios.'))
      .toBe('Encerra-se o presente laudo pericial.');
  });
});
