import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { db, createRecord, caseChildren } from '../src/db.js';
import { guardarRedacao, ultimaRedacao, guardarWordFinal, wordFinalAtual } from '../src/redacao.js';
import { duplicarCaso } from '../src/duplicar.js';

// Dados sintéticos.
describe('Word corrigido guardado como versão final', () => {
  it('guarda o .docx no caso, marca quando o texto muda depois e não vai para a cópia do caso', async () => {
    const c = await createRecord('caso', null, { tipoAtuacao: 'Extrajudicial', autorNome: 'Segurado A' });
    await guardarRedacao(c.id, '# 1 Texto corrigido', { origem: 'Word corrigido (x.docx)', doc: 'ltcat' });
    const f = new File(['conteudo'], 'Laudo_v2.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const w = await guardarWordFinal(c.id, f, { doc: 'ltcat' });
    expect((await db.blobs.get(w.id)).blob.size).toBe(8);
    let red = await ultimaRedacao(c.id, 'ltcat');
    expect(wordFinalAtual(red)).toMatchObject({ nome: 'Laudo_v2.docx', desatualizado: false });
    await new Promise((r) => setTimeout(r, 5));
    await guardarRedacao(c.id, '# 1 Texto mudado depois', { origem: 'correções aplicadas', doc: 'ltcat' });
    red = await ultimaRedacao(c.id, 'ltcat');
    expect(wordFinalAtual(red).desatualizado).toBe(true);
    const r = await duplicarCaso(c.id, { nome: 'Segurado B' });
    const novoId = r.id || r.caso?.id || r;
    const reds = await caseChildren(novoId, 'redacao');
    expect(reds.length).toBe(1);
    expect(reds[0].data.wordFinal).toBeUndefined();
    expect((await caseChildren(novoId, 'anexo')).filter((a) => a.data.descricao === 'wordFinal').length).toBe(0);
  });
});
