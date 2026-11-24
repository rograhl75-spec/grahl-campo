import { vistoriasDoCaso } from './schema.js';
// Anotações da diligência já feita (Google Keep, Word, PDF, texto): o app extrai o texto dos arquivos,
// guarda os originais no caso e monta a instrução para o Claude organizar tudo no formato do app.
import JSZip from 'jszip';
import { caseChildren } from './db.js';
import { FORMATO_DILIGENCIA } from './aiimport.js';
import { contextoLegal } from './schema.js';
import { profissaoDoCaso, referenciaProfissao } from './data/profissoes.js';

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
  // vistorias já cadastradas: o Claude usa a mesma data quando a anotação for da mesma vistoria
  const vs = vistoriasDoCaso(c).filter((x) => x.data);
  if (vs.length) L.push(`VISTORIAS JÁ CADASTRADAS NO APP: ${vs.map((x) => `${x.rotulo} em ${x.data.split('-').reverse().join('/')}`).join('; ')}. Em "diligencia.vistoriaData", use a data da vistoria a que as anotações se referem; uma data nova cria outra vistoria no app.`);
  // transcrições do ditado feitas no app entram como anotações
  for (const x of vistoriasDoCaso(c)) if (x.transcricao) textos = [...textos, { nome: `Transcrição do ditado – ${x.rotulo}`, texto: x.transcricao }];
  if (periodos.length) L.push(`VÍNCULOS CADASTRADOS (empresa | início | fim | cargo):\n${periodos.map((r) => `- ${r.data.empresa || ''} | ${r.data.inicio || ''} | ${r.data.fim || ''} | ${r.data.cargo || ''}`).join('\n')}`);
  if (postos.length) L.push(`POSTOS / VEÍCULOS JÁ CADASTRADOS:\n${postos.map((p) => `- ${p.data.nome || ''}`).join('\n')}`);
  if (quesitos.length) L.push(`QUESITOS CADASTRADOS (origem | número | texto):\n${quesitos.map((q) => `- ${q.data.origem || ''} | ${q.data.numero || ''} | ${String(q.data.texto || '').slice(0, 160)}`).join('\n')}`);
  // previdenciário: agentes avaliados sem medição e a referência da profissão (critérios do signatário)
  if (contextoLegal(c).prev === true) {
    L.push('AGENTES AVALIADOS ("agentesAvaliados"): para cada agente que o segurado usa ou usou (biológico, químico ou físico sem medição), preencha os elementos do art. 68, § 2º, do Decreto 3.048/1999 – circunstâncias da exposição durante a jornada, fontes e possibilidades de liberação, meios de contato e vias de absorção, intensidade, frequência e duração –, o CAS, os efeitos à saúde e o resultado de cada época. Agente que o segurado diz não usar fica de fora. FOTOS ("fotos"): uma legenda por foto, na ordem das anotações.');
    const ref = referenciaProfissao(profissaoDoCaso(c, periodos));
    if (ref) L.push(ref);
  }
  L.push(FORMATO_DILIGENCIA);
  L.push(`ANOTAÇÕES DA DILIGÊNCIA:\n${textos.map((t) => `===== ${t.nome} =====\n${t.texto || '(sem texto extraído – arquivo anexado à conversa)'}`).join('\n\n')}`);
  return L.join('\n\n');
}

// Relatórios exportados dos medidores (DoseMax, AxPro, iTemp…) já anexados como apêndices → medições do caso.
// Os apêndices só juntam as páginas ao laudo; os números do laudo vêm das medições cadastradas nos postos.
export async function promptRelatoriosMedicao(caso) {
  const c = caso.data;
  const postos = await caseChildren(caso.id, 'posto');
  const periodos = (await caseChildren(caso.id, 'periodo')).sort((a, b) => String(a.data.inicio).localeCompare(String(b.data.inicio)));
  const L = [];
  L.push(`Sou o ${c.papel || 'perito'} no processo ${c.numero || ''}. Os arquivos anexados são os RELATÓRIOS EXPORTADOS DOS MEDIDORES desta perícia (dosímetro de ruído, medidor de vibração, medidor de IBUTG) e, se houver, os certificados de calibração. Cadastre CADA medição no formato do meu app.`);
  L.push(`REGRAS
- Valores EXATAMENTE como no relatório (número com ponto decimal, sem unidade). Não calcule nem arredonde; não invente.
- Use os RESULTADOS PRONTOS do relatório (o aparelho já normaliza para a jornada configurada): não recalcule NEN, AREN nem VDVR.
- Ruído (dosimetria): "lavg" = nível médio com q = 5 (Lavg/TWA do critério NR-15); se o relatório só trouxer q = 3 (Leq), use-o e anote "q = 3" em "posicao". "nen" = o NEN (ou Lex/NE normalizado) informado no relatório. Também "dose" (%), "lmax", "tempoAmostragem" (em minutos), "jornada" (a jornada/tempo de exposição configurada no relatório, ex.: "12h"), "dataMedicao", "horaInicio", "horaFim", "calibInicial" e "calibFinal" (dB, só se constarem), e "equipamento" (modelo e número de série).
- Vibração de corpo inteiro: "aren" = AREN do relatório (aceleração resultante de exposição normalizada; se só houver AREP, use-o), "vdv" = VDVR do relatório (pode aparecer como "VDVR", "VDV R", "VDVexp resultante" ou "VDV da exposição"; se só houver VDV por eixo, use o do eixo dominante) – NUNCA deixe "vdv" vazio se o relatório trouxer qualquer um desses valores. "eixo" dominante, "tempoAmostragem", "tempoExposicao" (a jornada configurada no relatório, ex.: "12:00:00"), "veiculo" (se constar), "dataMedicao", "horaInicio", "horaFim" e "equipamento".
- Em cada medição, "relatorio" = o nome do arquivo de onde ela saiu (como na lista de anexos).
- Em "obs", só o que for útil ao laudo (outros resultados por eixo, classificação do aparelho). Não escreva dúvidas nem "pontos a verificar" na medição.
- DISCREPÂNCIAS: compare cada relatório com os dados da vistoria abaixo e liste em "alertas" (lista de frases curtas, fora de "postos") só o que não bate e precisa de correção:
  • data da medição diferente da data da vistoria (ex.: "Data no cabeçalho 29/09/2025 × medição e vistoria em 29/09/2026");
  • jornada / tempo de exposição configurado no relatório diferente do TEMPO DE CONDUÇÃO informado abaixo (ex.: "Relatório de vibração: 15 h configuradas; tempo de condução do caso: 12 h – refaça o relatório com 12 h");
  • número de série do relatório diferente do equipamento cadastrado.
  NÃO são discrepâncias (não alerte): horários da diligência × horários das medições (a diligência inclui a entrevista e outras etapas e dura mais que as medições); diferença de minutos entre a "data da avaliação" do cabeçalho e o início da medição; certificado de calibração ausente no relatório (vale o certificado cadastrado, lista abaixo); calibração com até 24 meses na data da medição (critério do signatário; o fabricante recomenda 12 meses); ausência de aferição inicial e final do dosímetro. Sem discrepância, "alertas": [].
- Calor: "tbn", "tbs", "tg" e "ibutgLido".
- Um item de medição por resultado (cada arquivo de relatório costuma ser uma medição). O certificado de calibração não é medição: o número e a data dele vão em "equipamento".
- POSTO: use o nome de um posto já cadastrado (lista abaixo) quando a medição for dele; havendo um só posto, use-o. Sem posto cadastrado, crie um com o veículo ou setor medido (ex.: "Motorista – Scania R124 2008").
- Preencha só "postos" (com as "medicoes") e, se constar, "diligencia.vistoriaData". Não preencha vínculos, quesitos nem agentes.`);
  if (postos.length) L.push(`POSTOS / VEÍCULOS JÁ CADASTRADOS:\n${postos.map((p) => `- ${p.data.nome || ''}${p.data.descricao ? ` – ${p.data.descricao}` : ''}${p.data.jornada ? ` (jornada: ${p.data.jornada})` : ''}`).join('\n')}`);
  if (periodos.length) {
    const { carregar } = await import('./docx/base.js');
    const { tempoConducao } = await import('./docx/penosidade.js');
    const dados = await carregar(caso.id);
    L.push(`VÍNCULOS DO CASO E TEMPO DE CONDUÇÃO ADOTADO: ${dados.periodos.map((r) => { const t = tempoConducao(r, dados); return `${r.data.empresa || ''} (${r.data.inicio || ''} a ${r.data.fim || 'atual'}${isFinite(t.T) ? `; condução ${String(t.T).replace('.', ',')} h/dia${t.base ? ` – ${t.base}` : ''}` : ''})`; }).join('; ')}`);
  }
  const vs = vistoriasDoCaso(c).filter((x) => x.data);
  L.push(`DADOS DA VISTORIA (para conferir os relatórios): ${vs.length ? vs.map((x) => `${x.rotulo} em ${x.data}${x.inicio ? `, das ${x.inicio}${x.fim ? ` às ${x.fim}` : ''}` : ''}${x.local ? `, ${x.local}` : ''}`).join('; ') : 'sem data cadastrada'}${c.foraDirecaoH ? `; horas fora da direção por dia: ${c.foraDirecaoH}` : ''}${c.conducaoPadrao ? `; condução padrão: ${c.conducaoPadrao} h/dia` : ''}.`);
  // equipamentos cadastrados (com certificado): o relatório sem certificado usa estes
  const { db } = await import('./db.js');
  const equips = (await db.records.where('kind').equals('equip').toArray()).filter((e) => !e.deleted);
  if (equips.length) L.push(`EQUIPAMENTOS CADASTRADOS (valem os certificados daqui): ${equips.map((e) => `${e.data.nome} ${e.data.modelo || ''}, série ${e.data.serie || '?'}, certificado ${e.data.certificado || '?'} de ${e.data.dataCalibracao || '?'}`).join('; ')}`);
  L.push(FORMATO_DILIGENCIA);
  L.push('Acrescente ao JSON, no nível de cima, "alertas": [] com as discrepâncias encontradas.');
  return L.join('\n\n');
}
