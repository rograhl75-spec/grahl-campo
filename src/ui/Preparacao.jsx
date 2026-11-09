import { useState } from 'preact/hooks';
import { db } from '../db.js';
import { CAMPOS_SINTESE, CAMPOS_PERIODO, CAMPOS_DOC, CAMPOS_EPI } from '../schema.js';
import { SITUACOES, situacaoDoCaso, montarPrompt, lerJsonIA, aplicarIA } from '../aiimport.js';
import { avisarAlteracao } from '../sync.js';
import { dataBR } from '../docx/reports.js';
import { TF, salvar } from './fields.jsx';
import { RecordList } from './RecordList.jsx';
import { useLive } from './hooks.js';
import { Campos } from './fields.jsx';
import { sugerirParadigmas } from '../paradigmas.js';
import { CAMPOS_PENOSIDADE } from '../docx/penosidade.js';
import { ResultadoBusca } from './Paradigmas.jsx';
import { updateFields, softDelete } from '../db.js';
import { guardarAnexo, LIMITE_NUVEM } from '../paradigmas.js';
import { obterAnexo } from '../sync.js';

export function Preparacao({ rec }) {
  const sintese = CAMPOS_SINTESE.filter(([k]) => k !== 'roteiro' && k !== 'analiseEpi');
  const vazio = !(rec.data.funcoes || '').trim() && !(rec.data.pedidos || '').trim();
  return (
    <div class="grade">
      <ArquivoDoProcesso rec={rec} />
      <ImportarIA rec={rec} abertoInicial={vazio} />
      <h2 class="largo subtitulo-etapa">Conferência dos dados extraídos</h2>
      <section class="bloco largo">
        <h3>Síntese dos autos</h3>
        {sintese.map(([k, label]) => <TF rec={rec} k={k} label={label} area />)}
      </section>
      <RecordList kind="periodo" caseId={rec.id} campos={CAMPOS_PERIODO} titulo="Contratos / períodos" novo="Adicionar período"
        resumo={(r) => [r.data.empresa, r.data.inicio && `${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`, r.data.cargo,
          (r.data.paradigmaRuido || r.data.paradigmaVibracao) && `paradigmas ${[r.data.paradigmaRuido, r.data.paradigmaVibracao].filter(Boolean).join('/')}`].filter(Boolean).join(' · ')}
        extra={(r) => <VeiculoDoPeriodo r={r} />} />
      <RecordList kind="documento" caseId={rec.id} campos={CAMPOS_DOC} titulo="Documentos técnicos analisados" novo="Adicionar documento"
        resumo={(r) => [r.data.tipo, r.data.identificacao].filter(Boolean).join(' – ')} />
      <RecordList kind="epi" caseId={rec.id} campos={CAMPOS_EPI} titulo="Ficha de EPIs" novo="Adicionar EPI"
        resumo={(r) => [r.data.descricao, r.data.ca && `CA ${r.data.ca}`, r.data.dataEntrega].filter(Boolean).join(' · ')} />
      <section class="bloco largo">
        <TF rec={rec} k="analiseEpi" label="Análise crítica dos EPIs (fichas, CA, periodicidade)" area />
      </section>
      <section class="bloco largo">
        <h3>Planejamento da diligência</h3>
        <TF rec={rec} k="roteiro" label="Roteiro da vistoria / documentos a solicitar" area rows={5} />
        <EquipamentosCaso rec={rec} />
      </section>
    </div>
  );
}

export function EquipamentosCaso({ rec, titulo = 'Equipamentos a levar / utilizados' }) {
  const equip = useLive(async () => (await db.records.where('kind').equals('equip').toArray()).filter((e) => !e.deleted)
    .sort((a, b) => (a.data.ordem || 0) - (b.data.ordem || 0)), [], []);
  const sel = Array.isArray(rec.data.equipamentos) ? rec.data.equipamentos : [];
  const alterna = (id) => salvar(rec.id, 'equipamentos', sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <div class="campo">
      <span class="rotulo">{titulo}</span>
      <div class="chips">
        {equip.map((e) => (
          <button type="button" class={`chip ${sel.includes(e.id) ? 'on' : ''}`} onClick={() => alterna(e.id)}>
            {e.data.modelo || e.data.nome}{e.data.serie ? ` · ${e.data.serie}` : ''}
          </button>
        ))}
      </div>
      <small class="dica">Cadastro e certificados em Configurações → Equipamentos.</small>
    </div>
  );
}

function ArquivoDoProcesso({ rec }) {
  const lista = useLive(async () => (await db.records.where('[caseId+kind]').equals([rec.id, 'anexo']).toArray())
    .filter((r) => !r.deleted && r.data.descricao === 'autos').sort((a, b) => a.createdAt - b.createdAt), [rec.id], []);
  const [msg, setMsg] = useState('');
  const anexar = async (e) => {
    const arqs = [...e.currentTarget.files];
    e.currentTarget.value = '';
    for (const f of arqs) await guardarAnexo(f, 'autos', rec.id);
    avisarAlteracao();
    setMsg(arqs.some((f) => f.size > LIMITE_NUVEM) ? 'Arquivo com mais de 39 MB: fica guardado só neste aparelho (não vai para a nuvem).' : '');
  };
  const abrir = async (r) => {
    try { const b = await obterAnexo(r.id); window.open(URL.createObjectURL(b), '_blank'); } catch (err) { setMsg(err.message); }
  };
  const remover = async (r) => { if (confirm(`Remover "${r.data.nome}" do caso?`)) { await softDelete(r.id); avisarAlteracao(); } };
  const mb = (n) => `${(n / 1048576).toFixed(1).replace('.', ',')} MB`;
  return (
    <section class="bloco largo passo-etapa">
      <h3><span class="num-passo">A</span> Arquivo do processo (PDF)</h3>
      <p class="dica">Guarde aqui o PDF completo dos autos (pode ser mais de um arquivo). Ele fica no caso, para abrir no tablet ou no PC e anexar no Claude.</p>
      {lista.map((r) => (
        <div class="linha-arquivo">
          <span>📄 {r.data.nome} <small>({mb(r.data.tamanho || 0)}{r.data.soLocal ? ' · só neste aparelho' : ''})</small></span>
          <span><button type="button" class="mini" onClick={() => abrir(r)}>Abrir</button> <button type="button" class="mini perigo" onClick={() => remover(r)}>✕</button></span>
        </div>
      ))}
      <label class="botao-arquivo">{lista.length ? '＋ Anexar outro PDF' : '＋ Anexar PDF do processo'}<input type="file" accept="application/pdf,.pdf" multiple hidden onChange={anexar} /></label>
      {msg && <p class="alerta-txt">{msg}</p>}
    </section>
  );
}

function ImportarIA({ rec, abertoInicial = false }) {
  const [aberto, setAberto] = useState(abertoInicial);
  const [texto, setTexto] = useState('');
  const [previa, setPrevia] = useState(null);
  const [erro, setErro] = useState('');
  const [substituir, setSubstituir] = useState(false);
  const [msg, setMsg] = useState('');
  const [situacao, setSituacao] = useState(situacaoDoCaso(rec.data));
  const perfil = useLive(async () => ((await db.records.get('perfil')) || {}).data || {}, [], {});
  const prompt = montarPrompt(situacao, rec.data, perfil);

  const copiar = async () => {
    try { await navigator.clipboard.writeText(prompt); setMsg('Instrução copiada. Cole no Claude junto com os PDFs dos autos.'); }
    catch (e) { setMsg('Não foi possível copiar automaticamente; selecione o texto abaixo.'); }
  };
  const ler = () => {
    setErro(''); setMsg('');
    try { setPrevia(lerJsonIA(texto)); } catch (e) { setPrevia(null); setErro(e.message); }
  };
  const aplicar = async () => {
    const r = await aplicarIA(rec.id, previa, { substituir });
    avisarAlteracao();
    setMsg(`Aplicado: ${r.campos} campo(s), ${r.periodos} período(s), ${r.documentos} documento(s), ${r.epis} EPI(s), ${r.quesitos} quesito(s)`
      + (r.respostas ? `, ${r.respostas} resposta(s) do laudo` : '') + (r.postos || r.medicoes ? `, ${r.postos} posto(s) e ${r.medicoes} medição(ões) da diligência (veja em 4. Campo)` : '') + '.');
    setPrevia(null); setTexto('');
  };

  if (!aberto) {
    return (
      <section class="bloco largo destaque passo-etapa">
        <div class="linha-botoes entre">
          <div><b class="titulo-passo"><span class="num-passo">B</span> Extrair os dados dos autos com o Claude</b><br /><small>Já feito? Os dados estão abaixo para conferir. Pode repetir a extração quando chegarem novos documentos.</small></div>
          <button type="button" onClick={() => setAberto(true)}>Abrir</button>
        </div>
      </section>
    );
  }
  return (
    <section class="bloco largo destaque passo-etapa">
      <h3><span class="num-passo">B</span> Extrair os dados dos autos com o Claude</h3>
      <ol class="passos">
        <li>Toque em <b>Copiar instrução</b>.</li>
        <li>Abra uma conversa nova no Claude, cole a instrução e anexe o PDF do processo (o mesmo guardado no item A).</li>
        <li>Quando o Claude responder, copie a resposta inteira (o bloco que começa com <code>{'{'}</code>) e cole no campo abaixo.</li>
        <li>Toque em <b>Ler e mostrar prévia</b> e depois em <b>Aplicar ao caso</b>. O app preenche cadastro, síntese, períodos, documentos, EPIs e quesitos. Se o processo já tiver laudo ou diligência, preenche também a etapa 4. Campo (diligência, postos e medições), as respostas dos quesitos, a conclusão do laudo e a fase. Campos que você já preencheu não são alterados, a menos que marque "substituir".</li>
      </ol>
      <label class="campo"><span class="rotulo">Situação (escolhida pelo tipo do caso; pode trocar)</span>
        <select value={situacao} onChange={(e) => setSituacao(e.currentTarget.value)}>
          {SITUACOES.map((x) => <option value={x.id}>{x.titulo}</option>)}
        </select>
      </label>
      <div class="linha-botoes">
        <button type="button" class="primario" onClick={copiar}>Copiar instrução</button>
        <button type="button" class="sec" onClick={() => setAberto(false)}>Fechar</button>
      </div>
      <details><summary>Ver a instrução</summary><pre class="prompt">{prompt}</pre></details>
      <label class="campo campo-area"><span class="rotulo">Resposta da IA (JSON)</span>
        <textarea rows={6} value={texto} onInput={(e) => setTexto(e.currentTarget.value)} placeholder='{"processo": {...}, "quesitos": [...]}' />
      </label>
      <div class="linha-botoes"><button type="button" onClick={ler} disabled={!texto.trim()}>Ler e mostrar prévia</button></div>
      {erro && <p class="erro-msg">{erro}</p>}
      {previa && (
        <div class="previa">
          <p><b>Prévia:</b> {Object.keys(previa.caso).length} campo(s) do caso, {previa.periodos.length} período(s), {previa.documentos.length} documento(s), {previa.epis.length} EPI(s), {previa.quesitos.length} quesito(s)
            {previa.quesitos.some((q) => q.resposta) && `, ${previa.quesitos.filter((q) => q.resposta).length} com resposta do laudo`}
            {previa.postos.length > 0 && `, ${previa.postos.length} posto(s) e ${previa.postos.reduce((n, p) => n + p.medicoes.length, 0)} medição(ões) da diligência`}.</p>
          {(previa.caso.laudoRefPerito || previa.caso.vistoriaData) && <p class="ok-msg">Processo em andamento: {previa.caso.laudoRefPerito ? `laudo ${previa.caso.laudoRefPerito}${previa.caso.laudoData ? ` de ${dataBR(previa.caso.laudoData)}` : ''}` : ''}{previa.caso.vistoriaData ? ` · diligência em ${dataBR(previa.caso.vistoriaData)}` : ''}{previa.caso.fase ? ` · fase: ${previa.caso.fase}` : ''}.</p>}
          <ul>{Object.entries(previa.caso).map(([k, v]) => <li><b>{k}</b>: {String(v).slice(0, 140)}{String(v).length > 140 ? '…' : ''}</li>)}</ul>
          <label class="check"><input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.currentTarget.checked)} /> Substituir campos que já estão preenchidos</label>
          <div class="linha-botoes"><button type="button" class="primario" onClick={aplicar}>Aplicar ao caso</button></div>
        </div>
      )}
      {msg && <p class="ok-msg">{msg}</p>}
    </section>
  );
}

export const CAMPOS_VEICULO_PERIODO = [
  ['veiculoTipo', 'Tipo do veículo / máquina', 'text'], ['veiculoMarca', 'Marca', 'text'], ['veiculoModelo', 'Modelo', 'text'], ['veiculoAno', 'Ano', 'text'],
  ['conducaoH', 'Tempo diário de condução / operação (h)', 'num'], ['conducaoBase', 'Base da informação (ex.: entrevista de 20/10/2026; jornada 04h–22h menos paradas)', 'text'],
  ['paradigmaRuido', 'Paradigma de ruído (código, ex.: M01)', 'text'], ['paradigmaVibracao', 'Paradigma de vibração (código)', 'text'],
];

function VeiculoDoPeriodo({ r }) {
  const [aberto, setAberto] = useState(!!(r.data.veiculoModelo || r.data.paradigmaRuido));
  const [res, setRes] = useState(null);
  const buscar = async () => setRes(await sugerirParadigmas({ marca: r.data.veiculoMarca, modelo: r.data.veiculoModelo, tipo: r.data.veiculoTipo }));
  const escolher = async (tipo, p) => {
    await updateFields(r.id, tipo === 'ruido' ? { paradigmaRuido: p.data.codigo } : { paradigmaVibracao: p.data.codigo });
    avisarAlteracao();
  };
  if (!aberto) return <button type="button" class="mini" onClick={() => setAberto(true)}>🚚 Veículo, paradigma e penosidade (motorista / operador)</button>;
  return (
    <div class="bloco destaque" style="margin-top:8px">
      <h4>Veículo do requerente neste período</h4>
      <div class="linha2"><Campos rec={r} campos={CAMPOS_VEICULO_PERIODO} /></div>
      <button type="button" onClick={buscar}>Sugerir paradigmas pelo banco</button>
      {res && <ResultadoBusca res={res} onEscolher={escolher} />}
      <details style="margin-top:10px" open={!!(r.data.jornadaSemanal || r.data.penosidadeConclusao)}>
        <summary><b>Penosidade (motorista / cobrador – a partir de 29/04/1995)</b></summary>
        <p class="dica">Fatores concretos de desgaste, vínculo a vínculo. Até 28/04/1995 basta a categoria profissional; depois, a penosidade depende de perícia técnica individualizada. Os dados saem no quadro de penosidade do laudo, do parecer e do LTCAT.</p>
        <div class="linha2"><Campos rec={r} campos={CAMPOS_PENOSIDADE} /></div>
      </details>
    </div>
  );
}
