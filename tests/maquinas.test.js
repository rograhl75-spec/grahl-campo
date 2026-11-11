import { describe, it, expect } from 'vitest';
import { classificar, estatistica, resumoPorCategoria, codigoCategoria, ehMaquina, CATEGORIAS_MAQUINA, PROMPT_MAQUINAS } from '../src/maquinas.js';
import { veiculoParaDados } from '../src/paradigmas.js';

describe('banco de ruído e vibração de máquinas', () => {
  it('classifica pelos níveis de ação e limites da NR-9 / NR-15', () => {
    expect(classificar('ruido', '86').nivel).toBe('acima');
    expect(classificar('ruido', '82,5').nivel).toBe('acao');
    expect(classificar('vciAren', '0,4').nivel).toBe('abaixo');
    expect(classificar('vciAren', '1,1').nivel).toBe('acao');
    expect(classificar('vciVdvr', '21,3').nivel).toBe('acima');
    expect(classificar('vmb', '')).toBeNull();
  });
  it('calcula n, mínimo, mediana e máximo', () => {
    expect(estatistica(['90', '80,5', '', '95'])).toEqual({ n: 3, min: 80.5, mediana: 90, max: 95 });
    expect(estatistica(['1', '2']).mediana).toBe(1.5);
  });
  it('resume por categoria e reconhece máquinas', () => {
    const regs = [
      { data: { categoriaMaquina: 'AG-TSC – Trator agrícola sem cabine', lavg: '92', arep: '0,8' } },
      { data: { categoriaMaquina: 'AG-TSC', lavg: '96', arenLaudo: '1,2' } },
      { data: { tipo: 'Cavalo', lavg: '80' } },
    ];
    const r = resumoPorCategoria(regs);
    expect(r['AG-TSC'].total).toBe(2);
    expect(r['AG-TSC'].lavg.max).toBe(96);
    expect(r['AG-TSC'].arep.n).toBe(2);
    expect(codigoCategoria('CO-PCA – Pá carregadeira')).toBe('CO-PCA');
    expect(ehMaquina({ data: { tipo: 'Trator' } })).toBe(true);
    expect(ehMaquina(regs[2])).toBe(false);
  });
  it('importa o bloco "maquina" do JSON e usa a referência como citação', () => {
    const d = veiculoParaDados({ id: 'M90', identificacao: { tipo: 'Trator', marca: 'X', modelo: 'Y' },
      maquina: { categoria: 'AG-TSC', origem: 'Literatura técnica', operacao: 'gradagem', referencia: 'AUTOR. Título. Revista, 2020.' },
      resultados: { lavg_q5: 91.2 }, fonte: { tipo: 'Literatura' } });
    expect(d.categoriaMaquina).toBe('AG-TSC');
    expect(d.lavg).toBe('91,2');
    expect(d.citacao).toBe('AUTOR. Título. Revista, 2020.');
  });
  it('códigos de categoria são únicos e estão na instrução', () => {
    const cods = CATEGORIAS_MAQUINA.map((c) => c.cod);
    expect(new Set(cods).size).toBe(cods.length);
    for (const c of cods) expect(PROMPT_MAQUINAS).toContain(c);
  });
});
