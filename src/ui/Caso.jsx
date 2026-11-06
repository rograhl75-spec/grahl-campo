import { db, softDelete } from '../db.js';
import { avisarAlteracao } from '../sync.js';
import {
  TIPO_ATUACAO, JUSTICA, MATERIA, PAPEL, OBJETO, FASE, CAMPOS_PROCESSO, CAMPOS_PARTES, CAMPOS_PRAZOS, CAMPOS_HONORARIOS, tituloCaso,
} from '../schema.js';
import { useLive, ir } from './hooks.js';
import { siglaTipo, FASE_COR } from './Casos.jsx';
import { Campos, Chips, Opcoes, Sel } from './fields.jsx';
import { Preparacao } from './Preparacao.jsx';
import { Quesitos } from './Quesitos.jsx';
import { Campo } from './Campo.jsx';
import { Fotos } from './Fotos.jsx';
import { Documentos } from './Documentos.jsx';

// Etapas do caso, na ordem do trabalho
export const ETAPAS = [
  { k: 'cadastro', n: 1, rot: 'Cadastro', o: 'confira o tipo e a sua atuação; número e partes podem vir dos autos (etapa 2)' },
  { k: 'autos', n: 2, rot: 'Autos', o: 'anexe o PDF do processo e extraia os dados com o Claude' },
  { k: 'quesitos', n: 3, rot: 'Quesitos', o: 'confira os quesitos das partes e do Juízo' },
  { k: 'campo', n: 4, rot: 'Campo', o: 'registre a diligência, os postos e as medições' },
  { k: 'fotos', n: 5, rot: 'Fotos', o: 'confira as fotos e as legendas' },
  { k: 'documentos', n: 6, rot: 'Documentos', o: 'gere as petições, o laudo ou o parecer' },
];
const ALIAS = { resumo: 'cadastro', preparacao: 'autos' };

export function etapasFeitas(c, cont) {
  return {
    cadastro: !!(c.tipoAtuacao && c.papel && (c.numero || c.autorNome)),
    autos: !!((cont.autos || 0) > 0 || (cont.periodo || 0) > 0 || (c.funcoes || '').trim()),
    quesitos: (cont.quesito || 0) > 0 || !!c.semQuesitos,
    campo: !!c.vistoriaData,
    fotos: (cont.foto || 0) > 0,
    documentos: ['Aguardando manifestação / esclarecimentos', 'Concluído', 'Arquivado'].includes(c.fase),
  };
}

export function Caso({ id, aba }) {
  const rec = useLive(() => db.records.get(id), [id], null);
  const contagem = useLive(async () => {
    const filhos = await db.records.where('caseId').equals(id).toArray();
    const c = {};
    for (const f of filhos) {
      if (f.deleted) continue;
      c[f.kind] = (c[f.kind] || 0) + 1;
      if (f.kind === 'anexo' && f.data.descricao === 'autos') c.autos = (c.autos || 0) + 1;
    }
    return c;
  }, [id], {});
  if (rec === null) return <p class="vazio">Carregando…</p>;
  if (!rec) return <div class="pagina"><p class="vazio grande">Caso não encontrado neste aparelho. <a href="#/">Voltar</a></p></div>;
  if (rec.deleted) return <div class="pagina"><p class="vazio grande">Este caso está na lixeira. Restaure em <a href="#/config/lixeira">Configurações → Lixeira</a>.</p></div>;

  aba = ALIAS[aba] || aba;
  const feitas = etapasFeitas(rec.data, contagem);
  const proxima = ETAPAS.find((e) => !feitas[e.k]);
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
      <nav class="abas etapas">
        {ETAPAS.map((e) => (
          <a href={`#/caso/${id}/${e.k}`} class={`${aba === e.k ? 'ativo' : ''} ${feitas[e.k] ? 'feita' : ''}`}>
            <span class="num">{feitas[e.k] ? '✓' : e.n}</span>{e.rot}{n[e.k] ? <span class="contador">{n[e.k]}</span> : null}
          </a>
        ))}
        {rec.data.legado && <a href={`#/caso/${id}/antigo`} class={`extra ${aba === 'antigo' ? 'ativo' : ''}`}>🗂 App antigo</a>}
      </nav>
      {proxima && proxima.k !== aba && (
        <a class="proximo-passo" href={`#/caso/${id}/${proxima.k}`}>➜ Próximo passo: <b>{proxima.n}. {proxima.rot}</b> – {proxima.o}</a>
      )}
      {aba === 'cadastro' && <Resumo rec={rec} />}
      {aba === 'autos' && <Preparacao rec={rec} />}
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
      <p class="dica largo">Comece marcando o <b>tipo</b> e a <b>sua atuação</b>. Número do processo, partes e prazos podem ser preenchidos automaticamente na etapa <b>2. Autos</b>, a partir do PDF do processo; aqui você só confere.</p>
      <section class="bloco">
        <h3>Classificação</h3>
        <Opcoes rec={rec} k="tipoAtuacao" label="Tipo" opcoes={TIPO_ATUACAO} />
        <Opcoes rec={rec} k="papel" label="Minha atuação" opcoes={PAPEL} />
        <Sel rec={rec} k="justica" label="Justiça / órgão" opcoes={JUSTICA} />
        <Sel rec={rec} k="materia" label="Matéria" opcoes={MATERIA} />
        <Chips rec={rec} k="objeto" label="Objeto da perícia (azul = marcado; toque para marcar ou desmarcar)" opcoes={OBJETO} />
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
      {rec.data.papel === 'Perito do Juízo' && (
        <section class="bloco">
          <h3>Honorários e itens do despacho</h3>
          <p class="dica">Usados nas petições de majoração de honorários e de agendamento da vistoria.</p>
          <Campos rec={rec} campos={CAMPOS_HONORARIOS} />
        </section>
      )}
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
