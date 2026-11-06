import { useState } from 'preact/hooks';
import { db } from '../db.js';
import { CAMPOS_SINTESE, CAMPOS_PERIODO, CAMPOS_DOC, CAMPOS_EPI } from '../schema.js';
import { PROMPT_IA, lerJsonIA, aplicarIA } from '../aiimport.js';
import { avisarAlteracao } from '../sync.js';
import { dataBR } from '../docx/reports.js';
import { TF, salvar } from './fields.jsx';
import { RecordList } from './RecordList.jsx';
import { useLive } from './hooks.js';

export function Preparacao({ rec }) {
  const sintese = CAMPOS_SINTESE.filter(([k]) => k !== 'roteiro' && k !== 'analiseEpi');
  return (
    <div class="grade">
      <ImportarIA rec={rec} />
      <section class="bloco largo">
        <h3>Síntese dos autos</h3>
        {sintese.map(([k, label]) => <TF rec={rec} k={k} label={label} area />)}
      </section>
      <RecordList kind="periodo" caseId={rec.id} campos={CAMPOS_PERIODO} titulo="Contratos / períodos" novo="Adicionar período"
        resumo={(r) => [r.data.empresa, r.data.inicio && `${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`, r.data.cargo].filter(Boolean).join(' · ')} />
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

function ImportarIA({ rec }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [previa, setPrevia] = useState(null);
  const [erro, setErro] = useState('');
  const [substituir, setSubstituir] = useState(false);
  const [msg, setMsg] = useState('');

  const copiar = async () => {
    try { await navigator.clipboard.writeText(PROMPT_IA); setMsg('Instrução copiada. Cole no Claude junto com os PDFs dos autos.'); }
    catch (e) { setMsg('Não foi possível copiar automaticamente; selecione o texto abaixo.'); }
  };
  const ler = () => {
    setErro(''); setMsg('');
    try { setPrevia(lerJsonIA(texto)); } catch (e) { setPrevia(null); setErro(e.message); }
  };
  const aplicar = async () => {
    const r = await aplicarIA(rec.id, previa, { substituir });
    avisarAlteracao();
    setMsg(`Aplicado: ${r.campos} campo(s), ${r.periodos} período(s), ${r.documentos} documento(s), ${r.epis} EPI(s), ${r.quesitos} quesito(s).`);
    setPrevia(null); setTexto('');
  };

  if (!aberto) {
    return (
      <section class="bloco largo destaque">
        <div class="linha-botoes entre">
          <div><b>Pré-relatório com IA</b><br /><small>Extraia os dados dos autos no Claude e cole o resultado aqui; o app preenche os campos e gera o pré-relatório no timbrado.</small></div>
          <button type="button" onClick={() => setAberto(true)}>Abrir</button>
        </div>
      </section>
    );
  }
  return (
    <section class="bloco largo destaque">
      <h3>Preencher a partir dos autos (IA)</h3>
      <ol class="passos">
        <li>Toque em <b>Copiar instrução</b>, abra o Claude, cole a instrução e anexe os PDFs dos autos.</li>
        <li>Copie a resposta inteira (o bloco JSON) e cole no campo abaixo.</li>
        <li>Confira a prévia e aplique. Campos já preenchidos não são alterados, a menos que você marque "substituir".</li>
      </ol>
      <div class="linha-botoes">
        <button type="button" onClick={copiar}>Copiar instrução</button>
        <button type="button" class="sec" onClick={() => setAberto(false)}>Fechar</button>
      </div>
      <details><summary>Ver a instrução</summary><pre class="prompt">{PROMPT_IA}</pre></details>
      <label class="campo campo-area"><span class="rotulo">Resposta da IA (JSON)</span>
        <textarea rows={6} value={texto} onInput={(e) => setTexto(e.currentTarget.value)} placeholder='{"processo": {...}, "quesitos": [...]}' />
      </label>
      <div class="linha-botoes"><button type="button" onClick={ler} disabled={!texto.trim()}>Ler e mostrar prévia</button></div>
      {erro && <p class="erro-msg">{erro}</p>}
      {previa && (
        <div class="previa">
          <p><b>Prévia:</b> {Object.keys(previa.caso).length} campo(s) do caso, {previa.periodos.length} período(s), {previa.documentos.length} documento(s), {previa.epis.length} EPI(s), {previa.quesitos.length} quesito(s).</p>
          <ul>{Object.entries(previa.caso).map(([k, v]) => <li><b>{k}</b>: {String(v).slice(0, 140)}{String(v).length > 140 ? '…' : ''}</li>)}</ul>
          <label class="check"><input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.currentTarget.checked)} /> Substituir campos que já estão preenchidos</label>
          <div class="linha-botoes"><button type="button" class="primario" onClick={aplicar}>Aplicar ao caso</button></div>
        </div>
      )}
      {msg && <p class="ok-msg">{msg}</p>}
    </section>
  );
}
