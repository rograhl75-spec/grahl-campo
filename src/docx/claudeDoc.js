// ======================================================================
// Documento redigido pelo Claude → Word no padrão GRAHL (timbrado, fontes embutidas, capa, sumário,
// quadros e figuras numerados, assinatura). O Claude devolve o texto em Markdown com as convenções de
// CONVENCOES_CLAUDE; o app monta o documento, sem o perito ter de formatar no Word.
// ======================================================================
import { Doc, carregar, finalizar, capaTecnica, blocoAssinatura, partes, enderecamentoTexto, linhasProcesso, figurasDoCaso, apendicesDoCaso, anexosDoCaso, textoIntegram, inserirAnexos, inserirApendices, dataPorExtenso } from './base.js';
import { datasDasVistorias } from '../schema.js';
import { semRevisao, largurasAuto } from './ooxml.js';
import { termoDeclaracaoAutorizacao, assinaturaEmitentePpp } from './modelos.js';
import { fichasFds } from './fdsQuadros.js';
const ROMANOS_DOC = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export const CONVENCOES_CLAUDE = `FORMATO DA RESPOSTA (o app monta o Word no meu papel timbrado, com capa, sumário, numeração de quadros e figuras e assinatura; não faça capa, sumário nem assinatura):
- Comece com as linhas "Título: ..." e "Subtítulo: ..." (o subtítulo é opcional).
- Títulos: "# 1 Título da seção" (primário, abre página nova), "## 1.1 Subtítulo", "### 1.1.1 Item".
- Parágrafos separados por linha em branco. Negrito com **texto**, itálico com *texto*. O que eu precisar completar ou conferir: [[pendência]].
- Listas: uma linha por item começando com "- ".
- Quadros: uma linha "Quadro: título do quadro", a tabela em Markdown (primeira linha = cabeçalho) e, logo abaixo, "Fonte: ...". Não numere: o app numera.
- Fluxos (etapas, metodologia, dinâmica de um acidente): uma linha "Fluxo: título" seguida das etapas numeradas "1. Etapa – descrição curta" (até 8).
- Prefira quadros a parágrafos longos sempre que houver comparação, datas, valores, períodos ou critérios.
- Fórmulas e cálculos entre cifrões, em notação simples: $NEN = L_{avg} + 16,61 \\cdot \\log(T/8)$, $a_{ren}(T) = a_{rep} \\cdot \\sqrt{T/8}$, $VDV_R(T) = VDV_{R,medido} \\cdot (T/T_{medição})^{0,25}$, $NEN = 93,1 + 16,61 \\cdot \\log(12/8) = 96,0$ dB(A). O app converte em equação do Word.
- Não escreva o anexo fotográfico (legendas das fotos), a lista de anexos e apêndices, nem local e data: o app insere as fotos com as legendas, os anexos (ART etc.), os apêndices (relatórios de medição, certificados) e a data de emissão.
- Revise a ortografia e a concordância (português do Brasil).
- Não use emojis, HTML nem blocos de código.`;

const limpa = (t) => String(t ?? '').trim();
const celulas = (linha) => linha.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
const separador = (linha) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(linha);

// Fórmula escrita como texto ("NEN = Lavg + 16,61·log(T/8)") → notação do app ($NEN = L_{avg} + …$), que vira equação do Word
const RE_LADO = /(?<![\p{L}\d])(NEN|Lavg|Leq|aren|arep|VDVR|VDV)(\s*\([^()]{0,20}\))?\s*=\s*/gu;
function paraTex(f) {
  let t = f.trim();
  t = t.replace(/√\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, '\\sqrt{$1}');
  t = t.replace(/\^\s*\(?([\d.,]+)\)?/g, '^{$1}');
  t = t.replace(/(?<![\p{L}])Lavg(?![\p{L}])/gu, 'L_{avg}').replace(/(?<![\p{L}])Leq(?![\p{L}])/gu, 'L_{eq}')
    .replace(/(?<![\p{L}])aren(?![\p{L}])/gu, 'a_{ren}').replace(/(?<![\p{L}])arep(?![\p{L}])/gu, 'a_{rep}').replace(/(?<![\p{L}])VDVR(?![\p{L}])/gu, 'VDV_{R}')
    .replace(/(?<![\p{L}])T(medição|medicao|medido|laudo|med)(?![\p{L}])/gu, 'T_{$1}')
    .replace(/(?<![\p{L}\\])log(?![\p{L}])/gu, '\\log');
  return t;
}
export function formulasDoTexto(s) {
  if (/\$/.test(s)) return s;
  let out = '', ultimo = 0, m;
  RE_LADO.lastIndex = 0;
  while ((m = RE_LADO.exec(s))) {
    if (m.index < ultimo) continue;
    let j = m.index + m[0].length, prof = 0;
    for (; j < s.length; j++) {
      const c = s[j], resto = s.slice(j);
      if (c === '(') prof++;
      else if (c === ')') { if (!prof) break; prof--; }
      else if (!prof && /^\s+(dB|m\/s|h\b|horas|%)/.test(resto)) break;
      else if (!prof && (c === ';' || c === ':' || (c === ',' && !/\d/.test(s[j + 1] || '')) || (c === '.' && !/\d/.test(s[j + 1] || '')))) break;
      else if (!/[\p{L}\d\s·√^/+\-=×,.]/u.test(c)) break;
    }
    const f = s.slice(m.index, j).replace(/\s+$/, '');
    if (!/log|√|\^|·/.test(f)) continue;
    out += s.slice(ultimo, m.index) + `$${paraTex(f)}$`;
    ultimo = m.index + f.length;
    RE_LADO.lastIndex = ultimo;
  }
  return out + s.slice(ultimo);
}

// partes que o app monta sozinho: o Claude às vezes as escreve mesmo assim
const RE_ANEXO_FOTOS = /^#{0,3}\s*\**\s*anexo\s+[ivx\d]*\s*[–—:-]?\s*(registro|relat[óo]rio)\s+fotogr/i;
const RE_LOCAL_DATA = /^\**[\p{L} .'/–-]{3,90}\/[A-Z]{2}\**\s*,\s*(\[\[)?\s*(data de emiss[ãa]o|\d{1,2}(º)? de [\p{L}]+ de \d{4})\s*(\]\])?\s*\.?\**$/u;
const RE_INTEGRAM = /^(o (presente )?(laudo|parecer|documento) (segue acompanhado|é acompanhado)|integram? o (presente )?(laudo|parecer|documento)|integram? o presente|seguem anexos)/i;
const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function semPartesDoApp(md) {
  const L = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = []; let pulando = false, encerramento = false, listaIntegram = false;
  for (const l of L) {
    const t = l.trim();
    if (/^#\s/.test(t)) encerramento = /encerramento/i.test(t);
    if (encerramento && /\b(constam?|seguem|encontram-se)\b[^.]*\b(Anexo|apêndices?)\b/i.test(t) && /^[^.]*\.?\s*$/.test(t.replace(/\.$/, ''))) continue;
    if (RE_ANEXO_FOTOS.test(t)) { pulando = true; continue; }
    if (pulando) { if (/^#\s/.test(t) && !/foto/i.test(t)) pulando = false; else continue; }
    // "Integram o laudo:" com a lista abaixo e o "Responsável técnico:" do encerramento: o app monta os dois
    if (listaIntegram) { if (/^[-*•]\s|^\d+[.)]\s/.test(t) || (!t && out.length)) { if (t) continue; } else listaIntegram = false; }
    if (encerramento && /^respons[áa]vel t[ée]cnico\s*:/i.test(t)) continue;
    if (RE_INTEGRAM.test(t)) { listaIntegram = /:\s*$/.test(t); continue; }
    if (RE_LOCAL_DATA.test(t)) continue;
    out.push(l.replace(/\s*(?<=^|[.!?]\s*)(Integra(m)?|Seguem anexos)[^.]*?(Anexo|apêndice|registro fotográfico)[^.]*\./gi, ''));
  }
  return out.join('\n').replace(/\[\[\s*data de emiss[ãa]o\s*\]\]/gi, dataPorExtenso(hojeIso()))
    // perito do Juízo apresenta conclusão técnica, não "posição"
    .replace(/(,\s*)?\b([Aa]) posi[çc][ãa]o t[ée]cnica do perito[^:.]*?é a seguinte:/g, (m, virg, a) => (virg ? ', conclui-se' : a === 'A' ? 'Conclui-se' : 'conclui-se') + ' tecnicamente o seguinte:')
    .replace(/posi[çc][ãa]o t[ée]cnica do perito/gi, 'conclusão técnica')
    // CNPJ / CPF em branco ("Jardelino Transportes, CNPJ [[CNPJ da Jardelino]]"): omitido, sem pendência
    .replace(/\s*\(\s*(CNPJ|CPF)\s*(n[º°.]\s*)?\[\[[^\]]*\]\]\s*\)/g, '').replace(/,?\s*(inscrita no\s+)?(CNPJ|CPF)\s*(n[º°.]\s*)?(sob o n[º°.]\s*)?\[\[[^\]]*\]\]/g, '');
}

// Corretor do Word: título de norma em inglês ("ISO 2631-1:1997 – Mechanical vibration…") sai como inglês;
// siglas, marcas e nomes próprios no meio da frase (Teslab, DoseMax, Jardelino) saem sem revisão ortográfica
const RE_NORMA_EN = /((?:ISO|IEC|ANSI|ACGIH|NIOSH|OSHA)[\w /-]*?\d[\d.-]*(?::\d{4})?\s*[–—-]\s*)([A-Z][A-Za-z0-9 ,'’()/:–—-]*?\b(?:and|of|to|the|for)\b[A-Za-z0-9 ,'’()/:–—-]*?)(?=\.\s|\.$|;|$)/g;
export const inglesDasNormas = (s) => String(s).replace(RE_NORMA_EN, (m, a, b) => (/\{\{/.test(m) ? m : `${a}{{en:${b.trim()}}}`));
export function nomesSemRevisao(md) {
  const t = String(md || '').replace(/\$[^$\n]*\$/g, ' ');
  const siglas = t.match(/(?<![\p{L}])[\p{Lu}][\p{L}]*[\p{Lu}][\p{L}\d]*(?![\p{L}])/gu) || []; // NEN, DoseMax, CalPro, CRLV
  const meio = [...t.matchAll(/[\p{Ll},;:)\d]\s+(\p{Lu}[\p{Ll}]{2,})(?![\p{L}])/gu)].map((m) => m[1]); // nome próprio no meio da frase
  semRevisao([...siglas, ...meio]);
}

// Converte o Markdown do Claude e devolve { titulo, subtitulo }; o corpo vai para d
export function markdownParaDoc(md, d, { marcas = {} } = {}) {
  const L = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  let titulo = '', subtitulo = '';
  let par = [];
  const soltaPar = () => { if (par.length) { d.texto(inglesDasNormas(formulasDoTexto(par.join(' ')))); par = []; } };
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    const t = l.trim();
    if (!t) { soltaPar(); continue; }
    // marcas do app (ex.: assinatura do emitente ao final do PPP)
    if (marcas[t]) { soltaPar(); marcas[t](d); continue; }
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
        const lq = linhas.map((x) => [...x, ...Array(n - x.length).fill('')]);
        const tamQ = 9; // mesmo tamanho em todos os quadros (antes 8,5 ou 9,5 conforme o número de colunas)
        d.quadro(tituloQ, lq, { fonte, tam: tamQ, larguras: largurasAuto(lq, tamQ) });
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
    if (/^[-•*]\s+/.test(t) || /^[a-z]\)\s+/i.test(t)) { soltaPar(); d.texto(inglesDasNormas(formulasDoTexto(t.replace(/^\*\s+/, '- ')))); continue; }
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
  nomesSemRevisao(md);
  // LTCAT extrajudicial: assinatura do emitente do PPP ao final da minuta do PPP (antes do título seguinte)
  const comPpp = ehLtcatExtrajudicial(c, md);
  let mdC = comPpp ? comAssinaturaPpp(semPartesDoApp(md)) : semPartesDoApp(md);
  // fichas das FDS logo depois do título da avaliação dos agentes químicos (como nos laudos do app)
  if ((dados.produtos || []).some((p) => String(p.data.nome || '').trim())) mdC = comFichasFds(mdC);
  const { titulo, subtitulo } = markdownParaDoc(mdC, corpo, { marcas: {
    [MARCA_PPP]: (x) => assinaturaEmitentePpp(x, dados),
    [MARCA_FDS]: (x) => fichasFds(x, dados, { primeiraSemQuebra: true }),
  } });
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
  // como nos laudos do app: lista do que integra o documento, assinatura com a data de emissão, Anexo I (fotos),
  // anexos do caso (ART, documentos) e apêndices (relatórios de medição, certificados de calibração, paradigmas)
  const { lista, faltando } = await figurasDoCaso(dados);
  const { apendices, falhasApendice, semRelatorios, semRelatoriosLgpd } = await apendicesDoCaso(dados);
  const { anexos, falhasAnexo } = await anexosDoCaso(dados, { romanos: true, inicio: lista.length ? 1 : 0 });
  const doc = /parecer/i.test(titulo) ? 'parecer' : /laudo|ltcat/i.test(titulo) ? 'laudo' : 'documento';
  // fichas das FDS dos produtos do caso (dados transcritos das seções 2, 3, 8 e 9), num anexo próprio, uma por página
  // sem o título da avaliação química no texto, as fichas vão para um anexo próprio
  const comFds = doc !== 'documento' && !dados._fdsImpressas && (dados.produtos || []).some((p) => String(p.data.nome || '').trim());
  if (comFds) anexos.push({ letra: ROMANOS_DOC[(lista.length ? 1 : 0) + anexos.length] || String(anexos.length + 1), titulo: 'Fichas dos produtos químicos (FDS)', fds: true });
  textoIntegram(d, { fotos: lista.length > 0, anexos, apendices, doc });
  blocoAssinatura(d, dados);
  // LTCAT/PPP extrajudicial (laudo individual): a autorização do levantamento (art. 277, IV, a, da IN 128/2022)
  // e a declaração do segurado vão no termo ao final do laudo, como nos LTCAT do app
  if (ehLtcatExtrajudicial(c, titulo)) termoDeclaracaoAutorizacao(d, dados);
  if (lista.length) { d.h1('', 'Anexo I – Relatório fotográfico da diligência'); d.figuras(lista, { rotulo: 'Foto' }); }
  inserirAnexos(d, anexos.filter((a) => !a.fds));
  for (const a of anexos.filter((x) => x.fds)) { d.h1('', `Anexo ${a.letra} – ${a.titulo}`); fichasFds(d, dados, { primeiraSemQuebra: true }); }
  inserirApendices(d, apendices, dados);
  const r = await finalizar(d, { titulo: titulo || 'Documento técnico', arquivo: (titulo || 'Documento').replace(/[^\wÀ-ú]+/g, '_').slice(0, 40), c });
  return { ...r, faltando, falhasApendice: (falhasApendice || 0) + (falhasAnexo || 0), semRelatorios, semRelatoriosLgpd, nFotos: lista.length, nApendices: apendices.length, nAnexos: anexos.length };
}

const MARCA_PPP = '%%ASSINATURA_EMITENTE_PPP%%';
// insere a marca da assinatura no fim da seção do PPP (título de 1º nível com "PPP"), antes do título seguinte
export function comAssinaturaPpp(md) {
  const L = String(md || '').split('\n');
  const i = L.findIndex((l) => /^#\s+.*\b(PPP|Perfil Profissiogr[áa]fico)/i.test(l.trim()));
  if (i < 0) return md;
  let j = L.findIndex((l, k) => k > i && /^#\s+/.test(l.trim()));
  if (j < 0) j = L.length;
  L.splice(j, 0, '', MARCA_PPP, '');
  return L.join('\n');
}

const MARCA_FDS = '%%FICHAS_FDS%%';
// insere a marca das fichas logo após o primeiro título da avaliação dos agentes químicos
export function comFichasFds(md) {
  const L = String(md || '').split('\n');
  // de preferência o da seção de avaliação dos agentes (não o da fundamentação)
  const ehQ = (l) => /^#{1,3}\s+.*(agentes?\s+qu[íi]mic|produtos?\s+qu[íi]mic)/i.test(l.trim()) && !/\bPPP\b/.test(l);
  let h1 = ''; const cand = [];
  L.forEach((l, k) => { if (/^#\s/.test(l.trim())) h1 = l; if (ehQ(l)) cand.push({ k, aval: /avalia/i.test(h1) }); });
  const i = (cand.find((x) => x.aval) || cand[0] || { k: -1 }).k;
  if (i < 0) return md;
  L.splice(i + 1, 0, '', MARCA_FDS, '');
  return L.join('\n');
}

export const ehLtcatExtrajudicial = (c, titulo = '') => c.tipoAtuacao === 'Extrajudicial' && /ltcat|ppp|condi[çc][õo]es ambientais/i.test(`${titulo} ${(c.objeto || []).join(' ')}`);

export const temConteudo = (md) => limpa(md).length > 40;

// Petição redigida pelo Claude → Word no padrão das petições do app: endereçamento ao Juízo, linhas do processo,
// corpo (o texto do Claude), "Nestes termos, pede deferimento" e assinatura. Sem capa e sem sumário.
export async function peticaoDoClaude(caseId, md) {
  const dados = await carregar(caseId);
  const { c } = dados;
  const d = new Doc();
  d.enderecamento(enderecamentoTexto(c), linhasProcesso(c));
  const { titulo } = markdownParaDoc(String(md || '').replace(/^\s*(nestes termos|termos em que)[\s\S]*$/im, ''), d);
  const { fecho } = await import('./modelos.js');
  fecho(d, dados, c.papel === 'Perito do Juízo' ? 'Perito Judicial' : null);
  const nome = (titulo || 'Peticao').replace(/^peti[çc][ãa]o\s*(de|do|da)?\s*/i, '');
  return finalizar(d, { titulo: titulo || 'Petição', arquivo: `Peticao_${nome.replace(/[^\wÀ-ú]+/g, '_').slice(0, 40) || 'avulsa'}`, c });
}
