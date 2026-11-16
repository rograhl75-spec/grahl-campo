import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { db } from '../src/db.js';
import { parecerPenosidade } from '../src/docx/parecerPenosidade.js';
import { PERFIL_ID } from '../src/docx/base.js';
import { CATALOGO } from '../src/docx/reports.js';
import { situacaoDoCaso, lerJsonIA, montarPrompt } from '../src/aiimport.js';

// Dados sintéticos (nunca usar dados reais de segurados nos testes do repositório)
const CASO = 'caso-parecer-motorista';
const dadosCaso = {
  tipoAtuacao: 'Extrajudicial', papel: 'Parecer técnico extrajudicial (segurado / advogado)', contratadoPor: 'Trabalhador / segurado',
  objeto: ['Aposentadoria especial', 'Penosidade (motorista)'], materia: 'Previdenciária', autorNome: 'Segurado Teste', autorCpf: '000.000.000-00',
  funcoes: 'Motorista profissional de caminhão e carreta', art: '0000000000', finalidade: 'Instrução de ação judicial previdenciária', jurisprudencia: 'Incluir',
};

beforeAll(async () => {
  globalThis.fetch = async (url) => {
    const nome = String(url).split('/').pop();
    const buf = await readFile(new URL(`../public/modelos/${nome}`, import.meta.url));
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  await db.records.put({ id: PERFIL_ID, kind: 'perfil', caseId: null, data: { nome: 'ENGENHEIRO TESTE', titulos: 'Engenheiro de Segurança do Trabalho', crea: 'CREA-XX 0000', cidade: 'Cidade – UF' }, ts: {} });
  await db.records.put({ id: CASO, kind: 'caso', caseId: null, ts: {}, data: dadosCaso });
  for (const [cod, lavg, arep, cit] of [['M90', '88,5', '1,1', 'Proc. 0000000-00.2017.4.04.0000 – Vara Federal de Cidade A – 01/02/2020'], ['M91', '91,2', '1,4', 'Extrajudicial – 10/10/2022']]) {
    await db.records.put({ id: `par-${cod}`, kind: 'paradigma', caseId: null, ts: {}, data: { codigo: cod, marca: 'Marca', modelo: `Mod ${cod}`, familia: 'F6', lavg, arep, jornadaLaudo: '8', citacao: cit, situacao: 'OK' } });
  }
  let n = 0;
  const per = (data) => db.records.put({ id: `per-${++n}`, kind: 'periodo', caseId: CASO, ts: {}, createdAt: n, data });
  await per({ empresa: 'Transportes Alfa', inicio: '1990-06-01', fim: '1991-02-01', cargo: 'Motorista de caminhão truck', veiculoMarca: 'Marca', veiculoModelo: 'T1', grupoVeiculo: 'Caminhão truck (chassi rígido, eixo duplo)', tipoCarga: 'verduras', vias: 'Cidade A/PR x Cidade B/GO', noturnoPernoite: 'na cabine', conducaoH: '12', paradigmaRuido: 'M90' });
  await per({ empresa: 'Transportes Beta', inicio: '1997-04-01', fim: '2000-02-08', cargo: 'Motorista carreteiro', veiculoMarca: 'Marca', veiculoModelo: 'C1', grupoVeiculo: 'Cavalo mecânico com cabine convencional / semiavançada, sem ar-condicionado (projeto antigo)', carroceria: 'graneleiro', tipoCarga: 'grãos', carregaDescarrega: 'Não', vias: 'Cidade A/PR x Cidade C/SP', noturnoPernoite: 'na cabine', conducaoH: '14', cabine: 'sem ar-condicionado, câmbio manual', acidenteVinculo: 'Não', assaltoVinculo: 'Não', paradigmaRuido: 'M90', paradigmaVibracao: 'M90' });
  await per({ empresa: 'Logística Gama', inicio: '2019-04-08', fim: '', cargo: 'Motorista carreteiro', veiculoMarca: 'Marca', veiculoModelo: 'P1', grupoVeiculo: 'Caminhão pesado moderno (câmbio automatizado, suspensão de cabine, ar-condicionado)', carroceria: 'baú', tipoCarga: 'perecíveis de supermercado', carregaDescarrega: 'Não', vias: 'Cidade A/PR x Cidade C/SP', noturnoPernoite: 'na cabine', conducaoH: '12', assaltoVinculo: 'Sim, em 2021, na rodovia', paradigmaRuido: 'M91', paradigmaVibracao: 'M91' });
});

async function texto(blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return (await zip.file('word/document.xml').async('string')).replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

describe('parecer técnico de condições de trabalho e penosidade', () => {
  it('é sugerido para o parecer técnico extrajudicial do segurado, sem o LTCAT', () => {
    const sug = CATALOGO.filter((d) => d.rec(dadosCaso)).map((d) => d.id);
    expect(sug).toContain('parPenosidade');
    expect(sug).not.toContain('ltcat');
  });
  it('gera o documento com identificação, quadros por vínculo, fonte da prova, matriz e EC 103', async () => {
    const r = await parecerPenosidade(CASO);
    // SALVAR_DOCX=caminho grava o Word gerado, para conferência visual
    if (process.env.SALVAR_DOCX) await writeFile(process.env.SALVAR_DOCX, Buffer.from(await r.blob.arrayBuffer()));
    const t = await texto(r.blob);
    expect(t).toMatch(/PARECER TÉCNICO DE CONDIÇÕES DE TRABALHO E PENOSIDADE/);
    expect(t).toMatch(/Instrução de ação judicial previdenciária/);
    expect(t).toMatch(/ART/);
    expect(t).toMatch(/Vínculo 1 – Transportes Alfa/);
    expect(t).toMatch(/Proc\. 0000000-00\.2017\.4\.04\.0000/); // fonte da prova vem do paradigma
    expect(t).toMatch(/Caminhão truck/);
    expect(t).toMatch(/Assalto/);
    expect(t).toMatch(/EC 103\/2019, art\. 25, § 2º/);
    expect(t).toMatch(/Matriz de agentes, penosidade e enquadramento técnico/);
    expect(t).not.toMatch(/Súmula Vinculante|IRDR 15|irrefutável|faz jus|undefined|NaN/);
  });
  it('a instrução do Claude reconhece o tipo e importa a entrevista do motorista', () => {
    expect(situacaoDoCaso(dadosCaso)).toBe('extra-penosidade');
    expect(montarPrompt('extra-penosidade', dadosCaso)).toMatch(/grupoVeiculo/);
    const j = lerJsonIA(JSON.stringify({ periodos: [{ empresa: 'X', inicio: '01/06/1990', fim: '', grupoVeiculo: 'Ônibus (transporte coletivo)', tipoCarga: 'passageiros', carregaDescarrega: 'Não', conducaoH: '8', assaltoVinculo: 'Não' }] }));
    expect(j.periodos[0]).toMatchObject({ inicio: '1990-06-01', grupoVeiculo: 'Ônibus (transporte coletivo)', tipoCarga: 'passageiros', conducaoH: '8', assaltoVinculo: 'Não' });
  });
});
