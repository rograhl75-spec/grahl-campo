import { describe, it, expect } from 'vitest';
import { casarArquivo, chaveProcesso, numerosDoModelo } from '../src/laudosLote.js';

const P = (id, codigo, d = {}) => ({ id, data: { codigo, ...d } });
const base = [
  P('a', 'M07', { processo: 'Proc. 5003129-68.2013.4.04.7001', dataMedicao: '16/07/2019', modelo: 'FH12 380' }),
  P('b', 'M61', { processo: 'Proc. 5003129-68.2013.4.04.7001', dataMedicao: '25/02/2019', modelo: 'T112 H' }),
  P('c', 'M14', { dataMedicao: '06/11/2023', modelo: 'Cargo 2422' }),
  P('d', 'M17', { dataMedicao: '13/04/2023', modelo: '8.150' }),
];
const corpo = 'O perito avaliou as condições de trabalho do autor na função de motorista.';
const rel = 'Inlite Technology NS: 25030407607A Empresa Avaliada: X Funcionário Avaliado: Y Data da Avaliação: 06/11/2023 10:00';

describe('laudos em lote', () => {
  it('chaves', () => {
    expect(chaveProcesso('Proc. 5000406-87.2016.4.04.7028')).toBe('5000406872016');
    expect(numerosDoModelo('VW 8.150 Delivery')).toEqual(['8150']);
    expect(numerosDoModelo('Ford Cargo 2422')).toEqual(['2422']);
  });
  it('código no nome do arquivo liga a vários paradigmas', () => {
    const r = casarArquivo({ nome: 'M07_M61 - LAUDO ADAO.pdf', textos: Array(20).fill(corpo) }, base);
    expect(r).toMatchObject({ certo: true, tipo: 'laudo', ids: ['a', 'b'] });
  });
  it('processo no cabeçalho do laudo, com as páginas dos relatórios', () => {
    const textos = [`Processo nº 5003129-68.2013.4.04.7001 ${corpo}`, ...Array(15).fill(corpo), rel, rel];
    const r = casarArquivo({ nome: 'laudo.pdf', textos }, base);
    expect(r).toMatchObject({ certo: true, tipo: 'laudo', paginas: '17-18', ids: ['a', 'b'] });
  });
  it('processo citado só no meio do laudo não liga', () => {
    const textos = [corpo, corpo, corpo, `foi utilizada a avaliação do processo 5003129-68.2013.4.04.7001`, ...Array(10).fill(corpo)];
    expect(casarArquivo({ nome: 'outro.pdf', textos }, base).ids).toEqual([]);
  });
  it('relatório avulso: data + modelo, para confirmar', () => {
    const r = casarArquivo({ nome: 'Ford Cargo 2422 15 horas.pdf', textos: [rel] }, base);
    expect(r).toMatchObject({ certo: false, tipo: 'relatorios', ids: ['c'] });
  });
  it('páginas no nome do arquivo prevalecem', () => {
    const r = casarArquivo({ nome: 'M07 - Laudo [p 9-11, 14].pdf', textos: Array(20).fill(corpo) }, base);
    expect(r).toMatchObject({ tipo: 'laudo', paginas: '9-11, 14', ids: ['a'] });
  });
});
