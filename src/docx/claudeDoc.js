// ======================================================================
// Documento redigido pelo Claude → Word no padrão GRAHL (timbrado, fontes embutidas, capa, sumário,
// quadros e figuras numerados, assinatura). O Claude devolve o texto em Markdown com as convenções de
// CONVENCOES_CLAUDE; o app monta o documento, sem o perito ter de formatar no Word.
// ======================================================================
import { Doc, carregar, finalizar, capaTecnica, blocoAssinatura, partes } from './base.js';
import { datasDasVistorias } from '../schema.js';

export const CONVENCOES_CLAUDE = `FORMATO DA RESPOSTA (o app monta o Word no meu papel timbrado, com capa, sumário, numeração de quadros e figuras e assinatura; não faça capa, sumário nem assinatura):
- Comece com as linhas "Título: ..." e "Subtítulo: ..." (o subtítulo é opcional).
- Títulos: "# 1 Título da seção" (primário, abre página nova), "## 1.1 Subtítulo", "### 1.1.1 Item".
- Parágrafos separados por linha em branco. Negrito com **texto**, itálico com *texto*. O que eu precisar completar ou conferir: [[pendência]].
- Listas: uma linha por item começando com "- ".
- Quadros: uma linha "Quadro: título do quadro", a tabela em Markdown (primeira linha = cabeçalho) e, logo abaixo, "Fonte: ...". Não numere: o app numera.
- Fluxos (etapas, metodologia, dinâmica de um acidente): uma linha "Fluxo: título" seguida das etapas numeradas "1. Etapa – descrição curta" (até 8).
- Prefira quadros a parágrafos longos sempre que houver comparação, datas, valores, períodos ou critérios.
- Não use emojis, HTML nem blocos de código.`;

const limpa = (t) => String(t ?? '').trim();
const celulas = (linha) => linha.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
const separador = (linha) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(linha);

// Converte o Markdown do Claude e devolve { titulo, subtitulo }; o corpo vai para d
export function markdownParaDoc(md, d) {
  const L = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  let titulo = '', subtitulo = '';
  let par = [];
  const soltaPar = () => { if (par.length) { d.texto(par.join(' ')); par = []; } };
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    const t = l.trim();
    if (!t) { soltaPar(); continue; }
    let m;
    if ((m = t.match(/^t[íi]tulo:\s*(.+)$/i)) && !titulo) { titulo = m[1].replace(/\*\*/g, ''); continue; }
    if ((m = t.match(/^subt[íi]tulo:\s*(.+)$/i)) && !subtitulo) { subtitulo = m[1].replace(/\*\*/g, ''); continue; }
    if ((m = t.match(/^(#{1,3})\s+(.+)$/))) {
      soltaPar();
      const nivel = m[1].length;
      const txt = m[2].replace(/\*\*/g, '').trim();
      const nm = txt.match(/^((?:\d+\.)*\d+)\.?\s+(.+)$/);
      const [num, tit] = nm ? [nm[1], nm[2]] : ['', txt];
      if (nivel === 1) d.h1(num, tit); else if (nivel === 2) d.h2(num, tit); else d.h3(num, tit);
      continue;
    }
    if ((m = t.match(/^quadro\s*(?:\d+)?\s*[:–-]\s*(.+)$/i))) {
      soltaPar();
      const tituloQ = m[1].trim();
      const linhas = [];
      let j = i + 1;
      while (j < L.length && !L[j].trim()) j++;
      for (; j < L.length && L[j].trim().startsWith('|'); j++) if (!separador(L[j])) linhas.push(celulas(L[j]));
      let fonte = 'Elaborado pelo signatário.';
      let k = j;
      while (k < L.length && !L[k].trim()) k++;
      if (k < L.length && /^fonte:/i.test(L[k].trim())) { fonte = L[k].trim().replace(/^fonte:\s*/i, ''); j = k + 1; }
      if (linhas.length >= 2) {
        const n = Math.max(...linhas.map((x) => x.length));
        d.quadro(tituloQ, linhas.map((x) => [...x, ...Array(n - x.length).fill('')]), { fonte, tam: n > 5 ? 8.5 : 9.5 });
      } else d.texto(`[[quadro "${tituloQ}" sem tabela – conferir]]`);
      i = j - 1;
      continue;
    }
    if ((m = t.match(/^fluxo\s*[:–-]\s*(.+)$/i))) {
      soltaPar();
      const etapas = [];
      let j = i + 1;
      while (j < L.length && !L[j].trim()) j++;
      for (; j < L.length && /^\s*\d+[.)]\s+/.test(L[j]); j++) {
        const [tt, ...resto] = L[j].replace(/^\s*\d+[.)]\s+/, '').split(/\s+[–—-]\s+/);
        etapas.push({ t: tt.replace(/\*\*/g, '').trim(), d: resto.join(' – ').trim() });
      }
      if (etapas.length) d.fluxo(m[1].trim(), etapas.slice(0, 8));
      i = j - 1;
      continue;
    }
    // tabela solta (sem a linha "Quadro:"): vira quadro sem título próprio
    if (t.startsWith('|') && i + 1 < L.length && separador(L[i + 1])) {
      soltaPar();
      const linhas = [];
      let j = i;
      for (; j < L.length && L[j].trim().startsWith('|'); j++) if (!separador(L[j])) linhas.push(celulas(L[j]));
      d.quadro('[[título do quadro]]', linhas);
      i = j - 1;
      continue;
    }
    if (/^[-•*]\s+/.test(t) || /^[a-z]\)\s+/i.test(t)) { soltaPar(); d.texto(t.replace(/^\*\s+/, '- ')); continue; }
    if (/^(---|\*\*\*)$/.test(t)) { soltaPar(); continue; }
    par.push(t);
  }
  soltaPar();
  return { titulo, subtitulo };
}

// Word completo: capa no padrão (com os dados do caso), sumário, listas, corpo do Claude e assinatura
export async function documentoDoClaude(caseId, md) {
  const dados = await carregar(caseId);
  const { c, perfil } = dados;
  const pt = partes(c);
  const corpo = new Doc();
  const { titulo, subtitulo } = markdownParaDoc(md, corpo);
  const d = new Doc();
  const extra = c.tipoAtuacao === 'Extrajudicial';
  capaTecnica(d, {
    titulo: (titulo || 'DOCUMENTO TÉCNICO').toUpperCase(), subtitulo, perfil,
    orgao: !extra && c.justica ? `Poder Judiciário – ${c.justica}` : '',
    pares: [['Processo', extra ? '' : c.numero], ['Juízo', extra ? '' : c.juizo], [pt.autor, c.autorNome], [pt.reu, c.reuNome],
      ['Vistoria', datasDasVistorias(c)], ['Responsável técnico', perfil.nome]].filter(([, x]) => String(x || '').trim()),
  });
  // corpo: o sumário e as listas usam as entradas do corpo (numeração e marcadores contínuos)
  d.entradas = corpo.entradas; d.nQuad = corpo.nQuad; d.nFig = corpo.nFig; d.imagens = corpo.imagens; d.nMarca = corpo.nMarca;
  if (corpo.entradas.Quadro.length) d.listaQuadros();
  if (corpo.entradas.Figura.length) d.listaFiguras({ novaPagina: !corpo.entradas.Quadro.length });
  d.sumario();
  d.add(...corpo.x);
  blocoAssinatura(d, dados);
  return finalizar(d, { titulo: titulo || 'Documento técnico', arquivo: (titulo || 'Documento').replace(/[^\wÀ-ú]+/g, '_').slice(0, 40), c });
}

export const temConteudo = (md) => limpa(md).length > 40;
