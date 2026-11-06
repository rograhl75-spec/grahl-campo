import { db, caseChildren } from '../db.js';
import { resumoMedicao, calculados } from '../medicoes.js';
import { nenQ5, num, fmt } from '../calc.js';
import { ORIGEM_QUESITO } from '../schema.js';
import { Doc, p, run, montarDocx } from './ooxml.js';

export const PERFIL_ID = 'perfil';

export function dataBR(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}
export function dataHoraBR(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function menosCincoAnos(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${Number(m[1]) - 5}` : '';
}
const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
export const ou = (x, pend) => (v(x) ? v(x) : `[[${pend}]]`);

export async function carregar(caseId) {
  const caso = await db.records.get(caseId);
  if (!caso) throw new Error('Caso não encontrado.');
  const kinds = ['quesito', 'periodo', 'documento', 'epi', 'posto', 'medicao', 'foto'];
  const [quesitos, periodos, documentos, epis, postos, medicoes, fotos] = await Promise.all(kinds.map((k) => caseChildren(caseId, k)));
  const equipamentos = (await db.records.where('kind').equals('equip').toArray()).filter((e) => !e.deleted)
    .sort((a, b) => (a.data.ordem || 0) - (b.data.ordem || 0));
  const perfilRec = await db.records.get(PERFIL_ID);
  const perfil = { ...PERFIL_PADRAO, ...(perfilRec ? perfilRec.data : {}) };
  periodos.sort((a, b) => String(a.data.inicio || '').localeCompare(String(b.data.inicio || '')));
  return { id: caseId, c: caso.data, quesitos, periodos, documentos, epis, postos, medicoes, fotos, equipamentos, perfil };
}

export const PERFIL_PADRAO = {
  nome: 'ROGÉRIO GRAHL',
  titulos: 'Engenheiro Químico e Engenheiro de Segurança do Trabalho',
  crea: 'CREA-SC nº 10392239/D',
  vistoCrea: 'visto CREA-PR nº 081075',
  cidade: 'Londrina – PR',
};

export function credencial(perfil) {
  return [perfil.crea, perfil.vistoCrea].filter(Boolean).join(' – ');
}

// Rótulos das partes conforme a matéria
export function partes(c) {
  const trab = c.materia === 'Trabalhista' || c.justica === 'Justiça do Trabalho';
  const prev = c.materia === 'Previdenciária' || c.materia === 'Acidentária';
  return {
    autor: trab ? 'Reclamante' : prev ? 'Autor(a) / Segurado(a)' : 'Requerente',
    reu: trab ? 'Reclamada' : prev ? 'Réu' : 'Requerido(a)',
    autorCurto: trab ? 'Reclamante' : 'Autor(a)',
    reuCurto: trab ? 'Reclamada' : prev ? 'INSS' : 'Requerido(a)',
    trab, prev,
  };
}

export function papelAssinatura(c) {
  const pt = partes(c);
  if (c.papel === 'Perito do Juízo') return 'Perito do Juízo';
  if (/autor/i.test(c.papel || '')) return `Assistente Técnico do(a) ${pt.autorCurto}`;
  if (/réu/i.test(c.papel || '')) return `Assistente Técnico da ${pt.reuCurto}`;
  return 'Responsável Técnico';
}

export function enderecamentoTexto(c) {
  const j = v(c.juizo);
  const cidade = v(c.comarca).split(/[\/–-]/)[0].trim().toLowerCase();
  const comarca = v(c.comarca) && !(cidade && j.toLowerCase().includes(cidade)) ? ` – ${c.comarca}` : '';
  return `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ ${j ? 'DA ' + j : '[[VARA / JUÍZO]]'}${comarca}`;
}

export function linhasProcesso(c, extra = []) {
  const pt = partes(c);
  return [['Processo nº', ou(c.numero, 'número do processo')], [pt.autor, c.autorNome], [pt.reu, c.reuNome], ...extra];
}

export function qualificacaoCurta(perfil) {
  return `**${perfil.nome}**, ${perfil.titulos}, ${credencial(perfil)}`;
}

export function qualificacaoCompleta(perfil) {
  const partesQ = [`**${perfil.nome}**, ${perfil.titulos}`];
  if (perfil.cpf) partesQ.push(`portador do CPF nº ${perfil.cpf}${perfil.rg ? ` e do RG nº ${perfil.rg}` : ''}`);
  partesQ.push(`inscrito no ${credencial(perfil).replace(/^CREA-SC nº/, 'CREA/SC sob o nº')}`);
  if (perfil.endereco) partesQ.push(`com endereço profissional na ${perfil.endereco}`);
  const contatos = [perfil.telefone && `telefone ${perfil.telefone}`, perfil.email && `e-mail ${perfil.email}`].filter(Boolean).join(' e ');
  if (contatos) partesQ.push(`com contatos pelo ${contatos}`);
  return partesQ.join(', ');
}

export function blocoAssinatura(d, { c, perfil }, papel) {
  return d.assinatura({
    local: perfil.cidade || 'Londrina – PR',
    nome: perfil.nome,
    linhas: [perfil.titulos, credencial(perfil), papel || papelAssinatura(c)],
  });
}

// ---------- quadros reutilizáveis ----------
export function equipamentosUsados(dados) {
  const { c, medicoes, equipamentos } = dados;
  const ids = new Set([...(c.equipamentos || []), ...medicoes.map((m) => m.data.equipamentoId).filter(Boolean)]);
  return equipamentos.filter((e) => ids.has(e.id));
}

export function quadroEquipamentos(d, lista, titulo = 'Instrumentos utilizados') {
  if (!lista.length) return d.texto('[[Selecionar os equipamentos utilizados na aba Campo do caso.]]');
  return d.quadro(titulo, [['Equipamento', 'Marca / modelo', 'Nº de série', 'Certificado / laboratório', 'Calibração'],
    ...lista.map((e) => [e.data.nome, `${e.data.fabricante || ''} ${e.data.modelo || ''}`.trim(), ou(e.data.serie, 'série'),
      [e.data.certificado, e.data.laboratorio].filter(Boolean).join(' – ') || '[[certificado]]', dataBR(e.data.dataCalibracao) || '[[data]]'])],
  { larguras: [0.21, 0.17, 0.17, 0.29, 0.16], alinhar: 'left', tam: 9 });
}

export function quadroDiligencia(d, c, titulo = 'Registro da diligência') {
  return d.quadro(titulo, [['Campo', 'Informação'],
    ['Data e horário', [dataBR(c.vistoriaData) || dataBR(c.dataDiligencia), [c.vistoriaInicio || c.horaDiligencia, c.vistoriaFim].filter(Boolean).join(' às ')].filter(Boolean).join(', ') || '[[data e horário]]'],
    ['Local', [c.vistoriaLocal, c.vistoriaEndereco].filter(Boolean).join(' – ') || '[[local]]'],
    ...(c.vistoriaGps ? [['Coordenadas', c.vistoriaGps]] : []),
    ['Presentes', c.vistoriaPresentes || '[[pessoas presentes]]'],
    ...(c.vistoriaCondicoes ? [['Condições operacionais no dia', c.vistoriaCondicoes]] : []),
  ], { larguras: [0.3, 0.7], alinhar: 'left' });
}

export function quadroPeriodos(d, periodos, titulo = 'Períodos avaliados') {
  if (!periodos.length) return d.texto('[[Cadastrar os vínculos/períodos na aba Preparação.]]');
  return d.quadro(titulo, [['Empresa', 'Período', 'Cargo / setor', 'Fonte'],
    ...periodos.map((r) => [[r.data.empresa, r.data.cnpj && `CNPJ ${r.data.cnpj}`].filter(Boolean).join('\n'),
      `${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`, [r.data.cargo, r.data.setor].filter(Boolean).join(' / '), r.data.fonte || ''])],
  { larguras: [0.32, 0.22, 0.26, 0.2], alinhar: 'left' });
}

export function quadroEpis(d, epis) {
  if (!epis.length) return d.texto('Não foram apresentados registros de entrega de EPI. [[Confirmar.]]');
  return d.quadro('Equipamentos de proteção individual registrados', [['EPI', 'CA', 'Entrega', 'Observações'],
    ...epis.map((e) => [e.data.descricao, e.data.ca, e.data.dataEntrega, e.data.obs])], { larguras: [0.34, 0.12, 0.16, 0.38] });
}

export function quadroDocumentos(d, documentos) {
  if (!documentos.length) return d;
  return d.quadro('Documentos analisados', [['Documento', 'Identificação', 'O que consta'],
    ...documentos.map((x) => [x.data.tipo || 'Documento', x.data.identificacao || '', x.data.analise || ''])], { larguras: [0.2, 0.2, 0.6] });
}

// ---------- ruído: critério legal por período (padrão do signatário) ----------
const JANELAS_RUIDO = [
  { ini: '0000-01-01', fim: '1997-03-05', crit: 'Lavg', lim: 80, fund: 'Lavg > 80 dB(A) – cód. 1.1.6 do Decreto 53.831/1964 (STJ, Tema 694)' },
  { ini: '1997-03-06', fim: '2003-11-18', crit: 'Lavg', lim: 90, fund: 'Lavg > 90 dB(A) – cód. 2.0.1 dos Decretos 2.172/1997 e 3.048/1999. A legislação remetia ao Anexo 1 da NR-15 na íntegra; compara-se o Lavg com q = 5' },
  { ini: '2003-11-19', fim: '9999-12-31', crit: 'NEN', lim: 85, fund: 'NEN > 85 dB(A) – cód. 2.0.1 com a redação do Decreto 4.882/2003; NEN calculado para a jornada com q = 5 (Anexo 1 da NR-15), com os procedimentos de medição da NHO-01' },
];
const fimJanela = (j) => (j.fim === '9999-12-31' ? 'em diante' : dataBR(j.fim));

export function quadroCriteriosRuido(d) {
  return d.quadro('Critérios – Ruído', [['Período', 'Critério e fundamento'],
    ['Até 05/03/1997', JANELAS_RUIDO[0].fund], ['06/03/1997 a 18/11/2003', JANELAS_RUIDO[1].fund], ['A partir de 19/11/2003', JANELAS_RUIDO[2].fund]],
  { larguras: [0.27, 0.73], fonte: 'Elaborado pelo autor com base em Brasil (2022, art. 292).' });
}

// divide cada período cadastrado pelas janelas legais do ruído
export function subperiodosRuido(periodos) {
  const out = [];
  for (const r of periodos) {
    const ini = r.data.inicio, fim = r.data.fim || new Date().toISOString().slice(0, 10);
    if (!ini) continue;
    for (const j of JANELAS_RUIDO) {
      const a = ini > j.ini ? ini : j.ini;
      const b = fim < j.fim ? fim : j.fim;
      if (a <= b) out.push({ periodo: r, ini: a, fim: b, janela: j });
    }
  }
  return out;
}

export function quadroConfrontoRuido(d, dados) {
  const ruido = dados.medicoes.filter((m) => m.data.agente === 'Ruído');
  const subs = subperiodosRuido(dados.periodos);
  if (!subs.length) return d;
  const ref = ruido[0];
  const lavg = ref ? num(ref.data.lavg) : NaN;
  const nen = ref ? nenQ5(ref.data.lavg, ref.data.jornada) : NaN;
  return d.quadro('Confronto do ruído com o limite de cada período', [['Vínculo / subperíodo', 'Critério', 'Valor', 'Limite', 'Resultado'],
    ...subs.map((s) => {
      const val = s.janela.crit === 'Lavg' ? lavg : nen;
      const res = isFinite(val) ? (Math.round(val * 10) / 10 > s.janela.lim ? 'Supera' : 'Não supera') : '[[medir]]';
      return [`${s.periodo.data.empresa || ''}\n${dataBR(s.ini)} a ${dataBR(s.fim)}`, s.janela.crit,
        isFinite(val) ? `${fmt(val)} dB(A)` : '[[valor]]', `${s.janela.lim} dB(A)`, res];
    })], { larguras: [0.38, 0.12, 0.17, 0.15, 0.18], alinhar: 'left',
    fonte: ref ? 'Elaborado pelo autor (valor da medição de referência; conferir se representa cada período).' : 'Elaborado pelo autor.' });
}

// ---------- medições por agente ----------
export function quadroMedicoesRuido(d, ms, eq, nomePosto) {
  if (!ms.length) return d;
  return d.quadro('Resultados – Ruído', [['Posto / trabalhador', 'Amostragem', 'Dose', 'Lavg (q = 5)', 'Jornada', 'NEN (q = 5)'],
    ...ms.map((m) => {
      const x = m.data;
      const n = nenQ5(x.lavg, x.jornada);
      return [[nomePosto(x.postoId), x.posicao].filter(Boolean).join(' – '), [x.tempoAmostragem, x.horaInicio && x.horaFim && `${x.horaInicio}–${x.horaFim}`].filter(Boolean).join(', '),
        x.dose ? `${x.dose}%` : '', x.lavg ? `${x.lavg} dB(A)` : '', x.jornada || '', isFinite(n) ? `${fmt(n)} dB(A)` : ''];
    })], { larguras: [0.28, 0.18, 0.1, 0.15, 0.12, 0.17], alinhar: 'left', tam: 9,
    fonte: `Elaborado pelo autor. ${ms[0] && eq.get(ms[0].data.equipamentoId) ? `Dosímetro ${eq.get(ms[0].data.equipamentoId).data.modelo}, série ${eq.get(ms[0].data.equipamentoId).data.serie}; ` : ''}critério 85 dB(A), limiar 80 dB(A), q = 5, circuito A, resposta lenta.` });
}

export function quadroMedicoesGenerico(d, titulo, ms, nomePosto) {
  if (!ms.length) return d;
  return d.quadro(titulo, [['Posto / atividade', 'Resultados'],
    ...ms.map((m) => [nomePosto(m.data.postoId), [resumoMedicao(m), m.data.obs].filter(Boolean).join('\n')])],
  { larguras: [0.3, 0.7], alinhar: 'left', tam: 9.5 });
}

export function medicoesPorAgente(dados) {
  const g = {};
  for (const m of dados.medicoes) (g[m.data.agente || 'Outro'] = g[m.data.agente || 'Outro'] || []).push(m);
  return g;
}

export function nomePostoFn(postos) {
  const mp = new Map(postos.map((p) => [p.id, p.data.nome]));
  return (id) => mp.get(id) || 'Geral';
}

export function profissiografia(d, postos) {
  if (!postos.length) return d.redigir('descrição do ambiente e das atividades observadas (cadastrar os postos na aba Campo).');
  postos.forEach((ps) => {
    const x = ps.data;
    d.h3(x.nome || 'Posto / atividade');
    if (x.descricao) d.texto(x.descricao);
    const linhas = [['Informações do trabalhador', x.infoTrabalhador], ['Informações da empresa / acompanhante', x.infoEmpresa],
      ['Agentes identificados', x.agentes], ['Jornada / exposição', x.jornada], ['EPC', x.epc], ['EPI observado', x.epi]].filter(([, t]) => v(t));
    if (linhas.length) d.quadro(`Registro do posto – ${x.nome || 'posto'}`, [['Item', 'Registro'], ...linhas], { larguras: [0.3, 0.7], alinhar: 'left', fonte: 'Vistoria e informações colhidas na diligência.' });
  });
  return d;
}

export async function figurasDoCaso(dados, filtro = () => true) {
  const nome = nomePostoFn(dados.postos);
  const lista = [];
  let faltando = 0;
  for (const f of dados.fotos.filter(filtro)) {
    const b = await db.blobs.get(f.id);
    if (!b) { faltando++; continue; }
    lista.push({
      bytes: new Uint8Array(await b.blob.arrayBuffer()), w: f.data.largura || 4, h: f.data.altura || 3,
      legenda: f.data.legenda || (f.data.postoId ? nome(f.data.postoId) : 'Registro fotográfico'),
      detalhe: [dataHoraBR(f.data.tiradaEm), f.data.gps && `GPS ${f.data.gps}`].filter(Boolean).join(' · '),
    });
  }
  return { lista, faltando };
}

export function respostasQuesitos(d, quesitos, numBase, c) {
  const pt = partes(c);
  const nomeOrigem = (o) => (o === 'Autor / Reclamante' ? `da parte ${pt.autorCurto.toLowerCase()}` : o === 'Réu / Reclamada' ? `da parte ${pt.reuCurto === 'INSS' ? 'ré (INSS)' : pt.reuCurto.toLowerCase()}` : o === 'Juízo' ? 'do Juízo' : o === 'INSS' ? 'do INSS' : (o || '').toLowerCase());
  let n = 0;
  for (const origem of ORIGEM_QUESITO) {
    const lista = quesitos.filter((q) => (q.data.origem || 'Outro') === origem);
    if (!lista.length) continue;
    n += 1;
    d.h2(`${numBase}.${n}`, `Quesitos ${nomeOrigem(origem)}`);
    for (const q of lista) {
      d.add(p([run(`${q.data.numero || '•'} – `, { b: true }), run(q.data.texto || '', { i: true })], { after: 60 }));
      d.add(p([run('Resposta: ', { b: true })].concat(q.data.resposta ? [run(q.data.resposta)] : [run('[[Responder]]', { b: true, hl: true })]), { first: 709, after: 200 }));
    }
  }
  if (!n) d.texto('[[Não há quesitos cadastrados. Transcreva-os na aba Quesitos.]]');
  return d;
}

export function rodapeTecnico(d, c, dados) {
  void c; void dados;
  return d;
}

// Carrega o modelo timbrado (vertical ou paisagem)
export async function modelo(nome = 'timbrado-vertical.docx') {
  const r = await fetch(`${import.meta.env.BASE_URL}modelos/${nome}`);
  if (!r.ok) throw new Error('Não foi possível carregar o modelo timbrado.');
  return r.arrayBuffer();
}

export async function finalizar(d, { titulo, arquivo, c }) {
  const nomeArq = `${arquivo}_${(c.numero || c.autorNome || 'caso').replace(/[^\w.-]+/g, '_').slice(0, 60)}.docx`;
  const blob = await montarDocx(await modelo(), d.xml(), { imagens: d.imagens, tituloDoc: titulo, comCampos: true });
  return { blob, nome: nomeArq };
}

export function capaTecnica(d, { titulo, subtitulo, linha2, pares, perfil, data = new Date() }) {
  d.add(p([run(perfil.nome, { b: true, color: '1B365D', size: 13 })], { align: 'center', after: 0 }));
  d.add(p([run(perfil.titulos, { size: 10, color: '475569' })], { align: 'center', after: 0 }));
  d.add(p([run(credencial(perfil), { size: 10, color: '475569' })], { align: 'center', after: 1400 }));
  d.add(p([run(titulo, { b: true, size: 22, color: '1B365D' })], { align: 'center', after: 120, line: 276 }));
  if (subtitulo) d.add(p([run(subtitulo, { size: 12, color: '475569' })], { align: 'center', after: 60, line: 276 }));
  if (linha2) d.add(p([run(linha2, { b: true, size: 12, color: '1B365D' })], { align: 'center', after: 480, line: 276 }));
  d.add(p('', { after: 240 }));
  d.identificacao(pares);
  d.add(p('', { after: 1600 }));
  d.add(p([run(`${perfil.cidade || 'Londrina – PR'}`, { b: true, color: '1B365D' })], { align: 'center', after: 0 }));
  d.add(p([run(String(data.getFullYear()), { b: true, color: '1B365D' })], { align: 'center', after: 0 }));
  return d;
}

export { Doc, calculados };
