import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { db, caseChildren } from '../src/db.js';
import { PERFIL_ID } from '../src/docx/base.js';
import { ltcatPpp, laudoPericial } from '../src/docx/modelos.js';
import { gerarPreRelatorio } from '../src/docx/reports.js';
import { lerJsonFds, linhasFichaFds, aplicarFds, componentesDoTexto, promptFds } from '../src/fds.js';
import { legendaDoNomeArquivo, lerJsonFotos, aplicarFotosIA, promptFotos } from '../src/fotosIA.js';
import { lerJsonIA, aplicarIA, montarPrompt } from '../src/aiimport.js';

async function texto(r) {
  const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
  return (await zip.file('word/document.xml').async('string')).replace(/<w:tab\/>/g, ' ').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/[ \t]+/g, ' ');
}
const caso = (id, data) => db.records.put({ id, kind: 'caso', caseId: null, ts: {}, data });
const filho = (id, kind, caseId, data) => db.records.put({ id, kind, caseId, ts: {}, createdAt: Date.now(), data });

const PRODUTO = {
  nome: 'Produto Fictício PU', fabricante: 'Fabricante Fictício', revisao: 'v. 3, 2021', fonte: 'pesquisada na internet', url: 'https://exemplo.invalid/fds.pdf', consultadoEm: '2026-11-22',
  secao2: { classificacao: ['Sensibilização respiratória – Categoria 1'], advertencia: 'Perigo', frasesH: 'H334 – Quando inalado pode provocar sintomas alérgicos' },
  secao3: { tipo: 'mistura', componentes: [{ nome: 'Diisocianato de difenilmetano', cas: '101-68-8', concentracao: '40–50 %' }] },
  secao8: { limites: 'ACGIH TWA 0,005 ppm', epi: 'Respirador com filtro para vapores orgânicos' },
  secao9: { estado: 'Líquido marrom', pontoFulgor: '> 204 °C', pressaoVapor: '< 0,00001 mmHg a 25 °C' },
};

beforeAll(async () => {
  globalThis.fetch = async (url) => {
    const buf = await readFile(new URL(`../public/modelos/${String(url).split('/').pop()}`, import.meta.url));
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  await db.records.put({ id: PERFIL_ID, kind: 'perfil', caseId: null, data: { nome: 'Perito Teste', cidade: 'Cidade A' }, ts: {} });
});

describe('legenda pelo nome do arquivo', () => {
  it('aproveita nomes descritivos e ignora nomes de câmera', () => {
    expect(legendaDoNomeArquivo('Area 1- 05a, chamada suja - Bancada de testes hidraulicos de bombas.jpeg')).toBe('Area 1- 05a, chamada suja - Bancada de testes hidraulicos de bombas');
    expect(legendaDoNomeArquivo('Area 3 - 02, chamada Limpa - Estoque de Parafusos e Peças aguardando apr.._.jpeg')).toBe('Area 3 - 02, chamada Limpa - Estoque de Parafusos e Peças aguardando apr');
    expect(legendaDoNomeArquivo('bancada_de_montagem (1).jpg')).toBe('Bancada de montagem');
    for (const n of ['IMG_20261023_095112.jpg', 'PXL_20261023_120000123.jpg', 'DSC01234.JPG', 'WhatsApp Image 2026-10-23 at 09.51.12.jpeg', '20261023_095112.jpg', 'image3.jpeg', 'Screenshot_2026-10-23.png']) {
      expect(legendaDoNomeArquivo(n)).toBe('');
    }
  });
});

describe('ficha da FDS', () => {
  it('lê o JSON do Claude e monta as linhas da ficha', () => {
    const [p] = lerJsonFds(JSON.stringify({ produtos: [PRODUTO] }));
    expect(p).toMatchObject({ nome: 'Produto Fictício PU', fonteFds: 'Pesquisada na internet', s3Tipo: 'Mistura', s2Advertencia: 'Perigo' });
    expect(componentesDoTexto(p.s3Componentes)[0]).toMatchObject({ nome: 'Diisocianato de difenilmetano', cas: '101-68-8', concentracao: '40–50 %' });
    const linhas = linhasFichaFds(p);
    expect(linhas.map((l) => l[0])).toEqual(['Produto', 'FDS', 'Seção 2 – Identificação de perigos', 'Seção 3 – Composição (mistura)', 'Seção 8 – Controle de exposição e proteção individual', 'Seção 9 – Propriedades físicas e químicas']);
    expect(linhas[3][1]).toContain('CAS 101-68-8');
    expect(promptFds(['Produto X – Fabricante Y'])).toContain('PESQUISE a FDS do fabricante');
  });
  it('o pré-relatório pede a ficha por produto e lê "produtos" e a identificação das fotos', () => {
    const prompt = montarPrompt('extra-ltcat', { tipoAtuacao: 'Extrajudicial' });
    expect(prompt).toContain('PRODUTOS QUÍMICOS – FICHA DA FDS');
    expect(prompt).toContain('"produtos": [{"nome": "nome comercial"');
    expect(prompt.match(/"agentesAvaliados":/g)).toHaveLength(1);
    expect(prompt.match(/"fotos":/g)).toHaveLength(1);
    const r = lerJsonIA(JSON.stringify({ produtos: [PRODUTO], fotos: [{ numero: 2, legenda: 'Bancada de testes', tipo: 'máquina', identificacao: { marca: 'Marca X', serie: '123' } }] }));
    expect(r.produtos[0].nome).toBe('Produto Fictício PU');
    expect(r.fotos[0]).toMatchObject({ numero: 2, identTipo: 'Máquina / veículo', identificacao: 'marca: Marca X; serie: 123', identSituacao: 'A conferir' });
  });
});

describe('documentos com a ficha da FDS', () => {
  it('LTCAT, pré-relatório e laudo trabalhista trazem uma ficha por produto', async () => {
    await caso('f1', { tipoAtuacao: 'Extrajudicial', contratadoPor: 'Trabalhador / segurado', objeto: ['LTCAT'], autorNome: 'Segurado Fictício', art: '1' });
    await filho('f1v1', 'periodo', 'f1', { empresa: 'Empresa Fictícia', inicio: '1997-07-01', fim: '2010-12-31', cargo: 'Técnico', categoriaSegurado: 'Contribuinte individual' });
    await filho('f1a', 'agenteAvaliado', 'f1', { nome: 'Óleo mineral', tipo: 'Químico', resAte97: 'A confirmar', resDesde97: 'A confirmar', fundamentacao: 'Contato com óleo.' });
    const cont = await aplicarFds('f1', lerJsonFds(JSON.stringify([PRODUTO, { ...PRODUTO, nome: 'Óleo Hidráulico Fictício 68', secao3: { tipo: 'mistura', componentes: [] } }])));
    expect(cont).toEqual({ novos: 2, completados: 0 });
    // não duplica pelo nome; completa o vazio
    expect(await aplicarFds('f1', [{ nome: 'produto fictício pu', observacoes: 'Revisão posterior ao período.' }])).toEqual({ novos: 0, completados: 1 });
    const t = await texto(await ltcatPpp('f1'));
    if (process.env.SALVAR_DOCS) await writeFile(`${process.env.SALVAR_DOCS}/ltcat-fds.docx`, Buffer.from(await (await ltcatPpp('f1')).blob.arrayBuffer()));
    expect(t).toContain('Ficha do produto – Produto Fictício PU');
    expect(t).toContain('Ficha do produto – Óleo Hidráulico Fictício 68');
    expect(t.match(/ARABIC \d+ – Ficha do produto – Produto Fictício PU/g)).toHaveLength(1); // uma vez no corpo (a outra é a lista de quadros)
    expect(t).toContain('H334');
    expect(t).toContain('versão vigente na consulta');
    const pre = await texto(await gerarPreRelatorio('f1'));
    expect(pre).toMatch(/Produtos químicos – fichas das FDS/i);
    expect(pre).toContain('Ficha do produto – Produto Fictício PU');
    await caso('f2', { tipoAtuacao: 'Judicial', papel: 'Perito do Juízo', materia: 'Trabalhista', objeto: ['Insalubridade'] });
    await aplicarFds('f2', lerJsonFds(JSON.stringify([PRODUTO])));
    const lt = await texto(await laudoPericial('f2'));
    expect(lt).toContain('Ficha do produto – Produto Fictício PU');
  });
});

describe('identificação das fotos', () => {
  it('aplica legenda e identificação pela ordem do app e cria a ficha do produto do rótulo', async () => {
    await caso('g1', { tipoAtuacao: 'Extrajudicial' });
    await filho('g1f1', 'foto', 'g1', { ordem: 1, legenda: 'Já tinha legenda' });
    await filho('g1f2', 'foto', 'g1', { ordem: 2, nomeArquivo: 'IMG_0001.jpg' });
    const fotos = (await caseChildren('g1', 'foto')).map((f, i) => ({ ...f, numero: i + 1 }));
    expect(promptFotos(fotos)).toContain('- Foto 2 · arquivo: IMG_0001.jpg');
    const dados = lerJsonFotos(JSON.stringify({
      fotos: [{ numero: 1, legenda: 'Nova', tipo: 'Posto / ambiente' }, { numero: 'Foto 2', legenda: 'Tambor de óleo', tipo: 'Produto químico (rótulo)', identificacao: { produto: 'Óleo X', lote: 'L1' }, confianca: 'alta' }],
      produtos: [{ nome: 'Óleo X', fonte: 'Rótulo do produto (foto)', observacoes: 'foto 2' }] }));
    const r = await aplicarFotosIA('g1', dados);
    expect(r).toEqual({ fotos: 2, produtos: 1 });
    const [f1, f2] = await caseChildren('g1', 'foto');
    expect(f1.data.legenda).toBe('Já tinha legenda'); // não substitui sem pedir
    expect(f1.data.identTipo).toBe('Posto / ambiente');
    expect(f2.data).toMatchObject({ legenda: 'Tambor de óleo', identificacao: 'produto: Óleo X; lote: L1', identConfianca: 'alta', identSituacao: 'A conferir' });
    expect((await caseChildren('g1', 'fds'))[0].data).toMatchObject({ nome: 'Óleo X', fonteFds: 'Rótulo do produto (foto)', situacao: 'A conferir' });
    // o pré-relatório também aplica a identificação pela mesma regra
    await aplicarIA('g1', lerJsonIA(JSON.stringify({ fotos: [{ numero: 1, identificacao: 'CA 12345' }] })));
    expect((await caseChildren('g1', 'foto'))[0].data.identificacao).toBe('CA 12345');
  });
});
