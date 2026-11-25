import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { aplicarTrocas, lerTrocas, guardarRedacao, ultimaRedacao, desfazerRedacao, promptAplicarCorrecoes } from '../src/redacao.js';

// Dados sintéticos.
const MD = `Título: Laudo técnico pericial

# 6 Conclusão
Com base na perícia, a posição técnica do perito é a seguinte:

Quadro: Elementos técnicos
| Elemento | Situação |
|---|---|
| Origem dos tempos | Relato do autor |
| Número de fornos | 2 × 1 |
Fonte: medições.

No período do forno elétrico, o calor não se caracteriza.
`;

describe('aplicar correções ao texto guardado', () => {
  it('troca, apaga e acrescenta linha de quadro; o resto não muda', () => {
    const { md, feitas, falhas } = aplicarTrocas(MD, [
      { buscar: 'a posição técnica do perito é a seguinte:', substituir: 'conclui-se tecnicamente o seguinte:' },
      { buscar: '| Origem dos tempos | Relato do autor |', substituir: '| Origem dos tempos | Relato do autor |\n| Incerteza do medidor | [[± __ °C]] |' },
      { buscar: 'No período do forno elétrico, o calor não se caracteriza.', substituir: 'No período do forno elétrico, o calor não foi avaliado.' },
      { buscar: 'trecho que não existe', substituir: 'x' },
    ]);
    expect(feitas.length).toBe(3);
    expect(falhas.map((f) => f.motivo)).toEqual(['trecho não encontrado']);
    expect(md).toContain('conclui-se tecnicamente o seguinte:');
    expect(md).toContain('| Incerteza do medidor | [[± __ °C]] |');
    expect(md).toContain('| Número de fornos | 2 × 1 |');
    expect(md).not.toContain('não se caracteriza');
  });
  it('trecho repetido não é trocado (ambíguo)', () => {
    const { falhas } = aplicarTrocas('a b a', [{ buscar: 'a', substituir: 'c' }]);
    expect(falhas[0].motivo).toBe('trecho aparece mais de uma vez');
  });
  it('lê o JSON da resposta', () => {
    const r = lerTrocas('Segue:\n{"trocas":[{"buscar":"x","substituir":"y"}],"naoAplicadas":["item 9: falta o dado"]}');
    expect(r.trocas).toHaveLength(1);
    expect(r.naoAplicadas).toEqual(['item 9: falta o dado']);
  });
  it('guarda o texto, a versão anterior e desfaz', async () => {
    await guardarRedacao('rc1', 'texto 1');
    await guardarRedacao('rc1', 'texto 2');
    expect((await ultimaRedacao('rc1')).data.md).toBe('texto 2');
    expect(await desfazerRedacao('rc1')).toBe(true);
    expect((await ultimaRedacao('rc1')).data.md).toBe('texto 1');
  });
  it('a instrução pede só as trocas, com o texto e as correções', () => {
    const p = promptAplicarCorrecoes(MD, '1. trocar posição por conclusão');
    expect(p).toContain('"trocas"');
    expect(p).toContain('1. trocar posição por conclusão');
    expect(p).toContain('Origem dos tempos');
  });
});
