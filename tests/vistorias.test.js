import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { db } from '../src/db.js';
import { PERFIL_ID } from '../src/docx/base.js';
import { vistoriasDoCaso, datasDasVistorias, vistoriaAtual, variasVistorias, chaveVistoria } from '../src/schema.js';
import { laudoPericial, parecerAssistente } from '../src/docx/modelos.js';
import { termoPresenca } from '../src/docx/modelos2.js';
import { aplicarIA } from '../src/aiimport.js';

// Dados sintéticos.
async function texto(r) {
  const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
  return (await zip.file('word/document.xml').async('string')).replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
}
const caso = (id, data) => db.records.put({ id, kind: 'caso', caseId: null, ts: {}, data });
const DUAS = {
  tipoAtuacao: 'Judicial', papel: 'Perito do Juízo', justica: 'Justiça do Trabalho', numero: '0000000-00.2026.5.09.0000', objeto: ['Insalubridade'],
  autorNome: 'Trabalhadora Teste', reuNome: 'Empresa Teste', vistoriaData: '2026-09-01', vistoriaInicio: '10:30', vistoriaLocal: 'Empresa Teste – unidade A',
  vistoriaEndereco: 'Rua A, 1', vistoriaPresentes: 'Fulano – coordenador – reclamada\nBeltrana – reclamante', vistoriaCondicoes: '1ª diligência; redesignada.',
  vistoriasQtd: '2', vistoria2Data: '2026-11-17', vistoria2Inicio: '09:00', vistoria2Fim: '11:15', vistoria2Presentes: 'Fulano – coordenador – reclamada\nCiclano – engenheiro – reclamada',
  vistoria2Objetivo: 'Visita às obras de rede de esgoto pendentes da 1ª vistoria.',
};

beforeAll(async () => {
  globalThis.fetch = async (url) => {
    const buf = await readFile(new URL(`../public/modelos/${String(url).split('/').pop()}`, import.meta.url));
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  await db.records.put({ id: PERFIL_ID, kind: 'perfil', caseId: null, data: { nome: 'Perito Teste', cidade: 'Cidade A' }, ts: {} });
});

describe('várias vistorias no mesmo caso', () => {
  it('lista, datas e vistoria atual', () => {
    const l = vistoriasDoCaso(DUAS);
    expect(l.map((v) => v.rotulo)).toEqual(['1ª vistoria', '2ª vistoria']);
    expect(l[1].local).toBe('Empresa Teste – unidade A'); // em branco = o da 1ª
    expect(datasDasVistorias(DUAS)).toBe('01/09/2026 e 17/11/2026');
    expect(vistoriaAtual(DUAS).n).toBe(2);
    expect(variasVistorias(DUAS)).toBe(true);
    // 2ª aba criada, mas vazia: não conta
    expect(vistoriasDoCaso({ vistoriaData: '2026-09-01', vistoriasQtd: '2' })).toHaveLength(1);
    expect(chaveVistoria(1, 'Data')).toBe('vistoriaData');
    expect(chaveVistoria(3, 'Presentes')).toBe('vistoria3Presentes');
  });
  it('laudo traz as duas vistorias; termo de presença é o da mais recente', async () => {
    await caso('v1', DUAS);
    let t = await texto(await laudoPericial('v1'));
    expect(t).toContain('1ª vistoria – data e horário');
    expect(t).toContain('17/11/2026, 09:00 às 11:15');
    expect(t).toContain('Visita às obras de rede de esgoto');
    expect(t).toContain('Ciclano');
    t = await texto(await termoPresenca('v1'));
    expect(t).toContain('TERMO DE PRESENÇA – 2ª DILIGÊNCIA PERICIAL');
    expect(t).toContain('17/11/2026');
    expect(t).toContain('Ciclano');
    expect(t).not.toContain('Beltrana');
  });
  it('manifestação do assistente cita as duas diligências', async () => {
    await caso('v2', { ...DUAS, papel: 'Assistente técnico do reclamante' });
    const t = await texto(await parecerAssistente('v2'));
    expect(t).toContain('as diligências periciais realizadas em 01/09/2026 e 17/11/2026');
  });
  it('anotações importadas com outra data vão para uma nova vistoria, sem mexer na 1ª', async () => {
    await caso('v3', { vistoriaData: '2026-09-01', vistoriaInicio: '10:30', vistoriaPresentes: 'Fulano' });
    await aplicarIA('v3', { caso: { vistoriaData: '2026-11-17', vistoriaInicio: '09:00', vistoriaPresentes: 'Ciclano', vistoriaNotas: 'continuação' },
      periodos: [], documentos: [], epis: [], quesitos: [], postos: [] });
    const c = (await db.records.get('v3')).data;
    expect(c.vistoriaData).toBe('2026-09-01');
    expect(c.vistoriaPresentes).toBe('Fulano');
    expect(c.vistoriasQtd).toBe('2');
    expect(c.vistoria2Data).toBe('2026-11-17');
    expect(c.vistoria2Presentes).toBe('Ciclano');
    expect(c.vistoria2Objetivo).toBe('continuação');
  });
});
