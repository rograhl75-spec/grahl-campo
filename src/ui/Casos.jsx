import { useState } from 'preact/hooks';
import { db, createRecord } from '../db.js';
import { avisarAlteracao } from '../sync.js';
import { FASE, NOVO_CASO, tituloCaso } from '../schema.js';
import { dataBR } from '../docx/reports.js';
import { useLive, ir } from './hooks.js';

function semAcento(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function proximaData(d) {
  const hoje = new Date().toISOString().slice(0, 10);
  const datas = [['Diligência', d.dataDiligencia], ['Laudo', d.prazoLaudo], ['Manifestação', d.prazoManifestacao]]
    .filter(([, v]) => v && v >= hoje).sort((a, b) => a[1].localeCompare(b[1]));
  return datas[0] || null;
}

export function Casos() {
  const casos = useLive(async () => (await db.records.where('kind').equals('caso').toArray()).filter((c) => !c.deleted), [], null);
  const [busca, setBusca] = useState('');
  const [fase, setFase] = useState('ativos');

  const novo = async () => {
    const r = await createRecord('caso', null, { ...NOVO_CASO, objeto: [] });
    avisarAlteracao();
    ir(`/caso/${r.id}/resumo`);
  };

  if (!casos) return <p class="vazio">Carregando…</p>;
  const termo = semAcento(busca.trim());
  let lista = casos.filter((c) => {
    const d = c.data;
    if (fase === 'ativos' && ['Concluído', 'Arquivado'].includes(d.fase)) return false;
    if (fase !== 'ativos' && fase !== 'todos' && d.fase !== fase) return false;
    if (!termo) return true;
    return semAcento([d.numero, d.autorNome, d.reuNome, d.contratante, d.juizo, d.comarca, d.vistoriaLocal].join(' ')).includes(termo);
  });
  lista = lista.sort((a, b) => {
    const pa = proximaData(a.data), pb = proximaData(b.data);
    if (pa && pb) return pa[1].localeCompare(pb[1]);
    if (pa) return -1;
    if (pb) return 1;
    return b.updatedAt - a.updatedAt;
  });

  return (
    <div class="pagina">
      <div class="barra-casos">
        <input class="busca" type="search" placeholder="Buscar por nome, número, empresa, vara…" value={busca} onInput={(e) => setBusca(e.currentTarget.value)} />
        <button type="button" class="primario" onClick={novo}>＋ Novo caso</button>
      </div>
      <div class="chips filtros">
        {['ativos', ...FASE, 'todos'].map((f) => (
          <button type="button" class={`chip ${fase === f ? 'on' : ''}`} onClick={() => setFase(f)}>
            {f === 'ativos' ? 'Em andamento' : f === 'todos' ? 'Todos' : f}
          </button>
        ))}
      </div>
      {!lista.length && (
        <div class="vazio grande">
          {casos.length ? 'Nenhum caso com esse filtro.' : 'Nenhum caso ainda. Toque em "Novo caso" ou traga os casos do app antigo em Configurações.'}
        </div>
      )}
      <div class="cartoes">
        {lista.map((c) => {
          const d = c.data;
          const prox = proximaData(d);
          return (
            <a class="cartao" href={`#/caso/${c.id}/resumo`} key={c.id}>
              <div class="cartao-titulo">{tituloCaso(d)}</div>
              <div class="cartao-sub">{d.numero || 'sem número'}{d.juizo ? ` · ${d.juizo}` : ''}</div>
              <div class="etiquetas">
                <span class="etq">{d.papel}</span>
                <span class="etq fase">{d.fase || 'A preparar'}</span>
                {d.materia && <span class="etq">{d.materia}</span>}
              </div>
              {prox && <div class="cartao-data">{prox[0]}: <b>{dataBR(prox[1])}</b></div>}
            </a>
          );
        })}
      </div>
    </div>
  );
}
