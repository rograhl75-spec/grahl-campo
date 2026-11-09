import { useState } from 'preact/hooks';
import { CATALOGO } from '../docx/reports.js';
import { exportarBackup, baixarArquivo, carimbo } from '../backup.js';
import { OPCOES_REDACAO, exportarParaClaude } from '../aiimport.js';
import { gravarTudoAgora, salvar } from './fields.jsx';
import { db } from '../db.js';
import { PERFIL_ID, contasDoPerfil, PERFIL_PADRAO } from '../docx/base.js';
import { useLive } from './hooks.js';

const SUGESTAO_REDACAO = (c) => (c.papel === 'Perito do Juízo' ? 'laudo'
  : /Assistente/i.test(c.papel || '') ? 'parecerAT'
    : c.tipoAtuacao === 'Extrajudicial' ? 'ltcat' : 'laudo');

const QUANDO = {
  '1. Início do caso': 'Logo após extrair os dados dos autos (etapa 2).',
  '2. Antes da diligência': 'Com a data da vistoria definida.',
  '3. Depois da diligência': 'Com o campo e as fotos registrados (etapas 4 e 5).',
  '4. Laudo / parecer': 'O Word traz a estrutura e os quadros prontos. Para o texto completo, use também "Redigir com o Claude", logo abaixo.',
  '5. Quesitos suplementares e esclarecimentos': 'Quando o Juízo manda responder quesitos suplementares ou esclarecer o laudo. Cadastre e responda os quesitos na etapa 3 (há o atalho com o Claude lá) e gere a resposta aqui.',
  '6. Recebimento dos honorários': 'Após a entrega do laudo e dos esclarecimentos.',
};

export function Documentos({ rec }) {
  const [ocupado, setOcupado] = useState('');
  const [msg, setMsg] = useState('');
  const [verTodos, setVerTodos] = useState(false);
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
      setMsg(`✓ ${r.nome} gerado. Ao abrir no Word, confirme "Sim" para atualizar o sumário e as listas. Trechos em amarelo são para você completar.${r.faltando ? ` Atenção: ${r.faltando} foto(s) ainda não baixadas neste aparelho ficaram de fora.` : ''}`);
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
  const outros = CATALOGO.filter((d) => !d.rec(c));
  const grupos = (lista) => [...new Set(lista.map((d) => d.grupo))].sort().map((g) => [g, lista.filter((d) => d.grupo === g)]);

  return (
    <div class="docs">
      <p class="dica largo">Os documentos estão na ordem em que costumam ser usados e saem em Word no seu papel timbrado, já preenchidos com os dados das etapas anteriores. O que depende da sua análise sai marcado em amarelo. Aparecem só os modelos que servem para este tipo de caso.</p>
      {grupos(recomendados).map(([g, lista]) => (
        <section class="grupo-docs">
          <h3>{g}</h3>
          {QUANDO[g] && <p class="passo-docs">{QUANDO[g]}</p>}
          <div class="grade-docs">
            {lista.map((d) => <CartaoDoc d={d} ocupado={ocupado} gerar={gerar} contas={contas} contaSel={contaSel} recId={rec.id} />)}
          </div>
        </section>
      ))}
      {outros.length > 0 && (
        <section class="grupo-docs">
          <button type="button" class="sec" onClick={() => setVerTodos(!verTodos)}>{verTodos ? 'Ocultar' : 'Mostrar'} outros modelos ({outros.length})</button>
          {verTodos && <div class="grade-docs">{outros.map((d) => <CartaoDoc d={d} ocupado={ocupado} gerar={gerar} contas={contas} contaSel={contaSel} recId={rec.id} />)}</div>}
        </section>
      )}
      <LevarParaClaude rec={rec} />
      <section class="grupo-docs">
        <h3>Cópia de segurança</h3>
        <div class="bloco doc">
          <p>ZIP com todos os dados e fotos originais deste caso, para guardar no Drive ou no PC.</p>
          <button type="button" disabled={!!ocupado} onClick={backupCaso}>{ocupado === 'zip' ? 'Gerando…' : 'Exportar caso (ZIP)'}</button>
        </div>
      </section>
      {msg && <p class="ok-msg aviso-fixo">{msg}</p>}
    </div>
  );
}

function CartaoDoc({ d, ocupado, gerar, contas = [], contaSel, recId }) {
  return (
    <div class="bloco doc">
      <h4>{d.titulo}</h4>
      <p>{d.desc}</p>
      {d.usaConta && (contas.length ? (
        <label class="campo"><span class="rotulo">Conta para os honorários</span>
          <select value={contaSel} onChange={(e) => salvar(recId, 'contaBancaria', e.currentTarget.value)}>
            {contas.map((ct) => <option value={ct.id}>{ct.rotulo}</option>)}
          </select>
        </label>
      ) : <p class="alerta-txt">Cadastre as contas em Configurações → Meus dados.</p>)}
      <button type="button" class="primario" disabled={!!ocupado} onClick={() => gerar(d)}>{ocupado === d.id ? 'Gerando…' : 'Gerar Word'}</button>
    </div>
  );
}

function LevarParaClaude({ rec }) {
  const [tipo, setTipo] = useState(SUGESTAO_REDACAO(rec.data));
  const [msg, setMsg] = useState('');
  const copiar = async () => {
    gravarTudoAgora();
    const texto = await exportarParaClaude(rec.id, tipo);
    try {
      await navigator.clipboard.writeText(texto);
      setMsg(`✓ Caso copiado (${Math.round(texto.length / 1000)} mil caracteres). Cole no Claude, anexe os autos e, se quiser, o Word gerado acima e as fotos.`);
    } catch (e) {
      baixarArquivo(new Blob([texto], { type: 'text/markdown' }), `Caso_para_Claude_${carimbo()}.md`);
      setMsg('Não foi possível copiar; o texto foi baixado como arquivo .md para anexar no Claude.');
    }
  };
  return (
    <section class="grupo-docs">
      <h3>Redigir com o Claude (texto completo do laudo ou parecer)</h3>
      <div class="bloco destaque">
        <p>Copia tudo o que está no caso (síntese dos autos, campo, medições, paradigmas, quesitos com anotações e seus critérios técnicos) com a instrução de redação do documento escolhido. Cole no Claude e anexe o PDF do processo (etapa 2).</p>
        <label class="campo"><span class="rotulo">Documento a redigir</span>
          <select value={tipo} onChange={(e) => setTipo(e.currentTarget.value)}>
            {OPCOES_REDACAO.map(([k, r]) => <option value={k}>{r}</option>)}
          </select>
        </label>
        <button type="button" class="primario" onClick={copiar}>Copiar caso para o Claude</button>
        {msg && <p class="ok-msg">{msg}</p>}
      </div>
    </section>
  );
}
