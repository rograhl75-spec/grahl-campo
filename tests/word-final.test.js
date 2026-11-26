import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { db, createRecord, caseChildren } from '../src/db.js';
import { guardarRedacao, ultimaRedacao, guardarWordFinal, wordsFinais, wordFinalDesatualizado } from '../src/redacao.js';
import { duplicarCaso } from '../src/duplicar.js';

// Dados sintéticos.
const docx = (nome) => new File(['conteudo'], nome, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
describe('arquivo final do documento', () => {
  it('guarda o Word corrigido com o texto, avisa quando o texto muda depois e não vai para a cópia do caso', async () => {
    const c = await createRecord('caso', null, { tipoAtuacao: 'Extrajudicial', autorNome: 'Segurado A' });
    await guardarRedacao(c.id, '# 1 Texto corrigido', { origem: 'Word corrigido (x.docx)', doc: 'ltcat' });
    const id = await guardarWordFinal(c.id, docx('Laudo_v2.docx'), { doc: 'ltcat' });
    expect((await db.blobs.get(id)).blob.size).toBe(8);
    let [w] = await wordsFinais(c.id, 'ltcat');
    expect(w.data.nome).toBe('Laudo_v2.docx');
    expect(wordFinalDesatualizado(w, await ultimaRedacao(c.id, 'ltcat'))).toBe(false);
    await new Promise((r) => setTimeout(r, 5));
    await guardarRedacao(c.id, '# 1 Texto mudado depois', { origem: 'correções aplicadas', doc: 'ltcat' });
    expect(wordFinalDesatualizado(w, await ultimaRedacao(c.id, 'ltcat'))).toBe(true);
    const r = await duplicarCaso(c.id, { nome: 'Segurado B' });
    const novoId = r.id || r.caso?.id || r;
    expect((await caseChildren(novoId, 'redacao')).length).toBe(1);
    expect((await wordsFinais(novoId, 'ltcat')).length).toBe(0);
  });
  it('guarda só o arquivo, sem texto do documento e sem mudar a redação', async () => {
    const c = await createRecord('caso', null, { autorNome: 'Segurado C' });
    await guardarWordFinal(c.id, docx('PPP_12.docx'), { doc: 'ppp', comTexto: false });
    const l = await wordsFinais(c.id, 'ppp');
    expect(l.length).toBe(1);
    expect(l[0].data.textoEm).toBe('');
    expect(wordFinalDesatualizado(l[0], null)).toBe(false);
    expect(await ultimaRedacao(c.id, 'ppp')).toBeNull();
    expect((await wordsFinais(c.id, 'ltcat')).length).toBe(0);
  });
});
