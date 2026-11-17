import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { db } from '../src/db.js';
import { PERFIL_ID } from '../src/docx/base.js';
import { parecerPenosidade } from '../src/docx/parecerPenosidade.js';
import { tempoConducao, jornadaDia } from '../src/docx/penosidade.js';
import { pendenciasDoCaso, marcacoesNoDocumento } from '../src/pendencias.js';
import { capitalizarCidades } from '../src/cidades.js';
import { carregar } from '../src/docx/base.js';

// Dados sintéticos (sem dados reais de segurados)
const CASO = 'caso-pend';
async function texto(blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return (await zip.file('word/document.xml').async('string')).replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
}
beforeAll(async () => {
  globalThis.fetch = async (url) => {
    const buf = await readFile(new URL(`../public/modelos/${String(url).split('/').pop()}`, import.meta.url));
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  await db.records.put({ id: PERFIL_ID, kind: 'perfil', caseId: null, data: { nome: 'ENGENHEIRO TESTE', titulos: 'Engenheiro', crea: 'CREA-XX 0', cidade: 'Cidade – UF' }, ts: {} });
  await db.records.put({ id: CASO, kind: 'caso', caseId: null, ts: {}, data: { tipoAtuacao: 'Extrajudicial', papel: 'Parecer técnico extrajudicial (segurado / advogado)', objeto: ['Penosidade (motorista)'], materia: 'Previdenciária', autorNome: 'Segurado Teste', art: '0', finalidade: 'Instrução de ação judicial previdenciária' } });
  await db.records.put({ id: 'par-M77', kind: 'paradigma', caseId: null, ts: {}, data: { codigo: 'M77', marca: 'Mercedes-Benz', modelo: '1720', familia: 'F1', tipo: 'Truck', lavg: '86,2', arep: '0,9', jornadaLaudo: '8', citacao: 'Proc. 0000000-00.2019.4.04.0000 – Vara Federal de Cidade A – 06/11/2019', situacao: 'OK' } });
  let n = 0;
  const per = (data) => db.records.put({ id: `p-${++n}`, kind: 'periodo', caseId: CASO, ts: {}, createdAt: n, data });
  await per({ empresa: 'Distribuidora Alfa', inicio: '2005-01-10', fim: '2008-06-30', cargo: 'Motorista de caminhão', veiculoMarca: 'Mercedes-Benz', veiculoModelo: '1720', grupoVeiculo: 'Caminhão truck (chassi rígido, eixo duplo)', jornadaSemanal: '15 h/dia', vias: 'cambé para paisandu, cornelio procopio, maringa', tipoCarga: 'alimentos', paradigmaRuido: 'M77', paradigmaVibracao: 'M77' });
  await per({ empresa: 'Transportes Beta', inicio: '2009-01-10', fim: '2010-06-30', cargo: 'Motorista de caminhão', grupoVeiculo: 'Caminhão truck (chassi rígido, eixo duplo)', jornadaSemanal: '05h00 às 18h00', tipoCarga: 'alimentos' });
});

describe('regra do caso, pendências antes de gerar e cidades', () => {
  it('sem a regra, o tempo de condução fica pendente; com 5 h fora da direção, condução = jornada − 5', async () => {
    let dados = await carregar(CASO);
    const [a, b] = dados.periodos;
    expect(jornadaDia(a, dados)).toBe(15);
    expect(jornadaDia(b, dados)).toBe(13);
    expect(tempoConducao(a, dados).T).toBeNaN();
    const itens = await pendenciasDoCaso(CASO);
    expect(itens.find((i) => i.id === 'foraDirecaoH')).toBeTruthy();
    expect(itens.filter((i) => i.campo === 'conducaoH')).toHaveLength(2);
    expect(itens.some((i) => i.campo === 'penosidadeResultado' && i.tipo === 'simnao')).toBe(true);
    expect(itens.find((i) => i.id === 'conc-todos')).toBeTruthy(); // aplicar a todos os vínculos
    // resposta dada na lista: regra do caso
    await db.records.update(CASO, { 'data.foraDirecaoH': '5' });
    dados = await carregar(CASO);
    expect(tempoConducao(dados.periodos[0], dados).T).toBe(10);
    expect(tempoConducao(dados.periodos[1], dados).T).toBe(8);
    expect(tempoConducao(dados.periodos[0], dados).base).toMatch(/menos 5 h/);
    const depois = await pendenciasDoCaso(CASO);
    expect(depois.filter((i) => i.campo === 'conducaoH')).toHaveLength(0);
    expect(depois.find((i) => i.id === 'foraDirecaoH').previa.join(' ')).toMatch(/condução 10 h \(jornada 15 h − regra\)/);
  });
  it('o parecer usa a regra (sem o T em amarelo) e corrige as cidades', async () => {
    const r = await parecerPenosidade(CASO);
    const t = await texto(r.blob);
    expect(t).toContain('Condução: cerca de 10 h/dia (jornada de cerca de 15 h/dia informada na entrevista, menos 5 h de carga, descarga e paradas)');
    expect(t).toContain('Cambé para Paiçandu, Cornélio Procópio, Maringá');
    const marcas = await marcacoesNoDocumento(() => parecerPenosidade(CASO));
    expect(marcas.some((m) => /informe o tempo diário|condução: informar/i.test(m.texto))).toBe(false);
  });
  it('frase digitada no lugar do número: "10 horas de condução e 5 horas de carga" vale como 10 h e 5 h', async () => {
    const FRASE = 'utilizar sempre 10 horas de condução e 5 horas de carga e descarga de mercadorias';
    await db.records.update(CASO, { 'data.foraDirecaoH': FRASE });
    await db.records.update('p-1', { 'data.conducaoH': FRASE });
    // vínculo sem jornada na entrevista: usa a condução escrita na regra (10 h)
    await db.records.put({ id: 'p-9', kind: 'periodo', caseId: CASO, ts: {}, createdAt: 9, data: { empresa: 'Transportadora Gama', inicio: '2015-07-01', fim: '2016-01-01', cargo: 'Motorista de caminhão', grupoVeiculo: 'Caminhão truck (chassi rígido, eixo duplo)' } });
    const dados = await carregar(CASO);
    const porId = (id) => dados.periodos.find((r) => r.id === id);
    expect(tempoConducao(porId('p-1'), dados).T).toBe(10);
    expect(tempoConducao(porId('p-1'), dados).base).toMatch(/regra do caso: 5 h/);
    expect(tempoConducao(porId('p-2'), dados).T).toBe(8); // jornada 13 h − 5 h
    expect(tempoConducao(porId('p-9'), dados).T).toBe(10);
    const t = await texto((await parecerPenosidade(CASO)).blob);
    expect(t).not.toContain('utilizar sempre');
    const marcas = await marcacoesNoDocumento(() => parecerPenosidade(CASO));
    expect(marcas.some((m) => /tempo diário|informe um número|base da informação|^T$/.test(m.texto))).toBe(false);
  });
  it('conclusão da penosidade: Sim / Não com o texto padrão, igual em todos os vínculos', async () => {
    for (const id of ['p-1', 'p-2']) await db.records.update(id, { 'data.penosidadeResultado': 'Sim – caracteriza', 'data.penosidadeConclusao': '' });
    await db.records.update('p-9', { 'data.penosidadeResultado': 'Não – não caracteriza' });
    const t = await texto((await parecerPenosidade(CASO)).blob);
    const sim = (t.match(/a atividade foi exercida em condições excepcionalmente penosas/g) || []).length;
    expect(sim).toBe(2);
    expect(t).toContain('não convergem de forma suficiente para caracterizar');
    expect(t).not.toContain('Proposta do app pela contagem de fatores');
    expect((await pendenciasDoCaso(CASO)).some((i) => i.campo === 'penosidadeResultado')).toBe(false);
  });
  it('cidades: só os municípios mudam; o resto fica como digitado', () => {
    expect(capitalizarCidades('londrina/pr - sao jose dos pinhais e foz do iguacu, serra do mar, br 277'))
      .toBe('Londrina/PR - São José dos Pinhais e Foz do Iguaçu, serra do mar, br 277');
  });
});

describe('as mesmas regras em outros documentos', () => {
  it('laudo trabalhista: pendências de quesitos e diligência, sem perguntas de motorista', async () => {
    await db.records.put({ id: 'trab', kind: 'caso', caseId: null, ts: {}, data: { tipoAtuacao: 'Judicial', papel: 'Perito do Juízo', justica: 'Justiça do Trabalho', materia: 'Trabalhista', objeto: ['Insalubridade'], vistoriaData: '2026-09-01' } });
    await db.records.put({ id: 'trab-p', kind: 'periodo', caseId: 'trab', ts: {}, createdAt: 1, data: { empresa: 'Empresa X', inicio: '2020-01-01', cargo: 'Auxiliar de produção' } });
    await db.records.put({ id: 'trab-q1', kind: 'quesito', caseId: 'trab', ts: {}, createdAt: 2, data: { origem: 'Juízo', numero: '1', texto: 'Havia exposição a ruído?' } });
    await db.records.put({ id: 'trab-q2', kind: 'quesito', caseId: 'trab', ts: {}, createdAt: 3, data: { origem: 'Juízo', numero: '2', texto: 'Qual o nível?', resposta: '88 dB(A).' } });
    const itens = await pendenciasDoCaso('trab');
    expect(itens.map((i) => i.id)).toEqual(['intimacao', 'presentes', 'q-trab-q1']);
    expect(itens.find((i) => i.id === 'q-trab-q1').explicacao).toBe('Havia exposição a ruído?');
  });
  it('o texto para o Claude leva a regra do caso, o tempo adotado, a conclusão escolhida e as cidades corrigidas', async () => {
    const { textoDoCaso } = await import('../src/aiimport.js');
    const { texto: t } = await textoDoCaso(CASO);
    expect(t).toContain('Regras do caso e valores adotados por vínculo');
    expect(t).toContain('tempo diário de condução 10 h');
    expect(t).toContain('conclusão da penosidade adotada: "Pela convergência cumulativa');
    expect(t).toContain('Cambé para Paiçandu, Cornélio Procópio, Maringá');
    expect(t).toContain('nesta avaliação');
  });
});
