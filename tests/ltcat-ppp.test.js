import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { db } from '../src/db.js';
import { PERFIL_ID } from '../src/docx/base.js';
import { ltcatPpp } from '../src/docx/modelos.js';
import { lerAfastamentos, recortarAfastamentos, itensAgentes, categoriaDoVinculo } from '../src/enquadramento.js';
import { lerJsonIA } from '../src/aiimport.js';

// Dados sintéticos (dentista fictício)
async function texto(r) {
  const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
  return (await zip.file('word/document.xml').async('string')).replace(/<w:tab\/>/g, ' ').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/[ \t]+/g, ' ');
}
const caso = (id, data) => db.records.put({ id, kind: 'caso', caseId: null, ts: {}, data });
const filho = (id, kind, caseId, data) => db.records.put({ id, kind, caseId, ts: {}, createdAt: Date.now(), data });

beforeAll(async () => {
  globalThis.fetch = async (url) => {
    const buf = await readFile(new URL(`../public/modelos/${String(url).split('/').pop()}`, import.meta.url));
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  await db.records.put({ id: PERFIL_ID, kind: 'perfil', caseId: null, data: { nome: 'Perito Teste', cidade: 'Cidade A' }, ts: {} });
});

describe('enquadramento sem medição', () => {
  it('auxílio previdenciário depois do Decreto 10.410/2020 sai do tempo especial; acidentário fica', () => {
    const af = lerAfastamentos('13/11/2025 a 11/01/2026 – B31\n01/02/2021 a 10/02/2021 – B91\n01/01/2015 a 31/01/2015 – B31');
    expect(af.map((x) => x.excluido)).toEqual([true, false, false]);
    const { segs, excluidos } = recortarAfastamentos([['2019-11-14', '2025-11-30']], af);
    expect(segs).toEqual([['2019-11-14', '2025-11-12']]);
    expect(excluidos[0].slice(0, 2)).toEqual(['2025-11-13', '2025-11-30']);
  });
  it('agente por época e categoria pelo texto do vínculo', () => {
    const ags = [{ data: { nome: 'Biológico X', tipo: 'Biológico', resAte97: 'Caracteriza', resDesde97: 'Caracteriza' } },
      { data: { nome: 'Mercúrio', tipo: 'Químico', resAte97: 'A confirmar', resDesde97: 'Não caracteriza', vinculos: 'V2' } }];
    const ate = itensAgentes(ags, 1, '1995-04-29', '1997-03-05');
    expect(ate.some((i) => i.sup && /1\.3\.2/.test(i.cod))).toBe(true);
    expect(ate.some((i) => i.pendente)).toBe(true);
    const depois = itensAgentes(ags, 1, '1997-03-06', '2003-11-18');
    expect(depois.find((i) => i.sup).cod).toMatch(/3\.0\.1/);
    expect(depois.some((i) => /Não caracteriza: Mercúrio/.test(i.t))).toBe(true);
    expect(itensAgentes(ags, 0, '1997-03-06', '2003-11-18').some((i) => /Mercúrio/.test(i.t))).toBe(false);
    expect(categoriaDoVinculo({ data: { empresa: 'Cooperativa Fictícia' } })).toMatch(/Cooperado/);
    expect(categoriaDoVinculo({ data: { empresa: 'Consultório próprio – autônomo' } })).toBe('Contribuinte individual');
  });
  it('importação: agentes avaliados, PPP e campos novos do vínculo', () => {
    const r = lerJsonIA(JSON.stringify({ ppp: { pppEmitente: 'Cooperativa', pppSexo: 'M' },
      periodos: [{ empresa: 'X', inicio: '2003-04-01', categoriaSegurado: 'cooperado', afastamentos: '13/11/2025 a 11/01/2026 – B31' }],
      agentesAvaliados: [{ nome: 'Biológico', tipo: 'biologico', resAte97: 'caracteriza', resDesde97: 'nao enquadravel' }] }));
    expect(r.caso.pppEmitente).toBe('Cooperativa de trabalho');
    expect(r.caso.pppSexo).toBe('Masculino');
    expect(r.periodos[0].categoriaSegurado).toBe('Cooperado (cooperativa de trabalho)');
    expect(r.agentesAvaliados[0]).toMatchObject({ tipo: 'Biológico', resAte97: 'Caracteriza', resDesde97: 'Não enquadrável' });
  });
});

describe('LTCAT + PPP (dentista)', () => {
  it('gera o LTCAT e o PPP com categoria, biológico, cooperativa e afastamento', async () => {
    await caso('d1', { tipoAtuacao: 'Extrajudicial', contratadoPor: 'Trabalhador / segurado', objeto: ['LTCAT'], autorNome: 'Segurado Fictício', autorNascimento: '1960-01-01',
      vistoriaData: '2026-11-04', vistoriaEndereco: 'Rua A, 1, Cidade A', pppEmitente: 'Cooperativa de trabalho', pppNit: '000.00000.00-0', art: '123' });
    await filho('d1v1', 'periodo', 'd1', { empresa: 'Consultório próprio – autônomo', inicio: '1989-01-01', fim: '1991-04-30', cargo: 'Cirurgião-dentista', local: 'Cidade B' });
    await filho('d1v2', 'periodo', 'd1', { empresa: 'Consultório próprio (sem contribuição no CNIS)', inicio: '1991-05-01', fim: '2003-03-31', cargo: 'Cirurgião-dentista', categoriaSegurado: 'Contribuinte individual' });
    await filho('d1v3', 'periodo', 'd1', { empresa: 'Cooperativa Fictícia', cnpj: '00.000.000/0001-00', inicio: '2003-04-01', fim: '2025-11-30', cargo: 'Cirurgião-dentista', cbo: '2232-08',
      afastamentos: '13/11/2025 a 11/01/2026 – B31', atividades: 'Clínica geral.' });
    await filho('d1a', 'agenteAvaliado', 'd1', { nome: 'Microrganismos e parasitas infectocontagiosos vivos e suas toxinas', tipo: 'Biológico', resAte97: 'Caracteriza', resDesde97: 'Caracteriza',
      fonte: 'atendimento clínico com sangue, saliva e aerossóis', fundamentacao: 'Contato direto e permanente com pacientes.', epcEficaz: 'Não', epiEficaz: 'Não' });
    await filho('d1b', 'agenteAvaliado', 'd1', { nome: 'Ácido fosfórico 37%', tipo: 'Químico', resAte97: 'Não caracteriza', resDesde97: 'Não enquadrável' });
    const r = await ltcatPpp('d1');
    expect(r.extras).toHaveLength(1);
    const t = await texto(r);
    const tp = await texto(r.extras[0]);
    if (process.env.SALVAR_DOCS) { await writeFile(`${process.env.SALVAR_DOCS}/ltcat.docx`, Buffer.from(await r.blob.arrayBuffer())); await writeFile(`${process.env.SALVAR_DOCS}/ppp.docx`, Buffer.from(await r.extras[0].blob.arrayBuffer())); }
    expect(t).toContain('cirurgião-dentista (cód. 2.1.3');
    expect(t).toContain('3.0.1, a');
    expect(t).toContain('art. 1º da Lei nº 10.666/2003');
    expect(t).toContain('13/11/2025 a 30/11/2025');
    expect(t).not.toContain('tempo diário de condução');
    expect(t).not.toContain('ruído > 80');
    expect(t).not.toContain('sem contribuição no CNIS');
    expect(t).not.toContain('Redigir: categoria do segurado');
    expect(tp).toContain('PERFIL PROFISSIOGRÁFICO PREVIDENCIÁRIO');
    expect(tp).toContain('2232-08');
    expect(tp).toContain('04 (25 anos)');
    expect(tp).toContain('Não constam deste PPP');
    expect(tp).toContain('não computado como tempo especial');
    expect(tp).not.toContain('Ácido fosfórico');
  });
});

describe('PPP emitido pelo próprio segurado e legendas das fotos', () => {
  it('lotação com o CPF do segurado e todos os vínculos; legendas pelo número da foto', async () => {
    await caso('d2', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'], autorNome: 'Segurado Dois', autorCpf: '000.000.000-00', pppEmitente: 'Próprio segurado (contribuinte individual)' });
    await filho('d2v1', 'periodo', 'd2', { empresa: 'Consultório', inicio: '1990-01-01', fim: '1995-12-31', cargo: 'Cirurgião-dentista', categoriaSegurado: 'Contribuinte individual' });
    await filho('d2v2', 'periodo', 'd2', { empresa: 'Cooperativa Fictícia', cnpj: '11.111.111/0001-11', inicio: '2003-04-01', fim: '2010-12-31', cargo: 'Cirurgião-dentista', categoriaSegurado: 'Cooperado (cooperativa de trabalho)' });
    await filho('d2a', 'agenteAvaliado', 'd2', { nome: 'Biológico', tipo: 'Biológico', resAte97: 'Caracteriza', resDesde97: 'Caracteriza' });
    const r = await ltcatPpp('d2');
    const t = await texto(r); const tp = await texto(r.extras[0]);
    expect(t).toContain('o PPP é emitido pelo próprio segurado');
    expect(t).not.toMatch(/sem conversão|convertido/);
    expect(tp).toContain('01/01/1990 a 31/12/1995');
    expect(tp).not.toContain('11.111.111/0001-11');
    expect(tp).not.toContain('Não constam deste PPP');
    const { aplicarIA } = await import('../src/aiimport.js');
    await filho('d2f1', 'foto', 'd2', { ordem: 1 }); await filho('d2f2', 'foto', 'd2', { ordem: 2, legenda: 'já tinha' });
    const res = await aplicarIA('d2', lerJsonIA(JSON.stringify({ fotos: [{ numero: 1, legenda: 'Sala clínica' }, { numero: 2, legenda: 'outra' }] })));
    expect(res.fotos).toBe(1);
    expect((await db.records.get('d2f1')).data.legenda).toBe('Sala clínica');
    expect((await db.records.get('d2f2')).data.legenda).toBe('já tinha');
  });
});

describe('CRQ no perfil', () => {
  it('registros do CRQ-IV e CRQ-IX', async () => {
    const { registrosCrq } = await import('../src/docx/base.js');
    expect(registrosCrq({ crqSp: '04123456', crqPr: 'CRQ nº 09200001' })).toBe('CRQ-IV nº 04123456 – CRQ-IX nº 09200001');
    expect(registrosCrq({})).toBe('');
  });
});

describe('técnica pelo Manual de Aposentadoria Especial e quadros dos agentes', () => {
  it('técnica por tipo e época; características com o banco', async () => {
    const { tecnicaDoAgente } = await import('../src/enquadramento.js');
    const { bancoDoAgente, orgaosEmPortugues } = await import('../src/docx/agentesQuadros.js');
    expect(tecnicaDoAgente({ data: { tipo: 'Biológico' } }, false)).toBe('Qualitativa');
    expect(tecnicaDoAgente({ data: { tipo: 'Químico', codDesde97: '1.0.9 – avaliação quantitativa (NR-15, Anexo 11)' } }, false)).toBe('Quantitativa – NR-15, Anexo 11');
    expect(tecnicaDoAgente({ data: { tipo: 'Químico' } }, true)).toBe('Qualitativa');
    expect(tecnicaDoAgente({ data: { tipo: 'Químico', codDesde97: '1.0.3 – avaliação qualitativa' } }, false)).toBe('Qualitativa – NR-15, Anexo 13');
    expect(tecnicaDoAgente({ data: { tipo: 'Físico', nome: 'Radiações ionizantes' } }, false)).toMatch(/Anexo 5/);
    expect(tecnicaDoAgente({ data: { tipo: 'Químico', tecnica: 'Digitada' } }, false)).toBe('Digitada');
    const banco = [{ id: 'q1', data: { nome: 'Ácido fosfórico', sinonimos: 'Phosphoric acid', cas: '0000-00-0' } }, { id: 'q2', data: { nome: 'Mercúrio (elementar)', sinonimos: 'Hg' } }];
    expect(bancoDoAgente({ data: { nome: 'Ácido fosfórico 37% (gel)' } }, banco).id).toBe('q1');
    expect(bancoDoAgente({ data: { nome: 'Mercúrio (amálgama)' } }, banco).id).toBe('q2');
    expect(orgaosEmPortugues('Eyes, skin, respiratory system, kidneys')).toBe('olhos, pele, sistema respiratório, rins');
  });
});

describe('vínculos sequenciais unidos num só', () => {
  it('mesma empresa e início: atualiza o vínculo; "fim": "atual" limpa a data com substituir', async () => {
    const { aplicarIA } = await import('../src/aiimport.js');
    const { caseChildren } = await import('../src/db.js');
    await caso('d3', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'] });
    await filho('d3v', 'periodo', 'd3', { empresa: 'Consultório Fictício', inicio: '1990-01-01', fim: '1991-12-31' });
    await aplicarIA('d3', lerJsonIA(JSON.stringify({ periodos: [{ empresa: 'Consultório Fictício', inicio: '1990-01-01', fim: 'atual', cbo: '2232-08' }] })), { substituir: true });
    const ps = await caseChildren('d3', 'periodo');
    expect(ps).toHaveLength(1);
    expect(ps[0].data.fim).toBe('');
    expect(ps[0].data.cbo).toBe('2232-08');
    expect(ps[0].data.fimAberto).toBeUndefined();
  });
});

describe('banco de profissões', () => {
  it('reconhece a profissão e leva a referência para a instrução do Claude', async () => {
    const { profissaoDoCaso, PROFISSOES } = await import('../src/data/profissoes.js');
    const { montarPrompt } = await import('../src/aiimport.js');
    expect(profissaoDoCaso({ funcoes: 'Cirurgião-dentista clínico geral' }).id).toBe('dentista');
    expect(profissaoDoCaso({ profissao: 'Cirurgião-dentista' }).id).toBe('dentista');
    expect(profissaoDoCaso({}, [{ data: { cargo: 'Técnica de enfermagem' } }]).id).toBe('enfermagem');
    expect(profissaoDoCaso({ funcoes: 'Soldador' })).toBeNull();
    const dent = PROFISSOES.find((p) => p.id === 'dentista');
    expect(dent.agentes.length).toBeGreaterThan(10);
    expect(JSON.stringify(dent)).not.toMatch(/Toffolo|Uniodonto|Spectro|8 pacientes/);
    const p = montarPrompt('extra-ltcat', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'], profissao: 'Cirurgião-dentista' });
    expect(p).toContain('REFERÊNCIA DA PROFISSÃO – CIRURGIÃO-DENTISTA');
    expect(p).toContain('é UM vínculo só');
    expect(montarPrompt('perito-trab', { profissao: 'Cirurgião-dentista' })).not.toContain('REFERÊNCIA DA PROFISSÃO');
  });
});
