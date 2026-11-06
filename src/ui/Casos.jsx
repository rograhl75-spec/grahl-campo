import { useState } from 'preact/hooks';
import { db, createRecord } from '../db.js';
import { avisarAlteracao } from '../sync.js';
import { FASE, NOVO_CASO } from '../schema.js';
import { dataBR } from '../docx/reports.js';
import { useLive, ir } from './hooks.js';

function semAcento(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function hojeIso() { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function diasAte(iso) { return Math.round((new Date(iso + 'T12:00:00') - new Date(hojeIso() + 'T12:00:00')) / 86400000); }

export const FASE_COR = {
  'A preparar': 'f-prep', 'Diligência agendada': 'f-agend', 'Diligência realizada': 'f-real', 'Laudo / parecer em elaboração': 'f-laudo',
  'Aguardando manifestação / esclarecimentos': 'f-aguard', 'Concluído': 'f-ok', 'Arquivado': 'f-arq',
};

export function siglaTipo(d) {
  if (d.tipoAtuacao === 'Extrajudicial') return ['EXTRA', 't-extra', 'Extrajudicial'];
  if (/Fazenda/i.test(d.justica || '') || d.materia === 'Administrativa (servidor)') return ['FAZ', 't-faz', 'Fazenda Pública'];
  if (d.materia === 'Previdenciária' || d.materia === 'Acidentária') return ['PREV', 't-prev', d.materia];
  return ['TRAB', 't-trab', d.materia || 'Trabalhista'];
}

export function papelCurto(p) {
  if (p === 'Perito do Juízo') return 'Perito';
  if (/autor/i.test(p || '')) return 'Assist. autor';
  if (/réu/i.test(p || '')) return 'Assist. réu';
  return 'Extrajudicial';
}

function compromissos(casos) {
  const hoje = hojeIso();
  const lim = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const out = [];
  for (const c of casos) {
    const d = c.data;
    if (['Concluído', 'Arquivado'].includes(d.fase)) continue;
    for (const [rot, data, hora] of [['Diligência', d.dataDiligencia, d.horaDiligencia], ['Prazo do laudo', d.prazoLaudo], ['Manifestação', d.prazoManifestacao]]) {
      if (data && data >= hoje && data <= lim) out.push({ c, rot, data, hora });
    }
  }
  return out.sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
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
  const contagem = {};
  for (const c of casos) contagem[c.data.fase || 'A preparar'] = (contagem[c.data.fase || 'A preparar'] || 0) + 1;
  const ativos = casos.filter((c) => !['Concluído', 'Arquivado'].includes(c.data.fase)).length;
  let lista = casos.filter((c) => {
    const d = c.data;
    if (fase === 'ativos' && ['Concluído', 'Arquivado'].includes(d.fase)) return false;
    if (fase !== 'ativos' && fase !== 'todos' && (d.fase || 'A preparar') !== fase) return false;
    if (!termo) return true;
    return semAcento([d.numero, d.autorNome, d.reuNome, d.contratante, d.juizo, d.comarca, d.vistoriaLocal, d.autorCpf, d.reuCnpj].join(' ')).includes(termo);
  });
  lista = lista.sort((a, b) => b.updatedAt - a.updatedAt);
  const prox = compromissos(casos);

  return (
    <div class="pagina">
      <div class="barra-casos">
        <input class="busca" type="search" placeholder="Buscar por nome, número, CPF, CNPJ, empresa, vara…" value={busca} onInput={(e) => setBusca(e.currentTarget.value)} />
        <button type="button" class="primario grande" onClick={novo}>＋ Novo caso</button>
      </div>

      {!busca && (
        <section class="painel">
          <div class="painel-titulo">
            <h2>Próximos 30 dias</h2>
            <span class="painel-resumo">{ativos} caso(s) em andamento</span>
          </div>
          {!prox.length && <p class="vazio">Nenhuma diligência ou prazo cadastrado para os próximos 30 dias.</p>}
          <div class="agenda">
            {prox.map(({ c, rot, data, hora }) => {
              const dias = diasAte(data);
              const [sig, cls] = siglaTipo(c.data);
              return (
                <a class={`agenda-item ${dias <= 3 ? 'urgente' : dias <= 7 ? 'breve' : ''}`} href={`#/caso/${c.id}/resumo`}>
                  <div class="agenda-data">
                    <b>{dataBR(data).slice(0, 5)}</b>
                    <small>{dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`}</small>
                  </div>
                  <div class="agenda-info">
                    <div><span class={`sigla ${cls}`}>{sig}</span> <b>{rot}</b>{hora ? ` às ${hora}` : ''}</div>
                    <div class="agenda-nome">{c.data.autorNome || 'Caso sem nome'}{c.data.reuNome ? ` × ${c.data.reuNome}` : ''}</div>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      <div class="chips filtros">
        {['ativos', ...FASE, 'todos'].map((f) => (
          <button type="button" class={`chip ${fase === f ? 'on' : ''}`} onClick={() => setFase(f)}>
            {f === 'ativos' ? 'Em andamento' : f === 'todos' ? 'Todos' : f}
            {f !== 'ativos' && f !== 'todos' && contagem[f] ? <span class="chip-n">{contagem[f]}</span> : null}
          </button>
        ))}
      </div>
      {!lista.length && (
        <div class="vazio grande">
          {casos.length ? 'Nenhum caso com esse filtro.' : 'Nenhum caso ainda. Toque em "Novo caso" ou traga os casos do app antigo em Configurações.'}
        </div>
      )}
      <div class="cartoes">
        {lista.map((c) => <CartaoCaso c={c} key={c.id} />)}
      </div>
    </div>
  );
}

function CartaoCaso({ c }) {
  const d = c.data;
  const [sig, cls, rotTipo] = siglaTipo(d);
  const hoje = hojeIso();
  const datas = [['Diligência', d.dataDiligencia], ['Laudo', d.prazoLaudo], ['Manifestação', d.prazoManifestacao]].filter(([, x]) => x && x >= hoje).sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <a class={`cartao ${cls}`} href={`#/caso/${c.id}/resumo`}>
      <div class="cartao-topo">
        <span class={`sigla ${cls}`} title={rotTipo}>{sig}</span>
        <span class="cartao-papel">{papelCurto(d.papel)}</span>
        <span class={`fase ${FASE_COR[d.fase] || 'f-prep'}`}>{d.fase || 'A preparar'}</span>
      </div>
      <div class="cartao-autor">{d.autorNome || d.contratante || 'Caso sem nome'}</div>
      {d.reuNome && <div class="cartao-reu">× {d.reuNome}</div>}
      <div class="cartao-proc">{d.numero || 'sem número'}</div>
      {d.juizo && <div class="cartao-juizo">{d.juizo}</div>}
      <div class="cartao-rodape">
        {datas[0] ? <span class={diasAte(datas[0][1]) <= 7 ? 'data-alerta' : ''}>{datas[0][0]}: <b>{dataBR(datas[0][1])}</b></span> : <span class="suave">Sem data marcada</span>}
      </div>
    </a>
  );
}
