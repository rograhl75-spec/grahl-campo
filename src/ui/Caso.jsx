import { useEffect } from 'preact/hooks';
import { db, softDelete } from '../db.js';
import { avisarAlteracao } from '../sync.js';
import {
  TIPO_ATUACAO, JUSTICA, MATERIA, PAPEL, OBJETO, FASE, CONTRATADO_POR, CAMPOS_ACIDENTE, ehAcidente, CAMPOS_PROCESSO, CAMPOS_PARTES, CAMPOS_PRAZOS, CAMPOS_HONORARIOS, CAMPOS_PPP, tituloCaso, contextoLegal, ehParecerTecnico, FINALIDADE_PARECER } from '../schema.js';
import { useLive, ir } from './hooks.js';
import { PROFISSOES } from '../data/profissoes.js';
import { siglaTipo, FASE_COR } from './Casos.jsx';
import { Campos, CamposCompactos, Chips, Opcoes, Sel, TF } from './fields.jsx';
import { Preparacao } from './Preparacao.jsx';
import { Quesitos } from './Quesitos.jsx';
import { Campo } from './Campo.jsx';
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
        <Preparacao rec={rec} dadosDoCaso={
          <details id="sec-cadastro" class="secao-etapa largo" open={!rec.data.tipoAtuacao || !rec.data.papel || secao === 'sec-cadastro'}>
            <summary><b>Dados do caso</b> <small class="dica">{resumoCaso(rec.data)}</small></summary>
            <Resumo rec={rec} />
          </details>} />
        <section id="sec-quesitos" class="secao-etapa"><h2 class="titulo-secao">Quesitos</h2><Quesitos rec={rec} /></section>
      </>}
      {aba === 'campo' && <Campo rec={rec} />}
      {aba === 'laudo' && <Documentos rec={rec} modo="laudo" />}
      {aba === 'peticoes' && <Documentos rec={rec} modo="peticoes" />}
      {aba === 'antigo' && <Antigo rec={rec} />}
    </div>
  );
}

// uma linha com o essencial do caso (no título recolhido de "Dados do caso") e o que falta
function resumoCaso(c) {
  const br = (d) => String(d || '').replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$3/$2/$1');
  const judicial = c.tipoAtuacao !== 'Extrajudicial';
  const partes = [
    c.classe,
    c.dataDiligencia && `diligência ${br(c.dataDiligencia)}${c.horaDiligencia ? ` ${c.horaDiligencia}` : ''}`,
    c.prazoLaudo && `prazo do laudo ${br(c.prazoLaudo)}`,
    c.honorariosFixados && `honorários ${String(c.honorariosFixados).replace(/\s*\(.*$/, '')}`,
  ].filter(Boolean);
  const faltam = [judicial && !c.numero && 'nº do processo', judicial && !c.juizo && 'juízo', !c.autorNome && 'autor', judicial && !c.reuNome && 'réu'].filter(Boolean);
  return `${partes.join(' · ') || 'tipo, atuação, processo, partes, prazos e honorários'}${faltam.length ? ` – falta: ${faltam.join(', ')}` : ''}`;
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
  const c = rec.data;
  const assistente = /assistente/i.test(c.papel || '');
  const extra = c.tipoAtuacao === 'Extrajudicial';
  const cheio = (k) => String(c[k] ?? '').trim() !== '';
  // só os campos que se aplicam a este tipo de trabalho (o que já estiver preenchido sempre aparece)
  const processo = CAMPOS_PROCESSO.filter(([k]) => cheio(k)
    || (k === 'juizoDeprecante' ? /precat/i.test(c.classe || '') : ['peritoJuizo', 'refLaudo'].includes(k) ? assistente : !extra || ['numero'].includes(k)));
  const partes = CAMPOS_PARTES.filter(([k]) => !['autorAdv', 'reuAdv'].includes(k) && (cheio(k) || k !== 'contratante' || extra || assistente));
  const posLaudo = ['Aguardando manifestação / esclarecimentos', 'Respondendo quesitos suplementares', 'Concluído', 'Arquivado'].includes(c.fase);
  const prazos = CAMPOS_PRAZOS.filter(([k]) => cheio(k) || k !== 'prazoEsclarecimentos' || posLaudo);
  const HON_PRINCIPAIS = ['honorariosFixados', 'honorariosItem', 'honorariosForma', 'similaridade', 'empresaOriginal', 'foraDomicilio', 'honorariosTabela', 'honorariosMultiplicador', 'complexidadeExtra'];
  const honPrincipais = CAMPOS_HONORARIOS.filter(([k]) => HON_PRINCIPAIS.includes(k) && (k !== 'empresaOriginal' || c.similaridade === 'Sim' || cheio(k)));
  const honItens = CAMPOS_HONORARIOS.filter(([k]) => !HON_PRINCIPAIS.includes(k));
  const nItens = honItens.filter(([k]) => cheio(k)).length;
  return (
    <div class="grade dados-caso">
      <p class="dica largo">A extração dos autos preenche estes dados; aqui você só confere. Aparecem os campos que se aplicam a este tipo de trabalho; os vazios ficam em "＋ campos vazios".</p>
      <section class="bloco">
        <h3>Classificação</h3>
        <Sel rec={rec} k="fase" label="Fase" opcoes={FASE} vazio={false} />
        <details class="opcoes-caso" open={!c.tipoAtuacao || !c.papel}>
          <summary>{[c.tipoAtuacao, c.papel, c.justica, c.materia, (c.objeto || []).join(', ')].filter(Boolean).join(' · ') || 'Tipo e atuação'} – alterar</summary>
          <Opcoes rec={rec} k="tipoAtuacao" label="Tipo" opcoes={TIPO_ATUACAO} />
          <Opcoes rec={rec} k="papel" label="Minha atuação" opcoes={PAPEL} />
          <div class="linha2">
            <Sel rec={rec} k="justica" label="Justiça / órgão" opcoes={JUSTICA} />
            <Sel rec={rec} k="materia" label="Matéria" opcoes={MATERIA} />
          </div>
          <Chips rec={rec} k="objeto" label="Objeto da perícia (toque para marcar ou desmarcar)" opcoes={OBJETO} />
        </details>
        {extra && <>
          <Sel rec={rec} k="contratadoPor" label="Quem contratou" opcoes={CONTRATADO_POR} />
          <TF rec={rec} k="art" label="Nº da ART" />
          {(ehParecerTecnico(c) || (c.objeto || []).includes('Penosidade (motorista)')) && <Sel rec={rec} k="finalidade" label="Finalidade do parecer" opcoes={FINALIDADE_PARECER} />}
          <p class="dica">Extrajudicial: o objeto define o documento. Aposentadoria especial, LTCAT ou PPP → LTCAT e parecer previdenciário; Insalubridade ou Periculosidade → laudo de insalubridade e periculosidade; Acidente → laudo de acidente. "Parecer técnico extrajudicial" com motorista ou o objeto "Penosidade (motorista)" → parecer técnico de condições de trabalho e penosidade.</p>
        </>}
        <details class="opcoes-caso">
          <summary>Opções do caso (jurisprudência{contextoLegal(c).prev ? ', profissão, penosidade' : ''})</summary>
          <Sel rec={rec} k="jurisprudencia" label="Súmulas e jurisprudência nos documentos deste caso" opcoes={['Padrão (Meus dados)', 'Incluir', 'Não incluir']} vazio={false} />
          {contextoLegal(c).prev && <Sel rec={rec} k="profissao" label="Profissão (banco de profissões: agentes e critérios já estudados)" opcoes={PROFISSOES.map((p) => p.nome)} />}
          {contextoLegal(c).prev && <Sel rec={rec} k="penosidade" label="Avaliação de penosidade (motorista / cobrador)" opcoes={['Automático', 'Sim', 'Não']} vazio={false} />}
          {c.faseLegado && <p class="dica">Fase no app antigo: {c.faseLegado}</p>}
        </details>
      </section>
      {ehAcidente(c) && (
        <section class="bloco">
          <h3>Acidente do trabalho</h3>
          <p class="dica">Usado no laudo de acidente. Pode vir preenchido pela extração dos autos com o Claude.</p>
          <CamposCompactos rec={rec} campos={CAMPOS_ACIDENTE} sempre={['acidenteData', 'acidenteLocal']} />
        </section>
      )}
      <section class="bloco">
        <h3>{extra ? 'Identificação' : 'Processo'}</h3>
        <CamposCompactos rec={rec} campos={processo} sempre={extra ? [] : ['numero', 'juizo', 'despachoRef']} />
      </section>
      <section class="bloco">
        <h3>Partes</h3>
        <CamposCompactos rec={rec} campos={partes} sempre={['autorNome', 'reuNome']} />
        <details class="opcoes-caso"><summary>Advogados (uso interno, não saem nos documentos)</summary>
          <Campos rec={rec} campos={CAMPOS_PARTES.filter(([k]) => ['autorAdv', 'reuAdv'].includes(k))} />
        </details>
      </section>
      <section class="bloco">
        <h3>Datas e prazos</h3>
        <CamposCompactos rec={rec} campos={prazos} sempre={['dataDiligencia', 'horaDiligencia', 'prazoLaudo']} />
      </section>
      {extra && contextoLegal(c).prev && !ehParecerTecnico(c) && (
        <section class="bloco">
          <h3>PPP (LTCAT + PPP)</h3>
          <p class="dica">Quem emite o PPP e os dados administrativos do formulário. Cooperativa: o PPP sai só com os vínculos de cooperado; os demais ficam no LTCAT. Próprio segurado: contribuinte individual sem empresa.</p>
          <CamposCompactos rec={rec} campos={CAMPOS_PPP} sempre={['pppEmitente', 'pppEmitenteNome']} />
        </section>
      )}
      {c.papel === 'Perito do Juízo' && (
        <section class="bloco">
          <h3>Honorários e despacho</h3>
          <CamposCompactos rec={rec} campos={honPrincipais} sempre={['honorariosFixados', 'similaridade']} />
          <details class="opcoes-caso">
            <summary>Itens do despacho usados nas petições ({nItens} de {honItens.length} preenchidos)</summary>
            <p class="dica">Números dos itens do despacho (depósito, aceite, alvará, data da perícia, ofício, prazo do laudo): a extração dos autos preenche.</p>
            <Campos rec={rec} campos={honItens} />
          </details>
        </section>
      )}
      <div class="largo linha-botoes"><button type="button" class="mini perigo" onClick={excluir}>Mover caso para a lixeira</button></div>
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
