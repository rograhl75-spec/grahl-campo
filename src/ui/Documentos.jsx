import { useState, useEffect } from 'preact/hooks';
import { pendenciasDoCaso, marcacoesNoDocumento, trechosPendentes } from '../pendencias.js';
import { horasDia, horasForaTexto, fmtHoras } from '../calc.js';
import { avisarAlteracao } from '../sync.js';
import { confirmar } from './dialogo.jsx';
import { softDelete, createRecord, updateFields } from '../db.js';
import { RelatoriosMedicao } from './Campo.jsx';
import { Suplementares } from './Quesitos.jsx';
import { DESC_ANEXO_DOC } from '../apendices.js';
import { CATALOGO, HONORARIOS, situacaoHonorarios, PETICOES_PERITO, PETICOES_AT, POSICOES_AT } from '../docx/reports.js';
import { exportarBackup, baixarArquivo, carimbo } from '../backup.js';
import { exportarParaClaude, lerJsonIA, aplicarIA, promptPeticaoLivre } from '../aiimport.js';
import { BotaoClaudeDireto, anexosDosAutos, ModoManual } from './ClaudeDireto.jsx';
import { temClaude } from '../claudeApi.js';
import { documentoDoClaude, peticaoDoClaude, temConteudo } from '../docx/claudeDoc.js';
import { incluirVeiculoNaBase, incluirPostoNaBase, promptProfissao, lerJsonProfissao, salvarProfissao, RE_MOTORISTA } from '../basesUsuario.js';
import { ultimaRedacao, guardarRedacao, desfazerRedacao, promptAplicarCorrecoes, lerTrocas, aplicarTrocas } from '../redacao.js';
import { textoDoCaso } from '../aiimport.js';
import { gravarTudoAgora, salvar, TF, Sel } from './fields.jsx';
import { FORMAS_PAGAMENTO, localVistoria, finalidadeArtDoCaso, rotuloArt } from '../schema.js';
import { db } from '../db.js';
import { PERFIL_ID, contasDoPerfil, PERFIL_PADRAO, ehSimilaridade, empresaDoDespacho } from '../docx/base.js';
import { useLive } from './hooks.js';
import { Icone } from './Icone.jsx';

// petições (etapa 4. Petições): escolhidas numa lista, uma de cada vez
const PETICOES = ['honorarios', 'indic', 'proposta', 'agenda', 'supl', 'atAvulsa', 'pagto', 'peritoAvulsa'];
const ehPrincipal = (d) => /^4\./.test(d.grupo);

export function Documentos({ rec, modo = 'laudo' }) {
  const [ocupado, setOcupado] = useState('');
  const [msg, setMsg] = useState('');
  const [verTodos, setVerTodos] = useState(false);
  const [nPend, setNPend] = useState(null);
  const nMed = useLive(async () => (await db.records.where('[caseId+kind]').equals([rec.id, 'medicao']).toArray()).filter((r) => !r.deleted && ['lavg', 'nen', 'aren', 'vdv', 'tbn', 'valor', 'dose'].some((k) => String(r.data[k] ?? '').trim())).length, [rec.id], 0);
  const c = rec.data;

  const perfil = useLive(async () => ({ ...PERFIL_PADRAO, ...((await db.records.get(PERFIL_ID)) || { data: {} }).data }), [], PERFIL_PADRAO);
  const contas = contasDoPerfil(perfil);
  const contaSel = c.contaBancaria || (contas[0] && contas[0].id) || '';

  const gerar = async (doc) => {
    gravarTudoAgora();
    setOcupado(doc.id); setMsg('');
    try {
      const r = await doc.fn(rec.id, { conta: contaSel });
      baixarArquivo(r.blob, r.nome);
      await registrarGerado(rec, doc, r.nome, 'estrutura do app');
      // documentos que saem juntos (LTCAT + PPP)
      for (const x of r.extras || []) baixarArquivo(x.blob, x.nome);
      setMsg(`✓ ${[r.nome, ...(r.extras || []).map((x) => x.nome)].join(' e ')} ${r.extras?.length ? 'gerados' : 'gerado'}. Ao abrir no Word, confirme "Sim" para atualizar o sumário e as listas. Trechos em amarelo são para você completar.${r.faltando ? ` Atenção: ${r.faltando} foto(s) ainda não baixadas neste aparelho ficaram de fora.` : ''}${r.semRelatorios?.length ? ` Atenção: sem os relatórios de medição dos paradigmas ${r.semRelatorios.join(', ')} (arquivo não ligado, não baixado neste aparelho ou páginas não achadas) – veja a lista de pendências.` : ''}${r.semRelatoriosLgpd?.length ? ` Relatórios dos paradigmas extrajudiciais ${r.semRelatoriosLgpd.join(', ')} não incluídos (trazem nomes; marque "Relatórios sem nomes" no paradigma quando o arquivo estiver anonimizado).` : ''}`);
    } catch (e) {
      console.error(e);
      setMsg('Erro ao gerar: ' + e.message);
    } finally { setOcupado(''); }
  };
  const backupCaso = async () => {
    setOcupado('zip');
    try {
      const r = await exportarBackup({ caseId: rec.id });
      baixarArquivo(r.blob, `Caso_${(c.numero || c.autorNome || rec.id).replace(/[^\w.-]+/g, '_').slice(0, 60)}_${carimbo()}.zip`);
      setMsg(`✓ Cópia do caso exportada (${r.total} registros, ${r.fotos} fotos).`);
    } catch (e) { setMsg('Erro: ' + e.message); } finally { setOcupado(''); }
  };

  const recomendados = CATALOGO.filter((d) => d.rec(c));
  const principais = recomendados.filter(ehPrincipal);
  const peticoes = recomendados.filter((d) => PETICOES.includes(d.id));
  const outrosDoCaso = recomendados.filter((d) => !ehPrincipal(d) && !PETICOES.includes(d.id));
  const outros = CATALOGO.filter((d) => !d.rec(c));
  const props = { ocupado, gerar, contas, contaSel, recId: rec.id, rec };
  const quesitos = useLive(async () => {
    const l = (await db.records.where('[caseId+kind]').equals([rec.id, 'quesito']).toArray()).filter((r) => !r.deleted && r.data.suplementar !== 'Sim');
    return { total: l.length, sem: l.filter((r) => !String(r.data.resposta || '').trim()).length, pend: l.filter((r) => /\[\[/.test(r.data.resposta || '')).length };
  }, [rec.id], { total: 0, sem: 0, pend: 0 });

  if (modo === 'laudo') {
    if (!principais.length) return <p class="vazio">Nenhum laudo ou parecer para este tipo de caso. Confira o tipo e a sua atuação em 1. Autos → Dados do caso.</p>;
    let n = 0;
    return (
      <div class="docs etapa-laudo">
        <p class="dica largo">Siga os passos: o Word sai no seu timbrado, com quadros, fotos e anexos. O que depende da sua análise sai em amarelo.</p>
        <PassoLaudo n={++n} titulo="Relatórios dos medidores" ok={nMed > 0} status={nMed ? `${nMed} medição(ões) cadastrada(s)` : ''} dica="No escritório: anexe os relatórios exportados (DoseMax, AxPro, iTemp) e toque em “Ler as medições” – os valores do laudo (Lavg, NEN, AREN, VDVR) vêm dessas medições, como constam no relatório. Os relatórios saem no fim do laudo como apêndices.">
          <RelatoriosMedicao rec={rec} titulo="" />
        </PassoLaudo>
        <PassoLaudo n={++n} titulo="Conferir as pendências" ok={nPend === 0} status={nPend === null ? '' : nPend ? `${nPend} pendência(s)` : 'nenhuma pendência'} dica="Dados que faltam para o documento; responda aqui mesmo (grava no caso).">
          <PendenciasDoc rec={rec} onContagem={setNPend} />
        </PassoLaudo>
        {quesitos.total > 0 && (
          <PassoLaudo n={++n} titulo="Responder os quesitos" ok={!quesitos.sem && !quesitos.pend} status={[quesitos.sem && `${quesitos.sem} de ${quesitos.total} sem resposta`, quesitos.pend && `${quesitos.pend} com pendência`].filter(Boolean).join(' · ') || `${quesitos.total} respondidos`}>
            <RespostasClaude rec={rec} />
          </PassoLaudo>
        )}
        <PassoLaudo n={++n} titulo={principais.length > 1 ? 'Redigir e gerar os documentos' : `Redigir e gerar – ${principais[0].titulo}`}>
          {principais.map((d) => <CartaoDoc d={d} principal embutido={principais.length === 1} {...props} />)}
          <AplicarCorrecoes rec={rec} />
          <ModoManual>
            <p class="dica">1. Copie o caso, cole no claude.ai com os autos anexados. 2. Cole a resposta do Claude abaixo e gere o Word no timbrado.</p>
            <div class="linha-botoes">{principais.filter((d) => d.redacao).map((d) => <BotaoClaude rec={rec} tipo={d.redacao} rotulo={principais.length > 1 ? `Copiar – ${d.titulo}` : 'Copiar o caso para o claude.ai'} soCopiar />)}</div>
            <MontarDoClaude rec={rec} />
          </ModoManual>
        </PassoLaudo>
        <PassoLaudo n={++n} titulo="Conferir o documento" dica="O que ainda sairia em amarelo no Word, agrupado, com o lugar onde completar.">
          {principais.map((d) => <ConferirAmarelo rec={rec} d={d} rotulo={principais.length > 1 ? d.titulo : ''} />)}
        </PassoLaudo>
        <PassoLaudo n={++n} titulo="Levar para a base técnica" dica="Depois de concluído: o veículo ou o posto medido, a ficha da profissão e as notas normativas ficam para os próximos casos.">
          <LevarParaBase rec={rec} />
        </PassoLaudo>
        {msg && <p class="ok-msg aviso-fixo">{msg}</p>}
      </div>
    );
  }

  const geradas = [...peticoes, { id: LIVRE, titulo: 'Outra petição (Claude)' }, ...outrosDoCaso].map((d) => ({ d, g: String(c[`gerado_${d.id}`] || '').split('|') })).filter((x) => x.g[0])
    .sort((a, b) => b.g[0].localeCompare(a.g[0]));
  return (
    <div class="docs">
      {peticoes.length > 0 && <CartaoPeticoes lista={peticoes} {...props} />}
      {geradas.length > 0 && (
        <details class="secao-etapa">
          <summary><b>Já geradas neste caso</b> <span class="contador">{geradas.length}</span> <small class="dica">a mais recente: {geradas[0].d.titulo}, {new Date(geradas[0].g[0]).toLocaleDateString('pt-BR')}</small></summary>
          <ul class="lista-geradas">{geradas.map(({ d, g }) => <li><b>{d.titulo}</b> – {new Date(g[0]).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {g[1]}{g[2] ? ` (${g[2]})` : ''}</li>)}</ul>
        </details>
      )}
      {outrosDoCaso.length > 0 && (
        <details class="secao-etapa">
          <summary><b>Outros documentos do caso</b> <small class="dica">{outrosDoCaso.map((d) => d.titulo).join(' · ')}</small></summary>
          <div class="grade-docs">{outrosDoCaso.map((d) => <CartaoDoc d={d} {...props} />)}</div>
        </details>
      )}
      <details class="secao-etapa">
        <summary><b>Cópia de segurança e outros modelos</b> <small class="dica">ZIP do caso; modelos de outros tipos de trabalho ({outros.length})</small></summary>
        <div class="bloco doc">
          <p>ZIP com todos os dados e fotos originais deste caso, para guardar no Drive ou no PC.</p>
          <button type="button" disabled={!!ocupado} onClick={backupCaso}>{ocupado === 'zip' ? 'Gerando…' : 'Exportar caso (ZIP)'}</button>
        </div>
        {outros.length > 0 && (
          <section class="grupo-docs">
            <button type="button" class="sec" onClick={() => setVerTodos(!verTodos)}>{verTodos ? 'Ocultar' : 'Mostrar'} modelos de outros tipos de trabalho ({outros.length})</button>
            {verTodos && <div class="grade-docs">{outros.map((d) => <CartaoDoc d={d} {...props} />)}</div>}
          </section>
        )}
      </details>
      {msg && <p class="ok-msg aviso-fixo">{msg}</p>}
    </div>
  );
}

// petições que costumam caber em cada fase do caso (sugestão; a lista completa continua no seletor)
const SUGERIDAS_FASE = {
  'A preparar': ['honorarios', 'indic', 'proposta', 'agenda'],
  'Aguardando depósito dos honorários': ['honorarios'],
  'Diligência agendada': ['agenda', 'peritoAvulsa'],
  'Diligência realizada': ['peritoAvulsa'],
  'Laudo / parecer em elaboração': ['peritoAvulsa'],
  'Aguardando manifestação / esclarecimentos': ['supl', 'atAvulsa', 'pagto'],
  'Respondendo quesitos suplementares': ['supl', 'atAvulsa'],
  'Concluído': ['pagto'],
};

// Passo numerado da etapa 3, com o estado (✓ quando concluído)
function PassoLaudo({ n, titulo, dica, ok = false, status = '', children }) {
  return (
    <section class={`bloco largo passo-laudo ${ok ? 'passo-ok' : ''}`}>
      <h3><span class="num-passo">{ok ? '✓' : n}</span> {titulo} {status && <small class={ok ? 'ok-msg' : 'alerta-txt'}>{status}</small>}</h3>
      {dica && <p class="dica">{dica}</p>}
      {children}
    </section>
  );
}

// guarda quando e como cada documento foi gerado (aparece no cartão) e avança a fase para "em elaboração"
async function registrarGerado(rec, d, nome, como) {
  const mud = { [`gerado_${d.id}`]: `${new Date().toISOString()}|${nome}|${como}` };
  if (ehPrincipal(d) && ['', 'A preparar', 'Diligência agendada', 'Diligência realizada'].includes(rec.data.fase || '')) mud.fase = 'Laudo / parecer em elaboração';
  await updateFields(rec.id, mud); avisarAlteracao();
}
function UltimoGerado({ c, d }) {
  const [em, nome, como] = String(c[`gerado_${d.id}`] || '').split('|');
  if (!em) return null;
  return <p class="dica">Último Word: <b>{nome}</b> – {new Date(em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} ({como}).</p>;
}

// Uma petição de cada vez: escolhe na lista e o cartão mostra só os campos dela
const LIVRE = 'livre';
function CartaoPeticoes({ lista, ...props }) {
  const { rec } = props;
  const c = rec.data;
  const sugeridas = (SUGERIDAS_FASE[c.fase || 'A preparar'] || []).map((id) => lista.find((d) => d.id === id)).filter(Boolean);
  const padrao = sugeridas.find((d) => !c[`gerado_${d.id}`]) || sugeridas[0] || lista[0];
  const sel = c.peticaoSel === LIVRE ? null : lista.find((d) => d.id === c.peticaoSel) || padrao;
  const gerada = (d) => { const em = String(c[`gerado_${d.id}`] || '').split('|')[0]; return em ? ` ✓ gerada em ${new Date(em).toLocaleDateString('pt-BR')}` : ''; };
  const escolher = (id) => salvar(rec.id, 'peticaoSel', id);
  return (
    <section class="bloco largo doc-peticoes">
      <h3>Petições</h3>
      {sugeridas.length > 0 && (
        <div class="chips sugeridas"><small class="dica">Para a fase "{c.fase || 'A preparar'}":</small>
          {sugeridas.map((d) => <button type="button" class={`chip ${sel && sel.id === d.id ? 'ativo' : ''}`} onClick={() => escolher(d.id)}>{d.titulo}{c[`gerado_${d.id}`] ? ' ✓' : ''}</button>)}
          <button type="button" class={`chip ${!sel ? 'ativo' : ''}`} onClick={() => escolher(LIVRE)}>Outra (Claude)</button>
        </div>
      )}
      <label class="campo"><span class="rotulo">Qual petição?</span>
        <select value={sel ? sel.id : LIVRE} onChange={(e) => escolher(e.currentTarget.value)}>
          {lista.map((d) => <option value={d.id}>{d.titulo}{gerada(d)}</option>)}
          <option value={LIVRE}>Outra petição – redigir com o Claude (pelo despacho ou pela sua necessidade){gerada({ id: LIVRE })}</option>
        </select>
      </label>
      {sel?.id === 'supl' && <Suplementares rec={rec} />}
      {sel ? <CartaoDoc d={sel} embutido {...props} /> : <PeticaoLivre rec={rec} />}
    </section>
  );
}

// Petição fora dos modelos: o Claude redige pelo despacho (anexado ou nos autos) e/ou pelo que você descrever
function PeticaoLivre({ rec }) {
  const [md, setMd] = useState('');
  const [msg, setMsg] = useState('');
  const gerarDoTexto = async (t) => { const r = await peticaoDoClaude(rec.id, t); baixarArquivo(r.blob, r.nome); await registrarGerado(rec, { id: LIVRE, grupo: '' }, r.nome, 'redigida pelo Claude'); return r.nome; };
  const copiar = async () => {
    gravarTudoAgora();
    const t = await promptPeticaoLivre(rec.id, rec.data.peticaoLivrePedido);
    try { await navigator.clipboard.writeText(t); setMsg('✓ Instrução copiada. Cole no Claude com o despacho anexado e traga a resposta para o campo abaixo.'); }
    catch { baixarArquivo(new Blob([t], { type: 'text/markdown' }), `Peticao_para_Claude_${carimbo()}.md`); setMsg('Não foi possível copiar; a instrução foi baixada como .md.'); }
  };
  return (
    <div class="doc-embutido">
      <p class="dica">Para o que não tem modelo: resposta a despacho, manifestação, juntada de documentos, pedido de dilação, de diligência complementar, de esclarecimentos à empresa… O Claude lê os autos guardados e o despacho que você anexar, e redige a petição; o Word sai no seu timbrado, com endereçamento, processo, fecho e assinatura.</p>
      <TF rec={rec} k="peticaoLivrePedido" label="O que a petição precisa pedir ou informar (em branco: o Claude atende à última determinação dirigida a você no despacho)" area rows={3} />
      <BotaoClaudeDireto rotulo="Redigir a petição com o Claude (gera o Word)" permitirArquivos rotuloArquivos="Anexar o despacho / decisão (PDF ou foto), se não estiver nos autos guardados"
        instrucao={async () => { gravarTudoAgora(); return promptPeticaoLivre(rec.id, (await db.records.get(rec.id))?.data?.peticaoLivrePedido); }}
        anexos={() => anexosDosAutos(rec.id)}
        onResposta={async (t) => { setMd(t); return `${await gerarDoTexto(t)} gerado e baixado. Confira as pendências em amarelo.`; }} />
      <ModoManual>
        <div class="linha-botoes"><button type="button" class="sec" onClick={copiar}>Copiar instrução (claude.ai)</button></div>
        <label class="campo campo-area"><span class="rotulo">Texto da petição redigido pelo Claude</span>
          <textarea rows={6} value={md} onInput={(e) => setMd(e.currentTarget.value)} />
        </label>
        <div class="linha-botoes"><button type="button" class="primario" disabled={!temConteudo(md)} onClick={async () => { try { setMsg(`✓ ${await gerarDoTexto(md)} gerado.`); } catch (e) { setMsg(`Erro: ${e.message}`); } }}>Gerar Word da petição</button></div>
      </ModoManual>
      {msg && <p class="ok-msg">{msg}</p>}
    </div>
  );
}

// ART do caso: escolhida entre as cadastradas em Configurações → ARTs (sugestão pela finalidade do caso)
function EscolherArt({ rec }) {
  const arts = useLive(async () => (await db.records.where('kind').equals('artCad').toArray()).filter((r) => !r.deleted), [], []);
  const c = rec.data;
  const sug = finalidadeArtDoCaso(c);
  const ordem = [...arts].sort((a, b) => (b.data.finalidade === sug) - (a.data.finalidade === sug));
  const escolher = async (id) => {
    const a = arts.find((x) => x.id === id);
    await updateFields(rec.id, { artId: id || '', ...(a ? { art: a.data.numero || '' } : {}) }); avisarAlteracao();
  };
  if (!arts.length) return <p class="dica">ART: cadastre as suas ARTs (com o PDF) em Configurações → ARTs e escolha aqui a deste caso.{c.art ? ` Nº informado no caso: ${c.art}.` : ''}</p>;
  return (
    <label class="campo"><span class="rotulo">ART deste documento (o número sai no documento e o PDF, como anexo)</span>
      <select value={c.artId || ''} onChange={(e) => escolher(e.currentTarget.value)}>
        <option value="">— sem ART anexada —</option>
        {ordem.map((a) => <option value={a.id}>{rotuloArt(a)}{a.data.finalidade === sug ? ' (sugerida para este caso)' : ''}{a.data.anexoId ? '' : ' – sem PDF'}</option>)}
      </select>
    </label>
  );
}

function CartaoDoc({ d, ocupado, gerar, contas = [], contaSel, recId, rec, principal = false, embutido = false }) {
  return (
    <div class={`${embutido ? 'doc-embutido' : 'bloco doc'} ${principal ? 'doc-principal' : ''}`}>
      {!embutido && <h4>{d.titulo}</h4>}
      <p class="dica">{d.desc}</p>
      {d.usaConta && (contas.length ? (
        <label class="campo"><span class="rotulo">Conta para os honorários</span>
          <select value={contaSel} onChange={(e) => salvar(recId, 'contaBancaria', e.currentTarget.value)}>
            {contas.map((ct) => <option value={ct.id}>{ct.rotulo}</option>)}
          </select>
        </label>
      ) : <p class="alerta-txt">Cadastre as contas em Configurações → Meus dados.</p>)}
      {d.id === 'agenda' && rec && <DadosAgendamento rec={rec} />}
      {/* anexos (ART etc.): em todo documento principal do passo "Redigir e gerar" e nos que já os usavam */}
      {(principal || ['ltcat', 'laudoprev', 'parprev'].includes(d.id)) && rec && (
        <EscolherArt rec={rec} />
      )}
      {(principal || ['ltcat', 'laudoprev', 'parprev'].includes(d.id)) && rec && (
        <details class="anexos-doc">
          <summary>Outros anexos do documento (CNIS, certidões, declarações)</summary>
          <RelatoriosMedicao rec={rec} desc={DESC_ANEXO_DOC} rotulo="Anexo" titulo="Anexos do documento"
            dica="Anexe aqui a ART e os documentos de terceiros (PDF ou imagem). Cada arquivo sai no fim do documento, com todas as páginas, como Anexo A, B, C… (no laudo judicial, Anexo II, III…, depois do relatório fotográfico)."
            botao="＋ Anexar documento (PDF ou imagem)" />
        </details>
      )}
      {d.id === 'honorarios' && rec && <>
        <label class="campo"><span class="rotulo">Situação</span>
          <select value={situacaoHonorarios(rec.data)} onChange={(e) => salvar(rec.id, 'honorariosSituacao', e.currentTarget.value)}>
            {HONORARIOS.map((o) => <option value={o}>{o}</option>)}
          </select>
        </label>
        {situacaoHonorarios(rec.data) === HONORARIOS[2] && <Sel rec={rec} k="honorariosForma" label="Forma de pagamento (conforme o despacho)" opcoes={FORMAS_PAGAMENTO} />}
      </>}
      {d.id === 'peritoAvulsa' && rec && <>
        <Sel rec={rec} k="peticaoPerito" label="Petição" opcoes={PETICOES_PERITO} vazio={false} />
        {(rec.data.peticaoPerito || PETICOES_PERITO[0]) === PETICOES_PERITO[0] && <TF rec={rec} k="prorrogacaoDias" label="Prorrogação pedida (dias) – em branco = metade do prazo original" inputMode="numeric" />}
        <TF rec={rec} k="peticaoMotivo" label="Motivo / o que ocorreu" area rows={3} />
      </>}
      {d.id === 'atAvulsa' && rec && <>
        <Sel rec={rec} k="peticaoAT" label="Petição" opcoes={PETICOES_AT} vazio={false} />
        {rec.data.peticaoAT === PETICOES_AT[2] && <Sel rec={rec} k="posicaoAT" label="Posição sobre o laudo e os esclarecimentos" opcoes={POSICOES_AT} />}
      </>}
      {d.id === 'proposta' && rec && <>
        <div class="linha2">
          <TF rec={rec} k="propostaValor" label="Valor (R$)" inputMode="decimal" />
          <TF rec={rec} k="propostaPrazo" label="Prazo de entrega (dias após a vistoria)" inputMode="numeric" />
        </div>
        <TF rec={rec} k="propostaPagamento" label="Forma de pagamento (ex.: 50% no aceite e 50% na entrega)" />
        <TF rec={rec} k="propostaDeslocamento" label="Deslocamento (ex.: incluso no valor / cobrado à parte a R$ 1,20 por km)" />
      </>}
      {d.id === 'parecerAT' && rec && <Sel rec={rec} k="posicaoAT" label="Posição sobre o laudo" opcoes={POSICOES_AT} />}
      {rec && <UltimoGerado c={rec.data} d={d} />}
      <div class="linha-botoes">
        {d.redacao && rec && temClaude() && <BotaoClaude rec={rec} tipo={d.redacao} soDireto cartao={d} />}
        <button type="button" class={d.redacao && temClaude() ? 'sec' : 'primario'} disabled={!!ocupado} onClick={() => gerar(d)}>{ocupado === d.id ? 'Gerando…' : d.redacao && temClaude() ? 'Gerar Word (estrutura e quadros, sem o Claude)' : 'Gerar Word'}</button>
      </div>
      {d.redacao && rec && !principal && <ModoManual><BotaoClaude rec={rec} tipo={d.redacao} soCopiar /></ModoManual>}
      {d.id === 'agenda' && rec && <LinkAgenda c={rec.data} />}
    </div>
  );
}

// Dados da vistoria para a petição de agendamento: empresa, CNPJ (com busca do endereço), endereço, data e horário
function DadosAgendamento({ rec }) {
  const c = rec.data;
  const [msg, setMsg] = useState('');
  const buscar = async () => {
    const cnpj = String(c.vistoriaCnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14) { setMsg('Informe o CNPJ completo (14 dígitos).'); return; }
    setMsg('Buscando…');
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!r.ok) throw new Error(r.status === 404 ? 'CNPJ não encontrado' : `erro ${r.status}`);
      const j = await r.json();
      const cep = String(j.cep || '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
      const end = [[j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' '), j.numero, j.complemento].filter((x) => x && String(x).trim()).join(', ');
      const linha2 = [j.bairro, `${j.municipio || ''}/${j.uf || ''}`, cep && `CEP ${cep}`].filter(Boolean).join(' – ');
      gravarTudoAgora();
      if (!String(c.vistoriaLocal || '').trim()) await salvar(rec.id, 'vistoriaLocal', j.razao_social || j.nome_fantasia || '');
      await salvar(rec.id, 'vistoriaEndereco', `${end}\n${linha2}`);
      setMsg(`✓ ${j.razao_social || ''}${j.descricao_situacao_cadastral ? ` – situação: ${j.descricao_situacao_cadastral}` : ''}. Confira o endereço.`);
    } catch (e) { setMsg(`Não foi possível buscar (${e.message}). Digite o endereço.`); }
  };
  // por similaridade a vistoria é na empresa paradigma, não na empregadora original
  const simil = ehSimilaridade(c);
  const empresas = [...new Set([empresaDoDespacho(c), !simil && c.reuNome && !/INSS|Instituto Nacional/i.test(c.reuNome) ? c.reuNome : ''].filter(Boolean))];
  return (
    <div class="dados-agenda">
      <TF rec={rec} k="vistoriaLocal" label={simil ? 'Empresa da vistoria (paradigma – perícia por similaridade)' : 'Empresa da vistoria'} />
      {!String(c.vistoriaLocal || '').trim() && empresas.length > 0 && (
        <div class="chips"><small class="dica">Dos autos:</small>{empresas.map((e) => <button type="button" class="chip" onClick={() => salvar(rec.id, 'vistoriaLocal', e)}>{e}</button>)}</div>
      )}
      <TF rec={rec} k="vistoriaProprietario" label="Ou: proprietário pessoa física (nome completo) – quando não há empresa" />
      {String(c.vistoriaProprietario || '').trim() && <small class="dica">Com o proprietário preenchido, a petição usa o nome dele e ignora o campo de empresa acima.</small>}
      {String(c.vistoriaProprietario || '').trim() && <>
        <TF rec={rec} k="vistoriaVeiculo" label="Veículo / equipamento paradigma (marca, modelo, ano)" />
        <TF rec={rec} k="vistoriaContato" label="Telefone / contato do proprietário" />
      </>}
      <div class="com-botao"><TF rec={rec} k="vistoriaCnpj" label="CNPJ (para buscar o endereço)" inputMode="numeric" />
        <button type="button" class="mini" onClick={buscar}><Icone nome="busca" /> Buscar</button></div>
      <TF rec={rec} k="vistoriaEndereco" label="Endereço (rua, nº – bairro – cidade/UF – CEP)" area rows={2} />
      <div class="linha2">
        <TF rec={rec} k="dataDiligencia" label="Data da vistoria" type="date" />
        <TF rec={rec} k="horaDiligencia" label="Horário" type="time" />
      </div>
      {msg && <small class="dica">{msg}</small>}
    </div>
  );
}

// Evento no Google Agenda (abre a tela de criação já preenchida; você confere e salva)
function LinkAgenda({ c }) {
  if (!c.dataDiligencia || !c.horaDiligencia) return <small class="dica">Com data e horário preenchidos, aparece aqui o botão para criar o evento no Google Agenda.</small>;
  const ini = `${c.dataDiligencia.replace(/-/g, '')}T${c.horaDiligencia.replace(':', '')}00`;
  // duração de 1 h 30 min
  const [h, m] = c.horaDiligencia.split(':').map(Number);
  const tf = Math.min(23 * 60 + 59, h * 60 + m + 90);
  const fim = `${c.dataDiligencia.replace(/-/g, '')}T${String(Math.floor(tf / 60)).padStart(2, '0')}${String(tf % 60).padStart(2, '0')}00`;
  const local = [localVistoria(c), String(c.vistoriaEndereco || '').replace(/\n/g, ' – ')].filter(Boolean).join(' – ');
  const det = [`Vistoria pericial – processo ${c.numero || ''}`, c.autorNome && `Autor: ${c.autorNome}`, c.reuNome && `Réu: ${c.reuNome}`,
    c.similaridade === 'Sim' && 'Perícia por similaridade', 'Levar: dosímetro, medidor de vibração, IBUTG, calibrador, trena, câmera.'].filter(Boolean).join('\n');
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Vistoria pericial – ${localVistoria(c) || c.autorNome || c.numero || ''}`)}&dates=${ini}/${fim}&ctz=America/Sao_Paulo&location=${encodeURIComponent(local)}&details=${encodeURIComponent(det)}`;
  return <a class="botao sec" href={url} target="_blank" rel="noopener"><Icone nome="agenda" /> Agendar no Google Agenda</a>;
}

// "Redigir com o Claude": copia o caso inteiro com a instrução de redação do documento do cartão
function BotaoClaude({ rec, tipo, rotulo = 'Redigir com o Claude', soDireto = false, soCopiar = false, cartao = null }) {
  const [msg, setMsg] = useState('');
  const copiar = async () => {
    gravarTudoAgora();
    const texto = await exportarParaClaude(rec.id, tipo);
    try {
      await navigator.clipboard.writeText(texto);
      // respostas dos quesitos: o Claude devolve um JSON, que volta pela etapa 1. Autos (não pelo "Montar no timbrado")
      setMsg(tipo === 'respostas'
        ? `✓ Caso copiado (${Math.round(texto.length / 1000)} mil caracteres). Cole no Claude e anexe os autos. Ele devolve um JSON com as respostas: copie-o e cole na etapa 1. Autos → B ("Extrair os dados dos autos com o Claude"), no campo "Resposta da IA (JSON)"; toque em "Ler e mostrar prévia" e "Aplicar ao caso".`
        : `✓ Caso copiado (${Math.round(texto.length / 1000)} mil caracteres). Cole no Claude e anexe os autos. Depois, cole a resposta em "Montar no timbrado" para gerar o Word no seu padrão.`);
    } catch (e) {
      baixarArquivo(new Blob([texto], { type: 'text/markdown' }), `Caso_para_Claude_${carimbo()}.md`);
      setMsg('Não foi possível copiar; o texto foi baixado como arquivo .md para anexar no Claude.');
    }
  };
  // envio direto pela API: respostas dos quesitos → aplicadas ao caso; documento → Word no timbrado
  const responder = async (t) => {
    if (tipo === 'respostas' || tipo === 'respostasPendentes') {
      const dados = lerJsonIA(t);
      const r = await aplicarIA(rec.id, dados, { substituir: false, criarPeriodos: false, refazerPendentes: tipo === 'respostasPendentes' });
      avisarAlteracao();
      return tipo === 'respostasPendentes'
        ? `${r.respostas} resposta(s) refeita(s) com os dados atuais. Confira em 1. Autos → Quesitos; o que ainda faltar continua em amarelo.`
        : `${r.respostas} resposta(s) preenchida(s) nos quesitos em branco (as já escritas ficaram como estavam). Confira em 1. Autos → Quesitos antes de gerar o laudo.`;
    }
    const doc = await documentoDoClaude(rec.id, t);
    baixarArquivo(doc.blob, doc.nome);
    await guardarRedacao(rec.id, t, { origem: 'Claude', doc: cartao?.id || tipo }); // para aplicar correções depois, sem redigir de novo
    if (cartao) await registrarGerado(rec, cartao, doc.nome, 'redigido pelo Claude');
    return `${doc.nome} gerado no timbrado e baixado. Confira no passo seguinte o que ainda sai em amarelo.`;
  };
  return <>
    {!soCopiar && <BotaoClaudeDireto rotulo={tipo === 'respostas' ? 'Responder os quesitos com o Claude' : tipo === 'respostasPendentes' ? (rotulo || 'Refazer as respostas com pendência') : 'Redigir com o Claude (gera o Word)'}
      instrucao={async () => { gravarTudoAgora(); return exportarParaClaude(rec.id, tipo); }} anexos={() => anexosDosAutos(rec.id)}
      permitirArquivos rotuloArquivos="Anexar outros documentos (opcional)" onResposta={responder} />}
    {!soDireto && <button type="button" class="sec" onClick={copiar}>{temClaude() ? `${rotulo} (copiar para o claude.ai)` : rotulo}</button>}
    {msg && <p class="ok-msg">{msg}</p>}
  </>;
}

// Respostas de todos os quesitos num JSON, que volta para o app e preenche só as respostas em branco
function RespostasClaude({ rec }) {
  const q = useLive(async () => {
    const l = (await db.records.where('[caseId+kind]').equals([rec.id, 'quesito']).toArray()).filter((r) => !r.deleted && r.data.suplementar !== 'Sim');
    return { sem: l.filter((r) => !String(r.data.resposta || '').trim()).length, pend: l.filter((r) => /\[\[/.test(r.data.resposta || '')).length };
  }, [rec.id], { sem: 0, pend: 0 });
  if (!q.sem && !q.pend) return <p class="ok-msg">✓ Todos os quesitos respondidos, sem pendência.</p>;
  return (
    <div class="bloco-interno">
      {q.sem > 0 && <>
        <p class="dica">O Claude responde os quesitos em branco com os dados do caso e os autos; as respostas já escritas ficam como estão. Confira em 1. Autos → Quesitos.</p>
        {temClaude() && <BotaoClaude rec={rec} tipo="respostas" soDireto />}
      </>}
      {q.pend > 0 && <>
        <p class="alerta-txt">{q.pend} resposta(s) com [[pendência]] – escritas antes de o caso ter todos os dados (medições, relatórios, entrevista).</p>
        <p class="dica">O Claude refaz só essas respostas com os dados atuais; as demais não mudam. O que realmente não estiver no caso continua como pendência, uma vez só.</p>
        <QuesitosPendentes rec={rec} />
        {temClaude() && <BotaoClaude rec={rec} tipo="respostasPendentes" rotulo={`Refazer as ${q.pend} resposta(s) com pendência`} soDireto />}
      </>}
      <ModoManual>
        <ol class="passos">
          <li>Toque em <b>Copiar caso para responder os quesitos</b> e cole numa conversa nova no Claude, com os autos anexados.</li>
          <li>Copie a resposta (o bloco que começa com <code>{'{'}</code>) e cole em <b>1. Autos → B</b>, no campo <b>Resposta da IA (JSON)</b>; toque em <b>Ler e mostrar prévia</b> e <b>Aplicar ao caso</b>.</li>
        </ol>
        <BotaoClaude rec={rec} tipo="respostas" rotulo="Copiar caso para responder os quesitos" soCopiar />
      </ModoManual>
    </div>
  );
}

// Só os quesitos com [[pendência]]: o que falta em cada um e a resposta para corrigir ali mesmo
function QuesitosPendentes({ rec }) {
  const [abertos, setAbertos] = useState(null); // ids fixos enquanto edita (a resposta corrigida não some da lista)
  const lista = useLive(async () => (await db.records.where('[caseId+kind]').equals([rec.id, 'quesito']).toArray())
    .filter((r) => !r.deleted && r.data.suplementar !== 'Sim').sort(byOrdem), [rec.id], []);
  const pend = lista.filter((r) => /\[\[/.test(r.data.resposta || ''));
  const ids = abertos || pend.map((r) => r.id);
  const itens = lista.filter((r) => ids.includes(r.id));
  if (!itens.length) return null;
  return (
    <details class="pend-quesitos" onToggle={(e) => { if (e.currentTarget.open && !abertos) setAbertos(pend.map((r) => r.id)); }}>
      <summary>Ver só os quesitos pendentes e o que falta em cada um</summary>
      {itens.map((r) => {
        const tr = trechosPendentes(r.data.resposta);
        const texto = String(r.data.texto || '').replace(/\s+/g, ' ');
        return (
          <div key={r.id} class="pend-quesito">
            <p><b>{r.data.origem || 'Quesito'}{r.data.numero ? ` – ${r.data.numero}` : ''}</b>{tr.length ? '' : ' ✓ sem pendência'}: {texto.slice(0, 220)}{texto.length > 220 ? '…' : ''}</p>
            {tr.length > 0 && <ul class="pend-trechos">{tr.map((t, i) => <li key={i}><mark>{t}</mark></li>)}</ul>}
            <TF rec={r} k="resposta" label="Resposta (complete o dado e apague os [[ ]] da pendência resolvida)" area rows={Math.min(14, Math.max(4, Math.ceil(String(r.data.resposta || '').length / 100)))} />
          </div>
        );
      })}
    </details>
  );
}
const byOrdem = (a, b) => (parseFloat(a.data.numero) || 0) - (parseFloat(b.data.numero) || 0) || String(a.data.origem || '').localeCompare(String(b.data.origem || ''));

// Caso concluído → bases técnicas: veículo avaliado (motorista) ou posto medido, ficha da profissão, notas normativas
function LevarParaBase({ rec }) {
  const dados = useLive(async () => {
    const filhos = (k) => db.records.where('[caseId+kind]').equals([rec.id, k]).toArray().then((l) => l.filter((r) => !r.deleted));
    const [postos, medicoes, periodos] = await Promise.all([filhos('posto'), filhos('medicao'), filhos('periodo')]);
    const equip = (await db.records.where('kind').equals('equip').toArray()).filter((e) => !e.deleted);
    return { postos, medicoes, periodos, equip };
  }, [rec.id], null);
  const [msg, setMsg] = useState('');
  if (!dados) return null;
  const motorista = RE_MOTORISTA.test(`${rec.data.funcoes || ''} ${dados.periodos.map((r) => `${r.data.cargo || ''} ${r.data.atividades || ''}`).join(' ')}`);
  const comValor = (m) => ['lavg', 'nen', 'dose', 'aren', 'vdv', 'tbn', 'tg', 'ibutgLido', 'valor'].some((k) => String(m.data[k] ?? '').trim());
  const postos = dados.postos.map((p) => ({ p, meds: dados.medicoes.filter((m) => m.data.postoId === p.id && comValor(m)) })).filter((x) => x.meds.length);
  const incluir = async ({ p, meds }) => {
    const r = motorista && meds.some((m) => /^Ru[íi]do|corpo inteiro/i.test(m.data.agente || ''))
      ? await incluirVeiculoNaBase(rec, p, meds, dados.equip) : await incluirPostoNaBase(rec, p, meds, dados.equip);
    avisarAlteracao();
    setMsg(r.kind === 'paradigma'
      ? `✓ Veículo incluído em Bases técnicas → Veículos como ${r.data.codigo} (situação "Revisar"): confira marca, modelo, família e cabine.`
      : '✓ Posto incluído em Bases técnicas → Postos de trabalho (situação "Revisar"): complete o ramo e confira os resultados.');
  };
  return (
    <div class="bloco-interno">
      <p class="dica"><b>Medições do caso</b> {motorista ? '– veículo avaliado vai para Veículos (ruído e VCI num registro só)' : '– posto medido vai para Postos de trabalho'}</p>
      {!postos.length && <p class="vazio">Nenhum posto com medição neste caso.</p>}
      {postos.map((x) => (
        <div class="linha-botoes" key={x.p.id}>
          <span class="cresce"><b>{x.p.data.nome || 'Posto'}</b> <small class="suave">{[...new Set(x.meds.map((m) => m.data.agente))].join(', ')}</small></span>
          {x.p.data.baseId ? <small class="ok-msg">✓ já na base</small> : <button type="button" class="sec" onClick={() => incluir(x)}>Incluir na base</button>}
        </div>
      ))}
      <p class="dica"><b>Ficha da profissão</b> – o Claude monta a ficha genérica (sem nomes do caso) com CBO, profissiografia, agentes por época, roteiro de entrevista e documentos; ela passa a aparecer em Bases técnicas → Profissões e nos próximos casos.</p>
      <BotaoClaudeDireto rotulo="Criar a ficha da profissão com o Claude" sec maxTokens={16000}
        instrucao={async () => { gravarTudoAgora(); const red = await ultimaRedacao(rec.id); return promptProfissao(await textoDoCaso(rec.id), red?.data?.md || ''); }}
        onResposta={async (t) => { const o = lerJsonProfissao(t); const r = await salvarProfissao(o, rec.id); avisarAlteracao(); return `Ficha "${o.nome}" ${r.atualizada ? 'atualizada' : 'criada'} em Bases técnicas → Profissões (${(o.agentes || []).length} agente(s)). Revise antes de usar.`; }} />
      <p class="dica"><b>Notas normativas</b> – as interpretações que você aplica (faixas, critérios) ficam em <a href="#/paradigmas/notas">Bases técnicas → Notas do signatário</a> e vão ao Claude em toda redação.</p>
      {msg && <p class="ok-msg">{msg}</p>}
    </div>
  );
}

// Correções da auditoria sobre o último texto redigido: o Claude devolve só as trocas; o app aplica, guarda a
// versão anterior (desfazer) e gera o Word de novo – o resto do laudo não muda
function AplicarCorrecoes({ rec }) {
  const red = useLive(() => ultimaRedacao(rec.id), [rec.id], null);
  const [correcoes, setCorrecoes] = useState('');
  const [msg, setMsg] = useState('');
  const [falhas, setFalhas] = useState([]);
  const [colado, setColado] = useState('');
  if (!red) return null;
  const quando = new Date(red.data.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const gerar = async (md) => {
    const r = await documentoDoClaude(rec.id, md);
    baixarArquivo(r.blob, r.nome);
    return r.nome;
  };
  const aplicar = async (t) => {
    const { trocas, naoAplicadas } = lerTrocas(t);
    const res = aplicarTrocas(red.data.md, trocas);
    setFalhas([...res.falhas.map((x) => `"${String(x.buscar).slice(0, 90)}…" – ${x.motivo}`), ...naoAplicadas.map((x) => `não aplicada pelo Claude: ${x}`)]);
    if (!res.feitas.length) return 'Nenhuma troca pôde ser aplicada; o texto e o Word não mudaram.';
    await guardarRedacao(rec.id, res.md, { origem: 'correções aplicadas' });
    const nome = await gerar(res.md);
    return `${res.feitas.length} de ${trocas.length} troca(s) aplicada(s); ${nome} gerado de novo.${res.falhas.length || naoAplicadas.length ? ' Veja abaixo o que não foi aplicado.' : ''}`;
  };
  return (
    <details class="mt">
      <summary><b>Aplicar correções ao último texto</b> <small class="suave">– redigido em {quando} ({red.data.origem})</small></summary>
      <p class="dica">Cole a lista de correções (da auditoria ou suas). O Claude devolve só as trocas, e o app as aplica ao texto guardado e gera o Word de novo: o resto do laudo não muda. Depois, confira e complete o que sair em amarelo.</p>
      <label class="campo campo-area"><span class="rotulo">Correções a aplicar</span>
        <textarea rows={6} value={correcoes} onInput={(e) => setCorrecoes(e.currentTarget.value)} placeholder={'Ex.:\n1. Item 6.2: trocar "a posição técnica do perito é a seguinte" por "conclui-se tecnicamente o seguinte".\n2. Período do forno elétrico: "não avaliado (sem medição representativa)" em vez de "não caracteriza", em todo o laudo.'} /></label>
      {correcoes.trim().length > 10 && <BotaoClaudeDireto rotulo="Aplicar as correções e gerar o Word" maxTokens={32000} permitirArquivos rotuloArquivos="Anexar a lista de correções (PDF ou texto)"
        instrucao={async () => { gravarTudoAgora(); return promptAplicarCorrecoes(red.data.md, correcoes, await textoDoCaso(rec.id)); }}
        onResposta={(t) => aplicar(t).then((m) => { setMsg(m); return m; })} />}
      <div class="linha-botoes">
        <button type="button" class="sec" onClick={async () => { setMsg(`✓ ${await gerar(red.data.md)} gerado de novo com o último texto.`); }}>Gerar o Word do último texto</button>
        {red.data.anterior && <button type="button" class="sec" onClick={async () => { await desfazerRedacao(rec.id); setMsg('✓ Voltou ao texto anterior (gere o Word de novo para baixar).'); }}>Desfazer as últimas correções</button>}
        <button type="button" class="sec" onClick={() => baixarArquivo(new Blob([red.data.md], { type: 'text/markdown' }), `Texto_do_laudo_${carimbo()}.md`)}>Baixar o texto (.md)</button>
      </div>
      <ModoManual>
        <p class="dica">Sem a chave de API: copie a instrução, cole no claude.ai e cole aqui o JSON que ele devolver.</p>
        <button type="button" class="sec" disabled={correcoes.trim().length <= 10} onClick={async () => { await navigator.clipboard.writeText(promptAplicarCorrecoes(red.data.md, correcoes, await textoDoCaso(rec.id))); setMsg('✓ Instrução copiada.'); }}>Copiar a instrução de correção</button>
        <textarea rows={4} value={colado} onInput={(e) => setColado(e.currentTarget.value)} placeholder='{"trocas": [...]}' />
        <button type="button" class="sec" disabled={!colado.trim()} onClick={async () => { try { setMsg(await aplicar(colado)); } catch (e) { setMsg(`Erro: ${e.message}`); } }}>Aplicar o JSON colado</button>
      </ModoManual>
      {msg && <p class="ok-msg">{msg}</p>}
      {falhas.length > 0 && <div class="evidencias alerta"><b>Não aplicado (corrija no Word ou peça de novo):</b><ul>{falhas.map((x) => <li>{x}</li>)}</ul></div>}
    </details>
  );
}

// Texto redigido pelo Claude → Word no timbrado (capa, sumário, quadros, fluxos, fontes e assinatura do padrão)
function MontarDoClaude({ rec }) {
  const [md, setMd] = useState('');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const gerarWord = async () => {
    setOcupado(true); setMsg('');
    try {
      const r = await documentoDoClaude(rec.id, md);
      baixarArquivo(r.blob, r.nome);
      await guardarRedacao(rec.id, md, { origem: 'colado do claude.ai' });
      const junto = [r.nFotos && `${r.nFotos} foto(s) no Anexo I`, r.nAnexos && `${r.nAnexos} anexo(s)`, r.nApendices && `${r.nApendices} apêndice(s)`].filter(Boolean).join(', ');
      setMsg(`✓ ${r.nome} gerado no timbrado${junto ? `, com ${junto}` : ''}.${r.falhasApendice ? ` ${r.falhasApendice} arquivo(s) não puderam ser lidos – confira em Campo → Relatórios e em Configurações → Equipamentos.` : ''} Confira as pendências em amarelo.`);
    } catch (e) { setMsg(`Erro: ${e.message || e}`); } finally { setOcupado(false); }
  };
  return (
    <section class="grupo-docs">
      <div>
        <p class="dica">O app monta o Word com a moldura da GRAHL, capa, sumário, listas, quadros e fluxos numerados, fontes do padrão e assinatura.</p>
        <label class="campo campo-area"><span class="rotulo">Resposta do Claude (texto completo)</span>
          <textarea rows={8} value={md} onInput={(e) => setMd(e.currentTarget.value)} placeholder={'Título: LAUDO TÉCNICO PERICIAL\n\n# 1 Identificação\n...\n\nQuadro: Resultados\n| Agente | Resultado |\n|---|---|\n| Ruído | 88,4 dB(A) |\nFonte: Elaborado pelo signatário.'} />
        </label>
        <div class="linha-botoes">
          <button type="button" class="primario" disabled={ocupado || !temConteudo(md)} onClick={gerarWord}>{ocupado ? 'Montando…' : 'Gerar Word no timbrado'}</button>
          {md && <button type="button" class="sec" onClick={() => setMd('')}>Limpar</button>}
        </div>
        {msg && <p class="ok-msg">{msg}</p>}
      </div>
    </section>
  );
}

// Pendências antes de gerar, enxutas: um grupo por linha (com a contagem), aberto só quando tocado; os quesitos
// sem resposta não viram dezenas de caixas – ficam no "Responder os quesitos" logo abaixo
function PendenciasDoc({ rec, onContagem }) {
  const [itens, setItens] = useState(null);
  const [ver, setVer] = useState(0);
  const [abertos, setAbertos] = useState({});
  useEffect(() => { let vivo = true; pendenciasDoCaso(rec.id).then((x) => vivo && setItens(x)).catch((e) => vivo && setItens({ erro: e.message })); return () => { vivo = false; }; }, [rec.id, ver]);
  const responder = async (alvo, campo, valor) => { if (alvo) await salvar(alvo, campo, valor); avisarAlteracao(); setVer((v) => v + 1); };
  if (!itens) return <div class="pendencias"><p class="dica">Conferindo as pendências…</p></div>;
  if (itens.erro) return <div class="pendencias"><p class="erro-msg">{itens.erro}</p></div>;
  const lista = itens.filter((i) => i.grupo !== 'Quesitos sem resposta');
  const grupos = [...new Set(lista.map((i) => i.grupo))];
  const abertas = lista.filter((i) => !i.respondido).length;
  if (onContagem) queueMicrotask(() => onContagem(abertas));
  const alternar = (g) => setAbertos((a) => ({ ...a, [g]: !a[g] }));
  return (
    <div class="pendencias">
      {!abertas && lista.length > 0 && <p class="dica">As respostas dadas ficam nos grupos abaixo, para conferir.</p>}
      {grupos.map((g) => {
        const doGrupo = lista.filter((i) => i.grupo === g);
        const n = doGrupo.filter((i) => !i.respondido).length;
        const aberto = abertos[g] ?? (abertas <= 3 && n > 0);
        return (
          <div class="pend-grupo" key={g}>
            <button type="button" class="pend-grupo-tit" onClick={() => alternar(g)} aria-expanded={aberto}>
              {aberto ? '▾' : '▸'} {g} {n ? <span class="contador">{n}</span> : <span class="contador ok">✓</span>}
              {!aberto && <small class="dica"> – {doGrupo.map((i) => i.titulo).filter((t, k, a) => a.indexOf(t) === k).slice(0, 3).join('; ')}</small>}
            </button>
            {aberto && doGrupo.map((it) => <ItemPendencia key={it.id} it={it} responder={responder} />)}
          </div>
        );
      })}
    </div>
  );
}

// O que ainda sairia em amarelo no documento: trechos agrupados pela seção, com o atalho para onde se corrige
const ONDE_CORRIGIR = [
  [/PENOSIDADE|PERNOITE|ENTREVISTA/i, 'campo', '2. Campo → Entrevista do segurado – vínculos (toque no vínculo: pernoite, fatores e conclusão da penosidade)'],
  [/QUESITO/i, 'quesitos', '1. Autos → Quesitos (ou "Refazer as respostas com pendência", no passo 3)'],
  [/DILIG|VISTORIA|INSTRUMENTO|MEDI[ÇC]|RESULTADO|RU[ÍI]DO|VIBRA/i, 'campo', '2. Campo (diligência, postos e medições)'],
  [/V[ÍI]NCULO|PER[ÍI]ODO|AMBIENTE|PROFISSIOGRAFIA|PENOSIDADE|VE[ÍI]CULO|ATIVIDADE/i, 'autos', '1. Autos (vínculos, veículo e entrevista)'],
  [/IDENTIFICA|PROCESSO|OBJETIVO|DESPACHO|HONOR/i, 'cadastro', '1. Autos → Dados do caso'],
];
function ConferirAmarelo({ rec, d, rotulo = '' }) {
  const [marcas, setMarcas] = useState(null);
  const [busy, setBusy] = useState(false);
  const conferir = async () => { gravarTudoAgora(); setBusy(true); try { setMarcas(await marcacoesNoDocumento(() => d.fn(rec.id, {}))); } finally { setBusy(false); } };
  const secoes = marcas ? [...new Set(marcas.map((m) => m.secao || 'Outros trechos'))] : [];
  return (
    <div class="conferir-amarelo">
      <div class="linha-botoes"><button type="button" class="sec" disabled={busy} onClick={conferir}>{busy ? 'Conferindo…' : `Ver o que ainda sai em amarelo${rotulo ? ` – ${rotulo}` : ''}`}</button></div>
      {marcas && (marcas.length ? (
        <div class="pend-marcas">
          <small class="dica">{marcas.reduce((s, m) => s + m.n, 0)} trecho(s) em amarelo, em {secoes.length} seção(ões):</small>
          {secoes.map((sec) => {
            const lista = marcas.filter((m) => (m.secao || 'Outros trechos') === sec);
            const alvo = ONDE_CORRIGIR.find(([re]) => re.test(sec));
            return (
              <details class="pend-secao" open={secoes.length <= 3}>
                <summary><b>{sec}</b> <span class="contador">{lista.reduce((s, m) => s + m.n, 0)}</span>
                  {alvo && <> – corrigir em <a href={`#/caso/${encodeURIComponent(rec.id)}/${alvo[1]}`}>{alvo[2]}</a></>}</summary>
                <ul>{lista.map((m) => <li key={m.texto}>{m.n > 1 && <span class="contador">{m.n}×</span>} {m.texto}{m.quesitos?.length ? <small class="dica"> – {m.quesitos.join(', ')}</small> : ''}</li>)}</ul>
              </details>
            );
          })}
        </div>
      ) : <p class="ok-msg">✓ O documento sai sem trechos em amarelo.</p>)}
    </div>
  );
}

function ItemPendencia({ it, responder }) {
  const [txt, setTxt] = useState(it.valor || it.sugestao || '');
  // campo de horas: o que o app entendeu do texto (horas fora da direção ou de condução)
  const lerH = (t) => (it.campo === 'foraDirecaoH' ? horasForaTexto(t) : horasDia(t));
  const h = it.tipo === 'numero' ? lerH(txt) : NaN;
  // Sim / Não: grava a escolha (num vínculo ou em todos) e limpa o texto próprio, para valer o texto padrão
  const escolherSimNao = async (valor) => {
    for (const alvo of it.alvos || [it.rec]) {
      if (it.limpar) await salvar(alvo, it.limpar, '');
      await responder(alvo, it.campo, valor);
    }
  };
  const salvarTxt = () => {
    const t = String(txt).trim();
    if (!t) return;
    if (it.tipo === 'numero') { if (isFinite(h)) responder(it.rec, it.campo, String(h).replace('.', ',')); return; }
    responder(it.rec, it.campo, t);
  };
  return (
    <div class="pend-item">
      <div class="pend-tit">{it.titulo}</div>
      {it.explicacao && <small class="dica">{it.explicacao}</small>}
      {it.previa && <ul class="pend-previa">{it.previa.map((l) => <li>{l}</li>)}</ul>}
      {it.tipo === 'numero' && (
        <div class="com-botao">
          <label class="campo"><span class="rotulo">Horas</span><input inputMode="decimal" value={txt} onInput={(e) => setTxt(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && salvarTxt()} /></label>
          <button type="button" class="mini" disabled={String(txt).trim() !== '' && !isFinite(h)} onClick={salvarTxt}>Salvar</button>
        </div>
      )}
      {it.tipo === 'numero' && String(txt).trim() && (isFinite(h)
        ? <small class="dica">O app entendeu: <b>{fmtHoras(h)}</b>{it.campo === 'foraDirecaoH' ? ' por dia fora da direção' : ' por dia'}.</small>
        : <small class="erro-msg">Não entendi um número de horas. Digite só o número (ex.: 5 ou 8,5).</small>)}
      {it.tipo === 'aviso' && it.link && <div class="linha-botoes"><a class="botao sec mini" href={it.link}>{it.rotuloLink || 'Ir para Paradigmas'}</a></div>}
      {it.tipo === 'aviso' && it.excluir && <div class="linha-botoes"><button type="button" class="mini perigo" onClick={async () => { if (await confirmar(`${it.excluir}? O vínculo vai para a lixeira.`)) { await softDelete(it.rec); responder(null); } }}>{it.excluir}</button></div>}
      {it.tipo === 'simnao' && (
        <div class="linha-botoes">
          <button type="button" class="mini" onClick={() => escolherSimNao('Sim – caracteriza')}>Sim – caracteriza</button>
          <button type="button" class="mini" onClick={() => escolherSimNao('Não – não caracteriza')}>Não – não caracteriza</button>
        </div>
      )}
      {it.tipo === 'escolha' && (
        <div class="linha-botoes">
          {it.opcoes.map((o) => <button type="button" class="mini" onClick={() => responder(it.rec, it.campo, o.valor)}>Usar {o.rotulo}</button>)}
          {!it.opcoes.length && !it.livre && <small class="dica">Sem sugestão no banco.</small>}
        </div>
      )}
      {it.tipo === 'escolha' && it.livre && (
        <div class="com-botao">
          <label class="campo"><span class="rotulo">{it.rotuloLivre || 'Outro'}</span><input value={txt} onInput={(e) => setTxt(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && salvarTxt()} /></label>
          <button type="button" class="mini" disabled={!String(txt).trim()} onClick={salvarTxt}>Salvar</button>
        </div>
      )}
      {it.tipo === 'aviso' && (it.acoes || []).length > 0 && (
        <div class="linha-botoes">
          {it.acoes.map((a) => <button type="button" class="mini" onClick={() => responder(it.rec, a.campo, a.valor)}>{a.rotulo}</button>)}
        </div>
      )}
      {it.tipo === 'lote' && (
        <div class="linha-botoes">
          {(it.lotes || []).map((l) => (
            <button type="button" class={`mini${l.sec ? ' sec' : ''}`} onClick={async () => {
              for (const e of l.escritas) {
                if (e.criar) { await createRecord(e.criar.kind, it.caseId, e.criar.data); continue; }
                for (const [k, val] of Object.entries(e.campos)) await salvar(e.rec, k, val);
              }
              await responder(null);
            }}>{l.rotulo}</button>
          ))}
        </div>
      )}
      {it.tipo === 'nota' && (
        <div class="com-botao">
          <label class="campo"><span class="rotulo">No lugar da nota</span><input value={txt} onInput={(e) => setTxt(e.currentTarget.value)} /></label>
          <button type="button" class="mini" disabled={!String(txt).trim()} onClick={() => responder(it.rec, it.campo, it.valorAtual.replace(it.trecho, String(txt).trim()))}>Substituir</button>
          <button type="button" class="mini perigo" onClick={() => responder(it.rec, it.campo, it.valorAtual.replace(` ${it.trecho}`, '').replace(it.trecho, ''))}>Apagar a nota</button>
        </div>
      )}
      {it.ciente && (
        <div class="linha-botoes">
          <button type="button" class="mini sec" onClick={() => responder(it.rec, it.ciente.campo, 'Sim')}>Está correto – manter</button>
        </div>
      )}
      {(it.tipo === 'confirmar' || it.tipo === 'texto') && (
        <>
          <textarea rows={it.tipo === 'texto' ? 4 : 2} value={txt} onInput={(e) => setTxt(e.currentTarget.value)} />
          <div class="linha-botoes">
            <button type="button" class="mini" onClick={salvarTxt}>{it.tipo === 'texto' ? (it.sugestao ? 'Adotar este texto' : 'Salvar') : 'Confirmar'}</button>
            {it.recusa && <button type="button" class="mini perigo" onClick={() => responder(it.rec, it.recusa.campo, it.recusa.valor)}>Não se aplica</button>}
          </div>
        </>
      )}
    </div>
  );
}
