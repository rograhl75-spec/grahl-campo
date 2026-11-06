import { db, softDelete } from '../db.js';
import { avisarAlteracao } from '../sync.js';
import {
  TIPO_ATUACAO, JUSTICA, MATERIA, PAPEL, OBJETO, FASE, CAMPOS_PROCESSO, CAMPOS_PARTES, CAMPOS_PRAZOS, tituloCaso,
} from '../schema.js';
import { useLive, ir } from './hooks.js';
import { siglaTipo, FASE_COR } from './Casos.jsx';
import { Campos, Chips, Opcoes, Sel } from './fields.jsx';
import { Preparacao } from './Preparacao.jsx';
import { Quesitos } from './Quesitos.jsx';
import { Campo } from './Campo.jsx';
import { Fotos } from './Fotos.jsx';
import { Documentos } from './Documentos.jsx';

const ABAS = [
  ['resumo', '📋 Resumo'], ['preparacao', '📚 Preparação'], ['quesitos', '❓ Quesitos'],
  ['campo', '🦺 Campo'], ['fotos', '📷 Fotos'], ['documentos', '📄 Documentos'],
];

export function Caso({ id, aba }) {
  const rec = useLive(() => db.records.get(id), [id], null);
  const contagem = useLive(async () => {
    const filhos = await db.records.where('caseId').equals(id).toArray();
    const c = {};
    for (const f of filhos) if (!f.deleted) c[f.kind] = (c[f.kind] || 0) + 1;
    return c;
  }, [id], {});
  if (rec === null) return <p class="vazio">Carregando…</p>;
  if (!rec) return <div class="pagina"><p class="vazio grande">Caso não encontrado neste aparelho. <a href="#/">Voltar</a></p></div>;
  if (rec.deleted) return <div class="pagina"><p class="vazio grande">Este caso está na lixeira. Restaure em <a href="#/config/lixeira">Configurações → Lixeira</a>.</p></div>;

  const abas = [...ABAS];
  if (rec.data.legado) abas.push(['antigo', '🗂 App antigo']);
  const n = { quesitos: contagem.quesito, fotos: contagem.foto, campo: (contagem.posto || 0) + (contagem.medicao || 0) || undefined };
  return (
    <div class="pagina caso">
      <div class="caso-topo">
        <a class="voltar" href="#/">‹ Casos</a>
        <div class="caso-id">
          <div class="cartao-topo">
            <span class={`sigla ${siglaTipo(rec.data)[1]}`}>{siglaTipo(rec.data)[0]}</span>
            <span class="cartao-papel">{rec.data.papel}</span>
            <span class={`fase ${FASE_COR[rec.data.fase] || 'f-prep'}`}>{rec.data.fase || 'A preparar'}</span>
          </div>
          <h1>{rec.data.autorNome || rec.data.contratante || 'Caso sem nome'}</h1>
          {rec.data.reuNome && <div class="caso-reu">× {rec.data.reuNome}</div>}
          <div class="caso-sub">{rec.data.numero || 'sem número'}{rec.data.juizo ? ` · ${rec.data.juizo}` : ''}</div>
        </div>
      </div>
      <nav class="abas">
        {abas.map(([k, rot]) => (
          <a href={`#/caso/${id}/${k}`} class={aba === k ? 'ativo' : ''}>{rot}{n[k] ? <span class="contador">{n[k]}</span> : null}</a>
        ))}
      </nav>
      {aba === 'resumo' && <Resumo rec={rec} />}
      {aba === 'preparacao' && <Preparacao rec={rec} />}
      {aba === 'quesitos' && <Quesitos rec={rec} />}
      {aba === 'campo' && <Campo rec={rec} />}
      {aba === 'fotos' && <Fotos rec={rec} />}
      {aba === 'documentos' && <Documentos rec={rec} />}
      {aba === 'antigo' && <Antigo rec={rec} />}
    </div>
  );
}

function Resumo({ rec }) {
  const excluir = async () => {
    if (!confirm('Mover este caso para a lixeira? Ele pode ser restaurado em Configurações → Lixeira.')) return;
    await softDelete(rec.id);
    avisarAlteracao();
    ir('/');
  };
  return (
    <div class="grade">
      <section class="bloco">
        <h3>Classificação</h3>
        <Opcoes rec={rec} k="tipoAtuacao" label="Tipo" opcoes={TIPO_ATUACAO} />
        <Opcoes rec={rec} k="papel" label="Minha atuação" opcoes={PAPEL} />
        <Sel rec={rec} k="justica" label="Justiça / órgão" opcoes={JUSTICA} />
        <Sel rec={rec} k="materia" label="Matéria" opcoes={MATERIA} />
        <Chips rec={rec} k="objeto" label="Objeto" opcoes={OBJETO} />
        <Sel rec={rec} k="fase" label="Fase" opcoes={FASE} vazio={false} />
        {rec.data.faseLegado && <p class="dica">Fase no app antigo: {rec.data.faseLegado}</p>}
      </section>
      <section class="bloco">
        <h3>Processo</h3>
        <Campos rec={rec} campos={CAMPOS_PROCESSO} />
      </section>
      <section class="bloco">
        <h3>Partes</h3>
        <Campos rec={rec} campos={CAMPOS_PARTES} />
      </section>
      <section class="bloco">
        <h3>Datas e prazos</h3>
        <Campos rec={rec} campos={CAMPOS_PRAZOS} />
      </section>
      <section class="bloco perigo-zona">
        <button type="button" class="perigo" onClick={excluir}>Mover caso para a lixeira</button>
      </section>
    </div>
  );
}

function Antigo({ rec }) {
  let obj = {};
  try { obj = JSON.parse(rec.data.legado); } catch (e) { /* texto bruto */ }
  const linhas = Object.entries(obj).filter(([, v]) => v !== '' && v !== null && !(Array.isArray(v) && !v.length));
  return (
    <section class="bloco">
      <h3>Dados originais do app antigo (somente leitura)</h3>
      <p class="dica">Cópia integral do que estava no app antigo ({rec.data.origemLegado}). Os campos já foram distribuídos nas abas; consulte aqui se algo parecer faltar.</p>
      <table class="legado">
        <tbody>
          {linhas.map(([k, v]) => (
            <tr><th>{k}</th><td><pre>{typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v)}</pre></td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
