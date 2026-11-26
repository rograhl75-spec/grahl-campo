import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { db } from '../src/db.js';
import { PERFIL_ID, limpaTextoLaudo } from '../src/docx/base.js';
import { ltcatPpp } from '../src/docx/modelos.js';
import { pendenciasDoCaso } from '../src/pendencias.js';
import { definirTabelaCbo, sugerirCbo, codigoCbo, cboComTitulo } from '../src/cbo.js';
import { bancoDoAgente, casValido, viasPadrao } from '../src/docx/agentesQuadros.js';
import { exposicaoNoVinculo } from '../src/enquadramento.js';
import { lerJsonIA, montarPrompt } from '../src/aiimport.js';

// Dados sintéticos (técnico fictício de máquinas de poliuretano)
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
  definirTabelaCbo(JSON.parse(await readFile(new URL('../public/bases/cbo2002.json', import.meta.url), 'utf8')));
  await db.records.put({ id: PERFIL_ID, kind: 'perfil', caseId: null, data: { nome: 'Perito Teste', cidade: 'Cidade A' }, ts: {} });
  await db.records.put({ id: 'q-tdi', kind: 'quimico', caseId: null, ts: {}, data: { nome: 'Tolueno diisocianato (TDI)', cas: '584-84-9', nr15Ppm: '0,016', nr15Grau: 'máximo' } });
  await db.records.put({ id: 'q-fenol', kind: 'quimico', caseId: null, ts: {}, data: { nome: 'Fenol', cas: '108-95-2', orgaosAlvo: 'liver, kidneys', nr15Ppm: '4' } });
});

describe('texto pronto para o laudo', () => {
  it('tira minutagem, transcrição, "~" e citações dos documentos da empresa; mantém [...]', () => {
    const t = "a) 05/1989 a ~1992: instalação (00:07:45–00:08:33), conforme entrevista (transcrição Gemini).\nd) 07/1997 a [data a confirmar]: Honda – TDI, transcrito como 'TVI'; 'fresa' (ver 'documentos').\ne) Atual: PGR 2026–2028 e PCMSO 2026 – setor Manutenção: 'instalação [...] esporadicamente' (PGR, item 11).";
    const s = limpaTextoLaudo(t, { semDocs: true });
    expect(s).not.toMatch(/00:0|transcri|~|\(ver|PGR|PCMSO|'/);
    expect(s).toContain('cerca de 1992');
    expect(s).toContain('[[data a confirmar]]');
    expect(s).toContain('[...]');
    expect(s).toContain('"fresa"');
    expect(limpaTextoLaudo('PGR 2026; CNIS', { semDocs: true, campo: 'fonte' })).toBe('CNIS');
    // sem a opção, os documentos continuam citados
    expect(limpaTextoLaudo('conforme o PGR, item 11')).toContain('PGR');
  });
  it('a importação não troca "[...]" por vírgula', () => {
    const r = lerJsonIA(JSON.stringify({ periodos: [{ empresa: 'X', inicio: '01/05/1989', fim: 'atual', atividades: 'manutenção [...] esporadicamente... depois' }],
      agentesAvaliados: [{ nome: 'TDI', tipo: 'Químico', expInicio: '01/07/1997' }], ppp: { modalidade: 'remota', docsEmpresa: 'somente referência' } }));
    expect(r.periodos[0].atividades).toContain('[...]');
    expect(r.agentesAvaliados[0].expInicio).toBe('1997-07-01');
    expect(r.caso.modalidade).toMatch(/^Remota/);
    expect(r.caso.docsEmpresa).toMatch(/^Somente/);
  });
  it('a instrução do LTCAT pede texto pronto, CBO e coerência', () => {
    const p = montarPrompt('extra-ltcat', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'] });
    expect(p).toContain('TEXTO PRONTO PARA O LAUDO');
    expect(p).toContain('"expInicio"');
    expect(p).toContain('CBO 2002');
  });
});

describe('CBO 2002', () => {
  it('sugere pelo cargo e completa o título', () => {
    const s = sugerirCbo({ cargo: 'Supervisor de manutenção elétrica', atividades: 'montagem e partida de máquinas' });
    expect(s[0].codigo).toBe('9503-05');
    expect(sugerirCbo({ cargo: 'Cirurgião-dentista' })[0].codigo).toBe('2232-08');
    expect(codigoCbo('950305')).toBe('9503-05');
    expect(cboComTitulo('9503.05')).toBe('9503-05 – Supervisor de manutenção eletromecânica');
  });
});

describe('agentes', () => {
  it('CAS só quando é número CAS; parênteses não entram na busca no banco; físico tem meio de exposição', async () => {
    expect(casValido('Óleo básico de petróleo')).toBe('');
    expect(casValido('CAS 584-84-9')).toBe('584-84-9');
    const quim = await db.records.where('kind').equals('quimico').toArray();
    expect(bancoDoAgente({ data: { nome: 'Mesamoll (éster alquilsulfônico de fenol)' } }, quim)).toBeNull();
    expect(bancoDoAgente({ data: { nome: 'Fenol' } }, quim)?.id).toBe('q-fenol');
    expect(bancoDoAgente({ data: { nome: 'Isocianatos (TDI)' } }, quim)?.id).toBe('q-tdi');
    expect(viasPadrao({ data: { nome: 'Eletricidade (tensão acima de 250 V)', tipo: 'Físico' } })).toMatch(/energizad/);
    expect(viasPadrao({ data: { nome: 'TDI', tipo: 'Químico' } })).toBe('');
  });
  it('o período de exposição do agente recorta a janela do PPP', () => {
    const r = { data: { inicio: '1989-05-01', fim: '2026-11-20' } };
    const ex = exposicaoNoVinculo(r, 0, [{ data: { nome: 'TDI', tipo: 'Químico', resAte97: 'Caracteriza', resDesde97: 'Caracteriza', expInicio: '1997-07-01', expFim: '2019-12-31' } }]);
    expect(ex.map((e) => [e.ini, e.fim])).toEqual([['1997-07-01', '2019-12-31']]);
  });
});

describe('LTCAT e PPP do contribuinte individual sócio, avaliação remota', () => {
  beforeAll(async () => {
    await caso('m1', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'], autorNome: 'Segurado Teste', reuNome: 'Empresa Teste Ltda', pppEmitente: 'Empresa (empregador)',
      pppEmitenteNome: 'Empresa Teste Ltda', modalidade: 'Remota (entrevista por videoconferência)', docsEmpresa: 'Somente referência (não citar)', fotosAutoria: 'Fornecidas pelo segurado',
      vistoriaData: '2026-10-23', vistoriaLocal: 'local', vistoriaPresentes: 'o segurado', art: '123' });
    await filho('m1v', 'periodo', 'm1', { empresa: 'Empresa Teste Ltda', inicio: '1989-05-01', fim: '', cargo: 'Supervisor de manutenção elétrica (PGR 2026)', setor: 'Manutenção (PGR 2026)',
      categoriaSegurado: 'Contribuinte individual', cbo: '950305',
      atividades: 'Sócio-administrador.\na) 05/1989 a ~1992: instalação de controladores (00:07:45).\nb) 1997 em diante: partida de máquinas de poliuretano (PGR, item 11).' });
    await filho('m1a', 'agenteAvaliado', 'm1', { nome: 'Isocianatos (TDI, CAS 584-84-9)', cas: '584-84-9', tipo: 'Químico', resAte97: 'Caracteriza', resDesde97: 'Caracteriza',
      codDesde97: '1.0.19', ca: 'Creme de proteção sem CA', fundamentacao: 'Exposição depende da confirmação do segurado.' });
    await filho('m1b', 'agenteAvaliado', 'm1', { nome: 'Eletricidade', tipo: 'Físico', resAte97: 'Caracteriza', resDesde97: 'Caracteriza', frequencia: 'Acesso eventual às cabines.',
      circunstancias: 'Leitura do medidor na cabine.', fonte: 'Cabine primária.' });
  });
  it('pendências: CBO resolvido, coerência apontada, vias da eletricidade automáticas', async () => {
    const it0 = await pendenciasDoCaso('m1');
    const ids = it0.map((i) => i.id);
    expect(ids.some((i) => i.startsWith('cbo-'))).toBe(false);
    expect(ids).toContain('regras');
    expect(ids).toContain('coer-cond');
    expect(ids).toContain('coer-eventual-m1b');
    expect(ids).toContain('coer-fases-m1v');
    expect(ids.some((i) => /^vias-m1b/.test(i))).toBe(false);
    // TDI: consta do Anexo IV e tem limite no Anexo 11 (banco) – sem medição, não caracteriza a partir de 06/03/1997
    const q = it0.find((i) => i.id === 'regras');
    const tdi = q.lotes[0].escritas.find((e) => e.rec === 'm1a');
    expect(tdi.campos.resDesde97).toBe('Não avaliado (sem medição)');
    // os resultados resolvidos pelas regras não viram perguntas separadas
    expect(ids.some((i) => /^resDesde97-m1a/.test(i))).toBe(false);
    // "Está correto – manter" tira o item da lista
    await db.records.update('m1b', { 'data.ciente_eventual': 'Sim' });
    expect((await pendenciasDoCaso('m1')).some((i) => i.id === 'coer-eventual-m1b')).toBe(false);
  });
  it('CBO sem código: sugestões da tabela', async () => {
    await caso('m2', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'], autorNome: 'X', pppEmitente: 'Empresa (empregador)', modalidade: 'Presencial (vistoria no local de trabalho)' });
    await filho('m2v', 'periodo', 'm2', { empresa: 'Y', inicio: '2000-01-01', fim: '2010-01-01', cargo: 'Mecânico de manutenção de máquinas', categoriaSegurado: 'Empregado' });
    const cbo = (await pendenciasDoCaso('m2')).find((i) => i.id === 'cbo-m2v');
    expect(cbo.livre).toBe(true);
    expect(cbo.opcoes[0].valor).toMatch(/^9113-05/);
  });
  it('LTCAT: remota, sócio, sem citar documentos, sem nota de ART, fotos e EC 103', async () => {
    const r = await ltcatPpp('m1');
    const t = await texto(r);
    expect(t).toContain('sem vistoria no local de trabalho');
    expect(t).toContain('Registro da entrevista');
    expect(t).toContain('Segurado Teste – segurado');
    expect(t).not.toMatch(/\nlocal\n/);
    expect(t).toContain('na condição de sócio da empresa emitente do PPP');
    expect(t).not.toContain('Não há empresa que mantenha registros ambientais');
    expect(t).toContain('13/11/2019, de entrada em vigor da Emenda Constitucional nº 103/2019, é indicada na síntese');
    expect(t).not.toMatch(/PGR|00:07|~1992/);
    expect(t).not.toContain('Anexe a ART');
    expect(t).toContain('4.1 PROFISSIOGRAFIA');
    expect(t).not.toMatch(/Redigir: descrição do ambiente/);
    expect(t).not.toMatch(/Todos os vínculos/);
    expect(t).toMatch(/Isocianatos \(TDI, CAS 584-84-9\)\nCAS 584-84-9/);
    expect(t).toContain('Tema 1291');
    expect(t).toMatch(/Tema 1291[^\n]*Tema 1447/);
    expect(t).toContain('LINACH');
  });
  it('PPP: CBO, cargo e setor limpos, sem quebra em 1996 e 1998 quando não há EPC/EPI a declarar, data de emissão', async () => {
    const r = await ltcatPpp('m1');
    const t = await texto(r.extras[0]);
    expect(t).toContain('9503-05');
    expect(t).not.toContain('(PGR 2026)');
    // sem fichas de EPI nem EPC/EPI eficaz: "Não" no período todo, só a quebra de 05/03/1997 (troca de decreto)
    expect(t).toContain('01/05/1989 a 05/03/1997');
    expect(t).toContain('06/03/1997 a');
    expect(t).not.toContain('13/10/1996');
    expect(t).not.toContain('02/12/1998');
    expect(t).not.toContain('Creme de proteção');
    expect(t).not.toMatch(/Isocianatos \(TDI/);
    expect(t).not.toContain('____/____');
    expect(t).toContain('Resolução CFM nº 1.715/2004');
  });
  it('PPP do empregado vai até a véspera do eSocial SST', async () => {
    await caso('m3', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'], autorNome: 'Z', pppEmitente: 'Empresa (empregador)', pppEmitenteNome: 'W', esocialSst: '2022-01-10' });
    await filho('m3v', 'periodo', 'm3', { empresa: 'W', inicio: '2010-01-01', fim: '', cargo: 'Soldador', categoriaSegurado: 'Empregado', cbo: '7243-15' });
    await filho('m3a', 'agenteAvaliado', 'm3', { nome: 'Fumos metálicos', tipo: 'Químico', resDesde97: 'Caracteriza', codDesde97: '1.0.8' });
    const t = await texto((await ltcatPpp('m3')).extras[0]);
    expect(t).toContain('01/01/2010 a 09/01/2022');
    expect(t).toContain('constam do PPP eletrônico (eSocial, evento S-2240)');
  });
});

describe('técnica e intensidade dos agentes qualitativos no PPP', () => {
  it('anexo da NR-15, NHO a partir de 2004, LINACH só desde 08/10/2014 e "Não quantificada"', async () => {
    const { tecnicaNoPeriodo } = await import('../src/enquadramento.js');
    const a = { data: { nome: 'Óleo mineral', tipo: 'Químico', tecnica: 'Qualitativa', codDesde97: '1.0.7, b, do Anexo IV – avaliação qualitativa' } };
    expect(tecnicaNoPeriodo(a, '1997-03-05')).toMatch(/^Qualitativa – presunção/);
    expect(tecnicaNoPeriodo(a, '2003-12-31')).toBe('Qualitativa – NR-15, Anexo 13');
    expect(tecnicaNoPeriodo(a, '2010-01-01')).toBe('Qualitativa – NR-15, Anexo 13');
    expect(tecnicaNoPeriodo({ data: { nome: 'TDI', tipo: 'Químico', codDesde97: 'quantitativa' } }, '2010-01-01')).toBe('Quantitativa – NR-15, Anexo 11; metodologia: NHO 02 e NHO 07 da FUNDACENTRO');
    const sil = { data: { nome: 'Sílica livre cristalizada', tipo: 'Químico' } };
    expect(tecnicaNoPeriodo(sil, '2014-10-07')).toMatch(/NHO 03, NHO 04 e NHO 08/);
    expect(tecnicaNoPeriodo({ data: { nome: 'Microrganismos', tipo: 'Biológico' } }, '2010-01-01')).toMatch(/cód\. 3\.0\.1/);
  });
  it('PPP: linhas partidas em 2003 e anexo na técnica; contribuinte individual sem corte do eSocial', async () => {
    await caso('m4', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'], autorNome: 'Q', pppEmitente: 'Empresa (empregador)', pppEmitenteNome: 'E', esocialSst: '2022-01-10' });
    await filho('m4v', 'periodo', 'm4', { empresa: 'E', inicio: '2000-01-01', fim: '2024-12-31', cargo: 'Técnico', categoriaSegurado: 'Contribuinte individual', cbo: '3131-25' });
    await filho('m4a', 'agenteAvaliado', 'm4', { nome: 'Óleo mineral', tipo: 'Químico', resDesde97: 'Caracteriza', tecnica: 'Qualitativa', codDesde97: '1.0.7 – qualitativa' });
    const t = await texto((await ltcatPpp('m4')).extras[0]);
    // qualitativa: os marcos de 2003 e 2014 não mudam a técnica – uma linha só
    expect(t).toContain('01/01/2000 a 31/12/2024');
    expect(t).toContain('Qualitativa – NR-15, Anexo 13');
    expect(t).not.toContain('NHO 02 e NHO 07 da');
    // qualitativa: intensidade "Qualitativa" (nada a quantificar)
    expect(t).toMatch(/Qualitativa\s*\n?\s*Qualitativa – NR-15, Anexo 13/);
    expect(t).not.toContain('Não quantificada');
    expect(t).not.toContain('PPP eletrônico');
  });
});

describe('regras de enquadramento por período', () => {
  it('consta, quantitativo ou qualitativo e LINACH', async () => {
    const { regraDoAgente } = await import('../src/regras.js');
    const quimicos = await db.records.where('kind').equals('quimico').toArray();
    const d = { quimicos, medicoes: [], periodos: [] };
    const mdi = regraDoAgente({ data: { nome: 'MDI', tipo: 'Químico', codAte97: '1.2.11 do Dec. 53.831/64', codDesde97: 'Não consta do Anexo IV' } }, d);
    expect([mdi.resAte97, mdi.resDesde97]).toEqual(['Caracteriza', 'Não enquadrável']);
    const graxa = regraDoAgente({ data: { nome: 'Graxa sintética', tipo: 'Químico', codDesde97: 'Não consta do Anexo IV' } }, d);
    expect(graxa.resAte97).toBe('Não enquadrável');
    const oleo = regraDoAgente({ data: { nome: 'Óleo mineral', tipo: 'Químico', codAte97: '1.2.11', codDesde97: '1.0.7, b, do Anexo IV' } }, d);
    expect(oleo.resDesde97).toBe('Caracteriza');
    const sil = regraDoAgente({ data: { nome: 'Sílica livre cristalizada', tipo: 'Químico', cas: '14808-60-7', codAte97: '1.2.10', codDesde97: '1.0.18 do Anexo IV' } }, d);
    expect([sil.resDesde97, sil.resDesde2014]).toEqual(['Não avaliado (sem medição)', 'Caracteriza']);
    const el = regraDoAgente({ data: { nome: 'Eletricidade', tipo: 'Físico' } }, d);
    expect([el.resAte97, el.resDesde97]).toEqual(['Caracteriza', 'Não enquadrável']);
  });
  it('LINACH: o PPP separa a linha em 08/10/2014', async () => {
    await caso('m5', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'], autorNome: 'R', pppEmitente: 'Empresa (empregador)', pppEmitenteNome: 'E' });
    await filho('m5v', 'periodo', 'm5', { empresa: 'E', inicio: '2010-01-01', fim: '2020-12-31', cargo: 'Jatista', categoriaSegurado: 'Empregado', cbo: '7244-40' });
    await filho('m5a', 'agenteAvaliado', 'm5', { nome: 'Sílica livre cristalizada', tipo: 'Químico', cas: '14808-60-7', resDesde97: 'Não caracteriza', resDesde2014: 'Caracteriza', codDesde97: '1.0.18' });
    const t = await texto((await ltcatPpp('m5')).extras[0]);
    expect(t).toContain('01/01/2010 a 07/10/2014');
    expect(t).toContain('08/10/2014 a 31/12/2020');
    expect(t).toContain('LINACH Grupo 1');
  });
  it('nota entre colchetes vira pendência com substituir / apagar', async () => {
    await caso('m6', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'], autorNome: 'T', pppEmitente: 'Empresa (empregador)' });
    await filho('m6v', 'periodo', 'm6', { empresa: 'E', inicio: '1997-07-01', fim: '2019-01-01', cargo: 'Técnico', cbo: '3131-25', categoriaSegurado: 'Empregado', atividades: 'd) 07/1997 a [data a confirmar – fim do contrato]: montagem.' });
    const n = (await pendenciasDoCaso('m6')).find((i) => i.tipo === 'nota');
    expect(n.trecho).toBe('[data a confirmar – fim do contrato]');
    expect(n.valorAtual.replace(n.trecho, '2019')).toContain('07/1997 a 2019:');
  });
});

describe('reescrever pelas regras', () => {
  it('tira o trecho condicional da frequência e reescreve a fundamentação; exposição até 1995 não pede permanência', async () => {
    await caso('m7', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'], autorNome: 'U', pppEmitente: 'Empresa (empregador)', modalidade: 'Remota (entrevista por videoconferência)' });
    await filho('m7v', 'periodo', 'm7', { empresa: 'E', inicio: '1989-05-01', fim: '2020-01-01', cargo: 'Técnico', cbo: '3131-25', categoriaSegurado: 'Contribuinte individual' });
    await filho('m7a', 'agenteAvaliado', 'm7', { nome: 'Óleo mineral', tipo: 'Químico', resAte97: 'Caracteriza', resDesde97: 'Caracteriza', codAte97: '1.2.11', codDesde97: '1.0.7 do Anexo IV',
      frequencia: 'Diária, nas montagens; habitualidade e permanência a confirmar em campo', fundamentacao: 'Depende de confirmação do segurado.' });
    await filho('m7b', 'agenteAvaliado', 'm7', { nome: 'Eletricidade', tipo: 'Físico', resAte97: 'Caracteriza', resDesde97: 'Não enquadrável', expFim: '1992-12-31', frequencia: 'Eventual' });
    const its = await pendenciasDoCaso('m7');
    expect(its.some((i) => i.id === 'coer-eventual-m7b')).toBe(false);
    const c = its.find((i) => i.id === 'coer-cond');
    const e = c.lotes[0].escritas.find((x) => x.rec === 'm7a');
    expect(e.campos.frequencia).toBe('Diária, nas montagens.');
    expect(e.campos.fundamentacao).toMatch(/consta do Anexo IV/);
    for (const [k, val] of Object.entries(e.campos)) await db.records.update('m7a', { [`data.${k}`]: val });
    expect((await pendenciasDoCaso('m7')).some((i) => i.id === 'coer-cond')).toBe(false);
  });
});

describe('óleo mineral × derivado de petróleo × sintético e IP 346', () => {
  it('classifica pelo nome e pelo CAS e lê o IP 346 da FDS', async () => {
    const { grupoHidrocarboneto, ip346DoTexto, IP346 } = await import('../src/hidrocarbonetos.js');
    expect(grupoHidrocarboneto('Óleo básico mineral altamente refinado', '64742-54-7')).toBe('oleoMineral');
    expect(grupoHidrocarboneto('Vaselina')).toBe('oleoMineral');
    expect(grupoHidrocarboneto('Óleo diesel', '68334-30-5')).toBe('derivadoPetroleo');
    expect(grupoHidrocarboneto('Aguarrás mineral')).toBe('derivadoPetroleo');
    expect(grupoHidrocarboneto('Polialfaolefina', '68037-01-4')).toBe('sintetico');
    expect(grupoHidrocarboneto('Graxa de base sintética')).toBe('sintetico');
    expect(ip346DoTexto('Óleo básico (< 3 % de extrato DMSO, IP 346)')).toBe(IP346[0]);
    expect(ip346DoTexto('óleo mineral não tratado')).toBe(IP346[1]);
  });
  it('regras: óleo mineral no cód. 1.0.7, b, qualitativo, sem LINACH; diesel no 1.0.17 a conferir; sintético não enquadrável', async () => {
    const { regraDoAgente, fundamentacaoPelasRegras } = await import('../src/regras.js');
    const d = { quimicos: [], medicoes: [], periodos: [] };
    const oleo = { data: { nome: 'Óleo hidráulico mineral', tipo: 'Químico', ip346: '< 3 % (óleo altamente refinado)' } };
    const r = regraDoAgente(oleo, d);
    expect([r.resAte97, r.resDesde97, r.resDesde2014]).toEqual(['Caracteriza', 'Caracteriza', '']);
    expect(r.codDesde97).toMatch(/^1\.0\.7, b/);
    expect(fundamentacaoPelasRegras(oleo, r)).toMatch(/IP 346/);
    const diesel = regraDoAgente({ data: { nome: 'Óleo diesel', tipo: 'Químico', cas: '68334-30-5' } }, d);
    expect(diesel.codDesde97).toMatch(/^1\.0\.17/);
    expect(diesel.conferir.join(' ')).toMatch(/art\. 287, § 4º/);
    const sint = regraDoAgente({ data: { nome: 'Graxa de base sintética', tipo: 'Químico' } }, d);
    expect(sint.resDesde97).toBe('Não enquadrável');
  });
  it('FDS → agentes: cria o grupo do produto com o resultado e completa o existente', async () => {
    await caso('m8', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'], autorNome: 'V', pppEmitente: 'Empresa (empregador)', modalidade: 'Remota (entrevista por videoconferência)' });
    await filho('m8v', 'periodo', 'm8', { empresa: 'E', inicio: '2000-01-01', fim: '2020-01-01', cargo: 'Mecânico', cbo: '9113-05', categoriaSegurado: 'Empregado' });
    await filho('m8p', 'fds', 'm8', { nome: 'Óleo Diesel S10', s3Componentes: 'Óleo diesel; 68334-30-5; 95-100 %' });
    await filho('m8q', 'fds', 'm8', { nome: 'Lubrificante X', s3Componentes: 'Óleo básico mineral; 64742-54-7; > 90 %', s2Outros: 'Extrato DMSO < 3 % (IP 346)' });
    const it0 = (await pendenciasDoCaso('m8')).find((i) => i.id === 'fds-agentes');
    const novos = it0.lotes[0].escritas.filter((e) => e.criar).map((e) => e.criar.data);
    expect(novos.map((x) => x.nome).sort()).toEqual(['Derivados de petróleo (combustíveis e solventes)', 'Óleos minerais']);
    const oleo = novos.find((x) => x.nome === 'Óleos minerais');
    expect(oleo).toMatchObject({ ip346: '< 3 % (óleo altamente refinado)', resDesde97: 'Caracteriza' });
    expect(oleo.codDesde97).toMatch(/^1\.0\.7, b/);
  });
});

describe('risco à integridade física fora do Anexo IV', () => {
  it('LTCAT enquadra em item próprio e na síntese; PPP cita nas observações, sem mudar campo 15 e GFIP', async () => {
    await caso('m9', { tipoAtuacao: 'Extrajudicial', objeto: ['LTCAT'], autorNome: 'W', pppEmitente: 'Empresa (empregador)', pppEmitenteNome: 'E', modalidade: 'Remota (entrevista por videoconferência)', jurisprudencia: 'Incluir' });
    await filho('m9v', 'periodo', 'm9', { empresa: 'E', inicio: '1990-01-01', fim: '2021-12-31', cargo: 'Eletricista', cbo: '9511-05', categoriaSegurado: 'Empregado' });
    await filho('m9a', 'agenteAvaliado', 'm9', { nome: 'Eletricidade (tensão acima de 250 V)', tipo: 'Físico', resAte97: 'Caracteriza', resDesde97: 'Não enquadrável',
      integridadeFisica: 'Caracterizada tecnicamente', circunstancias: 'Manutenção de painéis energizados.', frequencia: 'Diária, indissociável da atividade.' });
    await filho('m9b', 'agenteAvaliado', 'm9', { nome: 'Inflamáveis (gasolina)', tipo: 'Químico', resAte97: 'Caracteriza', resDesde97: 'Não enquadrável', integridadeFisica: 'Caracterizada tecnicamente',
      circunstancias: 'Abastecimento de geradores.', frequencia: 'Semanal.' });
    const r = await ltcatPpp('m9');
    const t = await texto(r);
    expect(t).toMatch(/RISCOS À INTEGRIDADE FÍSICA \(NR-16 E NR-10\)/i);
    expect(t).toContain('Integridade física');
    expect(t).toMatch(/a agentes nocivos e a risco à integridade física/);
    expect(t).toContain('06/03/1997 a 31/12/2021');
    expect(t).toContain('NR-16, Anexo 4');
    expect(t).toContain('NR-16, Anexo 2');
    expect(t).toContain('Emenda Constitucional nº 103/2019, o art. 201');
    expect(t).toContain('Tema 534');
    expect(t).toContain('inflamáveis e explosivos após 05/03/1997');
    const p = await texto(r.extras[0]);
    expect(p).toContain('Consta do LTCAT, no item');
    expect(p).not.toMatch(/\|?\s*F\s*\n?Eletricidade[^\n]*\n[^\n]*06\/03\/1997/);
    expect(p).toContain('não integra os fatores de risco do campo 15 nem o código GFIP');
  });
});
