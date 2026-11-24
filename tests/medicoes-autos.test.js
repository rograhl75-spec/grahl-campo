import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { db } from '../src/db.js';
import { PERFIL_ID } from '../src/docx/base.js';
import { laudoPrevidenciario } from '../src/docx/modelos.js';
import { adicionarParadigmas, sugerirParaVinculo, citacaoDe, PROMPT_LAUDOS_DOS_AUTOS, fonteDosParadigmas } from '../src/paradigmas.js';

// Dados sintéticos: processos, peritos e valores fictícios.
const caso = (id, data) => db.records.put({ id, kind: 'caso', caseId: null, ts: {}, data });
const filho = (id, kind, caseId, data) => db.records.put({ id, kind, caseId, ts: {}, data });
async function texto(r) {
  const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
  return (await zip.file('word/document.xml').async('string')).replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
}
const veic = (marca, modelo, lavg, fonte) => ({ identificacao: { tipo: 'Cavalo', marca, modelo, ano: '2005' }, caracteristicas: { familia: 'F6' }, resultados: { lavg_q5: lavg, jornada_laudo_h: 8 }, fonte });

beforeAll(async () => {
  globalThis.fetch = async (url) => {
    const buf = await readFile(new URL(`../public/modelos/${String(url).split('/').pop()}`, import.meta.url));
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  await db.records.put({ id: PERFIL_ID, kind: 'perfil', caseId: null, data: { nome: 'Perito Teste', cidade: 'Cidade A' }, ts: {} });
});

describe('somente as medições dos laudos juntados aos autos', () => {
  it('sugestão usa só as medições do processo; o laudo cita o perito de origem, não o banco do signatário', async () => {
    // banco do signatário: veículo idêntico ao do vínculo
    await adicionarParadigmas([veic('Alfa', 'Modelo X', 92, { tipo: 'Judicial', processo: '0000001-00.2015.0.00.0000', vara: '1ª Vara Teste', data: '01/01/2016' })]);
    // laudo de outro perito juntado aos autos deste processo: veículo diferente
    const [cod] = await adicionarParadigmas([veic('Beta', 'Modelo Y', 89, { tipo: 'Judicial', processo: '0000002-00.2010.0.00.0000', vara: '2ª Vara Teste', data: '05/05/2010', perito: 'Fulano de Tal', paginas_autos: 'Evento 1, LAUDO7, p. 2-12' })],
      { processoAutos: '5000000-11.2022.4.04.0000' });
    await caso('ca', { papel: 'Perito do Juízo', justica: 'Justiça Federal', materia: 'Previdenciária', numero: '5000000-11.2022.4.04.0000/PR' });
    await filho('va', 'periodo', 'ca', { empresa: 'Transportes Teste', inicio: '2005-01-01', fim: '2010-12-31', veiculoTipo: 'Cavalo', veiculoMarca: 'Alfa', veiculoModelo: 'Modelo X', familiaVeiculo: 'F6', conducaoH: '8' });

    // perícia judicial sem indicação do juízo: sem paradigma
    const bloq = await sugerirParaVinculo(await db.records.get('va'));
    expect(bloq.bloqueado).toBe(true);
    expect(bloq.ruido).toBe(null);
    // juízo indicou a similaridade: o banco todo
    await db.records.update('ca', { 'data.similaridade': 'Sim' });
    const antes = await sugerirParaVinculo(await db.records.get('va'));
    expect(antes.ruido.p.data.marca).toBe('Alfa');

    await db.records.update('ca', { 'data.similaridade': 'Não', 'data.somenteMedicoesAutos': true });
    const s = await sugerirParaVinculo(await db.records.get('va'));
    expect(s.ruido.p.data.codigo).toBe(cod);
    expect(s.criterio).toContain('somente medições dos laudos juntados aos autos');

    const p = s.ruido.p;
    expect(citacaoDe(p)).toContain('perito Fulano de Tal');
    expect(citacaoDe(p)).toContain('juntado aos autos (Evento 1, LAUDO7, p. 2-12)');
    expect(fonteDosParadigmas([p])).toBe('Laudos periciais juntados aos autos (prova emprestada).');

    await db.records.update('va', { 'data.paradigmaRuido': cod });
    const t = await texto(await laudoPrevidenciario('ca'));
    expect(t).toContain('usa exclusivamente as medições constantes dos laudos periciais juntados aos autos');
    expect(t).toContain('pelo perito Fulano de Tal');
    expect(t).not.toContain('medições realizadas pelo signatário');
    expect(t).toContain('quantificados exclusivamente pelas medições constantes dos laudos periciais juntados aos autos');
    expect(t).toContain('Não houve medição instrumental nesta perícia');
    expect(t).not.toContain('complementados por paradigmas');
    expect(t).not.toContain('Banco de paradigmas do signatário');
  });
  it('instrução de extração pede perito, processo de origem e local nos autos', () => {
    expect(PROMPT_LAUDOS_DOS_AUTOS).toContain('"perito": ""');
    expect(PROMPT_LAUDOS_DOS_AUTOS).toContain('"paginas_autos": ""');
    expect(PROMPT_LAUDOS_DOS_AUTOS).toContain('processo DE ORIGEM');
    expect(PROMPT_LAUDOS_DOS_AUTOS).not.toContain('elaborados por mim');
  });
});

describe('revisão da coleta em campo pelo Claude', () => {
  it('a instrução leva as pendências do app e os dados do caso, e não pede a redação do laudo', async () => {
    const { promptRevisaoCampo } = await import('../src/aiimport.js');
    await caso('cr', { papel: 'Perito do Juízo', justica: 'Justiça Federal', materia: 'Previdenciária', autorNome: 'Segurado Teste' });
    const p = await promptRevisaoCampo('cr', [{ grupo: 'V1', titulo: 'Tempo diário de condução (h)', explicacao: 'informe as horas' }]);
    expect(p).toContain('Coletar agora (antes de sair do local)');
    expect(p).toContain('- V1: Tempo diário de condução (h) – informe as horas');
    expect(p).toContain('Segurado Teste');
    expect(p).toContain('não redija o laudo');
  });
});
