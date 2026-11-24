import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { db } from '../src/db.js';
import { PERFIL_ID } from '../src/docx/base.js';
import { laudoPrevidenciario } from '../src/docx/modelos.js';

// Dados sintéticos.
async function texto(r) {
  const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
  return (await zip.file('word/document.xml').async('string')).replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
}
const put = (id, kind, caseId, data) => db.records.put({ id, kind, caseId, ts: {}, createdAt: Date.now(), data });
beforeAll(async () => {
  globalThis.fetch = async (url) => {
    const buf = await readFile(new URL(`../public/modelos/${String(url).split('/').pop()}`, import.meta.url));
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  await db.records.put({ id: PERFIL_ID, kind: 'perfil', caseId: null, data: { nome: 'Perito Teste', cidade: 'Cidade A' }, ts: {} });
});

describe('troca por veículo sem similar medido: somente penosidade a partir da data', () => {
  it('corta o vínculo, usa a medição até a véspera e não cobra ruído nem vibração depois; ignora medição vazia', async () => {
    await put('sp', 'caso', null, { papel: 'Perito do Juízo', justica: 'Justiça Federal', materia: 'Previdenciária', vistoriaData: '2026-09-29' });
    await put('spv', 'periodo', 'sp', { empresa: 'Transportes Gama', inicio: '2014-09-01', fim: '2021-01-13', cargo: 'Motorista de carreta', conducaoH: '11',
      soPenosidadeDesde: '2019-08-01', veiculoDepois: 'Volvo FH 460 com ar-condicionado' });
    await put('spp', 'posto', 'sp', { nome: 'Motorista – Scania R124', vinculos: ['spv'] });
    await put('spm0', 'medicao', 'sp', { agente: 'Ruído', postoId: 'spp' }); // aberta e não preenchida
    await put('spm1', 'medicao', 'sp', { agente: 'Ruído', postoId: 'spp', lavg: '93.1', nen: '96.0', tempoAmostragem: '60' });
    const t = await texto(await laudoPrevidenciario('sp'));
    expect(t).toContain('A partir de 01/08/2019, o autor passou a conduzir Volvo FH 460 com ar-condicionado');
    expect(t).toContain('31/07/2019');
    expect(t).toContain('Ruído e VCI: não avaliados – veículo sem similar medido (somente penosidade)');
    expect(t).toContain('Somente penosidade (veículo sem similar medido)');
    expect(t).not.toContain('[[vincular posto');
    expect(t).toContain('NEN 96,0 dB(A) &gt; 85 dB(A)'); // NEN do relatório, sem recalcular; a medição vazia não é a representativa
  });
});

describe('relatório × vistoria: alertas de discrepância nas pendências', () => {
  it('jornada do relatório diferente do tempo de condução e data fora da vistoria', async () => {
    const { pendenciasDoCaso } = await import('../src/pendencias.js');
    await put('dz', 'caso', null, { papel: 'Perito do Juízo', justica: 'Justiça Federal', materia: 'Previdenciária', vistoriaData: '2026-09-29', vistoriaPresentes: 'Fulano', vistoriaIntimacao: 'ev. 1' });
    await put('dzv', 'periodo', 'dz', { empresa: 'Transportes Delta', inicio: '2014-09-01', fim: '2019-07-31', cargo: 'Motorista de carreta', conducaoH: '12' });
    await put('dzp', 'posto', 'dz', { nome: 'Motorista – carreta', vinculos: ['dzv'] });
    await put('dzm', 'medicao', 'dz', { agente: 'Vibração de corpo inteiro (VCI)', postoId: 'dzp', aren: '1.20', vdv: '16.1', tempoExposicao: '15:00:00', dataMedicao: '2025-09-29', horaInicio: '11:35' });
    const itens = await pendenciasDoCaso('dz');
    const t = itens.map((i) => i.titulo).join(' | ');
    expect(t).toContain('relatório normalizado para 15 h');
    expect(t).toContain('fora das datas da vistoria');
  });
});

describe('conferir o amarelo', () => {
  it('trechos vizinhos formam uma marca só, agrupada pela seção, com o quesito', async () => {
    const { marcacoesNoDocumento } = await import('../src/pendencias.js');
    await put('am', 'caso', null, { papel: 'Perito do Juízo', justica: 'Justiça Federal', materia: 'Previdenciária' });
    await put('amq', 'quesito', 'am', { origem: 'Juízo', numero: 'b', texto: 'Qual a configuração dos agentes?', resposta: 'Ruído medido. [[pendência: confirmar a similaridade com o **Scania 113 HW**]]' });
    const m = await marcacoesNoDocumento(() => laudoPrevidenciario('am'));
    const q = m.filter((x) => /QUESITO/i.test(x.secao));
    expect(q.some((x) => /similaridade com o Scania 113 HW/.test(x.texto))).toBe(true);
    expect(m.some((x) => x.texto === 'Scania 113 HW')).toBe(false);
  });
});

describe('texto do caso para o Claude', () => {
  it('leva os vínculos que o posto representa, a troca de veículo e o resultado calculado por vínculo; sem medição vazia', async () => {
    const { textoDoCaso } = await import('../src/aiimport.js');
    const { texto } = await textoDoCaso('sp');
    expect(texto).toContain('Representa os vínculos');
    expect(texto).toContain('somente penosidade');
    expect(texto).toContain('Resultado calculado pelo app por vínculo');
    expect(texto).toContain('NEN 96,0 dB(A)');
    expect((texto.match(/\[Ruído\]/g) || []).length).toBe(1);
  });
});

describe('jornada da medição de vibração', () => {
  it('vale o tempo de exposição da tela, não a "jornada" antiga escondida', async () => {
    const { pendenciasDoCaso } = await import('../src/pendencias.js');
    await put('jv', 'caso', null, { papel: 'Perito do Juízo', justica: 'Justiça Federal', materia: 'Previdenciária', vistoriaData: '2026-09-29', vistoriaPresentes: 'Fulano', vistoriaIntimacao: 'ev. 1' });
    await put('jvv', 'periodo', 'jv', { empresa: 'Transportes Eta', inicio: '2014-09-01', fim: '2019-07-31', cargo: 'Motorista de carreta', conducaoH: '12' });
    await put('jvp', 'posto', 'jv', { nome: 'Motorista – carreta', vinculos: ['jvv'] });
    await put('jvm', 'medicao', 'jv', { agente: 'Vibração de corpo inteiro (VCI)', postoId: 'jvp', aren: '1.07', vdv: '15.74', jornada: '15:00', tempoExposicao: '12:00:00', dataMedicao: '2026-09-29', horaInicio: '11:35' });
    const t = (await pendenciasDoCaso('jv')).map((i) => i.titulo).join(' | ');
    expect(t).not.toContain('normalizado para');
  });
});

describe('pendências de paradigma e conclusão da penosidade', () => {
  it('vínculo medido neste processo não pede paradigma, mesmo com o banco liberado', async () => {
    const { pendenciasDoCaso } = await import('../src/pendencias.js');
    await put('pg', 'caso', null, { papel: 'Perito do Juízo', justica: 'Justiça Federal', materia: 'Previdenciária', usarBancoParadigmas: true, vistoriaData: '2026-09-29', vistoriaPresentes: 'Fulano', vistoriaIntimacao: 'ev. 1' });
    await put('pgv', 'periodo', 'pg', { empresa: 'Transportes Teta', inicio: '2010-02-01', fim: '2011-12-21', cargo: 'Motorista de carreta', conducaoH: '12', penosidadeResultado: 'Sim – caracteriza' });
    await put('pgp', 'posto', 'pg', { nome: 'Motorista – carreta', vinculos: ['pgv'] });
    await put('pgm1', 'medicao', 'pg', { agente: 'Ruído', postoId: 'pgp', lavg: '93.1', jornada: '12:00', dataMedicao: '2026-09-29' });
    await put('pgm2', 'medicao', 'pg', { agente: 'Vibração de corpo inteiro (VCI)', postoId: 'pgp', aren: '1.07', vdv: '15.74', tempoExposicao: '12:00:00', dataMedicao: '2026-09-29' });
    const t = (await pendenciasDoCaso('pg')).map((i) => i.titulo).join(' | ');
    expect(t).not.toContain('Paradigma de');
  });
  it('texto próprio que contradiz o resultado escolhido vira pendência', async () => {
    const { contradizResultado } = await import('../src/pendencias.js');
    expect(contradizResultado('Sim – caracteriza', 'Os fatores apurados não caracterizam a penosidade.')).toBe(true);
    expect(contradizResultado('Sim – caracteriza', 'A penosidade não restou caracterizada.')).toBe(true);
    expect(contradizResultado('Sim – caracteriza', 'Não se caracteriza a penosidade.')).toBe(true);
    expect(contradizResultado('Sim – caracteriza', 'A penosidade fica caracterizada.')).toBe(false);
    expect(contradizResultado('Não – não caracteriza', 'A penosidade fica caracterizada pela convergência.')).toBe(true);
  });
});
