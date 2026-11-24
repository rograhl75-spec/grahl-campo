import { useEffect } from 'preact/hooks';
import { db, softDelete } from '../db.js';
import { avisarAlteracao } from '../sync.js';
import {
  TIPO_ATUACAO, JUSTICA, MATERIA, PAPEL, OBJETO, FASE, CONTRATADO_POR, CAMPOS_ACIDENTE, ehAcidente, CAMPOS_PROCESSO, CAMPOS_PARTES, CAMPOS_PRAZOS, CAMPOS_HONORARIOS, CAMPOS_PPP, tituloCaso, contextoLegal, ehParecerTecnico, FINALIDADE_PARECER } from '../schema.js';
import { useLive, ir } from './hooks.js';
import { PROFISSOES } from '../data/profissoes.js';
import { siglaTipo, FASE_COR } from './Casos.jsx';
import { Campos, Chips, Opcoes, Sel, TF } from './fields.jsx';
import { Preparacao } from './Preparacao.jsx';
import { Quesitos } from './Quesitos.jsx';
import { Campo } from './Campo.jsx';
import { Fotos } from './Fotos.jsx';
import { Documentos } from './Documentos.jsx';
import { Icone } from './Icone.jsx';
import { confirmar } from './dialogo.jsx';

// Etapas do caso, na ordem do trabalho
// 1 Autos (dados do caso, PDF do processo, vínculos, agentes e quesitos) → 2 Campo (diligência, anotações,
// medições e fotos) → 3 Laudo (o documento principal) → 4 Petições (honorários, agendamento, suplementares…)
export const ETAPAS = [
  { k: 'autos', n: 1, rot: 'Autos', o: 'anexe o PDF do processo e extraia tudo com o Claude (dados do caso, vínculos e quesitos)' },
  { k: 'campo', n: 2, rot: 'Campo', o: 'registre ou importe as anotações da diligência, as medições e as fotos' },
  { k: 'laudo', n: 3, rot: 'Laudo', o: 'responda os quesitos e redija o laudo com o Claude' },
  { k: 'peticoes', n: 4, rot: 'Petições', o: 'honorários, agendamento, suplementares, pagamento' },
];
// endereços antigos (6 etapas) → etapa nova e a seção dentro dela
const ALIAS = { resumo: 'autos', cadastro: 'autos', preparacao: 'autos', quesitos: 'autos', fotos: 'campo', documentos: 'laudo' };
const SECAO = { resumo: 'sec-cadastro', cadastro: 'sec-cadastro', quesitos: 'sec-quesitos', fotos: 'sec-fotos' };

export function etapasFeitas(c, cont) {
  const cadastro = !!(c.tipoAtuacao && c.papel && (c.numero || c.autorNome));
  const autos = !!((cont.autos || 0) > 0 || (cont.periodo || 0) > 0 || (c.funcoes || '').trim());
  return {
    autos: cadastro && autos && ((cont.quesito || 0) > 0 || !!c.semQuesitos || c.tipoAtuacao === 'Extrajudicial'),
    campo: !!c.vistoriaData || (cont.foto || 0) > 0,
    laudo: ['Aguardando manifestação / esclarecimentos', 'Respondendo quesitos suplementares', 'Concluído', 'Arquivado'].includes(c.fase),
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

  const secao = SECAO[aba];
  aba = ALIAS[aba] || aba || 'autos';
  const feitas = etapasFeitas(rec.data, contagem);
  const proxima = ETAPAS.find((e) => e.k !== 'peticoes' && !feitas[e.k]);
  const n = { autos: contagem.quesito, campo: (contagem.foto || 0) + (contagem.medicao || 0) || undefined };
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
          <a href={`#/caso/${id}/${e.k}`} class={`${aba === e.k ? 'ativo' : ''} ${feitas[e.k] ? 'feita' : ''}`} title={feitas[e.k] ? `Etapa ${e.n} – concluída` : `Etapa ${e.n}`}>
            <span class="num">{e.n}</span>{e.rot}{feitas[e.k] ? <span class="feita-ok" aria-label="concluída">✓</span> : null}{n[e.k] ? <span class="contador">{n[e.k]}</span> : null}
          </a>
        ))}
        {rec.data.legado && <a href={`#/caso/${id}/antigo`} class={`extra ${aba === 'antigo' ? 'ativo' : ''}`}><Icone nome="pasta" /> App antigo</a>}
      </nav>
      {proxima && proxima.k !== aba && (
        <a class="proximo-passo" href={`#/caso/${id}/${proxima.k}`}>➜ Próximo passo: <b>{proxima.n}. {proxima.rot}</b> – {proxima.o}</a>
      )}
      {secao && <IrParaSecao id={secao} />}
      {aba === 'autos' && <>
        <details id="sec-cadastro" class="secao-etapa" open={!rec.data.tipoAtuacao || !rec.data.papel || secao === 'sec-cadastro'}>
          <summary><b>Dados do caso</b> <small class="dica">tipo, atuação, processo, partes, prazos e honorários – a extração dos autos preenche</small></summary>
          <Resumo rec={rec} />
        </details>
        <Preparacao rec={rec} />
        <section id="sec-quesitos" class="secao-etapa"><h2 class="titulo-secao">Quesitos</h2><Quesitos rec={rec} /></section>
      </>}
      {aba === 'campo' && <>
        <Campo rec={rec} />
        <section id="sec-fotos" class="secao-etapa"><h2 class="titulo-secao">Fotos</h2><Fotos rec={rec} /></section>
      </>}
      {aba === 'laudo' && <Documentos rec={rec} modo="laudo" />}
      {aba === 'peticoes' && <Documentos rec={rec} modo="peticoes" />}
      {aba === 'antigo' && <Antigo rec={rec} />}
    </div>
  );
}

// rola até a seção pedida pelo endereço antigo (ex.: #/caso/x/quesitos → Autos, seção Quesitos)
function IrParaSecao({ id }) {
  useEffect(() => { const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150); return () => clearTimeout(t); }, [id]);
  return null;
}

function Resumo({ rec }) {
  const excluir = async () => {
    if (!await confirmar('Mover este caso para a lixeira? Ele pode ser restaurado em Configurações → Lixeira.')) return;
    await softDelete(rec.id);
    avisarAlteracao();
    ir('/');
  };
  return (
    <div class="grade">
      <p class="dica largo">Comece marcando o <b>tipo</b> e a <b>sua atuação</b>. Número do processo, partes e prazos são preenchidos automaticamente pela extração dos autos (logo abaixo), a partir do PDF do processo; aqui você só confere.</p>
      <section class="bloco">
        <h3>Classificação</h3>
        <Opcoes rec={rec} k="tipoAtuacao" label="Tipo" opcoes={TIPO_ATUACAO} />
        <Opcoes rec={rec} k="papel" label="Minha atuação" opcoes={PAPEL} />
        <Sel rec={rec} k="justica" label="Justiça / órgão" opcoes={JUSTICA} />
        <Sel rec={rec} k="materia" label="Matéria" opcoes={MATERIA} />
        <Chips rec={rec} k="objeto" label="Objeto da perícia (azul = marcado; toque para marcar ou desmarcar)" opcoes={OBJETO} />
        <Sel rec={rec} k="fase" label="Fase" opcoes={FASE} vazio={false} />
        <Sel rec={rec} k="jurisprudencia" label="Súmulas e jurisprudência nos documentos deste caso" opcoes={['Padrão (Meus dados)', 'Incluir', 'Não incluir']} vazio={false} />
        {contextoLegal(rec.data).prev && <Sel rec={rec} k="profissao" label="Profissão (banco de profissões: agentes e critérios já estudados)" opcoes={PROFISSOES.map((p) => p.nome)} />}
        {contextoLegal(rec.data).prev && <Sel rec={rec} k="penosidade" label="Avaliação de penosidade (motorista / cobrador)" opcoes={['Automático', 'Sim', 'Não']} vazio={false} />}
        {rec.data.tipoAtuacao === 'Extrajudicial' && <>
          <Sel rec={rec} k="contratadoPor" label="Quem contratou" opcoes={CONTRATADO_POR} />
          <TF rec={rec} k="art" label="Nº da ART" />
          {(ehParecerTecnico(rec.data) || (rec.data.objeto || []).includes('Penosidade (motorista)')) && <Sel rec={rec} k="finalidade" label="Finalidade do parecer" opcoes={FINALIDADE_PARECER} />}
          <p class="dica">Extrajudicial: o objeto define o documento. Aposentadoria especial, LTCAT ou PPP → LTCAT e parecer previdenciário; Insalubridade ou Periculosidade → laudo de insalubridade e periculosidade; Acidente → laudo de acidente. "Parecer técnico extrajudicial" com motorista ou o objeto "Penosidade (motorista)" → parecer técnico de condições de trabalho e penosidade.</p>
        </>}
        {rec.data.faseLegado && <p class="dica">Fase no app antigo: {rec.data.faseLegado}</p>}
      </section>
      {ehAcidente(rec.data) && (
        <section class="bloco">
          <h3>Acidente do trabalho</h3>
          <p class="dica">Usado no laudo de acidente. Pode vir preenchido pela extração dos autos com o Claude.</p>
          <Campos rec={rec} campos={CAMPOS_ACIDENTE} />
        </section>
      )}
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
      {rec.data.tipoAtuacao === 'Extrajudicial' && contextoLegal(rec.data).prev && !ehParecerTecnico(rec.data) && (
        <section class="bloco">
          <h3>PPP (LTCAT + PPP)</h3>
          <p class="dica">Quem emite o PPP e os dados administrativos do formulário. Cooperativa: o PPP sai só com os vínculos de cooperado; os demais ficam no LTCAT. Próprio segurado: contribuinte individual sem empresa.</p>
          <Campos rec={rec} campos={CAMPOS_PPP} />
        </section>
      )}
      {rec.data.papel === 'Perito do Juízo' && (
        <section class="bloco">
          <h3>Honorários e itens do despacho</h3>
          <p class="dica">Usados nas petições de honorários (proposta, majoração e aceite) e de agendamento da vistoria.</p>
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
