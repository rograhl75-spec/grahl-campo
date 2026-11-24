import { describe, it, expect } from 'vitest';
import { nomeDoArquivo } from '../src/docx/base.js';

// Dados sintéticos.
describe('nome do arquivo gerado', () => {
  it('tipo, âmbito, autor e processo', () => {
    expect(nomeDoArquivo('Laudo_pericial_previdenciario', { tipoAtuacao: 'Judicial', autorNome: 'José da Silva Ávila', numero: '0000000-00.2026.4.04.7001' }))
      .toBe('Laudo_Pericial_Previdenciario_Judicial_Jose_da_Silva_Avila_0000000-00.2026.4.04.7001.docx');
    expect(nomeDoArquivo('LTCAT', { tipoAtuacao: 'Extrajudicial', autorNome: 'Maria Teste', numero: '' }))
      .toBe('LTCAT_Extrajudicial_Maria_Teste.docx');
    expect(nomeDoArquivo('Parecer_assistente_tecnico', { tipoAtuacao: 'Judicial', autorNome: 'Ana Beta', numero: '1' })).toBe('Parecer_Assistente_Tecnico_Judicial_Ana_Beta_1.docx');
  });
  it('título do Claude com o processo ou o nome: só o tipo', () => {
    expect(nomeDoArquivo('Laudo_Pericial_Processo_n_0000000_00_202', { tipoAtuacao: 'Judicial', autorNome: 'Fulano Teste', numero: '0000000-00.2022.4.04.7001' }))
      .toBe('Laudo_Pericial_Judicial_Fulano_Teste_0000000-00.2022.4.04.7001.docx');
    expect(nomeDoArquivo('Laudo_Pericial_Fulano_Teste', { tipoAtuacao: 'Judicial', autorNome: 'Fulano Teste', numero: '2' }))
      .toBe('Laudo_Pericial_Judicial_Fulano_Teste_2.docx');
  });
});
