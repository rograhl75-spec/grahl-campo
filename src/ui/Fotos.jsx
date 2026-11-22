import { useEffect, useRef, useState } from 'preact/hooks';
import { db, softDelete, updateFields } from '../db.js';
import { avisarAlteracao } from '../sync.js';
import { adicionarFotos, urlMiniatura, urlCompleta } from '../photos.js';
import { imagensDoDocx, imagensDoPdf, importarImagens } from '../fotosLaudo.js';
import { legendaDoNomeArquivo, promptFotos, lerJsonFotos, aplicarFotosIA, arquivosNumerados, folhasDeContato, entregarArquivos, TIPOS_IDENT } from '../fotosIA.js';
import { TF, salvar } from './fields.jsx';
import { useLive } from './hooks.js';
import { Icone } from './Icone.jsx';
import { confirmar } from './dialogo.jsx';

function useFotos(caseId, postoId) {
  return useLive(async () => (await db.records.where('[caseId+kind]').equals([caseId, 'foto']).toArray())
    .filter((r) => !r.deleted && (postoId === undefined || (r.data.postoId || '') === postoId))
    .sort((a, b) => (a.data.ordem ?? 0) - (b.data.ordem ?? 0) || a.createdAt - b.createdAt), [caseId, postoId], []);
}

export function BotoesFoto({ caseId, postoId = '' }) {
  const cam = useRef(null), gal = useRef(null);
  const [msg, setMsg] = useState('');
  const receber = async (e) => {
    const files = [...(e.currentTarget.files || [])];
    e.currentTarget.value = '';
    if (!files.length) return;
    setMsg(`Gravando ${files.length} foto(s) no aparelho…`);
    try {
      const r = await adicionarFotos(caseId, files, { postoId });
      avisarAlteracao();
      setMsg(`✓ ${r.length} foto(s) gravadas no aparelho.`);
      setTimeout(() => setMsg(''), 4000);
    } catch (err) {
      setMsg('ERRO ao gravar foto: ' + err.message);
    }
  };
  return (
    <div class="botoes-foto">
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={receber} />
      <input ref={gal} type="file" accept="image/*" multiple hidden onChange={receber} />
      <button type="button" class="primario" onClick={() => cam.current.click()}><Icone nome="camera" /> Tirar foto</button>
      <button type="button" onClick={() => gal.current.click()}><Icone nome="imagem" /> Da galeria</button>
      {msg && <span class="dica">{msg}</span>}
    </div>
  );
}

function Mini({ id, onClick, legenda = '' }) {
  const [url, setUrl] = useState(null);
  const blob = useLive(() => db.blobs.get(id).then((b) => (b ? 1 : 0)), [id], 0);
  useEffect(() => { let vivo = true; urlMiniatura(id).then((u) => vivo && setUrl(u)); return () => { vivo = false; }; }, [id, blob]);
  return (
    <button type="button" class="mini-foto" onClick={onClick} aria-label={`Abrir foto${legenda ? `: ${legenda}` : ''}`}>
      {url ? <img src={url} alt={legenda || 'Foto da diligência'} loading="lazy" /> : <span class="sem-foto">baixando…</span>}
    </button>
  );
}

export function Miniaturas({ caseId, postoId }) {
  const fotos = useFotos(caseId, postoId);
  const [sel, setSel] = useState(null);
  if (!fotos.length) return null;
  return (
    <>
      <div class="tira">
        {fotos.map((f) => <div class="tira-item"><Mini id={f.id} legenda={f.data.legenda} onClick={() => setSel(f.id)} /><small>{f.data.legenda || ''}</small></div>)}
      </div>
      {sel && <EditorFoto caseId={caseId} id={sel} fechar={() => setSel(null)} />}
    </>
  );
}

export function Fotos({ rec }) {
  const fotos = useFotos(rec.id, undefined);
  const postos = useLive(async () => (await db.records.where('[caseId+kind]').equals([rec.id, 'posto']).toArray()).filter((r) => !r.deleted), [rec.id], []);
  const [sel, setSel] = useState(null);
  const nomePosto = Object.fromEntries(postos.map((p) => [p.id, p.data.nome || 'posto sem nome']));
  const mover = async (idx, dir) => {
    const a = fotos[idx], b = fotos[idx + dir];
    if (!a || !b) return;
    const oa = a.data.ordem ?? idx, ob = b.data.ordem ?? idx + dir;
    await updateFields(a.id, { ordem: ob });
    await updateFields(b.id, { ordem: ob === oa ? oa + dir : oa });
    avisarAlteracao();
  };
  return (
    <div class="grade">
      <section class="bloco largo">
        <BotoesFoto caseId={rec.id} postoId="" />
        <p class="dica">As fotos ficam gravadas no aparelho no momento em que são tiradas e são enviadas à nuvem quando houver internet. A ordem aqui é a ordem do relatório fotográfico.</p>
      </section>
      <ImportarFotos rec={rec} />
      <IdentificarFotos rec={rec} fotos={fotos} nomePosto={nomePosto} />
      <section class="bloco largo">
        {!fotos.length && <p class="vazio">Nenhuma foto.</p>}
        <div class="galeria">
          {fotos.map((f, idx) => (
            <div class="galeria-item" key={f.id}>
              <Mini id={f.id} legenda={f.data.legenda} onClick={() => setSel(f.id)} />
              <div class="galeria-info">
                <b>Foto {idx + 1}</b>{f.data.postoId && nomePosto[f.data.postoId] ? ` · ${nomePosto[f.data.postoId]}` : ''}
                <br /><small class="suave">{f.data.tiradaEm ? new Date(f.data.tiradaEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'sem data na foto'}{f.data.gps ? ` · GPS ${f.data.gps}` : ''}{f.data.origem ? ` · ${f.data.origem}` : ''}</small>
                <TF rec={f} k="legenda" label="Legenda" />
                {f.data.identificacao && <small class="dica">🔎 {f.data.identTipo ? `${f.data.identTipo}: ` : ''}{f.data.identificacao}{f.data.identSituacao !== 'Conferido' ? ' – a conferir' : ''}</small>}
                <div class="linha-botoes">
                  <button type="button" class="mini" onClick={() => mover(idx, -1)}>↑</button>
                  <button type="button" class="mini" onClick={() => mover(idx, 1)}>↓</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      {sel && <EditorFoto caseId={rec.id} id={sel} fechar={() => setSel(null)} postos={postos} />}
    </div>
  );
}

function EditorFoto({ caseId, id, fechar, postos: postosProp }) {
  const f = useLive(() => db.records.get(id), [id], null);
  const postos = useLive(async () => postosProp || (await db.records.where('[caseId+kind]').equals([caseId, 'posto']).toArray()).filter((r) => !r.deleted), [caseId], []);
  const [url, setUrl] = useState(null);
  useEffect(() => { let u; urlCompleta(id).then((x) => { u = x; setUrl(x); }); return () => u && URL.revokeObjectURL(u); }, [id]);
  if (!f) return null;
  const excluir = async () => {
    if (!await confirmar('Mover esta foto para a lixeira? (pode ser restaurada em Configurações → Lixeira)')) return;
    await softDelete(id); avisarAlteracao(); fechar();
  };
  return (
    <div class="modal" onClick={fechar}>
      <div class="modal-caixa foto-editor" onClick={(e) => e.stopPropagation()}>
        {url ? <img src={url} alt={f.data.legenda || 'Foto da diligência'} /> : <p class="vazio">Foto ainda não disponível neste aparelho.</p>}
        <TF rec={f} k="legenda" label="Legenda" area rows={2} historico={false} />
        <label class="campo"><span class="rotulo">Posto / atividade</span>
          <select value={f.data.postoId || ''} onChange={(e) => salvar(id, 'postoId', e.currentTarget.value)}>
            <option value="">(geral)</option>
            {postos.map((p) => <option value={p.id}>{p.data.nome || 'posto sem nome'}</option>)}
          </select>
        </label>
        <details open={!!f.data.identificacao}>
          <summary>Identificação (plaqueta, rótulo, display, CA)</summary>
          <label class="campo"><span class="rotulo">Tipo</span>
            <select value={f.data.identTipo || ''} onChange={(e) => salvar(id, 'identTipo', e.currentTarget.value)}>
              <option value="">—</option>{TIPOS_IDENT.map((t) => <option value={t}>{t}</option>)}
            </select>
          </label>
          <TF rec={f} k="identificacao" label="O que está legível na foto (marca, modelo, série, produto, CA, leitura do display)" area rows={2} historico={false} />
          <label class="campo"><span class="rotulo">Situação</span>
            <select value={f.data.identSituacao || ''} onChange={(e) => salvar(id, 'identSituacao', e.currentTarget.value)}>
              <option value="">—</option><option>A conferir</option><option>Conferido</option>
            </select>
          </label>
          {f.data.identObs && <small class="dica">Observação do Claude: {f.data.identObs}{f.data.identConfianca ? ` (legibilidade ${f.data.identConfianca})` : ''}</small>}
        </details>
        <small class="dica">{f.data.tiradaEm && new Date(f.data.tiradaEm).toLocaleString('pt-BR')} {f.data.gps && `· GPS ${f.data.gps}`}{f.data.nomeArquivo ? ` · arquivo ${f.data.nomeArquivo}` : ''}</small>
        <div class="linha-botoes entre">
          <button type="button" class="perigo" onClick={excluir}>Excluir foto</button>
          <button type="button" class="primario" onClick={fechar}>Concluir</button>
        </div>
      </div>
    </div>
  );
}

function ImportarFotos({ rec }) {
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const receber = async (e) => {
    const files = [...(e.currentTarget.files || [])];
    e.currentTarget.value = '';
    if (!files.length) return;
    setOcupado(true);
    let total = 0, comExif = 0;
    try {
      for (const f of files) {
        let itens, origem;
        if (/\.docx$/i.test(f.name)) {
          setMsg(`Lendo ${f.name}…`);
          itens = await imagensDoDocx(f); origem = `do laudo ${f.name}`;
        } else if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
          itens = await imagensDoPdf(f, (n, t) => setMsg(`Lendo ${f.name}: página ${n} de ${t}…`)); origem = `do laudo ${f.name}`;
        } else if (/^image\//.test(f.type) || /\.(jpe?g|png|heic)$/i.test(f.name)) {
          itens = [{ blob: f, legenda: '', nome: f.name }]; origem = 'arquivo de foto';
        } else continue;
        setMsg(`Gravando ${itens.length} foto(s) de ${f.name}…`);
        const r = await importarImagens(rec.id, itens, { origem });
        total += r.fotos; comExif += r.comExif;
      }
      avisarAlteracao();
      setMsg(`✓ ${total} foto(s) importadas${total ? `; ${comExif} com data/hora ou GPS gravados na própria foto` : ''}. Confira as legendas e a ordem abaixo.`
        + (total && comExif < total ? ' Fotos tiradas de PDF normalmente perdem data e GPS; o Word costuma manter.' : ''));
    } catch (err) { setMsg('Erro: ' + err.message); }
    setOcupado(false);
  };
  return (
    <section class="bloco largo">
      <h3>Importar fotos de laudo já feito ou de arquivos</h3>
      <p class="dica">Escolha o laudo em <b>Word (.docx)</b> ou <b>PDF</b>, ou as próprias fotos (JPG). O app separa as fotos, ignora o timbrado e os logotipos, aproveita as legendas "Foto n – …" / "Figura n – …" e lê a data, a hora e o GPS gravados na foto quando ainda existem (o Word costuma manter; o PDF quase sempre apaga). Se tiver as fotos originais do celular, prefira elas.</p>
      <label class={`botao-arquivo ${ocupado ? 'desativado' : ''}`}>{ocupado ? 'Importando…' : '＋ Escolher laudo ou fotos'}
        <input type="file" accept=".docx,.pdf,application/pdf,image/*" multiple hidden disabled={ocupado} onChange={receber} /></label>
      {msg && <p class={msg.startsWith('Erro') ? 'erro-msg' : 'ok-msg'}>{msg}</p>}
    </section>
  );
}

// Legendas pelo nome do arquivo e identificação das fotos pelo Claude
function IdentificarFotos({ rec, fotos, nomePosto }) {
  const [json, setJson] = useState('');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [soSem, setSoSem] = useState(true);
  const [substituir, setSubstituir] = useState(false);
  if (!fotos.length) return null;
  const numeradas = fotos.map((f, i) => ({ ...f, numero: i + 1 }));
  const alvo = numeradas.filter((f) => !soSem || !String(f.data.legenda || '').trim() || !f.data.identificacao);
  const peloNome = numeradas.filter((f) => !String(f.data.legenda || '').trim() && legendaDoNomeArquivo(f.data.nomeArquivo));
  const legendasDoNome = async () => {
    for (const f of peloNome) await updateFields(f.id, { legenda: legendaDoNomeArquivo(f.data.nomeArquivo) });
    avisarAlteracao();
    setMsg(`✓ ${peloNome.length} legenda(s) preenchida(s) pelo nome do arquivo.`);
  };
  const copiar = async () => {
    const contexto = [rec.data.vistoriaLocal || rec.data.reuNome, rec.data.funcoes && String(rec.data.funcoes).split('\n')[0].slice(0, 160)].filter(Boolean).join(' – ');
    try { await navigator.clipboard.writeText(promptFotos(alvo, { nomePosto, contexto })); setMsg(`✓ Instrução copiada (${alvo.length} foto(s)). No Claude, cole a instrução e anexe as fotos numeradas ou as folhas de contato.`); }
    catch (e) { setMsg('Não foi possível copiar.'); }
  };
  const enviar = async (folhas) => {
    setOcupado(true); setMsg(folhas ? 'Montando as folhas de contato…' : 'Preparando as fotos numeradas…');
    try {
      const arqs = folhas ? await folhasDeContato(alvo) : await arquivosNumerados(alvo);
      const r = await entregarArquivos(arqs, folhas ? 'folhas-de-contato.zip' : 'fotos-numeradas.zip');
      setMsg(r === 'compartilhado' ? `✓ ${arqs.length} arquivo(s) enviados. Escolha o Claude na lista do Android.` : r === 'zip' ? `✓ ZIP com ${arqs.length} arquivo(s) baixado. Anexe os arquivos no Claude.` : r === 'cancelado' ? 'Envio cancelado.' : 'Nenhuma foto disponível neste aparelho.');
    } catch (e) { setMsg(`Erro: ${e.message}`); }
    setOcupado(false);
  };
  const aplicar = async () => {
    try {
      const dados = lerJsonFotos(json);
      const r = await aplicarFotosIA(rec.id, dados, { substituir });
      avisarAlteracao();
      setMsg(`✓ ${r.fotos} foto(s) com legenda ou identificação${r.produtos ? `; ${r.produtos} produto(s) químico(s) com ficha da FDS (Preparação → Produtos químicos)` : ''}. Tudo entra "a conferir".`);
      setJson('');
    } catch (e) { setMsg(`Erro: ${e.message}`); }
  };
  return (
    <section class="bloco largo">
      <h3>Legendas e identificação das fotos</h3>
      {peloNome.length > 0 && (
        <div class="linha-botoes"><button type="button" class="sec" onClick={legendasDoNome}>Preencher {peloNome.length} legenda(s) vazia(s) pelo nome do arquivo</button></div>
      )}
      <p class="dica">O Claude lê plaquetas (marca, modelo, série, ano), rótulos de produtos (e busca a FDS), CA de EPI e displays de equipamentos. Leitura de display serve só para conferir com o relatório do equipamento. Os números das fotos são os desta tela.</p>
      <label class="check"><input type="checkbox" checked={soSem} onChange={(e) => setSoSem(e.currentTarget.checked)} /> Só as fotos sem legenda ou sem identificação ({alvo.length} de {fotos.length})</label>
      <div class="linha-botoes">
        <button type="button" class="sec" disabled={ocupado || !alvo.length} onClick={() => enviar(false)}>1a. Enviar fotos numeradas</button>
        <button type="button" class="sec" disabled={ocupado || !alvo.length} onClick={() => enviar(true)}>1b. Folhas de contato (12 por folha)</button>
        <button type="button" class="primario" disabled={!alvo.length} onClick={copiar}>2. Copiar instrução</button>
      </div>
      <small class="dica">Muitas fotos: mande as folhas de contato para a legenda geral e, em tamanho original, só as de plaquetas, rótulos e displays.</small>
      <label class="campo"><span class="rotulo">3. Cole aqui o JSON devolvido pelo Claude</span>
        <textarea rows={3} value={json} onInput={(e) => setJson(e.currentTarget.value)} /></label>
      <label class="check"><input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.currentTarget.checked)} /> Substituir legendas já preenchidas</label>
      <div class="linha-botoes"><button type="button" class="primario" disabled={!json.trim()} onClick={aplicar}>Aplicar</button></div>
      {msg && <p class="ok-msg">{msg}</p>}
    </section>
  );
}
