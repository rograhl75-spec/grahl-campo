import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { db } from '../src/db.js';
import { PERFIL_ID } from '../src/docx/base.js';
import { documentoDoClaude } from '../src/docx/claudeDoc.js';
import { exportarParaClaude } from '../src/aiimport.js';

// Dados sintéticos.
const MD = `Título: Laudo técnico pericial
Subtítulo: Caracterização de insalubridade

# 1 Identificação
Texto **importante** com [[pendência]].

## 1.1 Dados do processo
Parágrafo em
duas linhas.

Quadro: Resultados por agente
| Agente | Resultado | Limite |
|---|---|---|
| Ruído | 88,4 dB(A) | 85 dB(A) |
| Calor | 27,1 °C | 26,7 °C |
Fonte: Medições do signatário.

Fluxo: Etapas da avaliação
1. Autos – despacho e quesitos
2. Diligência – vistoria
3. Conclusão

- item um
- item dois
`;

async function texto(r) {
  const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
  return (await zip.file('word/document.xml').async('string')).replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
}
beforeAll(async () => {
  globalThis.fetch = async (url) => {
    const buf = await readFile(new URL(`../public/modelos/${String(url).split('/').pop()}`, import.meta.url));
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  await db.records.put({ id: PERFIL_ID, kind: 'perfil', caseId: null, data: { nome: 'Perito Teste', titulos: 'Engenheiro', crea: 'CREA 1', cidade: 'Cidade A' }, ts: {} });
  await db.records.put({ id: 'cd1', kind: 'caso', caseId: null, ts: {}, data: { tipoAtuacao: 'Judicial', papel: 'Perito do Juízo', justica: 'Justiça do Trabalho', numero: '0000000-00.2026.5.09.0000', autorNome: 'Trabalhadora Teste', reuNome: 'Empresa Teste', vistoriaData: '2026-09-01' } });
});

describe('texto do Claude montado no timbrado', () => {
  it('capa, sumário, títulos, quadro e fluxo numerados, lista e assinatura', async () => {
    const r = await documentoDoClaude('cd1', MD);
    const t = await texto(r);
    expect(t).toContain('LAUDO TÉCNICO PERICIAL');
    expect(t).toContain('Caracterização de insalubridade');
    expect(t).toContain('SUMÁRIO');
    expect(t).toContain('1 IDENTIFICAÇÃO');
    expect(t).toContain('1.1 DADOS DO PROCESSO');
    expect(t).toContain('Parágrafo em duas linhas.');
    expect(t).toContain('Quadro 1 – Resultados por agente');
    expect(t).toContain('88,4 dB(A)');
    expect(t).toContain('Fonte: Medições do signatário.');
    expect(t).toContain('Figura 1 – Etapas da avaliação');
    expect(t).toContain('LISTA DE QUADROS');
    expect(t).toContain('item dois');
    expect(t).toContain('Perito Teste');
    expect(t).not.toContain('Título:');
    expect(r.nome).toMatch(/^Laudo_t/i);
  });
  it('a instrução para o Claude traz as convenções de formato', async () => {
    const p = await exportarParaClaude('cd1', 'laudo');
    expect(p).toContain('"Quadro: título do quadro"');
    expect(p).toContain('Fluxo: título');
  });
});

describe('partes que o app monta e fórmulas', () => {
  it('fórmula em texto simples vira notação do app; $...$ vira equação do Word', async () => {
    const { formulasDoTexto } = await import('../src/docx/claudeDoc.js');
    expect(formulasDoTexto('Ruído (q = 5): NEN = Lavg + 16,61·log(T/8), com T em horas.')).toBe('Ruído (q = 5): $NEN = L_{avg} + 16,61·\\log(T/8)$, com T em horas.');
    expect(formulasDoTexto('Vibração: aren(T) = arep·√(T/8).')).toBe('Vibração: $a_{ren}(T) = a_{rep}·\\sqrt{T/8}$.');
    expect(formulasDoTexto('Vibração: VDVR(T) = VDVR(medido)·(T/Tmedição)^0,25.')).toBe('Vibração: $VDV_{R}(T) = VDV_{R}(medido)·(T/T_{medição})^{0,25}$.');
    expect(formulasDoTexto('O cálculo foi NEN = 93,1 + 16,61·log(12/8) = 93,1 + 2,9 = 96,0 dB(A).')).toBe('O cálculo foi $NEN = 93,1 + 16,61·\\log(12/8) = 93,1 + 2,9 = 96,0$ dB(A).');
    expect(formulasDoTexto('O NEN = 96,0 dB(A) supera o limite.')).toBe('O NEN = 96,0 dB(A) supera o limite.');
    expect(formulasDoTexto('Honorários de R$ 3.000,00 e R$ 500,00.')).toBe('Honorários de R$ 3.000,00 e R$ 500,00.');
  });
  it('sem anexo fotográfico escrito pelo Claude, sem "data de emissão"; fotos do caso no Anexo I; equações e R$ intactos', async () => {
    await db.records.put({ id: 'cdf1', kind: 'foto', caseId: 'cd1', ts: {}, data: { legenda: 'Cabine do caminhão-trator durante a medição', largura: 4, altura: 3 } });
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    await db.blobs.put({ id: 'cdf1', blob: new Blob([png], { type: 'image/png' }) });
    const md = `Título: Laudo técnico pericial

# 1 Avaliação
Fórmula: $NEN = L_{avg} + 16,61 \\cdot \\log(T/8)$ e honorários de R$ 3.000,00. Unidade 21,0 m/s1,75.

# 8 Encerramento
O laudo segue acompanhado do Anexo I (registro fotográfico) e dos apêndices.

Santa Mariana/PR e Londrina/PR, [[data de emissão]].

# ANEXO I – REGISTRO FOTOGRÁFICO
Foto 1 – Legenda escrita pelo Claude.
`;
    const r = await documentoDoClaude('cd1', md);
    const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
    const xml = await zip.file('word/document.xml').async('string');
    const t = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(t).not.toContain('Legenda escrita pelo Claude');
    expect(t).not.toContain('data de emissão');
    expect(t).not.toContain('segue acompanhado');
    expect(t).toContain('Cabine do caminhão-trator durante a medição');
    expect(t).toMatch(/Anexo I – Relatório fotográfico/i);
    expect(r.nFotos).toBe(1);
    expect(t).toMatch(/Foto 1 – Cabine do caminhão-trator/);
    expect(t).not.toMatch(/Figura \d+ – Cabine/);
    expect(xml).toContain('<m:oMath>');
    expect(xml).toMatch(/<m:sSub><m:e>.*?>L<\/m:t>.*?<m:sub>.*?>avg<\/m:t>/);
    expect(t).toContain('R$ 3.000,00');
    expect(xml).toMatch(/vertAlign w:val="superscript"\/>.{0,80}1,75/);
    expect(Object.keys(zip.files).some((k) => k.startsWith('word/media/'))).toBe(true);
  });
});

describe('corretor ortográfico no Word do Claude', () => {
  it('título de norma em inglês marcado como inglês', async () => {
    const { inglesDasNormas } = await import('../src/docx/claudeDoc.js');
    expect(inglesDasNormas('ISO 2631-1:1997 – Mechanical vibration and shock – Evaluation of human exposure to whole-body vibration – Part 1: General requirements.'))
      .toBe('ISO 2631-1:1997 – {{en:Mechanical vibration and shock – Evaluation of human exposure to whole-body vibration – Part 1: General requirements}}.');
    expect(inglesDasNormas('Conforme a ISO 2631-1, o aren foi medido.')).toBe('Conforme a ISO 2631-1, o aren foi medido.');
  });
  it('marcas e nomes no meio da frase saem sem revisão', async () => {
    const r = await documentoDoClaude('cd1', 'Título: Laudo técnico pericial\n\n# 1 Instrumentos\nO dosímetro DoseMax foi calibrado pela Teslab e o medidor AxPro também.\n');
    const xml = await (await JSZip.loadAsync(await r.blob.arrayBuffer())).file('word/document.xml').async('string');
    for (const w of ['DoseMax', 'Teslab', 'AxPro']) expect(xml).toMatch(new RegExp(`<w:noProof/>.{0,300}>${w}<`));
  });
});

describe('CNPJ de terceiro em branco', () => {
  it('é omitido, sem pendência', async () => {
    const { semPartesDoApp } = await import('../src/docx/claudeDoc.js');
    expect(semPartesDoApp('Empresa similar: Jardelino Transportes, CNPJ [[CNPJ da Jardelino Transportes]].')).toBe('Empresa similar: Jardelino Transportes.');
    expect(semPartesDoApp('Transportes Alfa (CNPJ [[conferir]]), em Cidade A.')).toBe('Transportes Alfa, em Cidade A.');
    expect(semPartesDoApp('Transportes Alfa (CNPJ 00.000.000/0001-00).')).toBe('Transportes Alfa (CNPJ 00.000.000/0001-00).');
  });
});

describe('ART cadastrada em Configurações e escolhida no caso', () => {
  it('o número vai para o caso e o PDF sai como anexo depois das fotos', async () => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    await db.records.put({ id: 'artpdf1', kind: 'anexo', caseId: null, ts: {}, data: { nome: 'art.png', mime: 'image/png', descricao: 'ART' } });
    await db.blobs.put({ id: 'artpdf1', blob: new Blob([png], { type: 'image/png' }), mime: 'image/png' });
    await db.records.put({ id: 'art1', kind: 'artCad', caseId: null, ts: {}, data: { numero: '1720250000001', finalidade: 'Perícias judiciais (perito do juízo)', conselho: 'CREA-PR', anexoId: 'artpdf1' } });
    const caso = await db.records.get('cd1');
    await db.records.put({ ...caso, data: { ...caso.data, artId: 'art1' } });
    const { carregar, anexosDoCaso } = await import('../src/docx/base.js');
    const dados = await carregar('cd1');
    expect(dados.c.art).toBe('1720250000001');
    // no Node não há canvas para converter a imagem: a tentativa de ler o PDF da ART aparece como falha (no navegador, vira o Anexo II)
    const { anexos, falhasAnexo } = await anexosDoCaso(dados, { romanos: true, inicio: 1 });
    expect(anexos.length + falhasAnexo).toBe(1);
    if (anexos.length) expect(anexos[0].titulo).toBe('ART nº 1720250000001 (CREA-PR)');
    await db.records.put({ ...caso, data: { ...caso.data, artId: '' } });
  });
});

describe('LTCAT extrajudicial do Claude', () => {
  it('traz o termo de declaração e autorização ao final do laudo', async () => {
    await db.records.put({ id: 'cd9', kind: 'caso', caseId: null, ts: {}, data: { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT', 'PPP'], pppEmitente: 'Próprio segurado', autorNome: 'Segurado Teste', autorCpf: '000.000.000-00', vistoriaData: '2026-09-01' } });
    const t = await texto(await documentoDoClaude('cd9', 'Título: Laudo técnico das condições ambientais do trabalho\n\n# 1 Identificação\nTexto do laudo.'));
    expect(t).toContain('TERMO DE DECLARAÇÃO E AUTORIZAÇÃO');
    expect(t).toContain('autorizo o levantamento');
    expect(t).toContain('Segurado Teste');
  });
  it('laudo judicial não traz o termo', async () => {
    const t = await texto(await documentoDoClaude('cd1', MD));
    expect(t).not.toContain('TERMO DE DECLARAÇÃO E AUTORIZAÇÃO');
  });
});

describe('legendas e listas de quadros/figuras', () => {
  it('legenda no estilo "Legenda" e lista no estilo do índice de ilustrações; colunas pelo conteúdo', async () => {
    const r = await documentoDoClaude('cd1', MD);
    const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
    const x = await zip.file('word/document.xml').async('string');
    const st = await zip.file('word/styles.xml').async('string');
    expect(st).toContain('w:styleId="Legenda"');
    expect(st).toContain('w:styleId="ndicedeilustraes"');
    expect(x).toContain('<w:pStyle w:val="Legenda"/>');
    expect(x).toContain('<w:pStyle w:val="ndicedeilustraes"/>');
    const grid = x.match(/<w:tblGrid>(.*?)<\/w:tblGrid>/g).find((g) => (g.match(/gridCol/g) || []).length === 3);
    const ws = [...grid.matchAll(/w:w="(\d+)"/g)].map((m) => +m[1]);
    expect(new Set(ws).size).toBeGreaterThan(1);
  });
});
