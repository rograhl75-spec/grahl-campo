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

describe('encerramento: frase sobre onde estão os anexos', () => {
  it('sai só na seção de encerramento', () => {
    const md = '# 2 Instrumentos\nOs certificados constam dos apêndices deste laudo.\n\n# 8 Encerramento\nConcluídos os trabalhos.\n\nOs registros fotográficos constam do Anexo I, e os relatórios, dos apêndices deste laudo.\n';
    const r = semPartesDoApp(md);
    expect(r).toContain('Os certificados constam dos apêndices deste laudo.');
    expect(r).not.toContain('Os registros fotográficos constam');
    expect(r).toContain('Concluídos os trabalhos.');
  });
});

describe('auditoria do laudo do padeiro', () => {
  it('título de apêndice sem "Relatório X" repetido', () => {
    expect(tituloApendice('Relatório de calor (IBUTG) – Relatorio Calor Fulano Teste')).toBe('Relatório de calor (IBUTG) – Fulano Teste');
    expect(tituloApendice('Relatório de dosimetria de ruído – Relatorio Ruido Fulano Teste')).toBe('Relatório de dosimetria de ruído – Fulano Teste');
  });
  it('"posição técnica do perito" vira conclusão técnica', () => {
    expect(semPartesDoApp('Com base na perícia, a posição técnica do perito é a seguinte:')).toBe('Com base na perícia, conclui-se tecnicamente o seguinte:');
    expect(semPartesDoApp('Resposta: A posição técnica do perito, com base na perícia por similaridade, é a seguinte:')).toBe('Resposta: Conclui-se tecnicamente o seguinte:');
  });
});
