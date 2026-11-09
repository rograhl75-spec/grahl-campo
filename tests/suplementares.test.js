import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { db, createRecord, caseChildren } from '../src/db.js';
import { respostaQuesitosSuplementares, laudoPrevidenciario, peticaoPagamento } from '../src/docx/modelos.js';
import { lerJsonSuplementares, aplicarSuplementares, montarPromptSuplementares } from '../src/aiimport.js';
import { PERFIL_ID } from '../src/docx/base.js';

// Dados sintéticos (nunca usar dados reais de processos nos testes do repositório)
const CASO = 'caso-supl-teste';

beforeAll(async () => {
  globalThis.fetch = async (url) => {
    const nome = String(url).split('/').pop();
    const buf = await readFile(new URL(`../public/modelos/${nome}`, import.meta.url));
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  await db.records.put({ id: PERFIL_ID, kind: 'perfil', caseId: null, data: {}, ts: {} });
  await db.records.put({
    id: CASO, kind: 'caso', caseId: null, ts: {},
    data: {
      papel: 'Perito do Juízo', tipoAtuacao: 'Judicial', materia: 'Previdenciária', justica: 'Justiça Estadual – competência delegada (previdenciária)',
      numero: '0000000-00.2026.8.16.0000', juizo: 'Vara de Competência Delegada de Cidade A', autorNome: 'Autor Teste', reuNome: 'INSTITUTO NACIONAL DO SEGURO SOCIAL – INSS',
      vistoriaData: '2026-07-01', vistoriaInicio: '09:00', vistoriaFim: '10:30', vistoriaPresentes: 'Fulano – técnico da empresa',
      laudoRefPerito: 'mov. 50.1', laudoData: '2026-08-01', esclDecisaoRef: 'decisão do mov. 60.1',
      esclRetificacoes: 'Resposta ao quesito 1 do INSS: onde se lê 11h00 às 13h00, leia-se 09h00 às 10h30',
      fase: 'Aguardando manifestação / esclarecimentos',
    },
  });
  await createRecord('quesito', CASO, { origem: 'INSS', numero: '1', texto: 'Quesito inicial do INSS?', resposta: 'Resposta do laudo.', ordem: 1 });
});

async function textoDoDocx(blob) {
  const buf = blob.arrayBuffer ? await blob.arrayBuffer() : blob;
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');
  return xml.replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
}

const JSON_IA = '```json\n' + JSON.stringify({
  esclarecimentos: { laudoRefPerito: 'mov. 99', laudoData: '02/08/2026', esclDecisaoRef: '', prazoEsclarecimentos: '2026-09-15', retificacoes: '', observacoes: '', ratifica: 'sim' },
  quesitos: [
    { origem: 'Autor', numero: '1', refPeticao: 'mov. 55.1', texto: 'Informe o local da vistoria, especificando:\na) a denominação;\nb) se é o mesmo local.', resposta: 'a) Pátio da unidade X.\nb) Sim, o mesmo local.' },
    { origem: 'Autor', numero: '2', refPeticao: 'mov. 55.1', texto: 'Esclareça o horário da vistoria.', resposta: '' },
  ],
}) + '\n```';

describe('quesitos suplementares', () => {
  it('lê o JSON do Claude, normaliza origem, ratificação e datas', () => {
    const r = lerJsonSuplementares(JSON_IA);
    expect(r.quesitos).toHaveLength(2);
    expect(r.quesitos[0].origem).toBe('Autor / Reclamante');
    expect(r.caso.esclRatifica).toBe('Sim');
    expect(r.caso.laudoData).toBeUndefined(); // data fora do formato é descartada
    expect(r.caso.prazoEsclarecimentos).toBe('2026-09-15');
  });

  it('aplica sem duplicar, não sobrescreve o que já existe e muda a fase', async () => {
    const dados = lerJsonSuplementares(JSON_IA);
    const r1 = await aplicarSuplementares(CASO, dados);
    expect(r1.novos).toBe(2);
    const r2 = await aplicarSuplementares(CASO, dados);
    expect(r2.novos).toBe(0);
    const qs = await caseChildren(CASO, 'quesito');
    expect(qs.filter((q) => q.data.suplementar === 'Sim')).toHaveLength(2);
    const caso = await db.records.get(CASO);
    expect(caso.data.laudoRefPerito).toBe('mov. 50.1'); // já preenchido: mantido
    expect(caso.data.prazoEsclarecimentos).toBe('2026-09-15');
    expect(caso.data.fase).toBe('Respondendo quesitos suplementares');
  });

  it('a instrução leva os registros de campo e marca os suplementares', async () => {
    const t = await montarPromptSuplementares(CASO);
    expect(t).toContain('fonte primária');
    expect(t).toContain('09:00');
    expect(t).toContain('[SUPLEMENTAR – Autor / Reclamante 1 – mov. 55.1]');
  });

  it('gera a resposta com decisão, laudo, quesitos por parte, retificação e ratificação', async () => {
    const r = await respostaQuesitosSuplementares(CASO);
    const t = await textoDoDocx(r.blob);
    expect(r.nome).toMatch(/^Resposta_quesitos_suplementares_/);
    expect(t).toContain('em atenção à decisão do mov. 60.1');
    expect(t).toContain('laudo pericial juntado aos autos (mov. 50.1) em 01/08/2026');
    expect(t).toContain('art. 477, § 2º, inciso I');
    expect(t).toContain('QUESITOS SUPLEMENTARES DA PARTE AUTORA (MOV. 55.1)');
    expect(t).toContain('Quesito suplementar 1:');
    expect(t).toContain('a) Pátio da unidade X.');
    expect(t).toContain('Responder'); // quesito 2 sem resposta fica marcado
    expect(t).toContain('onde se lê 11h00 às 13h00');
    expect(t).toContain('ficam integralmente ratificadas');
    expect(t).not.toContain('Quesito inicial do INSS');
  });

  it('o laudo não repete os quesitos suplementares; o pagamento cita a juntada do laudo', async () => {
    const t = await textoDoDocx((await laudoPrevidenciario(CASO)).blob);
    expect(t).toContain('Quesito inicial do INSS');
    expect(t).not.toContain('Esclareça o horário da vistoria');
    const pg = await textoDoDocx((await peticaoPagamento(CASO, {})).blob);
    expect(pg).toContain('juntado aos autos em 01/08/2026 (mov. 50.1), tendo sido respondidos também os quesitos suplementares');
  });
});
