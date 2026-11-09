import { useState } from 'preact/hooks';
import { db, createRecord, softDelete, updateFields } from '../db.js';
import { avisarAlteracao } from '../sync.js';
import { useLive } from './hooks.js';
import { Campos } from './fields.jsx';

// Lista editável de registros de um caso (períodos, documentos, EPIs...)
export function RecordList({ kind, caseId, campos, titulo, novo = 'Adicionar', resumo, vazio = 'Nenhum item.', extra, inicial = {}, abrirNovo = true, filtro }) {
  const itens = useLive(async () => {
    const l = caseId
      ? await db.records.where('[caseId+kind]').equals([caseId, kind]).toArray()
      : await db.records.where('kind').equals(kind).toArray();
    return l.filter((r) => !r.deleted && (!filtro || filtro(r))).sort((a, b) => (a.data.ordem ?? a.createdAt) - (b.data.ordem ?? b.createdAt));
  }, [caseId, kind], []);
  const [aberto, setAberto] = useState(null);

  const adicionar = async () => {
    const ordem = itens.reduce((m, r) => Math.max(m, r.data.ordem || 0), 0) + 1;
    const r = await createRecord(kind, caseId, { ...inicial, ordem });
    avisarAlteracao();
    if (abrirNovo) setAberto(r.id);
  };
  const remover = async (r) => {
    if (!confirm(`Mover "${resumo(r) || 'item'}" para a lixeira? (pode ser restaurado em Configurações → Lixeira)`)) return;
    await softDelete(r.id);
    avisarAlteracao();
  };
  const mover = async (idx, dir) => {
    const a = itens[idx], b = itens[idx + dir];
    if (!a || !b) return;
    const oa = a.data.ordem ?? idx + 1, ob = b.data.ordem ?? idx + 1 + dir;
    await updateFields(a.id, { ordem: ob === oa ? oa + dir : ob });
    await updateFields(b.id, { ordem: oa });
    avisarAlteracao();
  };

  return (
    <section class="bloco">
      {titulo && <h3>{titulo} <span class="contador">{itens.length}</span></h3>}
      {!itens.length && <p class="vazio">{vazio}</p>}
      {itens.map((r, idx) => (
        <div class={`item ${aberto === r.id ? 'aberto' : ''}`} key={r.id}>
          <div class="item-topo" onClick={() => setAberto(aberto === r.id ? null : r.id)}>
            <span class="item-titulo">{resumo(r) || <em>(sem título – toque para preencher)</em>}</span>
            <span class="item-acoes" onClick={(e) => e.stopPropagation()}>
              <button type="button" class="mini" title="Subir" onClick={() => mover(idx, -1)}>↑</button>
              <button type="button" class="mini" title="Descer" onClick={() => mover(idx, 1)}>↓</button>
              <button type="button" class="mini perigo" title="Excluir" onClick={() => remover(r)}>✕</button>
            </span>
          </div>
          {aberto === r.id && (
            <div class="item-corpo">
              <Campos rec={r} campos={campos} />
              {extra && extra(r)}
            </div>
          )}
        </div>
      ))}
      <button type="button" class="adicionar" onClick={adicionar}>＋ {novo}</button>
    </section>
  );
}
