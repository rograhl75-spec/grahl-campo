import { db, caseChildren } from '../db.js';
import { ORIGEM_QUESITO } from '../schema.js';
import { resumoMedicao, calculados } from '../medicoes.js';
import { p, run, titulo, tabela, rotuloValor, sumario, imagem, montarDocx, quebraPagina } from './ooxml.js';

export function dataBR(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}

function dataHoraBR(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function menosCincoAnos(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${Number(m[1]) - 5}`;
}

async function modelo(nome = 'timbrado-vertical.docx') {
  const r = await fetch(`${import.meta.env.BASE_URL}modelos/${nome}`);
  if (!r.ok) throw new Error('Não foi possível carregar o modelo timbrado.');
  return r.arrayBuffer();
}

async function carregar(caseId) {
  const caso = await db.records.get(caseId);
  const [quesitos, periodos, documentos, epis, postos, medicoes, fotos] = await Promise.all(
    ['quesito', 'periodo', 'documento', 'epi', 'posto', 'medicao', 'foto'].map((k) => caseChildren(caseId, k)));
  const equipamentos = (await db.records.where('kind').equals('equip').toArray()).filter((e) => !e.deleted);
  return { c: caso.data, quesitos, periodos, documentos, epis, postos, medicoes, fotos, equipamentos };
}

function texto(t) {
  return t && String(t).trim() ? p(String(t).trim()) : p('Não informado.', { run: { i: true, color: '64748B' } });
}

function capa(c, nomeDoc) {
  const partes = [c.autorNome, c.reuNome].filter(Boolean).join(' × ');
  return [
    p('', { after: 1800 }),
    p(nomeDoc, { align: 'center', after: 480, run: { b: true, size: 16, color: '1B365D' } }),
    c.numero ? p(`Processo nº ${c.numero}`, { align: 'center', run: { b: true, size: 12 } }) : '',
    c.juizo ? p(c.juizo + (c.comarca ? ` – ${c.comarca}` : ''), { align: 'center' }) : '',
    partes ? p(partes, { align: 'center', before: 240 }) : '',
    p(c.papel || '', { align: 'center', before: 240, run: { i: true } }),
    p('', { after: 1600 }),
    p('Rogério Grahl', { align: 'center', after: 0, run: { b: true } }),
    p('Engenheiro Químico e Engenheiro de Segurança do Trabalho', { align: 'center', after: 0 }),
    p('CREA-SC 10392239/D – visto CREA-PR 081075', { align: 'center', after: 0 }),
    p(`Londrina/PR, ${new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}`, { align: 'center', before: 480 }),
  ].join('');
}

function tabelaEquipamentos(lista) {
  if (!lista.length) return p('Nenhum equipamento selecionado.', { run: { i: true } });
  return tabela([
    ['Equipamento', 'Fabricante / modelo', 'Nº de série', 'Certificado', 'Calibração'],
    ...lista.map((e) => [e.data.nome, `${e.data.fabricante || ''} ${e.data.modelo || ''}`.trim(), e.data.serie || '',
      [e.data.certificado, e.data.laboratorio].filter(Boolean).join(' – '), dataBR(e.data.dataCalibracao)]),
  ], { larguras: [0.2, 0.17, 0.2, 0.27, 0.16], alinhar: 'left', fonte: 9.5 });
}

// ---------------- PRÉ-RELATÓRIO ----------------
export async function gerarPreRelatorio(caseId) {
  const { c, quesitos, periodos, documentos, epis, equipamentos } = await carregar(caseId);
  const xml = [];
  xml.push(capa(c, 'PRÉ-RELATÓRIO DE ANÁLISE PROCESSUAL E PERICIAL'));
  xml.push(sumario());

  xml.push(titulo('1 Identificação do processo', 1, { novaPagina: true }));
  const linhas = [
    ['Processo', c.numero], ['Juízo', [c.juizo, c.comarca].filter(Boolean).join(' – ')],
    ['Justiça / matéria', [c.justica, c.materia].filter(Boolean).join(' – ')],
    ['Data de ajuizamento', dataBR(c.dataAjuizamento)],
  ];
  if (c.materia === 'Trabalhista' && c.dataAjuizamento) linhas.push(['Período imprescrito', `a partir de ${menosCincoAnos(c.dataAjuizamento)} (ajuizamento – 5 anos)`]);
  linhas.push(['Valor da causa', c.valorCausa], ['Rito', c.rito],
    ['Autor / reclamante / segurado', c.autorNome], ['CPF / NIT', c.autorCpf], ['Nascimento', dataBR(c.autorNascimento)],
    ['Réu / reclamada', c.reuNome], ['CNPJ', c.reuCnpj], ['Atuação', c.papel],
    ['Objeto', (c.objeto || []).join(', ')],
    ['Diligência', [dataBR(c.dataDiligencia), c.horaDiligencia].filter(Boolean).join(' às ')],
    ['Prazo do laudo / parecer', dataBR(c.prazoLaudo)]);
  xml.push(tabela(linhas.filter(([, v]) => v).map(([a, b]) => [a, b]), { header: false, larguras: [0.3, 0.7], alinhar: 'left', fonte: 10.5 }));

  xml.push(titulo('2 Contrato, funções e períodos', 1, { novaPagina: true }));
  xml.push(texto(c.funcoes));
  if (periodos.length) {
    xml.push(tabela([['Empresa', 'Período', 'Cargo / setor', 'Atividades e agentes'],
      ...periodos.map((r) => [
        [r.data.empresa, r.data.cnpj].filter(Boolean).join('\nCNPJ '),
        `${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`,
        [r.data.cargo, r.data.setor].filter(Boolean).join(' / '),
        [r.data.atividades, r.data.agentes, r.data.fonte && `Fonte: ${r.data.fonte}`].filter(Boolean).join('\n'),
      ])], { larguras: [0.24, 0.17, 0.2, 0.39] }));
  }

  xml.push(titulo('3 Síntese da petição inicial', 1, { novaPagina: true }));
  xml.push(titulo('3.1 Atividades descritas', 2), texto(c.atividadesAlegadas));
  xml.push(titulo('3.2 Agentes nocivos / riscos alegados', 2), texto(c.agentesAlegados));
  xml.push(titulo('3.3 Pedidos técnicos', 2), texto(c.pedidos));

  xml.push(titulo('4 Síntese da defesa', 1, { novaPagina: true }));
  xml.push(titulo('4.1 Tese técnica', 2), texto(c.defesa));
  xml.push(titulo('4.2 Pontos de atenção e preliminares periciais', 2), texto(c.preliminares));

  xml.push(titulo('5 Documentos técnicos analisados', 1, { novaPagina: true }));
  if (!documentos.length) xml.push(texto(''));
  documentos.forEach((d, i) => {
    xml.push(titulo(`5.${i + 1} ${d.data.tipo || 'Documento'}${d.data.identificacao ? ` (${d.data.identificacao})` : ''}`, 2));
    xml.push(texto(d.data.analise));
  });

  xml.push(titulo('6 Equipamentos de proteção individual', 1, { novaPagina: true }));
  if (epis.length) {
    xml.push(tabela([['EPI', 'CA', 'Entrega', 'Observações'], ...epis.map((e) => [e.data.descricao, e.data.ca, e.data.dataEntrega, e.data.obs])],
      { larguras: [0.34, 0.12, 0.16, 0.38] }));
  } else xml.push(p('Fichas de EPI não localizadas nos autos ou não cadastradas.', { run: { i: true } }));
  xml.push(titulo('6.1 Análise crítica', 2), texto(c.analiseEpi));

  xml.push(titulo('7 Quesitos', 1, { novaPagina: true }));
  let n = 0;
  for (const origem of ORIGEM_QUESITO) {
    const lista = quesitos.filter((q) => (q.data.origem || 'Outro') === origem);
    if (!lista.length) continue;
    n += 1;
    xml.push(titulo(`7.${n} Quesitos – ${origem}`, 2));
    for (const q of lista) xml.push(p([run(`${q.data.numero || '•'}) `, { b: true }), run(q.data.texto || '')]));
  }
  if (!n) xml.push(p('Quesitos não localizados nos autos ou não cadastrados.', { run: { i: true } }));

  xml.push(titulo('8 Planejamento da diligência', 1, { novaPagina: true }));
  xml.push(rotuloValor('Data e horário', [dataBR(c.dataDiligencia), c.horaDiligencia].filter(Boolean).join(' às ') || 'a definir'));
  xml.push(titulo('8.1 Roteiro e documentos a solicitar', 2), texto(c.roteiro));
  const levar = equipamentos.filter((e) => (c.equipamentos || []).includes(e.id));
  xml.push(titulo('8.2 Equipamentos', 2), tabelaEquipamentos(levar));
  if (c.observacoes) xml.push(titulo('8.3 Observações', 2), texto(c.observacoes));

  const nome = `Pre-relatorio_${(c.numero || c.autorNome || 'caso').replace(/[^\w.-]+/g, '_')}.docx`;
  const blob = await montarDocx(await modelo(), xml.join(''), { tituloDoc: 'Pré-relatório pericial', comSumario: true });
  return { blob, nome };
}

// ---------------- REGISTRO DA DILIGÊNCIA ----------------
export async function gerarRegistroDiligencia(caseId) {
  const { c, quesitos, postos, medicoes, fotos, equipamentos } = await carregar(caseId);
  const numFoto = new Map(fotos.map((f, i) => [f.id, i + 1]));
  const eq = new Map(equipamentos.map((e) => [e.id, e]));
  const xml = [];
  xml.push(p('REGISTRO DA DILIGÊNCIA', { align: 'center', after: 60, run: { b: true, size: 14, color: '1B365D' } }));
  if (c.numero) xml.push(p(`Processo nº ${c.numero}${c.juizo ? ` – ${c.juizo}` : ''}`, { align: 'center', after: 0 }));
  xml.push(p([c.autorNome, c.reuNome].filter(Boolean).join(' × '), { align: 'center', after: 240 }));

  xml.push(titulo('1 Dados da diligência', 1));
  xml.push(tabela([
    ['Data', dataBR(c.vistoriaData)], ['Horário', [c.vistoriaInicio, c.vistoriaFim].filter(Boolean).join(' às ')],
    ['Local', c.vistoriaLocal], ['Endereço', c.vistoriaEndereco], ['Coordenadas', c.vistoriaGps], ['Atuação', c.papel],
  ].filter(([, v]) => v), { header: false, larguras: [0.25, 0.75], alinhar: 'left' }));
  xml.push(titulo('1.1 Pessoas presentes', 2), texto(c.vistoriaPresentes));
  if (c.vistoriaCondicoes) xml.push(titulo('1.2 Condições observadas no dia', 2), texto(c.vistoriaCondicoes));

  xml.push(titulo('2 Equipamentos utilizados', 1));
  const usados = new Set([...(c.equipamentos || []), ...medicoes.map((m) => m.data.equipamentoId).filter(Boolean)]);
  xml.push(tabelaEquipamentos(equipamentos.filter((e) => usados.has(e.id))));

  xml.push(titulo('3 Postos e atividades avaliados', 1));
  const semPosto = medicoes.filter((m) => !postos.some((ps) => ps.id === m.data.postoId));
  postos.forEach((ps, i) => {
    const d = ps.data;
    xml.push(titulo(`3.${i + 1} ${d.nome || 'Posto sem nome'}`, 2));
    for (const [k, rot] of [['descricao', 'Atividade observada'], ['infoTrabalhador', 'Informações do trabalhador'],
      ['infoEmpresa', 'Informações da empresa'], ['agentes', 'Agentes identificados'], ['jornada', 'Jornada / exposição'],
      ['epc', 'EPC'], ['epi', 'EPI']]) {
      if (d[k]) xml.push(rotuloValor(rot, d[k]));
    }
    const ms = medicoes.filter((m) => m.data.postoId === ps.id);
    if (ms.length) xml.push(tabelaMedicoes(ms, eq));
    const fs = fotos.filter((f) => f.data.postoId === ps.id).map((f) => numFoto.get(f.id));
    if (fs.length) xml.push(rotuloValor('Registro fotográfico', `Fotos ${fs.join(', ')}`));
  });
  if (!postos.length) xml.push(texto(''));
  if (semPosto.length) {
    xml.push(titulo(`3.${postos.length + 1} Medições sem posto vinculado`, 2));
    xml.push(tabelaMedicoes(semPosto, eq));
  }

  const respondidos = quesitos.filter((q) => (q.data.resposta || '').trim());
  if (respondidos.length) {
    xml.push(titulo('4 Anotações de campo sobre os quesitos', 1));
    for (const q of respondidos) {
      xml.push(p([run(`${q.data.origem || ''} – ${q.data.numero || ''}) `, { b: true }), run(q.data.texto || '', { i: true })], { after: 40 }));
      xml.push(p(q.data.resposta, { indent: 360 }));
    }
  }
  if (c.vistoriaNotas) xml.push(titulo(`${respondidos.length ? 5 : 4} Anotações gerais`, 1), texto(c.vistoriaNotas));

  const nome = `Registro_diligencia_${(c.numero || c.autorNome || 'caso').replace(/[^\w.-]+/g, '_')}.docx`;
  const blob = await montarDocx(await modelo(), xml.join(''), { tituloDoc: 'Registro da diligência' });
  return { blob, nome };
}

function tabelaMedicoes(ms, eq) {
  return tabela([['Agente', 'Resultados', 'Equipamento'], ...ms.map((m) => {
    const e = eq.get(m.data.equipamentoId);
    return [m.data.agente, [resumoMedicao(m), m.data.obs].filter(Boolean).join('\n'),
      e ? `${e.data.modelo || e.data.nome} – série ${e.data.serie || '?'}` : ''];
  })], { larguras: [0.18, 0.6, 0.22], fonte: 9.5 });
}

// ---------------- RELATÓRIO FOTOGRÁFICO ----------------
export async function gerarRelatorioFotografico(caseId) {
  const { c, fotos, postos } = await carregar(caseId);
  const nomePosto = new Map(postos.map((ps) => [ps.id, ps.data.nome]));
  const xml = [];
  const imagens = [];
  xml.push(p('RELATÓRIO FOTOGRÁFICO', { align: 'center', after: 60, run: { b: true, size: 14, color: '1B365D' } }));
  if (c.numero) xml.push(p(`Processo nº ${c.numero}`, { align: 'center', after: 0 }));
  xml.push(p([c.autorNome, c.reuNome].filter(Boolean).join(' × '), { align: 'center', after: 120 }));
  xml.push(p(`Diligência: ${dataBR(c.vistoriaData) || '—'}${c.vistoriaLocal ? ` – ${c.vistoriaLocal}` : ''}`, { align: 'center', after: 240 }));
  let faltando = 0;
  const UTIL_CM = 23.5;
  let usado = 4.5; // cabeçalho do relatório na primeira página
  for (let i = 0; i < fotos.length; i++) {
    const f = fotos[i];
    const b = await db.blobs.get(f.id);
    if (!b) { faltando++; continue; }
    const bytes = new Uint8Array(await b.blob.arrayBuffer());
    const w = f.data.largura || 4, h = f.data.altura || 3;
    let larg = 15, alt = (15 * h) / w;
    if (alt > 10) { alt = 10; larg = (10 * w) / h; }
    const rId = `rIdFoto${i + 1}`;
    imagens.push({ rId, nome: `foto${i + 1}.jpg`, bytes });
    if (usado + alt + 1.8 > UTIL_CM) { xml.push(quebraPagina()); usado = 0; }
    xml.push(imagem(rId, 1000 + i, larg, alt));
    const det = [nomePosto.get(f.data.postoId) && `Posto: ${nomePosto.get(f.data.postoId)}`,
      f.data.tiradaEm && dataHoraBR(f.data.tiradaEm), f.data.gps && `GPS ${f.data.gps}`].filter(Boolean).join(' | ');
    xml.push(p([run(`Foto ${i + 1} – `, { b: true, size: 10 }), run(f.data.legenda || 'Registro fotográfico.', { size: 10 })], { align: 'center', after: 0, line: 276 }));
    if (det) xml.push(p(det, { align: 'center', after: 240, line: 276, run: { size: 8.5, color: '64748B' } }));
    usado += alt + 1.8;
  }
  if (!fotos.length) xml.push(p('Nenhuma foto registrada.', { run: { i: true } }));
  const nome = `Relatorio_fotografico_${(c.numero || c.autorNome || 'caso').replace(/[^\w.-]+/g, '_')}.docx`;
  const blob = await montarDocx(await modelo(), xml.join(''), { imagens, tituloDoc: 'Relatório fotográfico' });
  return { blob, nome, faltando };
}

export { calculados };
