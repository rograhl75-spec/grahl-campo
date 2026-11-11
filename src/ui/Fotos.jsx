import { useEffect, useRef, useState } from 'preact/hooks';
import { db, softDelete, updateFields } from '../db.js';
import { avisarAlteracao } from '../sync.js';
import { adicionarFotos, urlMiniatura, urlCompleta } from '../photos.js';
import { imagensDoDocx, imagensDoPdf, importarImagens } from '../fotosLaudo.js';
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
        <small class="dica">{f.data.tiradaEm && new Date(f.data.tiradaEm).toLocaleString('pt-BR')} {f.data.gps && `· GPS ${f.data.gps}`}</small>
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
