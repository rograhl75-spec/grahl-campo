import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { db } from '../src/db.js';
import { PERFIL_ID } from '../src/docx/base.js';
import { CATALOGO, HONORARIOS } from '../src/docx/reports.js';
import { laudoPericial, parecerAssistente } from '../src/docx/modelos.js';
import { laudoAcidente, peticaoPeritoAvulsa, peticaoAssistente, PETICOES_PERITO, PETICOES_AT, normasDoAcidente } from '../src/docx/modelos2.js';
import { contextoLegal, ehAcidente } from '../src/schema.js';
import { situacaoDoCaso } from '../src/aiimport.js';
import {
  ppmParaMgm3, mgm3ParaPpm, fatorDesvio, confrontoAnexo11, somaMistura, fatorBriefScalaSemanal, agenteParaDados, importarBaseQuimicos, acharAgente,
} from '../src/quimicos.js';

// Dados sintéticos (nunca usar dados reais de processos nos testes do repositório).
// Os limites abaixo são fictícios: servem só para testar os cálculos.
const AG = { nome: 'Solvente X', cas: '000-00-0', massaMolar: '92,1', nr15Ppm: '78', nr15Mgm3: '290', nr15Grau: 'médio', nr15Pele: 'Sim', nr15Teto: 'Não' };

const ids = (c) => CATALOGO.filter((d) => d.rec(c)).map((d) => d.id);

describe('modelos sugeridos por tipo de trabalho', () => {
  it('perito previdenciário: um único cartão de honorários e o laudo previdenciário', () => {
    const r = ids({ tipoAtuacao: 'Judicial', papel: 'Perito do Juízo', justica: 'Justiça Federal', materia: 'Previdenciária' });
    expect(r).toContain('honorarios');
    expect(r).not.toContain('honor');
    expect(r).toContain('laudoprev');
    expect(r).toContain('peritoAvulsa');
    expect(r).not.toContain('laudo');
  });
  it('perito em Vara Cível de acidente recebe o laudo de acidente, não o da CLT', () => {
    const c = { tipoAtuacao: 'Judicial', papel: 'Perito do Juízo', justica: 'Justiça Estadual – Vara Cível', materia: 'Cível', objeto: ['Acidente / doença ocupacional'] };
    expect(ehAcidente(c)).toBe(true);
    expect(ids(c)).toContain('acidente');
    expect(ids(c)).not.toContain('laudo');
  });
  it('extrajudicial de insalubridade para empresa: laudo extrajudicial e parecer preventivo, sem LTCAT', () => {
    const c = { tipoAtuacao: 'Extrajudicial', papel: 'Laudo extrajudicial (contratante)', contratadoPor: 'Empresa', objeto: ['Insalubridade', 'Periculosidade'] };
    expect(contextoLegal(c).prev).toBe(false);
    const r = ids(c);
    expect(r).toEqual(expect.arrayContaining(['laudoExtra', 'prevent']));
    expect(r).not.toContain('ltcat');
    expect(situacaoDoCaso(c)).toBe('extra-trab');
  });
  it('extrajudicial previdenciário para o segurado: LTCAT e parecer; para a empresa, só LTCAT', () => {
    const seg = { tipoAtuacao: 'Extrajudicial', contratadoPor: 'Trabalhador / segurado', objeto: ['LTCAT'] };
    expect(ids(seg)).toEqual(expect.arrayContaining(['ltcat', 'parprev']));
    expect(ids({ ...seg, contratadoPor: 'Empresa' })).not.toContain('parprev');
    // caso antigo, sem objeto: continua previdenciário (LTCAT)
    expect(contextoLegal({ tipoAtuacao: 'Extrajudicial' }).prev).toBe(true);
  });
  it('extrajudicial de acidente: laudo de acidente', () => {
    const c = { tipoAtuacao: 'Extrajudicial', objeto: ['Acidente / doença ocupacional'] };
    expect(ids(c)).toContain('acidente');
    expect(situacaoDoCaso(c)).toBe('acidente');
  });
  it('assistente técnico: relatório de acompanhamento, parecer e petições; parecer previdenciário não aparece', () => {
    const r = ids({ tipoAtuacao: 'Judicial', papel: 'Assistente técnico do autor / reclamante', justica: 'Justiça Federal', materia: 'Previdenciária' });
    expect(r).toEqual(expect.arrayContaining(['acomp', 'parecerAT', 'atAvulsa', 'indic']));
    expect(r).not.toContain('parprev');
    expect(r).not.toContain('reg');
  });
});

describe('agentes químicos – importação colada', () => {
  it('completa o agente existente pelo CAS, acrescenta a fonte e não cria repetido', async () => {
    const { importarAgentesColados } = await import('../src/quimicos.js');
    await db.records.put({ id: 'qui-agente-y', kind: 'quimico', caseId: null, ts: { nome: 1 }, data: { nome: 'Agente Y', cas: '111-11-1', fontes: 'Fonte base', situacao: 'Conferido' } });
    const json = JSON.stringify({ agentes: [{ nome: 'Agent Y', cas: '111-11-1', acgih: { twa: '10 ppm', notacoes: 'Skin', edicao: '2026' }, fontes: [{ referencia: 'Livro de referência 2026' }] }] });
    expect(await importarAgentesColados(json)).toBe(1);
    const lista = (await db.records.where('kind').equals('quimico').toArray()).filter((r) => r.data.cas === '111-11-1');
    expect(lista).toHaveLength(1);
    expect(lista[0].data).toMatchObject({ nome: 'Agente Y', acgihTwa: '10 ppm', acgihNotacoes: 'Skin', acgihEdicao: '2026', situacao: 'Conferido' });
    expect(lista[0].data.fontes).toBe('Fonte base\nLivro de referência 2026');
  });
});

describe('agentes químicos – cálculos', () => {
  it('converte ppm e mg/m³ pela massa molar (24,45 L/mol)', () => {
    expect(ppmParaMgm3(100, 92.14)).toBeCloseTo(376.85, 1);
    expect(mgm3ParaPpm('376,85', '92,14')).toBeCloseTo(100, 1);
  });
  it('fator de desvio do Quadro 2 do Anexo 11', () => {
    expect(fatorDesvio(0.5)).toBe(3);
    expect(fatorDesvio(5)).toBe(2);
    expect(fatorDesvio(78)).toBe(1.5);
    expect(fatorDesvio(500)).toBe(1.25);
    expect(fatorDesvio(1500)).toBe(1.1);
  });
  it('confronto com o Anexo 11: média, valor máximo e conversão de unidade', () => {
    const a = confrontoAnexo11(AG, '80', 'ppm', { maximo: '130' });
    expect(a.supera).toBe(true);
    expect(a.lt).toBe(78);
    expect(a.graveIminente).toBe(true); // 130 > 78 × 1,5
    const b = confrontoAnexo11(AG, '150', 'mg/m³');
    expect(b.lt).toBe(290);
    expect(b.supera).toBe(false);
    const teto = confrontoAnexo11({ ...AG, nr15Teto: 'Sim' }, '50', 'ppm', { maximo: '90' });
    expect(teto.supera).toBe(true); // valor teto: qualquer amostra acima do limite
  });
  it('mistura aditiva e Brief & Scala semanal', () => {
    expect(somaMistura([{ c: 50, lt: 78 }, { c: '20', lt: '100' }])).toBeCloseTo(0.841, 3);
    expect(fatorBriefScalaSemanal(48)).toBeCloseTo((40 / 48) * (120 / 128), 6);
    expect(fatorBriefScalaSemanal(40)).toBe(1);
  });
  it('base: agente do arquivo vira ficha plana, e a reimportação não passa por cima da edição', async () => {
    const d = agenteParaDados({ nome: 'Solvente X', cas: '000-00-0', sinonimos: ['SX'], nr15: { anexo11: { ppm: '78', mgm3: '290', grau: 'médio', pele: true, teto: false } }, fontes: [{ referencia: 'Fonte A', url: 'https://exemplo' }] });
    expect(d).toMatchObject({ nr15Ppm: '78', nr15Pele: 'Sim', nr15Teto: 'Não', sinonimos: 'SX', situacao: 'A conferir' });
    const base = { versao: '2026-11-11', agentes: [{ id: 'solvente-x', nome: 'Solvente X', cas: '000-00-0', massaMolar: '92,1' }] };
    expect((await importarBaseQuimicos(base)).gravados).toBe(1);
    const { updateFields } = await import('../src/db.js');
    await updateFields('qui-solvente-x', { massaMolar: '92,14' });
    await importarBaseQuimicos({ ...base, versao: '2026-12-01' });
    const rec = await db.records.get('qui-solvente-x');
    expect(rec.data.massaMolar).toBe('92,14');
    expect(acharAgente([rec], '000-00-0').id).toBe('qui-solvente-x');
    expect(acharAgente([rec], 'sx')).toBe(null);
  });
});

// ---------------- documentos ----------------
async function textoDoDocx(blob) {
  const buf = blob.arrayBuffer ? await blob.arrayBuffer() : blob;
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');
  return xml.replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
}

const caso = async (id, data) => db.records.put({ id, kind: 'caso', caseId: null, ts: {}, data });
const filho = async (id, kind, caseId, data) => db.records.put({ id, kind, caseId, ts: {}, data });

beforeAll(async () => {
  globalThis.fetch = async (url) => {
    const nome = String(url).split('/').pop();
    const buf = await readFile(new URL(`../public/modelos/${nome}`, import.meta.url));
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  await db.records.put({ id: PERFIL_ID, kind: 'perfil', caseId: null, data: { nome: 'Perito Teste', cidade: 'Cidade A' }, ts: {} });
  await db.records.put({ id: 'qui-teste', kind: 'quimico', caseId: null, ts: {}, data: { ...AG, linach: 'Grupo 1' } });
});

describe('documentos novos', () => {
  it('laudo extrajudicial: sem endereçamento, com ART, confronto do Anexo 11 e quadro conclusivo', async () => {
    await caso('c-extra', { tipoAtuacao: 'Extrajudicial', papel: 'Laudo extrajudicial (contratante)', contratadoPor: 'Empresa', objeto: ['Insalubridade'],
      reuNome: 'Empresa Teste Ltda.', art: '123456', vistoriaData: '2026-10-01' });
    await filho('ps1', 'posto', 'c-extra', { nome: 'Pintura' });
    await filho('m1', 'medicao', 'c-extra', { agente: 'Agente químico', postoId: 'ps1', agenteBanco: 'qui-teste', valor: '80', unidade: 'ppm', nAmostras: '3' });
    await filho('m2', 'medicao', 'c-extra', { agente: 'Ruído', postoId: 'ps1', dose: '120', tempoAmostragem: '480', jornada: '480', lavg: '86,3' });
    const t = await textoDoDocx((await laudoPericial('c-extra', { extra: true })).blob);
    expect(t).toContain('LAUDO TÉCNICO DE INSALUBRIDADE');
    expect(t).not.toContain('EXCELENTÍSSIMO');
    expect(t).toContain('123456');
    expect(t).toContain('Agentes químicos – confronto com o Anexo 11 da NR-15');
    expect(t).toContain('103% do LT – supera');
    expect(t).toContain('Quadro conclusivo por agente');
    expect(t).toContain('médio (20%)');
    expect(t).toContain('RECOMENDAÇÕES');
    expect(t).not.toMatch(/Brief/);
    expect(t).toContain('ContratanteEmpresa Teste Ltda.');
    expect(t).not.toContain('Código de Processo Civil');
    expect(t).not.toContain('nos autos');
  });
  it('laudo de acidente: normas detectadas pela máquina e pela atividade, sem opinar sobre o nexo médico', async () => {
    await caso('c-acid', { tipoAtuacao: 'Extrajudicial', objeto: ['Acidente / doença ocupacional'], autorNome: 'Trabalhador Teste',
      acidenteData: '2026-03-02', acidenteMaquina: 'Prensa excêntrica', acidenteAtividade: 'Alimentação manual da prensa', acidenteRelato: 'Relato fictício.' });
    const nrs = normasDoAcidente({ acidenteMaquina: 'Prensa excêntrica', acidenteAtividade: 'troca de telhas no telhado' }).map((x) => x.n);
    expect(nrs).toEqual(['NR-1', 'NR-12', 'NR-35', 'NR-6']);
    const t = await textoDoDocx((await laudoAcidente('c-acid')).blob);
    expect(t).toContain('LAUDO TÉCNICO DE ACIDENTE DO TRABALHO');
    expect(t).toContain('02/03/2026');
    expect(t).toContain('NR-12');
    expect(t).toContain('matéria médica');
    expect(t).toContain('Relato fictício.');
    expect(t).not.toContain('RESPOSTAS AOS QUESITOS');
  });
  it('petições avulsas do perito: prorrogação com dias por extenso e diligência frustrada', async () => {
    await caso('c-per', { papel: 'Perito do Juízo', justica: 'Justiça Federal', materia: 'Previdenciária', juizo: '1ª Vara Federal de Cidade A', prazoLaudo: '2026-12-10',
      peticaoPerito: PETICOES_PERITO[0], prorrogacaoDias: '15', peticaoMotivo: 'A empresa não apresentou o LTCAT.' });
    let t = await textoDoDocx((await peticaoPeritoAvulsa('c-per')).blob);
    expect(t).toContain('art. 476');
    expect(t).toContain('15 (quinze) dias');
    expect(t).toContain('10/12/2026');
    await db.records.update('c-per', { 'data.peticaoPerito': PETICOES_PERITO[1] });
    t = await textoDoDocx((await peticaoPeritoAvulsa('c-per')).blob);
    expect(t).toContain('art. 474');
    expect(t).toContain('nova data');
  });
  it('assistente técnico: posição "concorda" muda os requerimentos; petição de esclarecimentos cita o art. 477', async () => {
    await caso('c-at', { tipoAtuacao: 'Judicial', papel: 'Assistente técnico do autor / reclamante', justica: 'Justiça Federal', materia: 'Previdenciária',
      posicaoAT: 'Concorda com o laudo', refLaudo: 'evento 45', peticaoAT: PETICOES_AT[1] });
    await filho('pr1', 'periodo', 'c-at', { empresa: 'Transportes Teste', inicio: '1990-01-01', fim: '1999-12-31' });
    let t = await textoDoDocx((await parecerAssistente('c-at')).blob);
    expect(t).toContain('concorda com as conclusões do laudo');
    expect(t).not.toContain('não seja acolhido');
    expect(t).toContain('Transportes Teste');
    expect(t).toContain('ANÁLISE POR PERÍODO');
    t = await textoDoDocx((await peticaoAssistente('c-at')).blob);
    expect(t).toContain('art. 477, § 2º');
    expect(t).toContain('evento 45');
  });
  it('cartão de honorários escolhe a petição pela situação', async () => {
    await caso('c-hon', { papel: 'Perito do Juízo', justica: 'Justiça Estadual – Vara da Fazenda Pública', honorariosSituacao: HONORARIOS[0], juizo: 'Vara Teste' });
    const card = CATALOGO.find((d) => d.id === 'honorarios');
    expect((await card.fn('c-hon', {})).nome).toMatch(/^Peticao_honorarios_/);
  });
});
