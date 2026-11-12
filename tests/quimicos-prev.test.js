// Forma de avaliação previdenciária dos agentes químicos por período (IN 128/2022, arts. 297 e 298)
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { agenteParaDados, formaAvaliacaoPrev, codigosDoDecreto } from '../src/quimicos.js';

const base = JSON.parse(fs.readFileSync(new URL('../public/bases/quimicos-base.json', import.meta.url))).agentes;
const ag = (id) => agenteParaDados(base.find((a) => a.id === id));

describe('forma de avaliação previdenciária', () => {
  it('todo agente traz os quatro decretos em codDecretos', () => {
    for (const a of base) {
      const l = String(a.codDecretos || '').split('\n');
      expect(l.map((x) => x.split(':')[0]), a.id).toEqual(['Dec. 53.831/1964', 'Dec. 83.080/1979', 'Dec. 2.172/1997', 'Dec. 3.048/1999']);
    }
  });

  it('benzeno: presunção até 05/03/1997, Anexo 13-A depois e LINACH a partir de 08/10/2014', () => {
    const l = formaAvaliacaoPrev(ag('benzeno'));
    expect(l[0].forma).toMatch(/presunção.*art\. 297, I/);
    expect(l[1].codigos).toMatch(/^1\.0\.3/);
    expect(l[2].forma).toMatch(/Anexo 13-A/);
    expect(l[3].forma).toMatch(/NHO-02/);
    expect(l.find((x) => x.ini === '2014-10-08').forma).toMatch(/art\. 298/);
    expect(l.find((x) => x.ini === '2020-07-01').forma).toMatch(/medidas de controle/);
  });

  it('acetona: fora do Anexo IV a partir de 06/03/1997', () => {
    const l = formaAvaliacaoPrev(ag('acetona'));
    expect(l[0].forma).toMatch(/presunção/);
    expect(l.slice(1).every((x) => /Fora do Anexo IV/.test(x.forma))).toBe(true);
  });

  it('tolueno: quantitativa pelo LT do Anexo 11 e qualitativa nas atividades do Anexo 13', () => {
    expect(formaAvaliacaoPrev(ag('tolueno'))[2].forma).toMatch(/Quantitativa – LT do Anexo 11 da NR-15 \(78 ppm \/ 290 mg\/m³\); qualitativa – atividades do Anexo 13/);
  });

  it('óleo mineral: cód. 1.0.7 no Anexo IV', () => {
    expect(codigosDoDecreto(ag('oleo-mineral-nevoa'), '3.048')).toMatch(/1\.0\.7/);
  });

  it('LINACH Grupo 1 sem CAS não recebe a avaliação qualitativa do art. 298', () => {
    const d = { ...ag('benzeno'), cas: '' };
    const l = formaAvaliacaoPrev(d);
    expect(l.at(-1).forma).toMatch(/Não se aplica.*CAS/);
  });
});
