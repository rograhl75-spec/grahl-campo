import { describe, it, expect } from 'vitest';
import { acentuar, semInstrucoes, revisarCampo } from '../src/ortografia.js';

describe('revisão do texto digitado', () => {
  it('acentos, maiúsculas preservadas e terminações', () => {
    expect(acentuar('bau refrigerado; Bau carga seca; BAU')).toBe('baú refrigerado; Baú carga seca; BAÚ');
    expect(acentuar('textos de periodos anteriores, nao havia caçamba')).toBe('textos de períodos anteriores, não havia caçamba');
    expect(acentuar('distribuicao e conducao, condicoes ruins')).toBe('distribuição e condução, condições ruins');
    expect(acentuar('Faxinal, Calore, Pitanga')).toBe('Faxinal, Kaloré, Pitanga');
  });
  it('crase nos horários e concordância', () => {
    expect(acentuar('05h00 as 20h00')).toBe('05h00 às 20h00');
    expect(acentuar('das 5 as 18 horas')).toBe('das 5 às 18 horas');
    expect(acentuar('além dos anterior, Curitiba')).toBe('além dos anteriores, Curitiba');
    expect(acentuar('as cargas')).toBe('as cargas');
  });
  it('linhas de instrução não vão para o documento; campos de horas e nomes ficam como estão', () => {
    expect(semInstrucoes('6 h seguidas sem pausa\nadotar os textos de penosidade de periodos anteriores')).toBe('6 h seguidas sem pausa');
    expect(revisarCampo('pausas', 'utilizar sempre 10 horas de condução e 5 horas de carga e descarga')).toBe('');
    expect(revisarCampo('conducaoH', 'utilizar sempre 10 horas')).toBe('utilizar sempre 10 horas');
    expect(revisarCampo('empresa', 'CLOPAN PRESTADORA DE SERVICOS LTDA')).toBe('CLOPAN PRESTADORA DE SERVIÇOS LTDA');
    expect(revisarCampo('empresa', 'G GONCALVES DE SOUZA DOCES - PANIFICACAO')).toBe('G GONÇALVES DE SOUZA DOCES - PANIFICAÇÃO');
    expect(revisarCampo('autorNome', 'JOAO DA SILVA')).toBe('JOAO DA SILVA');
  });
  it('vínculo que pede para adotar o anterior herda os campos de penosidade e soma o trajeto', async () => {
    const { herdarDoAnterior } = await import('../src/heranca.js');
    const r = herdarDoAnterior([
      { id: 1, data: { vias: 'Cambé, Maringá', tipoCarga: 'farinha', penosidadeResultado: 'Sim – caracteriza', pausas: '6 h seguidas' } },
      { id: 2, data: { vias: 'além dos anteriores, Curitiba', pausas: 'utilizar sempre 10 horas de condução\nadotar os textos de penosidade de periodos anteriores' } },
      { id: 3, data: { vias: 'Londrina', cabine: 'considerando o vínculo anterior, cabine sem ar' } },
    ]);
    expect(r[1].data).toMatchObject({ vias: 'Cambé, Maringá; Curitiba', tipoCarga: 'farinha', penosidadeResultado: 'Sim – caracteriza', pausas: '6 h seguidas' });
    expect(r[2].data.tipoCarga).toBeUndefined(); // texto narrativo não é pedido de herança
  });
});

describe('crase e notas de trabalho', () => {
  it('crase só entre horários; notas "confirmar com o segurado" saem', async () => {
    const { acentuar, revisarCampo } = await import('../src/ortografia.js');
    expect(acentuar('jornada de 05h00 as 20h00 menos as 5 h de carga')).toBe('jornada das 05h00 às 20h00 menos as 5 h de carga');
    expect(acentuar('das 5 as 18 horas')).toBe('das 5 às 18 horas');
    expect(revisarCampo('conducaoBase', 'jornada de 15 h menos 5 h de carga. Confirmar com o segurado.')).toBe('jornada de 15 h menos 5 h de carga.');
  });
  it('rótulo do paradigma sem anotações do cadastro', async () => {
    const { rotuloParadigma } = await import('../src/paradigmas.js');
    expect(rotuloParadigma({ data: { codigo: 'M26', marca: 'Toyota', modelo: 'Bandeirante (pelas fotos; o laudo diz só "caminhonete Toyota")', ano: null } })).toBe('M26 – Toyota Bandeirante');
    expect(rotuloParadigma({ data: { codigo: 'M10', marca: '', modelo: 'Van escolar (modelo n/i)', ano: 'n/i' } })).toBe('M10 – Van escolar');
    expect(rotuloParadigma({ data: { codigo: 'M30', marca: 'Mercedes-Benz', modelo: 'L 1620', ano: '2003' } })).toBe('M30 – Mercedes-Benz L 1620 (2003)');
  });
});

describe('idioma no Word', () => {
  it('títulos em inglês marcados en-US; o resto pt-BR', async () => {
    const { rich } = await import('../src/docx/ooxml.js');
    const x = rich('ACGIH. {{en:TLVs and BEIs: threshold limit values}}. Cincinnati: ACGIH, edição vigente.');
    expect(x).toMatch(/w:val="en-US"\/><\/w:rPr><w:t xml:space="preserve">TLVs and BEIs: threshold limit values</);
    expect(x).toContain('w:val="pt-BR"');
  });
});

describe('gramática apontada pelo Word', () => {
  it('"das HH às HH", "à noite", "pré-", estados e termos jurídicos', async () => {
    const { acentuar } = await import('../src/ortografia.js');
    expect(acentuar('jornada de 05h00 às 20h00')).toBe('jornada das 05h00 às 20h00');
    expect(acentuar('jornada de 05h00 as 20h00')).toBe('jornada das 05h00 às 20h00');
    expect(acentuar('sai na segunda e volta quinta a noite')).toBe('sai na segunda e volta quinta à noite');
    expect(acentuar('pre-mistura; presente')).toBe('pré-mistura; presente');
    expect(acentuar('Grandes Rios (UFs não informadas)')).toBe('Grandes Rios (estados não informados)');
    expect(acentuar('a noite toda')).toBe('a noite toda');
  });
});

describe('mais apontamentos do Word', () => {
  it('data com mês ilegível e ar-condicionado', async () => {
    const { acentuar } = await import('../src/ortografia.js');
    expect(acentuar("saída em '06/[mês ilegível]/2019'; CTPS")).toBe('saída em dia 06 de mês ilegível de 2019; CTPS');
    expect(acentuar('cabine com ar condicionado')).toBe('cabine com ar-condicionado');
  });
});
