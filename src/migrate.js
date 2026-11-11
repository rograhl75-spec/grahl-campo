import JSZip from 'jszip';
import { collection, getDocs } from 'firebase/firestore';
import { ref as sref, getBlob } from 'firebase/storage';
import { db, mergeIncoming } from './db.js';
import { normalize } from './merge.js';
import { processarFoto } from './photos.js';
import { firebaseHandles } from './sync.js';

// Importa os casos do app antigo (coleção "processos") SEM alterar nada lá.
// Os campos importados recebem horário "antigo" (ts = 1): qualquer edição sua
// no app novo sempre prevalece, e importar de novo não sobrescreve nada.
const TS_LEGADO = 1;

const PADROES_ANTIGOS = new Set([
  'Ruído contínuo ou intermitente (NHO-01)',
  'Hidrocarbonetos / Solventes / Produtos químicos da atividade',
  'Agentes biológicos (se aplicável)',
  'Decreto 3.048/99 (Anexo IV)',
  'Insalubridade, Periculosidade e/ou Aposentadoria Especial',
  'As condições ambientais, layout e tecnologias mantêm-se inalteradas em relação ao período pretendido (Art. 279, IN 128/2022).',
  'Aguardando diligência pericial', 'Vara do Trabalho de Londrina - PR', 'Ordinário / Sumaríssimo', 'Ativo', 'Não informado',
]);

const ROTULOS_EXTRAS = {
  profissao_cargo: 'Profissão / cargo', status_contrato: 'Situação do contrato', periodo_imprescrito: 'Período imprescrito',
  ultima_remuneracao: 'Última remuneração', data_admissao: 'Admissão / período', cargos: 'Cargos', setor: 'Setor',
  objeto_pericia: 'Objeto da perícia', enquadramento_legal_prev: 'Enquadramento legal', conclusao_tecnica: 'Conclusão técnica',
  fase_processual: 'Fase (app antigo)', estabelecimento_endereco: 'Endereço do estabelecimento', estabelecimento_cnae: 'CNAE',
  estabelecimento_grau_risco: 'Grau de risco', natureza_laudo: 'Natureza do laudo', modo_temporal: 'Modo temporal',
  responsavel_nome: 'Responsável técnico', responsavel_conselho: 'Conselho', responsavel_art: 'ART',
  profissiografia_real: 'Profissiografia observada', fontes_documentais: 'Fontes documentais',
  agentes_observados: 'Agentes observados', medidas_epc: 'EPC', extemp_evidencias: 'Evidências históricas',
  extemp_justificativa: 'Fundamentação de equivalência', apr_fisicos: 'APR – físicos', apr_quimicos: 'APR – químicos',
  apr_biologicos: 'APR – biológicos', roteiro_vistoria: 'Roteiro de vistoria',
};

function txt(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function util(v) { const t = txt(v); return t && !PADROES_ANTIGOS.has(t) ? t : ''; }

export function dataIso(v) {
  const t = txt(v);
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}

export function separarQuesitos(texto) {
  const t = txt(texto);
  if (!t) return [];
  const partes = t.split(/\n\s*(?=(?:quesito\s*)?\d{1,3}\s*[)\.\-–:º°])/i).map((s) => s.trim()).filter(Boolean);
  return partes.map((p, i) => {
    const m = p.match(/^(?:quesito\s*)?(\d{1,3})\s*[)\.\-–:º°]\s*([\s\S]*)$/i);
    return m ? { numero: m[1], texto: m[2].trim() } : { numero: String(i + 1), texto: p };
  });
}

function linhas(pares) {
  return pares.filter(([, v]) => util(v)).map(([r, v]) => `${r}: ${util(v)}`).join('\n');
}

export function mapearLegado(docId, d) {
  const modulo = txt(d.modulo_atuacao);
  const prev = /previdenci/i.test(modulo);
  const papelAntigo = txt(d.papel_profissional).toLowerCase();
  let papel = 'Perito do Juízo';
  if (papelAntigo.includes('reclamad') || papelAntigo.includes('réu') || papelAntigo.includes('empresa')) papel = 'Assistente técnico do réu / reclamada';
  else if (papelAntigo.includes('reclamante') || papelAntigo.includes('autor') || papelAntigo.includes('segurado')) papel = 'Assistente técnico do autor / reclamante';
  else if (prev && !papelAntigo.includes('perito')) papel = 'Laudo extrajudicial (contratante)';

  const usados = new Set();
  const pega = (k) => { usados.add(k); return util(d[k]); };

  const caso = {
    tipoAtuacao: prev ? 'Extrajudicial' : 'Judicial',
    justica: prev ? 'Outra' : 'Justiça do Trabalho',
    materia: prev ? 'Previdenciária' : 'Trabalhista',
    papel,
    objeto: prev ? ['LTCAT', 'PPP', 'Aposentadoria especial'] : [],
    fase: 'A preparar',
    numero: pega('processo_num'),
    juizo: pega('orgao_julgador'),
    valorCausa: pega('valor_causa'),
    rito: pega('rito_processual'),
    autorNome: pega('reclamante_nome'),
    autorCpf: pega('reclamante_cpf'),
    autorAdv: pega('reclamante_adv'),
    reuNome: pega('reclamada_nome'),
    reuCnpj: pega('reclamada_cnpj'),
    reuAdv: pega('reclamada_adv'),
    atividadesAlegadas: [pega('atividades_inicial'), pega('relato_inicial')].filter(Boolean).join('\n\n'),
    agentesAlegados: pega('agentes_alegados'),
    pedidos: pega('pedidos_tecnicos'),
    defesa: pega('defesa_merito_sst'),
    preliminares: pega('preliminares_periciais'),
    analiseEpi: pega('analise_epis_critica'),
    vistoriaLocal: pega('local_diligencia'),
    vistoriaPresentes: pega('presentes_pericia'),
    origemLegado: docId,
  };
  const dtAj = dataIso(d.data_autuacao); usados.add('data_autuacao');
  if (dtAj) caso.dataAjuizamento = dtAj;
  const dtNasc = dataIso(d.segurado_nascimento); usados.add('segurado_nascimento');
  if (dtNasc) caso.autorNascimento = dtNasc;
  const dtCampo = dataIso(d.campo_data); usados.add('campo_data');
  const temCampo = ['campo_declaracoes_autor', 'campo_declaracoes_reu', 'campo_medicoes', 'local_diligencia', 'presentes_pericia']
    .some((k) => util(d[k])) || (Array.isArray(d.campo_fotos) && d.campo_fotos.length);
  if (dtCampo && temCampo) { caso.vistoriaData = dtCampo; caso.vistoriaInicio = txt(d.campo_horario); }
  usados.add('campo_horario');

  caso.funcoes = linhas(['cargos', 'setor', 'data_admissao', 'status_contrato', 'periodo_imprescrito', 'profissao_cargo', 'ultima_remuneracao']
    .map((k) => { usados.add(k); return [ROTULOS_EXTRAS[k], d[k]]; }));
  caso.roteiro = pega('roteiro_vistoria');

  const medTexto = pega('campo_medicoes');
  caso.vistoriaNotas = medTexto ? `Medições registradas no app antigo:\n${medTexto}` : '';

  // documentos, EPIs, quesitos, períodos e avaliações viram registros próprios
  const filhos = [];
  const docsMap = { doc_ltcat: 'LTCAT', doc_laudo: 'Laudo pericial', doc_ppp: 'PPP', doc_pgr: 'PGR / PPRA', doc_os: 'Ordem de serviço', doc_asos: 'PCMSO / ASO', doc_outros: 'Outro' };
  for (const [k, tipo] of Object.entries(docsMap)) {
    const v = pega(k);
    if (v) filhos.push({ kind: 'documento', data: { tipo, identificacao: '', analise: v } });
  }
  usados.add('quadro_epis');
  for (const e of Array.isArray(d.quadro_epis) ? d.quadro_epis : []) {
    if (!e || typeof e !== 'object') continue;
    const dd = { descricao: txt(e.descricao), ca: txt(e.ca), dataEntrega: txt(e.data_entrega), obs: txt(e.obs) };
    if (Object.values(dd).some(Boolean)) filhos.push({ kind: 'epi', data: dd });
  }
  const origens = { quesitos_juizo: 'Juízo', quesitos_autor: 'Autor / Reclamante', quesitos_reu: 'Réu / Reclamada' };
  for (const [k, origem] of Object.entries(origens)) {
    usados.add(k);
    separarQuesitos(d[k]).forEach((q, i) => filhos.push({ kind: 'quesito', data: { origem, numero: q.numero, texto: q.texto, resposta: '', ordem: i + 1 } }));
  }
  usados.add('cnis_periodos');
  for (const p of Array.isArray(d.cnis_periodos) ? d.cnis_periodos : []) {
    if (!p || typeof p !== 'object') continue;
    filhos.push({ kind: 'periodo', data: {
      empresa: txt(p.empresa), cnpj: txt(p.cnpj), inicio: dataIso(p.inicio), fim: dataIso(p.fim),
      cargo: txt(p.cargo), setor: txt(p.setor), atividades: txt(p.atividade),
      fonte: [txt(p.condicao), txt(p.periodo_id) && `ID ${txt(p.periodo_id)}`].filter(Boolean).join(' – '),
    } });
  }
  usados.add('avaliacoes_ambientais');
  for (const a of Array.isArray(d.avaliacoes_ambientais) ? d.avaliacoes_ambientais : []) {
    if (!a || typeof a !== 'object') continue;
    const ag = txt(a.agente);
    const agente = /ru[ií]do/i.test(ag) ? 'Ruído' : /calor|ibutg/i.test(ag) ? 'Calor (IBUTG)' : /vibra/i.test(ag) && /m[ãa]os|bra[çc]os|vmb/i.test(ag) ? 'Vibração de mãos e braços (VMB)' : /vibra/i.test(ag) ? 'Vibração de corpo inteiro (VCI)' : txt(a.tipo) === 'Q' ? 'Agente químico' : 'Outro';
    const obs = Object.entries(a).filter(([, v]) => txt(v)).map(([k, v]) => `${k}: ${txt(v)}`).join('; ');
    filhos.push({ kind: 'medicao', data: { agente, descricao: ag, valor: txt(a.intensidade), unidade: txt(a.unidade), metodo: txt(a.metodo), obs } });
  }

  const autorCampo = pega('campo_declaracoes_autor');
  const reuCampo = pega('campo_declaracoes_reu');
  if (autorCampo || reuCampo) {
    filhos.push({ kind: 'posto', data: { nome: 'Registros de campo do app antigo', infoTrabalhador: autorCampo, infoEmpresa: reuCampo, ordem: 1 } });
  }

  // tudo o que sobrou (e não é valor padrão) vai para Observações
  const ignorar = new Set(['campo_fotos', '_revision', 'modulo_atuacao', 'papel_profissional', 'tipos_pericia', 'extemp_layout', 'extemp_maquinas', 'extemp_epc', 'revisao_profissional']);
  const extras = [];
  for (const [k, v] of Object.entries(d)) {
    if (usados.has(k) || ignorar.has(k)) continue;
    if (typeof v === 'object') continue;
    const u = util(v);
    if (u && u !== 'false' && u !== 'true') extras.push(`${ROTULOS_EXTRAS[k] || k}: ${u}`);
  }
  if (txt(d.fase_processual)) caso.faseLegado = txt(d.fase_processual);
  caso.observacoes = extras.length ? `Outros dados do app antigo:\n${extras.join('\n')}` : '';

  // cópia integral (sem fotos) para consulta
  const bruto = { ...d };
  delete bruto.campo_fotos;
  caso.legado = JSON.stringify(bruto, null, 1);

  const fotos = (Array.isArray(d.campo_fotos) ? d.campo_fotos : []).filter((f) => f && typeof f === 'object');
  return { caso: limparVazios(caso), filhos, fotos };
}

function limparVazios(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (!(v === '' || v === undefined || v === null)) out[k] = v;
  return out;
}

function registroLegado(id, kind, caseId, data) {
  const ts = {};
  for (const k of Object.keys(data)) ts[k] = TS_LEGADO;
  return normalize({ id, kind, caseId, createdAt: Date.now(), data, ts });
}

// Identidade de cada item importado pelo CONTEÚDO, não pela posição na lista: com um item a mais no
// app antigo, a reimportação não desloca nem mistura os dados (antes, o id era "-quesito-3" etc.).
const CHAVES_FILHO = {
  quesito: ['origem', 'texto'], // o número muda quando entra um quesito antes: não identifica periodo: ['empresa', 'inicio', 'cargo'], documento: ['tipo', 'identificacao'],
  epi: ['descricao', 'ca', 'dataEntrega'], medicao: ['agente', 'descricao', 'valor', 'metodo'], posto: ['nome'], foto: ['tiradaEm', 'legenda', 'gps'],
};
export function chaveFilho(kind, data) {
  return (CHAVES_FILHO[kind] || ['texto', 'nome', 'descricao']).map((k) => txt(data[k]).toLowerCase().replace(/\s+/g, ' ')
    .replace(/^\(?(\d+|[a-z])\s*[).\-–]\s*/, '').slice(0, 160)).join('|');
}
function hashCurto(t) {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
// grava e só marca para envio se algo mudou (antes, toda reimportação subia tudo de novo)
async function gravarLegado(rec) {
  const { changed } = await mergeIncoming(rec);
  if (changed) await db.records.update(rec.id, { dirty: 1 });
  return changed;
}

async function gravarCaso(docId, d, carregarFoto, log) {
  const { caso, filhos, fotos } = mapearLegado(docId, d);
  const caseId = `leg-${docId}`;
  await gravarLegado(registroLegado(caseId, 'caso', null, caso));
  // itens já importados deste caso, pela chave de conteúdo (inclui os de ids antigos por posição)
  const existentes = new Map();
  for (const r of await db.records.where('caseId').equals(caseId).toArray()) existentes.set(`${r.kind}|${chaveFilho(r.kind, r.data)}`, r.id);
  const idDe = (kind, data, usados) => {
    const ch = `${kind}|${chaveFilho(kind, data)}`;
    let id = existentes.get(ch);
    if (!id || usados.has(id)) {
      id = `${caseId}-${kind}-h${hashCurto(ch)}`;
      for (let k = 2; usados.has(id); k++) id = `${caseId}-${kind}-h${hashCurto(ch)}-${k}`; // itens idênticos repetidos
    }
    usados.add(id);
    return id;
  };
  const usados = new Set();
  let i = 0;
  for (const f of filhos) {
    i += 1;
    await gravarLegado(registroLegado(idDe(f.kind, f.data, usados), f.kind, caseId, { ordem: i, ...f.data }));
  }
  let ok = 0, falhas = 0;
  for (let n = 0; n < fotos.length; n++) {
    const f = fotos[n];
    const dados = { legenda: txt(f.legenda), gps: txt(f.gps), ordem: n + 1, tiradaEm: txt(f.created_at), postoId: '' };
    const id = idDe('foto', dados, usados);
    await gravarLegado(registroLegado(id, 'foto', caseId, dados));
    if (await db.blobs.get(id)) { ok++; continue; }
    try {
      const blob = await carregarFoto(f);
      if (!blob) throw new Error('sem arquivo');
      const jpeg = await processarFoto(blob);
      await db.blobs.put({ id, blob: jpeg.blob, thumb: jpeg.thumb, uploaded: 0 });
      ok++;
    } catch (e) {
      falhas++;
      log(`  Foto ${n + 1} de ${docId} não pôde ser lida: ${e.message || e}`);
    }
  }
  return { filhos: filhos.length, fotos: ok, falhasFotos: falhas };
}

function base64ParaBlob(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: 'image/jpeg' });
}

// Caminho 1: direto do Firebase (precisa da regra de leitura da coleção antiga)
export async function migrarDoFirebase(log = () => {}) {
  const { fs, st, user } = firebaseHandles();
  if (!user) throw new Error('Entre com sua conta Google primeiro.');
  const snap = await getDocs(collection(fs, 'processos'));
  log(`${snap.size} caso(s) encontrados no app antigo.`);
  const resumo = { casos: 0, fotos: 0, falhasFotos: 0 };
  for (const docSnap of snap.docs) {
    const d = docSnap.data();
    const r = await gravarCaso(docSnap.id, d, async (f) => {
      if (f.storage_path) return getBlob(sref(st, f.storage_path));
      if (f.base64) return base64ParaBlob(f.base64);
      return null;
    }, log);
    resumo.casos++; resumo.fotos += r.fotos; resumo.falhasFotos += r.falhasFotos;
    log(`✔ ${docSnap.id}: ${d.reclamante_nome || 'sem nome'} — ${r.filhos} itens, ${r.fotos} foto(s)`);
  }
  return resumo;
}

// Caminho 2: ZIP gerado pelo script tools/exportar_app_antigo.py
export async function migrarDeZip(file, log = () => {}) {
  const zip = await JSZip.loadAsync(file);
  const jf = zip.file('processos.json');
  if (!jf) throw new Error('ZIP sem processos.json (gere com tools/exportar_app_antigo.py).');
  const processos = JSON.parse(await jf.async('string'));
  const ids = Object.keys(processos);
  log(`${ids.length} caso(s) no arquivo.`);
  const resumo = { casos: 0, fotos: 0, falhasFotos: 0 };
  for (const id of ids) {
    const d = processos[id];
    const r = await gravarCaso(id, d, async (f) => {
      if (f.arquivo_zip && zip.file(f.arquivo_zip)) return zip.file(f.arquivo_zip).async('blob');
      if (f.base64) return base64ParaBlob(f.base64);
      return null;
    }, log);
    resumo.casos++; resumo.fotos += r.fotos; resumo.falhasFotos += r.falhasFotos;
    log(`✔ ${id}: ${d.reclamante_nome || 'sem nome'} — ${r.filhos} itens, ${r.fotos} foto(s)`);
  }
  return resumo;
}
