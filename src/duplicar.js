// ======================================================================
// Duplicar o caso para outro segurado (ex.: o outro sócio da mesma empresa): copia a vistoria, os postos, as
// medições, as fotos, os produtos e agentes, os documentos, os vínculos e o texto já revisado do laudo; os dados
// pessoais do segurado ficam em branco para preencher (ou para vir do CNIS do novo segurado).
// ======================================================================
import { db, createRecord, updateFields } from './db.js';

// dados do segurado que não passam para o caso novo
export const CAMPOS_DO_SEGURADO = ['autorNome', 'autorCpf', 'autorNascimento', 'pppNit', 'autorRg', 'autorMae', 'autorEndereco', 'autorTelefone', 'autorEmail'];

export async function duplicarCaso(caseId, { nome = '' } = {}) {
  const caso = await db.records.get(caseId);
  if (!caso) throw new Error('Caso não encontrado.');
  const dados = { ...caso.data };
  for (const k of CAMPOS_DO_SEGURADO) delete dados[k];
  for (const k of Object.keys(dados)) if (k.startsWith('gerado_')) delete dados[k];
  if (nome) dados.autorNome = nome;
  dados.duplicadoDe = caseId;
  const novo = await createRecord('caso', null, dados);
  const filhos = (await db.records.where('caseId').equals(caseId).toArray()).filter((r) => !r.deleted);
  const mapa = new Map();
  const criados = [];
  for (const r of filhos) {
    const n = await createRecord(r.kind, novo.id, { ...r.data });
    mapa.set(r.id, n.id);
    criados.push(n);
    // arquivo da foto ou do anexo: copiado com o novo id (sobe para a nuvem na próxima sincronização)
    let b = await db.blobs.get(r.id);
    // foto ou anexo que está só na nuvem: baixa antes de copiar
    if (!b && (r.kind === 'foto' || r.kind === 'anexo')) {
      try { const sync = await import('./sync.js'); const bl = r.kind === 'foto' ? await sync.obterFoto(r.id) : await sync.obterAnexo(r.id); if (bl) b = await db.blobs.get(r.id) || { blob: bl }; } catch (e) { /* sem nuvem */ }
    }
    if (b) await db.blobs.put({ ...b, id: n.id, uploaded: 0 });
  }
  // referências entre registros do caso (posto da medição, foto do posto, anexo do relatório…)
  for (const n of criados) {
    const ajustes = {};
    for (const [k, v] of Object.entries(n.data)) {
      if (/Id$/.test(k) && typeof v === 'string' && mapa.has(v)) ajustes[k] = mapa.get(v);
      if (/Ids$/.test(k) && Array.isArray(v) && v.some((x) => mapa.has(x))) ajustes[k] = v.map((x) => mapa.get(x) || x);
    }
    if (Object.keys(ajustes).length) await updateFields(n.id, ajustes);
  }
  // texto guardado do laudo: a versão do outro segurado fica no histórico, para trocar os dados pelas correções
  return { id: novo.id, copiados: criados.length };
}

