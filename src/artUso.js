// ======================================================================
// Controle de uso das ARTs: cada CASO que escolhe a ART conta um trabalho (não cada Word gerado – o documento
// pode ser gerado muitas vezes). A soma vai até o número de trabalhos previsto na ART; no último, o app avisa
// para solicitar nova ART, e o relatório lista os processos em que a ART foi usada.
// ======================================================================
import { db } from './db.js';
import { dataBR, hojeLocal } from './docx/base.js';

// tipo do trabalho, como nos grupos da tela inicial
export function tipoDoCaso(d = {}) {
  if (d.tipoAtuacao === 'Extrajudicial') return 'Extrajudicial';
  if (/Fazenda/i.test(d.justica || '') || d.materia === 'Administrativa (servidor)') return 'Judicial – Fazenda Pública';
  if (d.materia === 'Previdenciária' || d.materia === 'Acidentária' || (/\bINSS\b|Instituto Nacional do Seguro Social/i.test(d.reuNome || '') && d.justica !== 'Justiça do Trabalho')) return 'Judicial – previdenciário';
  return 'Judicial – trabalhista';
}

// trabalhos previstos: o campo próprio ou, em ARTs cadastradas antes dele, o número escrito na descrição
// ("30 trabalhos", "quantidade: 30")
export function trabalhosPrevistos(art) {
  const x = (art && art.data) || {};
  const n = parseInt(String(x.trabalhos ?? '').replace(/\D/g, ''), 10);
  if (n > 0) return n;
  const m = String(x.descricao || '').match(/(\d{1,4})\s*(?:trabalhos?|laudos?|servi[çc]os?)\b/i) || String(x.descricao || '').match(/quantidade\D{0,5}(\d{1,4})/i);
  return m ? parseInt(m[1], 10) : 0;
}

// data do uso: a gravada quando a ART foi escolhida no caso; casos antigos usam a data de criação do caso
export const dataDoUso = (c) => c.data.artUsoEm || (c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : '');

export async function usosDaArt(artId, casos = null) {
  const lista = casos || (await db.records.where('kind').equals('caso').toArray());
  return lista.filter((c) => !c.deleted && c.data.artId === artId)
    .sort((a, b) => String(dataDoUso(a)).localeCompare(String(dataDoUso(b))) || (a.createdAt || 0) - (b.createdAt || 0));
}

export function situacaoArt(art, nUsos) {
  const previstos = trabalhosPrevistos(art);
  const vencida = !!(art.data.fim && art.data.fim < hojeLocal());
  if (!previstos) return { previstos: 0, usados: nUsos, restantes: null, nivel: vencida ? 'esgotada' : 'sem-limite', vencida, texto: `${nUsos} uso(s) – informe o nº de trabalhos previstos na ART` };
  const restantes = previstos - nUsos;
  const nivel = vencida || restantes <= 0 ? 'esgotada' : restantes <= Math.max(2, Math.ceil(previstos * 0.1)) ? 'acabando' : 'ok';
  const texto = restantes < 0 ? `${nUsos} de ${previstos} trabalhos – ${-restantes} acima do previsto: solicite nova ART`
    : restantes === 0 ? `${nUsos} de ${previstos} trabalhos – ART esgotada: solicite nova ART`
      : `${nUsos} de ${previstos} trabalhos – restam ${restantes}`;
  return { previstos, usados: nUsos, restantes, nivel, vencida, texto: vencida ? `${texto} · vigência encerrada em ${dataBR(art.data.fim)}` : texto };
}

// linha do relatório: dados básicos do processo / trabalho em que a ART foi usada
export function linhaDoUso(c, i) {
  const d = c.data;
  const tipo = tipoDoCaso(d);
  const quem = d.autorNome || d.contratante || 'Caso sem nome';
  const contra = d.reuNome || (tipo === 'Extrajudicial' ? (d.pppEmitenteNome || d.vistoriaLocal || '') : '');
  const proc = d.numero || (tipo === 'Extrajudicial' ? 'extrajudicial' : 'sem número');
  const juizo = [d.juizo, d.comarca].filter(Boolean).join(' – ');
  return {
    n: i + 1, data: dataBR(dataDoUso(c)), tipo, papel: d.papel || '', quem, contra, processo: proc, juizo,
    objeto: [].concat(d.objeto || []).join(', ') || d.tipoTrabalho || '', fase: d.fase || 'A preparar', id: c.id,
  };
}

// relatório em Word (no timbrado): ART, situação e a lista dos trabalhos
export async function relatorioUsoArt(art) {
  const { Doc, finalizar } = await import('./docx/base.js');
  const { p, run } = await import('./docx/ooxml.js');
  const { rotuloArt } = await import('./schema.js');
  const usos = await usosDaArt(art.id);
  const s = situacaoArt(art, usos.length);
  const d = new Doc();
  d.h1NovaPagina = false;
  d.add(p([run('RELATÓRIO DE USO DA ART', { b: true, size: 14, color: '1B365D', tit: true })], { align: 'center', after: 60 }));
  d.add(p([run(rotuloArt(art), { size: 11, color: '475569' })], { align: 'center', after: 240 }));
  d.identificacao([
    ['ART', `${art.data.numero || '—'}${art.data.conselho ? ` (${art.data.conselho})` : ''}`],
    ['Finalidade', art.data.finalidade || '—'],
    ['Atividades cobertas', art.data.descricao || '—'],
    ['Vigência', `${art.data.inicio ? dataBR(art.data.inicio) : '—'} a ${art.data.fim ? dataBR(art.data.fim) : 'sem prazo'}`],
    ['Trabalhos previstos', s.previstos ? String(s.previstos) : 'não informado'],
    ['Trabalhos registrados', String(s.usados)],
    ['Situação', s.texto],
  ]);
  const linhas = usos.map(linhaDoUso);
  d.quadro('Trabalhos em que a ART foi usada', [['Nº', 'Data do uso', 'Tipo', 'Segurado / autor / contratante', 'Réu / empresa', 'Processo', 'Juízo / comarca', 'Fase'],
    ...linhas.map((x) => [String(x.n), x.data, x.tipo, x.quem, x.contra || '—', x.processo, x.juizo || '—', x.fase])],
  { fonte: `Casos do app com esta ART escolhida; relatório de ${dataBR(hojeLocal())}.`, tam: 8, semNumero: true });
  const r = await finalizar(d, { titulo: 'Relatório de uso da ART', arquivo: 'Relatorio_uso_ART', c: {} });
  return { ...r, nome: `Relatorio_uso_ART_${String(art.data.numero || 'sem_numero').replace(/\W+/g, '')}_${hojeLocal()}.docx` };
}
