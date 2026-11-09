// Anotações da diligência já feita (Google Keep, Word, PDF, texto): o app extrai o texto dos arquivos,
// guarda os originais no caso e monta a instrução para o Claude organizar tudo no formato do app.
import JSZip from 'jszip';
import { caseChildren } from './db.js';
import { FORMATO_DILIGENCIA } from './aiimport.js';

const ent = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

export async function textoDocx(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  return ent(xml
    .replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:tc>/g, ' | ').replace(/<\/w:tr>/g, '\n').replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim();
}

export async function textoPdf(file) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const paginas = [];
  let semTexto = 0;
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i);
    const tc = await pg.getTextContent();
    // remonta as linhas pela posição vertical
    const linhas = new Map();
    for (const it of tc.items) {
      if (!it.str) continue;
      const y = Math.round(it.transform[5] / 3);
      if (!linhas.has(y)) linhas.set(y, []);
      linhas.get(y).push([it.transform[4], it.str]);
    }
    const txt = [...linhas.entries()].sort((a, b) => b[0] - a[0])
      .map(([, l]) => l.sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(' ').replace(/\s{2,}/g, ' ').trim()).filter(Boolean).join('\n');
    if (txt.length < 20) semTexto += 1;
    paginas.push(`[página ${i}]\n${txt}`);
    pg.cleanup();
  }
  await pdf.destroy();
  return { texto: paginas.join('\n\n'), semTexto, paginas: paginas.length };
}

// Google Keep: texto copiado, exportação do Takeout (.html ou .json) ou .txt
export async function textoArquivoSimples(file) {
  const t = await file.text();
  if (/\.json$/i.test(file.name)) {
    try {
      const o = JSON.parse(t);
      const lista = (o.listContent || []).map((x) => `${x.isChecked ? '[x]' : '[ ]'} ${x.text}`).join('\n');
      return [o.title, o.textContent, lista].filter(Boolean).join('\n');
    } catch (e) { return t; }
  }
  if (/\.html?$/i.test(file.name) || /<html|<div/i.test(t.slice(0, 500))) {
    return ent(t.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, ''))
      .replace(/\n{3,}/g, '\n\n').trim();
  }
  return t;
}

// lê qualquer arquivo de anotação; imagens não têm texto (vão anexadas ao Claude)
export async function lerAnotacao(file) {
  const nome = file.name || 'arquivo';
  if (/\.docx$/i.test(nome)) return { nome, texto: await textoDocx(file) };
  if (/\.pdf$/i.test(nome) || /pdf/.test(file.type)) {
    const r = await textoPdf(file);
    return { nome, texto: r.texto, aviso: r.semTexto ? `${r.semTexto} de ${r.paginas} página(s) sem texto (digitalizadas): anexe este PDF à conversa no Claude.` : '' };
  }
  if (/^image\//.test(file.type)) return { nome, texto: '', aviso: 'imagem: anexe-a à conversa no Claude junto com a instrução.' };
  if (/\.doc$/i.test(nome)) return { nome, texto: '', aviso: 'formato .doc antigo: salve como .docx ou PDF, ou anexe ao Claude.' };
  return { nome, texto: await textoArquivoSimples(file) };
}

// Instrução para o Claude: situação (diligência feita, laudo por escrever), vínculos e postos já cadastrados,
// e as anotações transcritas
export async function promptAnotacoes(caso, textos) {
  const c = caso.data;
  const periodos = (await caseChildren(caso.id, 'periodo')).sort((a, b) => String(a.data.inicio).localeCompare(String(b.data.inicio)));
  const postos = await caseChildren(caso.id, 'posto');
  const quesitos = await caseChildren(caso.id, 'quesito');
  const L = [];
  L.push(`Sou o ${c.papel || 'perito'} no processo ${c.numero || ''}. JÁ REALIZEI A DILIGÊNCIA, mas ainda não escrevi o laudo. Abaixo estão as minhas anotações de campo (Google Keep, Word ou PDF) e, se eu anexar, os relatórios dos medidores e fotos.`);
  L.push(`Organize as anotações no formato do meu app:
- "diligencia": data, horários de início e fim, local, endereço, presentes (um por linha: nome – função – quem representa), condições da vistoria e demais notas.
- "postos": um item por posto de trabalho ou veículo avaliado, com descrição, informações do trabalhador, informações da empresa ou do acompanhante, agentes, jornada, EPC, EPI e as medições daquele posto. Use o mesmo nome de posto já cadastrado quando for o mesmo (lista abaixo).
- medições: um item por medição, com os valores EXATAMENTE como anotados ou como constam no relatório do medidor (número sem unidade), data, horário de início e fim, tempo de amostragem e o equipamento (modelo, série, certificado).
- "periodos": para cada vínculo da lista abaixo que as anotações mencionem, as informações da entrevista (atividades, e, para motorista: tipo de transporte, jornada, pernoite, carga e descarga, vias e trajetos, risco de acidente e assalto, cabine, pausas, pressão de prazos, acesso a sanitários e alimentação). Repita empresa, início e fim EXATAMENTE como na lista, para o app reconhecer o vínculo.
- "quesitos": só se as anotações trouxerem respostas; repita origem, número e texto do quesito como na lista.
- "andamento": fase "Laudo / parecer em elaboração" e "dataDiligencia".
Fidelidade: use só o que está nas anotações e nos relatórios anexados. Não invente nem complete com suposições; o que não estiver lá fica vazio. Corrija apenas erros evidentes de digitação. Datas em AAAA-MM-DD e horários em HH:MM.`);
  if (periodos.length) L.push(`VÍNCULOS CADASTRADOS (empresa | início | fim | cargo):\n${periodos.map((r) => `- ${r.data.empresa || ''} | ${r.data.inicio || ''} | ${r.data.fim || ''} | ${r.data.cargo || ''}`).join('\n')}`);
  if (postos.length) L.push(`POSTOS / VEÍCULOS JÁ CADASTRADOS:\n${postos.map((p) => `- ${p.data.nome || ''}`).join('\n')}`);
  if (quesitos.length) L.push(`QUESITOS CADASTRADOS (origem | número | texto):\n${quesitos.map((q) => `- ${q.data.origem || ''} | ${q.data.numero || ''} | ${String(q.data.texto || '').slice(0, 160)}`).join('\n')}`);
  L.push(FORMATO_DILIGENCIA);
  L.push(`ANOTAÇÕES DA DILIGÊNCIA:\n${textos.map((t) => `===== ${t.nome} =====\n${t.texto || '(sem texto extraído – arquivo anexado à conversa)'}`).join('\n\n')}`);
  return L.join('\n\n');
}
