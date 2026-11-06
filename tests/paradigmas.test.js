import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { db, updateFields } from '../src/db.js';
import {
  importarBaseJson, sugerirParadigmas, adicionarParadigmas, nenParaJornada, arenParaJornada, vdvrParaJornada,
  certificadoVencido, veiculoParaDados, lerJsonVeiculos,
} from '../src/paradigmas.js';

// Dados sintéticos (nunca usar dados reais de processos nos testes do repositório)
const base = {
  regra_alerta_certificado_meses: 24,
  veiculos: [
    { id: 'M01', identificacao: { tipo: 'Caminhão', marca: 'Marca A', modelo: 'X 100', ano: '2005' },
      caracteristicas: { familia: 'F1', familia_descricao: 'Motor dianteiro, cabine antiga' },
      resultados: { lavg_q5: 84.2, jornada_laudo_h: 8, arep: 0.62, vdvr_laudo: 12.1 },
      fonte: { tipo: 'Judicial', processo: '0000000-00.2020.0.00.0000', vara: '1ª Vara', data: '10/05/2021', citacao: 'Proc. 0000000 – 1ª Vara – 10/05/2021' },
      instrumentacao: { ruido: { equipamento: 'Dosímetro', serie: '1', data_certificado: '01/01/2018' } }, situacao: 'OK' },
    { id: 'M02', identificacao: { tipo: 'Caminhão', marca: 'Marca B', modelo: 'Y 200' },
      caracteristicas: { familia: 'F1' }, resultados: { lavg_q5: 86.0, arep: 0.7 },
      fonte: { tipo: 'Extrajudicial', processo: 'não deve aparecer', data: '02/02/2022' }, situacao: 'NÃO USAR' },
    { id: 'M03', identificacao: { tipo: 'Ônibus', marca: 'Marca C', modelo: 'Z 300' },
      caracteristicas: { familia: 'F5' }, resultados: { lavg_q5: 79.5 }, fonte: { tipo: 'Extrajudicial', data: '03/03/2023' }, situacao: 'OK' },
  ],
  similares: [{ marca: 'Marca D', modelo: 'W 400', familia: 'F1', paradigma_ruido: 'M01', paradigma_vibracao: 'M01', status: 'Confirmado' }],
};

describe('banco de paradigmas', () => {
  it('fonte extrajudicial não guarda processo nem nome', () => {
    const d = veiculoParaDados(base.veiculos[1]);
    expect(d.processo).toBe('');
    expect(d.citacao).toBe('Extrajudicial – 02/02/2022');
  });
  it('importa a base e é idempotente; edição feita no app prevalece', async () => {
    const r = await importarBaseJson(base);
    expect(r.veiculos).toBe(3);
    expect(r.similares).toBe(1);
    await updateFields('par-m01', { lavg: '84,9' });
    const r2 = await importarBaseJson(base);
    expect(r2.veiculos).toBe(0);
    expect((await db.records.get('par-m01')).data.lavg).toBe('84,9');
    expect((await db.records.get('cfg-paradigmas')).data.regraCertMeses).toBe('24');
  });
  it('sugere pela tabela de similares e depois pela família, pulando "NÃO USAR"', async () => {
    const r = await sugerirParadigmas({ marca: 'Marca D', modelo: 'W 400' });
    expect(r.similar).toBeTruthy();
    expect(r.ruido[0].p.data.codigo).toBe('M01');
    expect(r.ruido.some((x) => x.p.data.codigo === 'M02')).toBe(false);
    const t = await sugerirParadigmas({ marca: 'Outra', modelo: 'Q', tipo: 'ônibus' });
    expect(t.ruido.map((x) => x.p.data.codigo)).toEqual(['M03']);
  });
  it('laudo antigo: novos códigos sequenciais, situação "Revisar"', async () => {
    const lista = lerJsonVeiculos('```json\n{"veiculos":[{"identificacao":{"marca":"E","modelo":"1"},"resultados":{"lavg_q5":85}}]}\n```');
    const cods = await adicionarParadigmas(lista);
    expect(cods).toEqual(['M04']);
    const p = (await db.records.where('kind').equals('paradigma').toArray()).find((x) => x.data.codigo === 'M04');
    expect(p.data.situacao).toBe('Revisar');
  });
});

describe('normalização pela jornada', () => {
  it('NEN, aren e VDVR', () => {
    expect(nenParaJornada('84,2', 8)).toBeCloseTo(84.2, 5);
    expect(nenParaJornada(84.2, 12)).toBeCloseTo(84.2 + 16.61 * Math.log10(1.5), 5);
    expect(arenParaJornada(0.62, 12)).toBeCloseTo(0.62 * Math.sqrt(1.5), 5);
    expect(vdvrParaJornada(12.1, 16, 8)).toBeCloseTo(12.1 * Math.pow(2, 0.25), 5);
  });
  it('alerta de certificado com mais de 24 meses', () => {
    expect(certificadoVencido('01/01/2018', '10/05/2021')).toBe(true);
    expect(certificadoVencido('01/01/2020', '10/05/2021')).toBe(false);
  });
});

describe('quadros do parecer com paradigmas', async () => {
  const { tokensModelo } = await import('../src/paradigmas.js');
  const { Doc } = await import('../src/docx/ooxml.js');
  const { quadrosParadigmasMetodologia, memoriasParadigmas } = await import('../src/docx/base.js');
  it('"R440" e "R 440 (2013+)" têm os mesmos tokens', () => {
    expect(tokensModelo('R440')).toEqual(tokensModelo('R 440 (2013+)'));
  });
  it('gera similaridade, normalização e memórias por subperíodo', async () => {
    const par = (await db.records.where('kind').equals('paradigma').toArray()).find((x) => x.data.codigo === 'M01');
    const periodo = { data: { empresa: 'Transp. X', inicio: '1995-01-01', fim: '2016-12-31', veiculoMarca: 'Marca D', veiculoModelo: 'W 400',
      conducaoH: '12', conducaoBase: 'entrevista', paradigmaRuido: 'M01', paradigmaVibracao: 'M01' } };
    const dados = { periodos: [periodo], paradigmas: new Map([['M01', par]]), regraCertMeses: 24 };
    const d = new Doc();
    expect(quadrosParadigmasMetodologia(d, dados)).toBe(true);
    expect(memoriasParadigmas(d, dados)).toBe(true);
    const xml = JSON.stringify(d);
    expect(xml).toContain('VERIFICAR: certificado');
    expect(xml).toContain('87,82'); // NEN 12 h: 84,9 + 16,61·log(1,5)
    expect(xml).toContain('Cód. 1.1.5');
    expect(xml).toContain('ISO 2631-1');
    expect(xml).toContain('NR-15, Anexo 8');
  });
});
