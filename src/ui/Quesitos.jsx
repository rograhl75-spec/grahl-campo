import { useState } from 'preact/hooks';
import { ORIGEM_QUESITO, CAMPOS_ESCLARECIMENTOS, ehSuplementar, rotuloOrigem } from '../schema.js';

const OPCOES_ORIGEM = ORIGEM_QUESITO.map((o) => [o, rotuloOrigem(o)]);
import { montarPromptSuplementares, lerJsonSuplementares, aplicarSuplementares } from '../aiimport.js';
import { avisarAlteracao } from '../sync.js';
import { RecordList } from './RecordList.jsx';
import { Campos, salvar, gravarTudoAgora } from './fields.jsx';
import { db } from '../db.js';
import { useLive } from './hooks.js';
import { baixarArquivo, carimbo } from '../backup.js';

const SUPL = ['Sim', 'Não'];

const CAMPOS = [
  ['origem', 'Origem', 'select', OPCOES_ORIGEM],
  ['numero', 'Número', 'text'],
  ['texto', 'Texto literal do quesito', 'area'],
  ['resposta', 'Anotações / resposta (em campo ou no escritório)', 'area'],
  ['suplementar', 'Suplementar (formulado depois do laudo)?', 'select', SUPL],
];

const CAMPOS_SUPL = [
  ['origem', 'Origem (quem formulou)', 'select', OPCOES_ORIGEM],
  ['numero', 'Número', 'text'],
  ['refPeticao', 'Petição (ex.: "mov. 67.1")', 'text'],
  ['texto', 'Texto literal do quesito (com as alíneas)', 'area'],
  ['resposta', 'Resposta (sai no Word; uma alínea por linha, se quiser)', 'area'],
  ['suplementar', 'Suplementar (formulado depois do laudo)?', 'select', SUPL],
];

const resumoQ = (r) => {
  const t = (r.data.texto || '').replace(/\s+/g, ' ');
  const ok = (r.data.resposta || '').trim() ? ' ✓' : '';
  return `${r.data.origem || ''} ${r.data.numero ? `– ${r.data.numero})` : ''} ${t.slice(0, 110)}${t.length > 110 ? '…' : ''}${ok}`;
};

export function Quesitos({ rec }) {
  const c = rec.data;
  const nSupl = useLive(async () => (await db.records.where('[caseId+kind]').equals([rec.id, 'quesito']).toArray()).filter((r) => !r.deleted && ehSuplementar(r)).length, [rec.id], 0);
  const temSupl = nSupl > 0 || !!(c.laudoRefPerito || c.esclDecisaoRef || c.prazoEsclarecimentos);
  const [abrirSupl, setAbrirSupl] = useState(false);
  return (
    <div class="grade">
      <section class="bloco largo">
        <p class="dica">Os quesitos entram automaticamente quando você extrai os dados dos autos na etapa <b>2. Autos</b>. Aqui você confere, corrige ou acrescenta. A anotação de cada quesito pode ser feita durante a vistoria e sai no Registro da diligência.</p>
        <label class="check"><input type="checkbox" checked={!!c.semQuesitos} onChange={(e) => salvar(rec.id, 'semQuesitos', e.currentTarget.checked)} /> Este caso não tem quesitos</label>
      </section>
      <div class="largo">
        <RecordList kind="quesito" caseId={rec.id} campos={CAMPOS} titulo="Quesitos do laudo" novo="Adicionar quesito" inicial={{ origem: 'Juízo' }}
          filtro={(r) => !ehSuplementar(r)} resumo={resumoQ} />
      </div>
      {temSupl || abrirSupl ? <Suplementares rec={rec} /> : (
        <section class="bloco largo">
          <div class="linha-botoes entre">
            <div><b>Depois do laudo: quesitos suplementares e esclarecimentos</b><br /><small>Use quando o Juízo mandar responder quesitos suplementares ou esclarecer o laudo (art. 477, § 2º, do CPC).</small></div>
            <button type="button" onClick={() => setAbrirSupl(true)}>Abrir</button>
          </div>
        </section>
      )}
    </div>
  );
}

function Suplementares({ rec }) {
  return (
    <>
      <section class="bloco largo destaque">
        <h3>Depois do laudo: quesitos suplementares e esclarecimentos</h3>
        <p class="dica">Os quesitos suplementares não entram no laudo nem no pré-relatório: saem na <b>Resposta aos quesitos suplementares</b> (etapa 6. Documentos). As respostas sobre a diligência devem seguir os seus registros de campo (etapa 4): horário, presentes, local e GPS.</p>
        <div class="linha2"><Campos rec={rec} campos={CAMPOS_ESCLARECIMENTOS} /></div>
      </section>
      <ClaudeSuplementares rec={rec} />
      <div class="largo">
        <RecordList kind="quesito" caseId={rec.id} campos={CAMPOS_SUPL} titulo="Quesitos suplementares" novo="Adicionar quesito suplementar"
          inicial={{ origem: 'Autor / Reclamante', suplementar: 'Sim' }} filtro={ehSuplementar} resumo={resumoQ}
          vazio="Nenhum quesito suplementar. Use o Claude acima ou adicione à mão." />
      </div>
    </>
  );
}

function ClaudeSuplementares({ rec }) {
  const [texto, setTexto] = useState('');
  const [previa, setPrevia] = useState(null);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [substituir, setSubstituir] = useState(false);

  const copiar = async () => {
    gravarTudoAgora();
    const prompt = await montarPromptSuplementares(rec.id);
    try {
      await navigator.clipboard.writeText(prompt);
      setMsg('Instrução copiada, com os seus registros de campo. Cole no Claude e anexe a petição dos quesitos, a decisão e o laudo (ou o PDF do processo).');
    } catch (e) {
      baixarArquivo(new Blob([prompt], { type: 'text/markdown' }), `Quesitos_suplementares_para_Claude_${carimbo()}.md`);
      setMsg('Não foi possível copiar; a instrução foi baixada como arquivo .md para anexar no Claude.');
    }
  };
  const ler = () => {
    setErro(''); setMsg('');
    try { setPrevia(lerJsonSuplementares(texto)); } catch (e) { setPrevia(null); setErro(e.message); }
  };
  const aplicar = async () => {
    const r = await aplicarSuplementares(rec.id, previa, { substituir });
    avisarAlteracao();
    setMsg(`Aplicado: ${r.novos} quesito(s) novo(s), ${r.respostas} resposta(s) preenchida(s), ${r.campos} campo(s) do caso. Confira cada resposta antes de gerar o Word.`);
    setPrevia(null); setTexto('');
  };
  return (
    <section class="bloco largo destaque passo-etapa">
      <h3><span class="num-passo">IA</span> Transcrever e minutar as respostas com o Claude</h3>
      <ol class="passos">
        <li>Toque em <b>Copiar instrução</b>. Ela já leva os dados do caso e da diligência registrados no app.</li>
        <li>Numa conversa nova no Claude, cole a instrução e anexe a petição dos quesitos suplementares, a decisão e o laudo (ou o PDF inteiro do processo).</li>
        <li>Copie a resposta (o bloco que começa com <code>{'{'}</code>), cole abaixo, confira a prévia e aplique. Os quesitos são criados sem duplicar e as respostas preenchem só as que estiverem vazias, a menos que marque "substituir".</li>
      </ol>
      <div class="linha-botoes"><button type="button" class="primario" onClick={copiar}>Copiar instrução</button></div>
      <label class="campo campo-area"><span class="rotulo">Resposta do Claude (JSON)</span>
        <textarea rows={5} value={texto} onInput={(e) => setTexto(e.currentTarget.value)} placeholder='{"esclarecimentos": {...}, "quesitos": [...]}' />
      </label>
      <div class="linha-botoes"><button type="button" onClick={ler} disabled={!texto.trim()}>Ler e mostrar prévia</button></div>
      {erro && <p class="erro-msg">{erro}</p>}
      {previa && (
        <div class="previa">
          <p><b>Prévia:</b> {previa.quesitos.length} quesito(s) suplementar(es), {Object.keys(previa.caso).length} campo(s) do caso.</p>
          <ul>
            {Object.entries(previa.caso).map(([k, v]) => <li><b>{k}</b>: {String(v).slice(0, 160)}{String(v).length > 160 ? '…' : ''}</li>)}
            {previa.quesitos.map((q) => <li><b>{q.origem} {q.numero}</b>{q.refPeticao ? ` (${q.refPeticao})` : ''}: {q.texto.slice(0, 120)}{q.texto.length > 120 ? '…' : ''}{q.resposta ? ' – com resposta' : ''}</li>)}
          </ul>
          <label class="check"><input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.currentTarget.checked)} /> Substituir campos e respostas já preenchidos</label>
          <div class="linha-botoes"><button type="button" class="primario" onClick={aplicar}>Aplicar ao caso</button></div>
        </div>
      )}
      {msg && <p class="ok-msg">{msg}</p>}
    </section>
  );
}
