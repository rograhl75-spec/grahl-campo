import { useState } from 'preact/hooks';
import { db, createRecord, softDelete } from '../db.js';
import { avisarAlteracao, obterAnexo } from '../sync.js';
import {
  importarBaseJson, sugerirParadigmas, lerJsonVeiculos, adicionarParadigmas, guardarAnexo, PROMPT_LAUDO_ANTIGO,
  rotuloParadigma, certificadoVencido, REGRA_CERT_MESES_PADRAO,
} from '../paradigmas.js';
import { useLive } from './hooks.js';
import { Campos } from './fields.jsx';
import { RecordList } from './RecordList.jsx';

export const CAMPOS_PARADIGMA = {
  'Identificação': [
    ['codigo', 'Código', 'text'], ['tipo', 'Tipo (toco, truck, cavalo, bitrem, ônibus, van, trator…)', 'text'],
    ['marca', 'Marca', 'text'], ['modelo', 'Modelo', 'text'], ['ano', 'Ano', 'text'],
    ['situacao', 'Situação', 'select', ['OK', 'Revisar', 'Ressalva', 'Confirmar modelo', 'RECALCULAR VDVR', 'NÃO USAR']],
  ],
  'Características técnicas (ordem da similaridade)': [
    ['familia', 'Família técnica (F1, F2…)', 'text'], ['posicaoMotor', 'Posição do motor', 'text'], ['cabine', 'Cabine – geração e isolamento', 'text'],
    ['arCondicionado', 'Ar-condicionado', 'text'], ['suspensaoCabine', 'Suspensão da cabine', 'text'], ['suspensaoAssento', 'Suspensão do assento', 'text'],
    ['configuracao', 'Configuração (eixos, implemento, carga)', 'text'], ['via', 'Via predominante', 'text'],
  ],
  'Resultados': [
    ['duracaoRuidoMin', 'Duração da amostra de ruído (min)', 'num'], ['lavg', 'Lavg q=5 (dB(A))', 'num'], ['leq', 'Leq q=3 (dB(A))', 'num'],
    ['jornadaLaudo', 'Jornada do laudo de origem (h)', 'num'], ['nenLaudo', 'NEN no laudo (dB(A))', 'num'],
    ['tempoVibracao', 'Tempo amostrado de vibração', 'text'], ['arep', 'arep VCI (m/s²)', 'num'], ['arenLaudo', 'aren no laudo (m/s²)', 'num'],
    ['vdvrLaudo', 'VDVR no laudo (m/s^1,75)', 'num'], ['eixoDominante', 'Eixo dominante', 'text'], ['arenVmb', 'aren VMB (m/s²)', 'num'], ['ibutg', 'IBUTG (°C)', 'num'],
  ],
  'Fonte (laudo extrajudicial: sem nome do segurado)': [
    ['fonteTipo', 'Tipo de fonte', 'select', ['Judicial', 'Judicial trabalhista', 'Judicial (perita terceira)', 'Extrajudicial']],
    ['processo', 'Processo', 'text'], ['vara', 'Vara', 'text'], ['dataMedicao', 'Data da medição (DD/MM/AAAA)', 'text'], ['citacao', 'Como citar no laudo', 'text'],
  ],
  'Instrumentação': [
    ['ruidoEquip', 'Dosímetro', 'text'], ['ruidoSerie', 'Série', 'text'], ['ruidoCert', 'Certificado', 'text'], ['ruidoCertData', 'Data do certificado', 'text'],
    ['calibEquip', 'Calibrador', 'text'], ['calibSerie', 'Série do calibrador', 'text'], ['calibCertData', 'Data do certificado do calibrador', 'text'],
    ['vibEquip', 'Medidor de vibração', 'text'], ['vibSerie', 'Série', 'text'], ['vibCert', 'Certificado', 'text'], ['vibCertData', 'Data do certificado', 'text'],
  ],
  'Uso e observações': [
    ['servePara', 'Serve de paradigma para', 'area'], ['observacoes', 'Observações', 'area'], ['idsAnteriores', 'IDs do banco anterior', 'text'],
  ],
};

const ABAS = [['veiculos', 'Veículos medidos'], ['similares', 'Similares'], ['familias', 'Famílias'], ['buscar', 'Buscar paradigma'], ['importar', 'Importar']];

export function Paradigmas({ aba = 'veiculos' }) {
  return (
    <div class="pagina">
      <div class="caso-topo"><div class="caso-id">
        <h1>Banco de paradigmas</h1>
        <div class="caso-sub">Veículos e máquinas medidos em perícias e laudos, usados como paradigma por similaridade.</div>
      </div></div>
      <nav class="abas">{ABAS.map(([k, r]) => <a href={`#/paradigmas/${k}`} class={aba === k ? 'ativo' : ''}>{r}</a>)}</nav>
      {aba === 'veiculos' && <Veiculos />}
      {aba === 'similares' && <Similares />}
      {aba === 'familias' && <Familias />}
      {aba === 'buscar' && <Buscar />}
      {aba === 'importar' && <Importar />}
    </div>
  );
}

function useParadigmas() {
  return useLive(async () => (await db.records.where('kind').equals('paradigma').toArray()).filter((r) => !r.deleted)
    .sort((a, b) => String(a.data.codigo).localeCompare(String(b.data.codigo), 'pt', { numeric: true })), [], []);
}

function alertas(p, meses) {
  const d = p.data, out = [];
  if (certificadoVencido(d.ruidoCertData, d.dataMedicao, meses)) out.push(`certificado do dosímetro com mais de ${meses} meses na data da medição`);
  if (certificadoVencido(d.vibCertData, d.dataMedicao, meses)) out.push(`certificado do medidor de vibração com mais de ${meses} meses na data da medição`);
  return out;
}

function Veiculos() {
  const lista = useParadigmas();
  const cfg = useLive(() => db.records.get('cfg-paradigmas'), [], null);
  const meses = Number((cfg && cfg.data.regraCertMeses) || REGRA_CERT_MESES_PADRAO);
  const [busca, setBusca] = useState('');
  const [fam, setFam] = useState('');
  const [aberto, setAberto] = useState(null);
  const fams = [...new Set(lista.map((p) => p.data.familia).filter(Boolean))].sort();
  const t = busca.toLowerCase();
  const filtrados = lista.filter((p) => (!fam || p.data.familia === fam) && (!t || JSON.stringify(p.data).toLowerCase().includes(t)));
  const novo = async () => { const r = await createRecord('paradigma', null, { codigo: '', situacao: 'Revisar' }); avisarAlteracao(); setAberto(r.id); };
  return (
    <div class="grade">
      <section class="bloco largo">
        <div class="barra-casos">
          <input class="busca" type="search" placeholder="Buscar marca, modelo, processo…" value={busca} onInput={(e) => setBusca(e.currentTarget.value)} />
          <button type="button" class="primario" onClick={novo}>＋ Novo veículo medido</button>
        </div>
        <div class="chips filtros" style="margin-top:10px">
          <button type="button" class={`chip ${!fam ? 'on' : ''}`} onClick={() => setFam('')}>Todas</button>
          {fams.map((f) => <button type="button" class={`chip ${fam === f ? 'on' : ''}`} onClick={() => setFam(f)}>{f}</button>)}
        </div>
      </section>
      {!lista.length && <section class="bloco largo"><p class="vazio">Banco vazio. Importe a sua base em "Importar".</p></section>}
      <div class="largo">
        {filtrados.map((p) => {
          const d = p.data;
          const al = alertas(p, meses);
          return (
            <div class={`item ${aberto === p.id ? 'aberto' : ''}`} key={p.id}>
              <div class="item-topo" onClick={() => setAberto(aberto === p.id ? null : p.id)}>
                <span class="item-titulo">
                  <b>{rotuloParadigma(p) || '(sem identificação)'}</b>{' '}
                  <span class="etq">{d.familia || 'sem família'}</span>{' '}
                  {d.situacao && d.situacao !== 'OK' && <span class="etq fase">{d.situacao}</span>}
                  <br /><small class="suave">
                    {[d.lavg && `Lavg ${d.lavg}`, d.arep && `arep ${d.arep}`, d.vdvrLaudo && `VDVR ${d.vdvrLaudo}`, d.citacao].filter(Boolean).join(' · ')}
                  </small>
                  {al.length > 0 && <><br /><small class="alerta-txt">⚠ {al.join('; ')}</small></>}
                </span>
                <span class="item-acoes" onClick={(e) => e.stopPropagation()}>
                  <button type="button" class="mini perigo" onClick={async () => { if (confirm('Mover para a lixeira?')) { await softDelete(p.id); avisarAlteracao(); } }}>✕</button>
                </span>
              </div>
              {aberto === p.id && (
                <div class="item-corpo">
                  {Object.entries(CAMPOS_PARADIGMA).map(([g, campos]) => (
                    <details open={g === 'Identificação' || g === 'Resultados'}>
                      <summary><b>{g}</b></summary>
                      <div class="linha2"><Campos rec={p} campos={campos} /></div>
                    </details>
                  ))}
                  {d.anexoId && <AbrirAnexo id={d.anexoId} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AbrirAnexo({ id }) {
  const [msg, setMsg] = useState('');
  const abrir = async () => {
    try { const b = await obterAnexo(id); window.open(URL.createObjectURL(b), '_blank'); } catch (e) { setMsg(e.message); }
  };
  return <p><button type="button" class="mini" onClick={abrir}>📄 Abrir laudo de origem</button> {msg && <span class="erro-msg">{msg}</span>}</p>;
}

function Similares() {
  return (
    <div class="grade"><div class="largo">
      <RecordList kind="similar" caseId={null} titulo="Tabela de similares" novo="Adicionar veículo similar"
        campos={[['marca', 'Marca', 'text'], ['modelo', 'Modelo', 'text'], ['tipo', 'Tipo', 'text'], ['epoca', 'Época de fabricação', 'text'],
          ['familia', 'Família técnica', 'text'], ['paradigmaRuido', 'Paradigma de ruído (código, ex.: M01)', 'text'], ['paradigmaRuidoAlt', 'Paradigma de ruído alternativo', 'text'],
          ['paradigmaVibracao', 'Paradigma de vibração', 'text'], ['status', 'Status', 'select', ['Medido', 'Proposta – validar', 'Validado', 'Não usar']], ['obs', 'Observações', 'area']]}
        resumo={(r) => `${r.data.marca || ''} ${r.data.modelo || ''} · ${r.data.familia || '?'} · ruído ${r.data.paradigmaRuido || '—'} · VCI ${r.data.paradigmaVibracao || '—'} · ${r.data.status || ''}`} />
    </div></div>
  );
}

function Familias() {
  return (
    <div class="grade"><div class="largo">
      <p class="dica">A similaridade considera, nesta ordem: posição do motor, geração e isolamento da cabine, suspensão da cabine e do assento, configuração do veículo e tipo de via predominante.</p>
      <RecordList kind="familia" caseId={null} titulo="Famílias técnicas" novo="Adicionar família"
        campos={[['codigo', 'Código (F1, F2…)', 'text'], ['descricao', 'Descrição', 'text'], ['criterios', 'Critérios que definem a família', 'area']]}
        resumo={(r) => `${r.data.codigo || ''} – ${r.data.descricao || ''}`} />
    </div></div>
  );
}

function Buscar() {
  const [q, setQ] = useState({ marca: '', modelo: '', tipo: '', familia: '' });
  const [res, setRes] = useState(null);
  const buscar = async () => setRes(await sugerirParadigmas(q));
  const campo = (k, r) => (
    <label class="campo"><span class="rotulo">{r}</span><input value={q[k]} onInput={(e) => setQ({ ...q, [k]: e.currentTarget.value })} /></label>
  );
  return (
    <div class="grade">
      <section class="bloco largo">
        <h3>Veículo do requerente</h3>
        <div class="linha2">{campo('marca', 'Marca')}{campo('modelo', 'Modelo')}{campo('tipo', 'Tipo')}{campo('familia', 'Família (se já souber)')}</div>
        <button type="button" class="primario" onClick={buscar}>Buscar paradigmas</button>
      </section>
      {res && <ResultadoBusca res={res} />}
    </div>
  );
}

export function ResultadoBusca({ res, onEscolher }) {
  const linha = ({ p, papel }, tipo) => (
    <div class="lixo">
      <div><b>{rotuloParadigma(p)}</b> <span class="etq">{papel}</span><br />
        <small class="suave">{tipo === 'ruido' ? `Lavg ${p.data.lavg || '—'} · jornada do laudo ${p.data.jornadaLaudo || '?'} h` : `arep ${p.data.arep || '—'} · VDVR ${p.data.vdvrLaudo || '—'}`} · {p.data.citacao} · {p.data.situacao}</small></div>
      {onEscolher && <button type="button" class="mini" onClick={() => onEscolher(tipo, p)}>Usar</button>}
    </div>
  );
  return (
    <section class="bloco largo">
      <p><b>Critério:</b> {res.criterio || 'nenhuma correspondência'}{res.familia ? ` · família ${res.familia}` : ''}</p>
      {res.similar && res.similar.data.obs && <p class="dica">{res.similar.data.obs}</p>}
      <h4>Ruído</h4>
      {res.ruido.length ? res.ruido.map((x) => linha(x, 'ruido')) : <p class="alerta-txt">[PESQUISAR] Sem paradigma de ruído no banco.</p>}
      <h4>Vibração de corpo inteiro</h4>
      {res.vibracao.length ? res.vibracao.map((x) => linha(x, 'vibracao')) : <p class="alerta-txt">[PESQUISAR] Sem paradigma de vibração no banco.</p>}
    </section>
  );
}

function Importar() {
  const [msg, setMsg] = useState('');
  const [texto, setTexto] = useState('');
  const [previa, setPrevia] = useState(null);
  const [anexoId, setAnexoId] = useState('');
  const [nomeAnexo, setNomeAnexo] = useState('');
  const [msgBase, setMsgBase] = useState('');
  const total = useLive(async () => {
    const l = await db.records.where('kind').anyOf('paradigma', 'similar').toArray();
    return { v: l.filter((r) => r.kind === 'paradigma' && !r.deleted).length, s: l.filter((r) => r.kind === 'similar' && !r.deleted).length };
  }, [], { v: 0, s: 0 });

  const importarBase = async (e) => {
    const f = e.currentTarget.files[0]; e.currentTarget.value = '';
    if (!f) return;
    setMsgBase('⏳ Importando…');
    try {
      const r = await importarBaseJson(JSON.parse(await f.text()));
      avisarAlteracao();
      if (r.falhas.length) { setMsgBase(`Erro: ${r.falhas.length} item(ns) não gravados – ${r.falhas.slice(0, 3).join(' | ')}. Mande um print desta mensagem.`); return; }
      setMsgBase(r.veiculos + r.similares + r.familias
        ? `✓ Importação concluída: ${r.veiculos} veículo(s), ${r.similares} similar(es) e ${r.familias} família(s) novos ou atualizados. O que você já editou no app foi mantido.`
        : '✓ Importação concluída: a base já estava atualizada neste aparelho, nada mudou.');
    } catch (err) { setMsgBase('Erro: ' + err.message); }
  };
  const anexar = async (e) => {
    const f = e.currentTarget.files[0]; e.currentTarget.value = '';
    if (!f) return;
    setAnexoId(await guardarAnexo(f, 'Laudo antigo – origem de paradigmas')); setNomeAnexo(f.name); avisarAlteracao();
  };
  const copiar = async () => { try { await navigator.clipboard.writeText(PROMPT_LAUDO_ANTIGO); setMsg('Instrução copiada. Cole no Claude e anexe o PDF do laudo.'); } catch (e) { setMsg('Selecione o texto da instrução abaixo.'); } };
  const ler = () => { try { setPrevia(lerJsonVeiculos(texto)); setMsg(''); } catch (e) { setPrevia(null); setMsg('Erro: ' + e.message); } };
  const aplicar = async () => {
    const cods = await adicionarParadigmas(previa, { anexoId });
    avisarAlteracao();
    setMsg(`✓ ${cods.length} veículo(s) incluídos: ${cods.join(', ')} (situação "Revisar" – confira e ajuste em Veículos medidos).`);
    setPrevia(null); setTexto(''); setAnexoId(''); setNomeAnexo('');
  };
  return (
    <div class="grade">
      <section class="bloco largo">
        <h3>Importar a base (arquivo JSON)</h3>
        <p>Use o arquivo <code>cadastro_veiculos_medidos.json</code>. Pode importar de novo depois de atualizar a planilha: nada é duplicado e o que você editou no app prevalece.</p>
        <p><b>No banco agora:</b> {total.v} veículo(s) medido(s) e {total.s} similar(es). Com a nuvem conectada, basta importar em um aparelho: os outros recebem a base sozinhos.</p>
        <label class="botao-arquivo">Escolher arquivo JSON<input type="file" accept=".json,application/json,text/plain,*/*" hidden onChange={importarBase} /></label>
        {msgBase && <p class={msgBase.startsWith('Erro') ? 'erro-msg' : 'ok-msg'}>{msgBase}</p>}
      </section>
      <section class="bloco largo destaque">
        <h3>Incluir laudos antigos</h3>
        <ol class="passos">
          <li>Anexe o PDF do laudo (fica guardado e vinculado aos veículos incluídos).</li>
          <li>Copie a instrução, cole no Claude e anexe o mesmo PDF.</li>
          <li>Cole aqui a resposta (JSON), confira a prévia e inclua.</li>
        </ol>
        <div class="linha-botoes">
          <label class="botao-arquivo">{nomeAnexo ? `📄 ${nomeAnexo}` : '1. Anexar PDF do laudo'}<input type="file" accept="application/pdf,.pdf" hidden onChange={anexar} /></label>
          <button type="button" class="primario" onClick={copiar}>2. Copiar instrução</button>
        </div>
        <details><summary>Ver a instrução</summary><pre class="prompt">{PROMPT_LAUDO_ANTIGO}</pre></details>
        <label class="campo campo-area"><span class="rotulo">3. Resposta do Claude (JSON)</span>
          <textarea rows={6} value={texto} onInput={(e) => setTexto(e.currentTarget.value)} placeholder='{"veiculos": [...]}' />
        </label>
        <button type="button" onClick={ler} disabled={!texto.trim()}>Ler e mostrar prévia</button>
        {previa && (
          <div class="previa">
            <p><b>{previa.length} veículo(s):</b></p>
            <ul>{previa.map((v) => <li>{(v.identificacao || {}).marca} {(v.identificacao || {}).modelo} {(v.identificacao || {}).ano} – Lavg {(v.resultados || {}).lavg_q5 ?? '—'} · arep {(v.resultados || {}).arep ?? '—'} · {(v.fonte || {}).tipo} {(v.fonte || {}).data}</li>)}</ul>
            <button type="button" class="primario" onClick={aplicar}>Incluir no banco</button>
          </div>
        )}
      </section>
      {msg && <p class="ok-msg largo">{msg}</p>}
    </div>
  );
}
