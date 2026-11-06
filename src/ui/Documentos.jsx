import { useState } from 'preact/hooks';
import { CATALOGO } from '../docx/reports.js';
import { exportarBackup, baixarArquivo, carimbo } from '../backup.js';
import { OPCOES_REDACAO, exportarParaClaude } from '../aiimport.js';
import { gravarTudoAgora } from './fields.jsx';

const SUGESTAO_REDACAO = (c) => (c.papel === 'Perito do Juízo' ? 'laudo'
  : /Assistente/i.test(c.papel || '') ? 'parecerAT'
    : c.tipoAtuacao === 'Extrajudicial' ? 'ltcat' : 'laudo');

export function Documentos({ rec }) {
  const [ocupado, setOcupado] = useState('');
  const [msg, setMsg] = useState('');
  const [verTodos, setVerTodos] = useState(false);
  const c = rec.data;

  const gerar = async (doc) => {
    gravarTudoAgora();
    setOcupado(doc.id); setMsg('');
    try {
      const r = await doc.fn(rec.id);
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
  const grupos = (lista) => [...new Set(lista.map((d) => d.grupo))].map((g) => [g, lista.filter((d) => d.grupo === g)]);

  return (
    <div class="docs">
      <p class="dica largo">Documentos em Word no seu papel timbrado, preenchidos com os dados do caso. O que depende da sua análise sai marcado em amarelo.</p>
      {grupos(recomendados).map(([g, lista]) => (
        <section class="grupo-docs">
          <h3>{g}</h3>
          <div class="grade-docs">
            {lista.map((d) => <CartaoDoc d={d} ocupado={ocupado} gerar={gerar} />)}
          </div>
        </section>
      ))}
      {outros.length > 0 && (
        <section class="grupo-docs">
          <button type="button" class="sec" onClick={() => setVerTodos(!verTodos)}>{verTodos ? 'Ocultar' : 'Mostrar'} outros modelos ({outros.length})</button>
          {verTodos && <div class="grade-docs">{outros.map((d) => <CartaoDoc d={d} ocupado={ocupado} gerar={gerar} />)}</div>}
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

function CartaoDoc({ d, ocupado, gerar }) {
  return (
    <div class="bloco doc">
      <h4>{d.titulo}</h4>
      <p>{d.desc}</p>
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
      <h3>Redigir com o Claude</h3>
      <div class="bloco destaque">
        <p>Copia o caso inteiro (autos, campo, medições, quesitos com anotações e seus critérios técnicos) com a instrução de redação do documento escolhido.</p>
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
