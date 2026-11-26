import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { aplicarTrocas, lerTrocas, guardarRedacao, ultimaRedacao, desfazerRedacao, promptAplicarCorrecoes, restaurarVersao, lerAuditoria, slugDoc, redacoesDoCaso } from '../src/redacao.js';
import { wordParaTexto } from '../src/docx/importarWord.js';

// Dados sintéticos.
const MD = `Título: Laudo técnico pericial

# 6 Conclusão
Com base na perícia, a posição técnica do perito é a seguinte:

Quadro: Elementos técnicos
| Elemento | Situação |
|---|---|
| Origem dos tempos | Relato do autor |
| Número de fornos | 2 × 1 |
Fonte: medições.

No período do forno elétrico, o calor não se caracteriza.
`;

describe('aplicar correções ao texto guardado', () => {
  it('troca, apaga e acrescenta linha de quadro; o resto não muda', () => {
    const { md, feitas, falhas } = aplicarTrocas(MD, [
      { buscar: 'a posição técnica do perito é a seguinte:', substituir: 'conclui-se tecnicamente o seguinte:' },
      { buscar: '| Origem dos tempos | Relato do autor |', substituir: '| Origem dos tempos | Relato do autor |\n| Incerteza do medidor | [[± __ °C]] |' },
      { buscar: 'No período do forno elétrico, o calor não se caracteriza.', substituir: 'No período do forno elétrico, o calor não foi avaliado.' },
      { buscar: 'trecho que não existe', substituir: 'x' },
    ]);
    expect(feitas.length).toBe(3);
    expect(falhas.map((f) => f.motivo)).toEqual(['trecho não encontrado']);
    expect(md).toContain('conclui-se tecnicamente o seguinte:');
    expect(md).toContain('| Incerteza do medidor | [[± __ °C]] |');
    expect(md).toContain('| Número de fornos | 2 × 1 |');
    expect(md).not.toContain('não se caracteriza');
  });
  it('trecho repetido não é trocado (ambíguo)', () => {
    const { falhas } = aplicarTrocas('a b a', [{ buscar: 'a', substituir: 'c' }]);
    expect(falhas[0].motivo).toBe('trecho aparece mais de uma vez');
  });
  it('lê o JSON da resposta', () => {
    const r = lerTrocas('Segue:\n{"trocas":[{"buscar":"x","substituir":"y"}],"naoAplicadas":["item 9: falta o dado"]}');
    expect(r.trocas).toHaveLength(1);
    expect(r.naoAplicadas).toEqual(['item 9: falta o dado']);
  });
  it('guarda o texto, a versão anterior e desfaz', async () => {
    await guardarRedacao('rc1', 'texto 1');
    await guardarRedacao('rc1', 'texto 2');
    expect((await ultimaRedacao('rc1')).data.md).toBe('texto 2');
    expect(await desfazerRedacao('rc1')).toBe(true);
    expect((await ultimaRedacao('rc1')).data.md).toBe('texto 1');
  });
  it('a instrução pede só as trocas, com o texto e as correções', () => {
    const p = promptAplicarCorrecoes(MD, '1. trocar posição por conclusão');
    expect(p).toContain('"trocas"');
    expect(p).toContain('1. trocar posição por conclusão');
    expect(p).toContain('Origem dos tempos');
  });
});

describe('texto por documento, histórico e auditoria', () => {
  it('cada documento guarda o seu texto', async () => {
    await guardarRedacao('rc2', 'laudo v1', { doc: 'laudo' });
    await guardarRedacao('rc2', 'petição v1', { doc: 'peticao:esclarecimentos', titulo: 'Esclarecimentos' });
    await guardarRedacao('rc2', 'laudo v2', { doc: 'laudo' });
    expect((await ultimaRedacao('rc2', 'laudo')).data.md).toBe('laudo v2');
    expect((await ultimaRedacao('rc2', 'peticao:esclarecimentos')).data.md).toBe('petição v1');
    expect((await redacoesDoCaso('rc2')).length).toBe(2);
  });
  it('histórico: volta a qualquer versão, e a atual vai para o histórico', async () => {
    for (const t of ['v1', 'v2', 'v3']) await guardarRedacao('rc3', t, { doc: 'd' });
    const r = await ultimaRedacao('rc3', 'd');
    expect(r.data.versoes.map((v) => v.md)).toEqual(['v2', 'v1']);
    await restaurarVersao('rc3', 'd', 1);
    const r2 = await ultimaRedacao('rc3', 'd');
    expect(r2.data.md).toBe('v1');
    expect(r2.data.versoes.map((v) => v.md)).toEqual(['v3', 'v2']);
    expect(await desfazerRedacao('rc3', 'd')).toBe(true);
    expect((await ultimaRedacao('rc3', 'd')).data.md).toBe('v3');
  });
  it('lê a auditoria do Claude', () => {
    const l = lerAuditoria('```json\n{"itens":[{"onde":"4.2","problema":"concordância","gravidade":"baixa","buscar":"é idêntico","substituir":"é idêntica","pergunta":""},{"onde":"5.3","problema":"falta a FDS","gravidade":"alta","buscar":"x","substituir":"[[dado: FDS]]","pergunta":"Qual a marca?"}]}\n```');
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ n: 1, gravidade: 'baixa', substituir: 'é idêntica' });
    expect(l[1].pergunta).toBe('Qual a marca?');
  });
  it('slug do assunto da petição', () => {
    expect(slugDoc('PETIÇÃO – Esclarecimentos ao laudo')).toBe('peticao-esclarecimentos-ao-laudo');
  });
  it('importa o corpo de uma petição em Word (sem endereçamento nem fecho)', () => {
    const P = (t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
    const xml = `<w:document xmlns:w="w"><w:body>${P('EXCELENTÍSSIMO SENHOR DOUTOR JUIZ FEDERAL DA VARA FEDERAL DE CIDADE A, ESTADO B, COM O DEVIDO RESPEITO E ACATAMENTO DE SEMPRE')}${P('Processo nº 0000')}${P('Perito Teste, perito judicial nomeado nos autos em epígrafe, vem, respeitosamente, à presença de Vossa Excelência, apresentar os esclarecimentos pedidos.')}${P('O laudo já responde ao quesito 3.')}${P('Nestes termos,')}${P('pede deferimento.')}</w:body></w:document>`;
    const md = wordParaTexto(xml, { titulo: 'Petição – esclarecimentos', peticao: true });
    expect(md).toContain('vem, respeitosamente');
    expect(md).toContain('O laudo já responde ao quesito 3.');
    expect(md).not.toContain('EXCELENTÍSSIMO');
    expect(md).not.toContain('Nestes termos');
  });
});

describe('instrução de auditoria', () => {
  it('leva o documento, os dados do caso, as regras e o formato das trocas', async () => {
    const { db } = await import('../src/db.js');
    const { promptAuditoria } = await import('../src/aiimport.js');
    await db.records.put({ id: 'rc9', kind: 'caso', caseId: null, ts: {}, data: { tipoAtuacao: 'Extrajudicial', autorNome: 'Segurado Teste' } });
    const p = await promptAuditoria('rc9', '# 1 Identificação\nTexto do laudo.', { tipo: 'ltcat' });
    expect(p).toContain('"itens"');
    expect(p).toContain('Texto do laudo.');
    expect(p).toContain('Segurado Teste');
    expect(p).toContain('PPP, item 15');
    const pp = await promptAuditoria('rc9', 'Petição.', { peticao: true });
    expect(pp).not.toContain('PPP, item 15');
  });
});
