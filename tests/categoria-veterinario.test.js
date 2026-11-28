import { describe, it, expect } from 'vitest';
import { categoriaSaude } from '../src/enquadramento.js';

describe('categoria profissional – veterinário', () => {
  it('médico-veterinário sai como médico-veterinário, não como médico', () => {
    expect(categoriaSaude('Médico-veterinário – diretor de fomento').t).toBe('Categoria profissional de médico-veterinário – enquadramento por presunção');
    expect(categoriaSaude('Veterinária de campo').t).toMatch(/médico-veterinário/);
  });
  it('médico continua como médico', () => {
    expect(categoriaSaude('Médico do trabalho').t).toBe('Categoria profissional de médico – enquadramento por presunção');
  });
});
