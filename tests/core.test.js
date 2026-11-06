import { describe, it, expect } from 'vitest';
import { mergeRecords, hasNewer } from '../src/merge.js';
import { nenQ5, lavgDaDose, ibutg, minutos } from '../src/calc.js';
import { separarQuesitos, dataIso } from '../src/migrate.js';

const r = (data, ts, extra = {}) => ({ id: 'x', kind: 'caso', caseId: null, createdAt: 1, data, ts, ...extra });

describe('mesclagem por campo', () => {
  it('edições em campos diferentes em dois aparelhos não se perdem', () => {
    const tablet = r({ local: 'Fábrica A', sintese: 'v1' }, { local: 200, sintese: 100 });
    const pc = r({ local: '', sintese: 'v2 do PC' }, { local: 50, sintese: 300 });
    const m = mergeRecords(tablet, pc);
    expect(m.data.local).toBe('Fábrica A');
    expect(m.data.sintese).toBe('v2 do PC');
    expect(mergeRecords(pc, tablet).data).toEqual(m.data);
  });
  it('exclusão é um campo como outro qualquer (e pode ser desfeita)', () => {
    const a = r({ nome: 'X', _del: true }, { nome: 10, _del: 20 });
    const b = r({ nome: 'X', _del: false }, { nome: 10, _del: 30 });
    expect(mergeRecords(a, b).deleted).toBe(0);
    expect(mergeRecords(a, r({ nome: 'X' }, { nome: 10 })).deleted).toBe(1);
  });
  it('dados importados (ts=1) nunca sobrescrevem edição feita no app', () => {
    const editado = r({ autorNome: 'Nome corrigido' }, { autorNome: 1700000000000 });
    const reimport = r({ autorNome: 'nome antigo', juizo: '7ª VT' }, { autorNome: 1, juizo: 1 });
    const m = mergeRecords(editado, reimport);
    expect(m.data.autorNome).toBe('Nome corrigido');
    expect(m.data.juizo).toBe('7ª VT');
  });
  it('detecta o que precisa ser enviado', () => {
    expect(hasNewer(r({ a: 1 }, { a: 5 }), r({ a: 1 }, { a: 4 }))).toBe(true);
    expect(hasNewer(r({ a: 1 }, { a: 4 }), r({ a: 1 }, { a: 4 }))).toBe(false);
  });
});

describe('cálculos', () => {
  it('NEN com q=5', () => {
    expect(nenQ5('85', '8')).toBeCloseTo(85, 5);
    expect(nenQ5('90', '4')).toBeCloseTo(85, 1);
    expect(nenQ5('87,5', '8h48')).toBeCloseTo(87.5 + 16.61 * Math.log10(528 / 480), 3);
  });
  it('Lavg pela dose', () => {
    expect(lavgDaDose('100', '8')).toBeCloseTo(85, 5);
    expect(lavgDaDose('200', '8:00')).toBeCloseTo(90, 1);
  });
  it('IBUTG', () => {
    expect(ibutg('25', '35', '', false)).toBeCloseTo(28, 5);
    expect(ibutg('25', '35', '30', true)).toBeCloseTo(27.5, 5);
  });
  it('minutos', () => { expect(minutos('8h48')).toBe(528); expect(minutos('7,5')).toBe(450); });
});

describe('migração', () => {
  it('separa quesitos numerados', () => {
    const q = separarQuesitos('1) Qual a função?\n2. Havia ruído?\n3 - Usava EPI?');
    expect(q.map((x) => x.numero)).toEqual(['1', '2', '3']);
    expect(q[1].texto).toBe('Havia ruído?');
  });
  it('mantém texto sem numeração como um quesito', () => {
    expect(separarQuesitos('Queira o perito informar...')).toHaveLength(1);
  });
  it('datas', () => { expect(dataIso('05/03/2024')).toBe('2024-03-05'); expect(dataIso('x')).toBe(''); });
});

import { mapearLegado } from '../src/migrate.js';
describe('mapeamento do app antigo', () => {
  it('distribui campos, cria filhos e preserva o bruto', () => {
    const d = {
      modulo_atuacao: 'Perícia Judicial Trabalhista', papel_profissional: 'Assistente Técnico da Reclamada',
      processo_num: '0000123-45.2024.5.09.0663', orgao_julgador: '7ª Vara do Trabalho de Londrina', data_autuacao: '10/02/2024',
      reclamante_nome: 'Fulano', reclamada_nome: 'Empresa X', reclamante_adv: 'Dr. Y',
      cargos: 'Operador', setor: 'Extrusão', atividades_inicial: 'Opera extrusora', agentes_alegados: 'Ruído e calor',
      apr_fisicos: 'Ruído contínuo ou intermitente (NHO-01)', fase_processual: 'Aguardando diligência pericial',
      quesitos_juizo: '1) Descreva as atividades.\n2) Há insalubridade?', quesitos_reu: '1. Usava EPI?',
      quadro_epis: [{ descricao: 'Protetor auricular', ca: '12345', data_entrega: '01/01/2023', obs: '' }],
      doc_ppp: 'PPP indica 84 dB(A)', campo_data: '15/03/2024', campo_horario: '09:00', local_diligencia: 'Planta',
      campo_declaracoes_autor: 'Trabalhava 12h', campo_medicoes: 'Lavg 88 dB(A)',
      campo_fotos: [{ storage_path: 'campo_fotos/a/b.jpg', legenda: 'Extrusora', gps: '' }],
      campo_estranho: 'valor x', _revision: 7,
    };
    const { caso, filhos, fotos } = mapearLegado('Proc_07', d);
    expect(caso.papel).toBe('Assistente técnico do réu / reclamada');
    expect(caso.dataAjuizamento).toBe('2024-02-10');
    expect(caso.vistoriaData).toBe('2024-03-15');
    expect(caso.agentesAlegados).toBe('Ruído e calor');
    expect(caso.funcoes).toContain('Cargos: Operador');
    expect(caso.observacoes).toContain('campo_estranho: valor x');
    expect(caso.observacoes).not.toContain('NHO-01');
    expect(caso.vistoriaNotas).toContain('Lavg 88');
    expect(JSON.parse(caso.legado).processo_num).toBe(d.processo_num);
    expect(filhos.filter((f) => f.kind === 'quesito')).toHaveLength(3);
    expect(filhos.filter((f) => f.kind === 'epi')).toHaveLength(1);
    expect(filhos.find((f) => f.kind === 'documento').data.tipo).toBe('PPP');
    expect(filhos.find((f) => f.kind === 'posto').data.infoTrabalhador).toBe('Trabalhava 12h');
    expect(fotos).toHaveLength(1);
  });
});

import { sugerirLimpeza } from '../src/organizar.js';
describe('organizar nomes importados', () => {
  it('separa CPF e CNPJ do nome e guarda o original', () => {
    const r = sugerirLimpeza({ autorNome: 'Marcia Fernanda Marcelino, CPF 033.452.159-93', reuNome: 'Instituto da Coluna S/S Ltda, 21.331.753/0001-50, e os sócios Fulano' });
    expect(r.autorNome).toBe('Marcia Fernanda Marcelino');
    expect(r.autorCpf).toBe('033.452.159-93');
    expect(r.reuNome).toBe('Instituto da Coluna S/S Ltda');
    expect(r.reuCnpj).toBe('21.331.753/0001-50');
    expect(r.observacoes).toContain('os sócios Fulano');
    expect(sugerirLimpeza({ autorNome: 'Fulano', reuNome: 'Empresa Ltda' })).toBe(null);
  });
});

import { montarPrompt, criteriosPara } from '../src/aiimport.js';
describe('separação trabalhista × previdenciário nas instruções', () => {
  it('trabalhista não leva critérios previdenciários', () => {
    const t = montarPrompt('perito-trab', { materia: 'Trabalhista' });
    expect(t).toContain('NR-15, Anexo 1');
    expect(t).not.toContain('NEN > 85');
    expect(t).not.toContain('cód. 3.0.1');
    expect(t).not.toContain('GFIP');
  });
  it('previdenciário não leva critérios trabalhistas', () => {
    const t = montarPrompt('perito-prev', { materia: 'Previdenciária' });
    expect(t).toContain('NEN > 85');
    expect(t).not.toContain('Brief & Scala');
    expect(t).not.toContain('área de isolamento');
  });
  it('assistente técnico segue a matéria do caso', () => {
    expect(criteriosPara({ materia: 'Previdenciária', papel: 'Assistente técnico do autor / reclamante' }, 'at-laudo')).toContain('tempus regit actum');
    expect(criteriosPara({ materia: 'Trabalhista' }, 'at-laudo')).toContain('NR-15, Anexo 1');
  });
});
