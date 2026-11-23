import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { db } from '../src/db.js';
import { PERFIL_ID } from '../src/docx/base.js';
import { ltcatPpp } from '../src/docx/modelos.js';
import { pendenciasDoCaso } from '../src/pendencias.js';
import { fundamentacaoPelasRegras } from '../src/regras.js';

// Dados sintéticos: técnico fictício de máquinas de espuma, um vínculo só desde 1989
async function texto(r) {
  const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
  return (await zip.file('word/document.xml').async('string')).replace(/<w:tab\/>/g, ' ').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/[ \t]+/g, ' ');
}
const caso = (id, data) => db.records.put({ id, kind: 'caso', caseId: null, ts: {}, data });
const filho = (id, kind, caseId, data) => db.records.put({ id, kind, caseId, ts: {}, createdAt: Date.now(), data });
const COD = '1.2.11 do Decreto 53.831/64; 1.2.10 do Anexo I do Decreto 83.080/79';
const agente = (id, nome, extra = {}) => {
  const r = { resAte97: 'Caracteriza', codAte97: COD, resDesde97: 'Não enquadrável', codDesde97: '', ...extra };
  return filho(id, 'agenteAvaliado', 's1', { nome, tipo: 'Químico', ...r, fundamentacao: extra.fundamentacao ?? fundamentacaoPelasRegras({ data: { nome } }, r) });
};

beforeAll(async () => {
  globalThis.fetch = async (url) => {
    const buf = await readFile(new URL(`../public/modelos/${String(url).split('/').pop()}`, import.meta.url));
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  await db.records.put({ id: PERFIL_ID, kind: 'perfil', caseId: null, data: { nome: 'Perito Teste', cidade: 'Cidade A' }, ts: {} });
  await caso('s1', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'], autorNome: 'Segurado Sintético', pppEmitente: 'Empresa (empregador)', pppEmitenteNome: 'Empresa Alfa Ltda', vistoriaData: '2026-10-01' });
  await filho('s1v', 'periodo', 's1', { empresa: 'Empresa Alfa Ltda', cnpj: '00.000.000/0001-00', inicio: '1989-05-01', fim: '', cargo: 'Técnico de assistência', setor: 'Manutenção',
    local: 'Sede na Rua A, 1, Cidade B; filial na Rua B, 2; e fábricas de clientes em várias cidades', fonte: 'CNIS; contrato social; relatórios de entrega técnica', categoriaSegurado: 'Contribuinte individual',
    atividades: 'Montagem e assistência técnica de máquinas dosadoras de espuma.' });
  await agente('a1', 'Óleo mineral', { resDesde97: 'Caracteriza', codDesde97: '1.0.7, b, do Anexo IV' });
  await agente('a2', 'Diisocianato de tolueno (TDI)', { resDesde97: 'Não caracteriza', codDesde97: '1.0.19 do Anexo IV', efeitos: 'Sensibilização respiratória (asma ocupacional) (FISPQ do fornecedor, seção 11).' });
  await agente('a3', 'n-Pentano', {});
  await agente('a4', 'Ciclopentano', {});
  await agente('a5', 'Fluortriclorometano (R11)', {});
  await agente('a6', 'Di(2-etilhexil)ftalato – DOP', { resAte97: 'Não enquadrável', codAte97: '', efeitos: 'Toxicidade à reprodução categoria 1B (H360).' });
  await filho('a7', 'agenteAvaliado', 's1', { nome: 'Eletricidade (tensão acima de 250 V)', tipo: 'Físico', resAte97: 'Caracteriza', codAte97: '1.1.8 do Decreto 53.831/64', resDesde97: 'Não enquadrável',
    fundamentacao: 'Acesso eventual à cabine para leitura do medidor.' });
});

describe('síntese sem linhas repetidas e integridade física sugerida', () => {
  it('LTCAT e PPP', async () => {
    const r = await ltcatPpp('s1');
    const t = await texto(r);
    const p = await texto(r.extras[0]);
    if (process.env.SALVAR) { await writeFile(`${process.env.SALVAR}/ltcat.docx`, Buffer.from(await r.blob.arrayBuffer())); await writeFile(`${process.env.SALVAR}/ppp.docx`, Buffer.from(await r.extras[0].blob.arrayBuffer())); }
    // síntese: 1989–1997 numa linha e 1997–emissão noutra (os marcos de 1995 e 2019 não mudam nada)
    expect(t).toMatch(/01\/05\/1989 a\s*\n?\s*05\/03\/1997/);
    expect(t).not.toMatch(/01\/05\/1989 a\s*\n?\s*28\/04\/1995/);
    expect(t).toContain('inclui o período posterior à Emenda Constitucional nº 103/2019');
    expect(t).not.toMatch(/Empresa Alfa Ltda \(01\/05\/1989/);
    // 5.3: frases agrupadas, sem um parágrafo por agente
    // 5.3: o texto padrão de cada agente está no quadro (resultado e código); nenhum parágrafo por agente
    expect(t).not.toMatch(/o agente consta do cód\. 1\.2\.11/);
    expect(t).not.toMatch(/Até 05\/03\/1997, os agentes (?!químicos são)/);
    expect(t).toMatch(/sem medição: no PPP como ("|&quot;)não quantificada/);
    // quadro 1: local e documentos fora do quadro
    expect(t).toContain('Local de trabalho:');
    // quadro de características: a citação da FISPQ vai para a fonte
    expect(t).toContain('nos documentos: FISPQ do fornecedor, seção 11');
    // integridade física: aviso amarelo no item 5 e pendência
    expect(t).toContain("n-Pentano (inflamáveis); Ciclopentano (inflamáveis); Eletricidade)");
    const pend = await pendenciasDoCaso('s1');
    const ids = pend.map((x) => x.id);
    expect(ids).toContain('integridade-a7');
    expect(ids).toContain('integridade-a3');
    expect(ids).not.toContain('integridade-a1');
    // recomendações: TDI (sensibilizante) e DOP (reprodução), ainda que sem caracterização
    expect(t).toMatch(/Agente presente – sensibilizante/);
    expect(t).toMatch(/Agente presente – tóxico à reprodução/);
    // PPP: técnica abreviada, CA sem número quando não há fichas de EPI
    expect(p).toContain('Dec. 53.831/64');
  });
});

describe('importação completa o agente pelo nome principal', () => {
  it('"Mesamoll" completa "Mesamoll (éster…)" sem duplicar nem renomear', async () => {
    const { aplicarIA, lerJsonIA } = await import('../src/aiimport.js');
    await caso('s2', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'] });
    await filho('s2a', 'agenteAvaliado', 's2', { nome: 'Mesamoll (éster de ácido alquilsulfônico de fenol)', tipo: 'Químico', vinculos: '' });
    const dados = lerJsonIA(JSON.stringify({ agentesAvaliados: [{ nome: 'Mesamoll', tipo: 'Químico', efeitos: 'Não classificado como perigoso.', integridadeFisica: 'Não se aplica' }] }));
    await aplicarIA('s2', dados, { substituir: true });
    const ags = (await db.records.toArray()).filter((r) => r.kind === 'agenteAvaliado' && r.caseId === 's2');
    expect(ags.length).toBe(1);
    expect(ags[0].data.nome).toBe('Mesamoll (éster de ácido alquilsulfônico de fenol)');
    expect(ags[0].data.efeitos).toBe('Não classificado como perigoso.');
  });
});

describe('perigos do agente', () => {
  it('trecho negado não conta', async () => {
    const { perigosDoAgente } = await import('../src/docx/agentesQuadros.js');
    expect(perigosDoAgente({ data: { nome: 'Mesamoll', tipo: 'Químico', efeitos: 'Não classificado; sem irritação e sem sensibilização; sem efeitos na fertilidade.' } })).toEqual([]);
    expect(perigosDoAgente({ data: { nome: 'TDI', tipo: 'Químico', efeitos: 'Sensibilização respiratória (asma ocupacional).' } })).toEqual(['sensibilizante']);
    expect(perigosDoAgente({ data: { nome: 'DOP', tipo: 'Químico', efeitos: 'H360 – pode prejudicar a fertilidade ou o feto.' } })).toEqual(['tóxico à reprodução']);
  });
});

describe('efeitos pela FDS e agente repetido pelo nome principal', () => {
  it('"MDI" usa a seção 2 da FDS do PMDI e é apontado como repetido', async () => {
    await caso('s3', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'], pppEmitente: 'Empresa (empregador)' });
    await filho('s3v', 'periodo', 's3', { empresa: 'Empresa Beta', inicio: '2000-01-01', fim: '2010-12-31', cargo: 'Técnico' });
    await filho('s3a', 'agenteAvaliado', 's3', { nome: 'MDI – diisocianato de difenilmetano (PMDI Produto X: CAS 9016-87-9)', tipo: 'Químico', efeitos: 'Sensibilização respiratória.' });
    await filho('s3b', 'agenteAvaliado', 's3', { nome: 'MDI', tipo: 'Químico' });
    await filho('s3p', 'fds', 's3', { nome: 'Produto X Isocianato', s3Componentes: 'Diisocianato de difenilmetano, isômeros e homólogos; 9016-87-9; 100%',
      s2FrasesH: 'Nocivo se inalado\nQuando inalado pode provocar sintomas alérgicos, de asma ou dificuldades respiratórias' });
    const { efeitosDaFds } = await import('../src/docx/agentesQuadros.js');
    const { carregar } = await import('../src/docx/base.js');
    const dados = await carregar('s3');
    const mdi = dados.agentes.find((a) => a.data.nome === 'MDI');
    expect(efeitosDaFds(mdi, dados)).toMatch(/^Nocivo se inalado; quando inalado pode provocar sintomas alérgicos.*\(FDS Produto X Isocianato, seção 2\)\.$/);
    const ids = (await pendenciasDoCaso('s3')).map((x) => x.id);
    expect(ids).toContain('agdup-s3b');
    expect(ids).not.toContain('efeitos-s3b');
  });
});

describe('documentos da empresa não citados', () => {
  it('tira PGR/PCMSO de listas, parênteses, cabeçalhos e frases', async () => {
    const { limpaTextoLaudo } = await import('../src/docx/base.js');
    const { semDocsEmpresa } = await import('../src/schema.js');
    expect(semDocsEmpresa({ tipoAtuacao: 'Extrajudicial' })).toBe(true);
    expect(semDocsEmpresa({ tipoAtuacao: 'Extrajudicial', docsEmpresa: 'Citar no laudo' })).toBe(false);
    expect(semDocsEmpresa({ tipoAtuacao: 'Judicial' })).toBe(false);
    const fonte = limpaTextoLaudo('CNIS; Contrato Social 6ª alteração (fls. 01–05); Contrato KM juramentado; entregas técnicas; PGR 2026 (itens 11–12, 16); PCMSO 2026 (p. 8–10, 12, 16); entrevista de 23/10/2026.', { semDocs: true, campo: 'fonte' });
    expect(fonte).not.toMatch(/PGR|PCMSO|16\)/);
    expect(fonte).toContain('entregas técnicas');
    expect(limpaTextoLaudo('Manutenção/supervisão (PGR 2026)', { semDocs: true, campo: 'setor' })).toBe('Manutenção/supervisão');
    const epi = limpaTextoLaudo('Não há fichas de entrega de EPI. O PGR 2026 (GHE Manutenção/supervisão) recomenda cinto de segurança, sem CA; o inventário registra creme de proteção. Na entrevista, o segurado relata uso de luvas.', { semDocs: true });
    expect(epi).toBe('Não há fichas de entrega de EPI. Na entrevista, o segurado relata uso de luvas.');
    const prof = limpaTextoLaudo("e) Atual: PGR 2026–2028 e PCMSO 2026 – setor Manutenção/supervisão, função Supervisor; 'trabalhos acima de 2 metros de altura' (PGR, item 11). Treinamentos práticos.", { semDocs: true });
    expect(prof).not.toMatch(/PGR|PCMSO/);
    expect(prof).toContain('Atual: setor Manutenção/supervisão');
  });
});

describe('texto da entrevista e perigos', () => {
  it('tira minutagem, "transcrição", "~" após travessão, "a:" sem data e "[, ]"', async () => {
    const { limpaTextoLaudo } = await import('../src/docx/base.js');
    const t = limpaTextoLaudo("Agente de expansão (entrevista 00:18:59–00:19:48: \"Isso é o R11\"); Grammer, conforme entrevista 00:19:48; controladores (1989–~1992); transcrição 23/10/2026. d) 07/1997 a: montagem. 'equipamentos [, ] esporadicamente pode realizar trabalhos acima de 2 metros de altura, conforme o documento da empresa do segurado'.");
    expect(t).not.toMatch(/\d{2}:\d{2}:\d{2}|R11"|~|transcrição|a:|\[/);
    expect(t).toContain('(entrevista)');
    expect(t).toContain('1989–cerca de 1992');
    expect(t).toContain('entrevista de 23/10/2026');
    expect(t).toContain('07/1997 em diante:');
    expect(t).toContain('"equipamentos, esporadicamente');
  });
  it('"sensibilização cardíaca" não é sensibilizante', async () => {
    const { perigosDoAgente } = await import('../src/docx/agentesQuadros.js');
    expect(perigosDoAgente({ data: { nome: 'HCFC-141b', tipo: 'Químico', efeitos: 'Depressão do SNC e sensibilização cardíaca com risco de arritmia.' } })).toEqual([]);
    expect(perigosDoAgente({ data: { nome: 'MDI', tipo: 'Químico', efeitos: 'Sensibilização respiratória e cutânea.' } })).toEqual(['sensibilizante']);
  });
});

describe('termo de declaração e autorização', () => {
  it('segurado que é o representante legal: uma assinatura com os dois papéis; 2.3 remete ao termo', async () => {
    await caso('s4', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'], autorNome: 'Fulano de Tal', autorCpf: '000.000.000-00', pppNit: '000.00000.00-0',
      pppEmitente: 'Empresa (empregador)', pppEmitenteNome: 'Empresa Gama Ltda', pppEmitenteCnpj: '00.000.000/0001-00', pppRepresentante: 'Fulano de Tal', vistoriaData: '2026-10-01' });
    await filho('s4v', 'periodo', 's4', { empresa: 'Empresa Gama Ltda', inicio: '2000-01-01', fim: '2010-12-31', cargo: 'Técnico', atividades: 'Montagem.' });
    await filho('s4a', 'agenteAvaliado', 's4', { nome: 'Óleo mineral', tipo: 'Químico', resAte97: 'Caracteriza', resDesde97: 'Caracteriza', codDesde97: '1.0.7, b, do Anexo IV' });
    const t = await texto(await ltcatPpp('s4'));
    expect(t).toMatch(/TERMO DE DECLARAÇÃO E AUTORIZAÇÃO/i);
    expect(t).toContain('Eu, Fulano de Tal, CPF 000.000.000-00 – NIT 000.00000.00-0, declaro');
    expect(t).toContain('Na condição de representante legal da Empresa Gama Ltda (CNPJ/CAEPF 00.000.000/0001-00), autorizo o levantamento');
    expect(t).toContain('Segurado e representante legal da Empresa Gama Ltda');
    expect((t.match(/_{20,}\n/g) || []).length).toBeGreaterThanOrEqual(1);
    expect(t).toContain('constam do termo de declaração e autorização, assinado ao final deste laudo');
  });
});

describe('contribuinte individual que emite o próprio PPP', () => {
  it('2.2 sem "autorização da empresa" e termo com a autorização do próprio segurado', async () => {
    await caso('s5', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'], autorNome: 'Dentista Fictício', autorCpf: '111.111.111-11', pppEmitente: 'Próprio segurado (contribuinte individual)', vistoriaData: '2026-11-04' });
    await filho('s5v', 'periodo', 's5', { empresa: 'Consultório próprio', inicio: '1990-01-01', fim: '', cargo: 'Cirurgião-dentista', atividades: 'Clínica geral.' });
    await filho('s5a', 'agenteAvaliado', 's5', { nome: 'Microrganismos', tipo: 'Biológico', resAte97: 'Caracteriza', resDesde97: 'Caracteriza' });
    const t = await texto(await ltcatPpp('s5'));
    expect(t).not.toContain('autorização escrita da empresa');
    expect(t).toContain('a autorização é dada por ele, no termo ao final deste laudo');
    expect(t).toContain('Como exerço a atividade por conta própria, autorizo o levantamento');
    expect(t).not.toContain('representante legal da');
  });
});

describe('importação: excluir agente e não trocar o tipo', () => {
  it('"excluir": true manda o agente para a lixeira; sem "tipo" o físico continua físico', async () => {
    const { aplicarIA, lerJsonIA } = await import('../src/aiimport.js');
    await caso('s6', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'] });
    await filho('s6a', 'agenteAvaliado', 's6', { nome: 'Ácido clorídrico', tipo: 'Químico' });
    await filho('s6b', 'agenteAvaliado', 's6', { nome: 'Radiações ionizantes (raios X intraoral)', tipo: 'Físico' });
    await aplicarIA('s6', lerJsonIA(JSON.stringify({ agentesAvaliados: [{ nome: 'Ácido clorídrico', excluir: true }, { nome: 'Radiações ionizantes', frequencia: 'Cerca de 8 radiografias por dia.', novoNome: 'Radiações ionizantes (raios X)' }] })), { substituir: true });
    const ags = (await db.records.toArray()).filter((r) => r.kind === 'agenteAvaliado' && r.caseId === 's6');
    expect(ags.find((r) => r.id === 's6a').deleted).toBeTruthy();
    const rx = ags.find((r) => r.id === 's6b');
    expect(rx.data.tipo).toBe('Físico');
    expect(rx.data.frequencia).toBe('Cerca de 8 radiografias por dia.');
    expect(rx.data.nome).toBe('Radiações ionizantes (raios X)');
    expect(ags.length).toBe(2);
  });
});

describe('coerência: biológico "não depende de" e peróxidos "por analogia"', () => {
  it('sem falso condicional, regra tira a analogia e o item de eventual muda todas as épocas', async () => {
    await caso('s7', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'], pppEmitente: 'Próprio segurado (contribuinte individual)' });
    await filho('s7v', 'periodo', 's7', { empresa: 'Consultório', inicio: '1989-01-01', fim: '', cargo: 'Cirurgião-dentista' });
    await filho('s7b', 'agenteAvaliado', 's7', { nome: 'Microrganismos', tipo: 'Biológico', resAte97: 'Caracteriza', resDesde97: 'Caracteriza',
      fundamentacao: 'A exposição é inerente à atividade e não depende de tempo mínimo diário.', frequencia: 'Habitual e permanente.' });
    await filho('s7p', 'agenteAvaliado', 's7', { nome: 'Peróxidos (clareamento dental)', tipo: 'Químico', codAte97: '1.2.9 do Dec. 53.831/64, por analogia',
      resAte97: 'Caracteriza', resDesde97: 'Não caracteriza', frequencia: 'Eventual, no clareamento.' });
    const pend = await pendenciasDoCaso('s7');
    expect(pend.find((x) => x.id === 'coer-cond')).toBeUndefined();
    const ev = pend.find((x) => x.id === 'coer-eventual-s7p');
    expect(ev.lotes[0].escritas[0].campos).toEqual({ resAte97: 'Não caracteriza' });
    const regras = pend.find((x) => x.id === 'regras');
    const camp = regras.lotes[0].escritas.find((e) => e.rec === 's7p').campos;
    expect(camp.resAte97).toBe('Não enquadrável');
    expect(camp.resDesde97).toBe('Não enquadrável');
    expect(camp.codAte97).toMatch(/^Não consta/);
  });
});

describe('varredura do laudo do dentista', () => {
  it('"sem exposição permanente" com "Caracteriza" vira pendência; técnica "Qualitativa até 05/03/1997" segue a regra', async () => {
    await caso('s8', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'], pppEmitente: 'Próprio segurado (contribuinte individual)' });
    await filho('s8v', 'periodo', 's8', { empresa: 'Consultório', inicio: '1989-01-01', fim: '', cargo: 'Cirurgião-dentista' });
    await filho('s8a', 'agenteAvaliado', 's8', { nome: 'Álcool etílico 70%', tipo: 'Químico', codAte97: '1.2.11 do Dec. 53.831/64 (III – álcoois)', resAte97: 'Caracteriza', resDesde97: 'Não enquadrável',
      fundamentacao: 'Até 05/03/1997, o enquadramento literal é possível, mas o uso é de saneante, em pequeno volume, sem exposição permanente a vapores; não caracteriza.' });
    const pend = await pendenciasDoCaso('s8');
    const ev = pend.find((x) => x.id === 'coer-eventual-s8a');
    expect(ev.lotes[0].escritas[0].campos).toEqual({ resAte97: 'Não caracteriza' });
    const { tecnicaDoAgente } = await import('../src/enquadramento.js');
    expect(tecnicaDoAgente({ data: { nome: 'Mercúrio', tipo: 'Químico', tecnica: 'Qualitativa até 05/03/1997' } }, false)).not.toMatch(/até 05\/03/);
  });
});

describe('cooperado sem exclusividade', () => {
  it('3.2 explica a condição simultânea', async () => {
    await caso('s9', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'], autorNome: 'Dentista', pppEmitente: 'Próprio segurado (contribuinte individual)' });
    await filho('s9v', 'periodo', 's9', { empresa: 'Consultório próprio', inicio: '1990-01-01', fim: '', cargo: 'Cirurgião-dentista', categoriaSegurado: 'Contribuinte individual',
      atividades: 'Clínica geral. Cooperado da cooperativa odontológica desde 1992, com atendimento também a particulares.' });
    await filho('s9a', 'agenteAvaliado', 's9', { nome: 'Microrganismos', tipo: 'Biológico', resAte97: 'Caracteriza', resDesde97: 'Caracteriza' });
    const t = await texto(await ltcatPpp('s9'));
    expect(t).toContain('Paralelamente, o segurado é cooperado de cooperativa de trabalho, sem exclusividade');
    expect(t).toContain('art. 1º da Lei nº 10.666/2003');
  });
});

describe('auditoria do laudo do dentista (versão 11)', () => {
  it('Observações sem códigos de época nem "Há entendimento"; PPP do próprio segurado com a assinatura dele', async () => {
    await caso('s10', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'], autorNome: 'Dentista', pppEmitente: 'Próprio segurado (contribuinte individual)' });
    await filho('s10v', 'periodo', 's10', { empresa: 'Consultório', inicio: '1990-01-01', fim: '', cargo: 'Cirurgião-dentista', atividades: 'Clínica.' });
    await filho('s10a', 'agenteAvaliado', 's10', { nome: 'Microrganismos', tipo: 'Biológico', resAte97: 'Caracteriza', resDesde97: 'Caracteriza',
      fundamentacao: 'Contato habitual com sangue e saliva. O consultório é estabelecimento de saúde, e a atividade corresponde ao cód. 1.3.2 até 05/03/1997 e ao cód. 3.0.1 a partir de 06/03/1997. Luvas reduzem, mas não eliminam, o contato.' });
    await filho('s10b', 'agenteAvaliado', 's10', { nome: 'Formaldeído', tipo: 'Químico', resAte97: 'Caracteriza', codAte97: '1.2.11 do Dec. 53.831/64', resDesde97: 'Não enquadrável',
      fundamentacao: 'Há entendimento de que o agente do Grupo 1 da LINACH é qualitativo. O volume usado é mínimo.' });
    const r = await ltcatPpp('s10');
    const t = await texto(r);
    expect(t).toContain('Contato habitual com sangue e saliva. Luvas reduzem');
    expect(t).not.toContain('O consultório é estabelecimento de saúde');
    expect(t).not.toContain('Há entendimento');
    expect(t).toContain('O volume usado é mínimo.');
    expect(await texto(r.extras[0])).toContain('Assinatura do segurado (emitente do PPP)');
  });
});
