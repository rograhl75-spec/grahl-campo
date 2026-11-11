import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { db } from '../src/db.js';
import { PERFIL_ID } from '../src/docx/base.js';
import { CATALOGO } from '../src/docx/reports.js';
import { laudoPericial, laudoPrevidenciario, ltcatPpp, respostaQuesitosSuplementares } from '../src/docx/modelos.js';
import { termoPresenca, parecerTrabalhista, propostaServicos, linhasRecomendacoes } from '../src/docx/modelos2.js';

// Dados sintéticos; limites fictícios só para testar os cálculos.
const AG = { nome: 'Solvente X', cas: '000-00-0', massaMolar: '92,1', nr15Ppm: '78', nr15Mgm3: '290', nr15Grau: 'médio', nr15Pele: 'Sim', nr15Teto: 'Não', linach: 'Grupo 1', codDecretos: '1.0.3 (Dec. 3.048/1999)' };
const ids = (c) => CATALOGO.filter((d) => d.rec(c)).map((d) => d.id);

async function texto(r) {
  const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
  return (await zip.file('word/document.xml').async('string')).replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
}
const caso = (id, data) => db.records.put({ id, kind: 'caso', caseId: null, ts: {}, data });
const filho = (id, kind, caseId, data) => db.records.put({ id, kind, caseId, ts: {}, data });

beforeAll(async () => {
  globalThis.fetch = async (url) => {
    const buf = await readFile(new URL(`../public/modelos/${String(url).split('/').pop()}`, import.meta.url));
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  await db.records.put({ id: PERFIL_ID, kind: 'perfil', caseId: null, data: { nome: 'Perito Teste', cidade: 'Cidade A' }, ts: {} });
  await db.records.put({ id: 'qui-x', kind: 'quimico', caseId: null, ts: {}, data: AG });
});

describe('modelos sugeridos (itens pendentes)', () => {
  it('extrajudicial: proposta de serviços; trabalhador recebe o parecer de viabilidade, empresa não', () => {
    const trab = { tipoAtuacao: 'Extrajudicial', contratadoPor: 'Advogado', objeto: ['Insalubridade'] };
    expect(ids(trab)).toEqual(expect.arrayContaining(['proposta', 'parTrab', 'laudoExtra', 'termo']));
    expect(ids({ ...trab, contratadoPor: 'Empresa' })).not.toContain('parTrab');
    expect(ids({ tipoAtuacao: 'Judicial', papel: 'Assistente técnico do réu / reclamada', justica: 'Justiça do Trabalho' })).not.toContain('termo');
  });
});

describe('documentos (itens pendentes)', () => {
  it('laudo trabalhista: síntese no início, roteiro da NR-16, requisitos do art. 473 e comunicação às partes', async () => {
    await caso('t1', { papel: 'Perito do Juízo', justica: 'Justiça Estadual – Vara da Fazenda Pública', materia: 'Administrativa (servidor)', objeto: ['Insalubridade', 'Periculosidade'],
      agentesAlegados: 'Abastecimento de veículos com gasolina', vistoriaIntimacao: 'intimação do evento 52' });
    await filho('t1p', 'posto', 't1', { nome: 'Garagem' });
    await filho('t1m', 'medicao', 't1', { agente: 'Ruído', postoId: 't1p', dose: '60', tempoAmostragem: '480', jornada: '480', lavg: '81' });
    const t = await texto(await laudoPericial('t1'));
    expect(t).toContain('SÍNTESE DA CONCLUSÃO');
    expect(t).toContain('Anexo II – Atividades e operações perigosas com inflamáveis');
    expect(t).not.toContain('Anexo V – Atividades perigosas em motocicleta');
    expect(t).toContain('Requisitos do laudo pericial – art. 473 do CPC');
    expect(t).toContain('intimação do evento 52');
  });
  it('laudo extrajudicial: recomendações a partir do nível de ação', async () => {
    await caso('t2', { tipoAtuacao: 'Extrajudicial', contratadoPor: 'Empresa', objeto: ['Insalubridade'], reuNome: 'Empresa Teste' });
    await filho('t2p', 'posto', 't2', { nome: 'Pintura' });
    await filho('t2m', 'medicao', 't2', { agente: 'Agente químico', postoId: 't2p', agenteBanco: 'qui-x', valor: '50', unidade: 'ppm' });
    await filho('t2r', 'medicao', 't2', { agente: 'Ruído', postoId: 't2p', dose: '30', tempoAmostragem: '480', jornada: '480' });
    const dados = { medicoes: [{ data: { agente: 'Agente químico', postoId: 't2p', agenteBanco: 'qui-x', valor: '50', unidade: 'ppm' } }, { data: { agente: 'Ruído', postoId: 't2p', dose: '30', tempoAmostragem: '480', jornada: '480' } }],
      postos: [{ id: 't2p', data: { nome: 'Pintura' } }], quimicos: [{ id: 'qui-x', data: AG }] };
    expect(linhasRecomendacoes(dados)).toHaveLength(1); // ruído abaixo de 50% não entra
    const t = await texto(await laudoPericial('t2', { extra: true }));
    expect(t).toContain('Recomendações por agente');
    expect(t).toContain('64% do LT (nível de ação: 50%)');
    expect(t).not.toContain('art. 473 do CPC');
  });
  it('laudo previdenciário: síntese por período e códigos do agente químico; LTCAT com dados para o PPP', async () => {
    await caso('t3', { papel: 'Perito do Juízo', justica: 'Justiça Federal', materia: 'Previdenciária' });
    await filho('t3v', 'periodo', 't3', { empresa: 'Indústria Teste', inicio: '2005-01-01', fim: '2010-12-31', postoId: 't3p' });
    await filho('t3p', 'posto', 't3', { nome: 'Pintura', periodos: ['t3v'] });
    await filho('t3m', 'medicao', 't3', { agente: 'Agente químico', postoId: 't3p', agenteBanco: 'qui-x', valor: '10', unidade: 'ppm', metodo: 'NIOSH 1501' });
    let t = await texto(await laudoPrevidenciario('t3'));
    expect(t).toContain('SÍNTESE DA CONCLUSÃO');
    expect(t).toContain('1.0.3 (Dec. 3.048/1999)');
    expect(t).toContain('Grupo 1 da LINACH');
    await db.records.update('t3', { 'data.tipoAtuacao': 'Extrajudicial', 'data.objeto': ['LTCAT'] });
    t = await texto(await ltcatPpp('t3'));
    expect(t).toContain('Dados para o PPP – exposição a fatores de risco');
    expect(t).toContain('01/01/2005 a 31/12/2010');
  });
  it('resposta aos suplementares: esclarecimentos ponto a ponto sobre o parecer do assistente', async () => {
    await caso('t4', { papel: 'Perito do Juízo', justica: 'Justiça Federal', esclParecerATRef: 'parecer do INSS, evento 60', esclParecerAT: 'Medição pontual :: A dosimetria cobriu 6 h da jornada.' });
    const t = await texto(await respostaQuesitosSuplementares('t4'));
    expect(t).toContain('art. 477, § 2º, inciso II');
    expect(t).toContain('Medição pontual');
    expect(t).toContain('A dosimetria cobriu 6 h da jornada.');
  });
  it('termo de presença, parecer de viabilidade e proposta de serviços', async () => {
    await caso('t5', { tipoAtuacao: 'Extrajudicial', contratadoPor: 'Advogado', contratante: 'Escritório Teste', objeto: ['Insalubridade'], autorNome: 'Trabalhador Teste',
      vistoriaPresentes: 'Fulano – supervisor – empresa', propostaValor: '3.500,00', propostaPrazo: '20' });
    let t = await texto(await termoPresenca('t5'));
    expect(t).toContain('TERMO DE PRESENÇA');
    expect(t).toContain('Fulano – supervisor – empresa');
    t = await texto(await parecerTrabalhista('t5'));
    expect(t).toContain('Viabilidade por pedido');
    expect(t).toContain('não substitui a perícia judicial');
    t = await texto(await propostaServicos('t5'));
    expect(t).toContain('R$ 3.500,00 (três mil e quinhentos reais)');
    expect(t).toContain('20 dias corridos');
    expect(t).toContain('Escritório Teste');
  });
});
