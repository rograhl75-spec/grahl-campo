import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { db } from '../src/db.js';
import { veiculoParaParadigma, postoParaBase, incluirVeiculoNaBase, incluirPostoNaBase, lerJsonProfissao, salvarProfissao, registrarProfissoes, profissaoDoRegistro,
  incluirNotasSugeridas, textoNotasParaClaude, NOTAS_SUGERIDAS, entradasDasNotas } from '../src/basesUsuario.js';
import { PROFISSOES, profissaoDoCaso } from '../src/data/profissoes.js';

// Dados sintéticos.
const caso = { id: 'bu1', data: { tipoAtuacao: 'Judicial', numero: '0000000-00.2026.4.04.0000', juizo: 'Vara Teste', vistoriaData: '2026-09-29', vistoriaLocal: 'Empresa Paradigma' } };
const posto = { id: 'bup1', data: { nome: 'Motorista – carreta', placa: 'ABC1D23', veiculoAvaliado: 'Marca Alfa T113 H 4x2 360, ano 1995, sem ar-condicionado, com semirreboque graneleiro' } };
const meds = [
  { id: 'bum1', data: { agente: 'Ruído', postoId: 'bup1', lavg: '93.1', nen: '96', jornada: '12:00', tempoAmostragem: '28 min', equipamentoId: 'eq1', dataMedicao: '2026-09-29' } },
  { id: 'bum2', data: { agente: 'Vibração de corpo inteiro (VCI)', postoId: 'bup1', aren: '1.07', vdv: '15.74', eixo: 'Z', carga: 'Vazio', condicaoVia: 'asfalto e terra', horaInicio: '11:35', horaFim: '11:56', equipamentoId: 'eq2' } },
];
const equip = [{ id: 'eq1', data: { nome: 'Dosímetro', modelo: 'DM', serie: '1', certificado: 'C1', dataCalibracao: '2025-06-26' } }, { id: 'eq2', data: { nome: 'Medidor', modelo: 'AX', serie: '2' } }];

describe('levar o caso para a base técnica', () => {
  it('veículo avaliado: um paradigma com ruído e VCI, dados do veículo e da fonte', () => {
    const d = veiculoParaParadigma(caso, posto, meds, equip);
    expect(d).toMatchObject({ marca: 'Marca', ano: '1995', arCondicionado: 'Não', tipo: 'Cavalo', lavg: '93.1', nenLaudo: '96', arenLaudo: '1.07', vdvrLaudo: '15.74', eixoDominante: 'Z', fonteTipo: 'Judicial', dataMedicao: '29/09/2026', situacao: 'Revisar' });
    expect(d.modelo).toContain('Alfa T113');
    expect(d.configuracao).toContain('conjunto vazio');
    expect(d.observacoes).toContain('Placa ABC1D23');
    expect(d.ruidoEquip).toContain('Dosímetro');
    expect(d.citacao).toContain('Proc. 0000000-00.2026.4.04.0000');
  });
  it('grava o paradigma e marca o posto e as medições', async () => {
    for (const r of [posto, ...meds]) await db.records.put({ ...r, kind: r.data.agente ? 'medicao' : 'posto', caseId: 'bu1', ts: {} });
    const r = await incluirVeiculoNaBase(caso, posto, meds, equip);
    expect(r.kind).toBe('paradigma');
    expect((await db.records.get('bup1')).data.baseId).toBe(r.id);
    expect((await db.records.get('bum2')).data.paradigmaId).toBe(r.id);
  });
  it('posto não motorista vai para postos medidos, com os resultados por agente', async () => {
    const p = { id: 'bup2', data: { nome: 'Padeiro', descricao: 'Massa e forno a lenha', fontes: 'masseira; forno' } };
    await db.records.put({ ...p, kind: 'posto', caseId: 'bu1', ts: {} });
    const m = [{ id: 'bum3', data: { agente: 'Ruído', lavg: '85.7', jornada: '8:30' } }, { id: 'bum4', data: { agente: 'Calor (IBUTG)', tbn: '24.2', tg: '29.4', obs: 'dia ensolarado' } }];
    const d = postoParaBase(caso, p, m, []);
    expect(d.funcao).toBe('Padeiro');
    expect(d.ruido).toContain('85.7');
    expect(d.calor).toContain('24.2');
    expect(d.condicoes).toContain('dia ensolarado');
    const r = await incluirPostoNaBase(caso, p, m, []);
    expect(r.kind).toBe('postoMedido');
  });
});

describe('profissões do signatário', () => {
  it('a ficha do Claude vira profissão do banco, reconhecida pelo cargo', async () => {
    const o = lerJsonProfissao('{"nome":"Padeiro","palavrasChave":["padeiro","panificação"],"cbo":"8483-05","profissiografia":"Prepara massas","roteiro":["Tempo junto ao forno?"],"documentos":["PPRA"],"agentes":[{"nome":"Calor","resDesde97":"A confirmar"}]}');
    await salvarProfissao(o, 'bu1');
    const recs = (await db.records.where('kind').equals('profissao').toArray());
    registrarProfissoes(recs);
    const p = profissaoDoCaso({ funcoes: 'padeiro de forno a lenha' }, []);
    expect(p?.nome).toBe('Padeiro');
    expect(p.roteiro).toEqual(['Tempo junto ao forno?']);
    registrarProfissoes(recs); // de novo: não duplica
    expect(PROFISSOES.filter((x) => x.nome === 'Padeiro')).toHaveLength(1);
    expect(profissaoDoRegistro({ data: { nome: 'X', palavrasChave: 'a, b' } }).re.test('cargo b')).toBe(true);
  });
});

describe('notas normativas do signatário', () => {
  it('inclui as sugeridas uma vez e monta o texto para o Claude e a consulta', async () => {
    expect(await incluirNotasSugeridas()).toBe(NOTAS_SUGERIDAS.length);
    expect(await incluirNotasSugeridas()).toBe(0);
    const l = (await db.records.where('kind').equals('notaNormativa').toArray());
    const t = textoNotasParaClaude(l);
    expect(t).toContain('NOTAS NORMATIVAS DO SIGNATÁRIO');
    expect(t).toContain('NHO-09');
    expect(entradasDasNotas(l)[0].fonte).toBe('Notas do signatário');
    expect(textoNotasParaClaude([{ data: { titulo: 'x', texto: 'y', usarNoClaude: 'Não' } }])).toBe('');
  });
});
