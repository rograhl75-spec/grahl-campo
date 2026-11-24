import { horasDia, fmtHoras } from '../calc.js';
import { useState } from 'preact/hooks';
import { db } from '../db.js';
import { CAMPOS_SINTESE, CAMPOS_PERIODO, CAMPOS_DOC, CAMPOS_EPI, CAMPOS_ENTREVISTA_MOTORISTA, CAMPOS_AGENTE_AVALIADO, contextoLegal } from '../schema.js';
import { BotaoClaudeDireto, anexosDosAutos, ModoManual } from './ClaudeDireto.jsx';
import { SITUACOES, situacaoDoCaso, montarPrompt, lerJsonIA, aplicarIA, limparDuplicados } from '../aiimport.js';
import { avisarAlteracao } from '../sync.js';
import { dataBR } from '../docx/reports.js';
import { TF, salvar, CamposCompactos } from './fields.jsx';
import { RecordList } from './RecordList.jsx';
import { useLive } from './hooks.js';
import { Campos } from './fields.jsx';
import { sugerirParaVinculo, paraResultadoBusca, fichaPesquisa, fichaPesquisaTexto, rotuloParadigma, paradigmasPermitidos, PROMPT_LAUDOS_DOS_AUTOS, lerJsonVeiculos, adicionarParadigmas, doProcesso, citacaoDe } from '../paradigmas.js';
import { familiaDoGrupo, tipoDoGrupo, CAMPOS_VEICULO_COPIAVEIS } from '../schema.js';
import { CAMPOS_PENOSIDADE } from '../docx/penosidade.js';
import { ResultadoBusca } from './Paradigmas.jsx';
import { updateFields, softDelete } from '../db.js';
import { guardarAnexo, LIMITE_NUVEM } from '../paradigmas.js';
import { obterAnexo } from '../sync.js';
import { Icone } from './Icone.jsx';
import { confirmar } from './dialogo.jsx';
import { profissaoDoCaso, PROFISSOES } from '../data/profissoes.js';
import { createRecord, caseChildren } from '../db.js';
import { CAMPOS_FDS, promptFds, lerJsonFds, aplicarFds, componentesDoTexto } from '../fds.js';

// Banco de profissões: carrega no caso os agentes avaliados, o CBO e a profissiografia já estudados
const chaveAgente = (n) => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s*\(.*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
function CarregarProfissao({ rec }) {
  const periodos = useLive(async () => caseChildren(rec.id, 'periodo'), [rec.id], []);
  const [msg, setMsg] = useState('');
  const prof = profissaoDoCaso(rec.data, periodos);
  // sem profissão do banco (ex.: motorista), nada a mostrar; a profissão se escolhe em Dados do caso → Opções do caso
  if (!prof) return null;
  const carregar = async () => {
    if (!(await confirmar(`Carregar os ${prof.agentes.length} agentes avaliados e a profissiografia padrão de ${prof.nome}? Os agentes que já estão no caso não são repetidos: só os campos vazios deles são completados; o que você já escreveu não muda. Depois, exclua os agentes que o segurado não usa.`))) return;
    const lista = await caseChildren(rec.id, 'agenteAvaliado');
    // o mesmo agente com outro detalhe no nome ("Ácido fluorídrico (…)" e "Ácido fluorídrico 5 a 10% (…)")
    const mesmo = (x, y) => { const a = chaveAgente(x), b = chaveAgente(y); return a === b || (a.length >= 6 && b.startsWith(a)) || (b.length >= 6 && a.startsWith(b)); };
    let n = 0; let completados = 0; let ordem = lista.length;
    for (const a of prof.agentes) {
      const ja = lista.find((r) => mesmo(r.data.nome, a.nome));
      if (ja) {
        const novos = Object.fromEntries(Object.entries(a).filter(([k, val]) => k !== 'nome' && String(val ?? '').trim() && !String(ja.data[k] ?? '').trim()));
        if (Object.keys(novos).length) { await updateFields(ja.id, novos); completados += 1; }
        continue;
      }
      ordem += 1; n += 1;
      await createRecord('agenteAvaliado', rec.id, { ...a, ordem });
    }
    let nv = 0;
    for (const r of await caseChildren(rec.id, 'periodo')) {
      const novos = {};
      if (!String(r.data.cbo || '').trim()) novos.cbo = prof.cbo;
      if (!String(r.data.profissiografia || '').trim()) novos.profissiografia = prof.profissiografia;
      if (Object.keys(novos).length) { await updateFields(r.id, novos); nv += 1; }
    }
    if (!String(rec.data.analiseEpi || '').trim()) await updateFields(rec.id, { analiseEpi: prof.epi });
    avisarAlteracao();
    const ja = prof.agentes.length - n;
    setMsg([n ? `${n} agente(s) carregado(s)` : 'Nenhum agente novo', ja ? `${ja} já estava(m) no caso (não repetidos${completados ? `; ${completados} completado(s) nos campos vazios` : ''})` : '',
      nv ? `${nv} vínculo(s) completado(s) com CBO e profissiografia` : 'vínculos já com CBO e profissiografia'].filter(Boolean).join('; ') + (n ? '. Revise os resultados e exclua o que não se aplica.' : '.'));
  };
  // aplica os critérios do banco aos agentes que já estão no caso: códigos, resultados, fundamentação e textos;
  // resultado "a confirmar" no banco não substitui a resposta já dada no caso (ex.: mercúrio, raios X)
  const aplicar = async () => {
    if (!(await confirmar(`Aplicar aos agentes que já estão no caso os critérios atuais do banco de ${prof.nome}? Substitui códigos, resultados, fundamentação e textos do art. 68 pelos do banco; as respostas que você deu aos agentes "a confirmar" no banco (ex.: mercúrio, raios X) são mantidas.`))) return;
    const lista = await caseChildren(rec.id, 'agenteAvaliado');
    const mesmo = (x, y) => { const a = chaveAgente(x), b = chaveAgente(y); return a === b || (a.length >= 6 && b.startsWith(a)) || (b.length >= 6 && a.startsWith(b)); };
    let n = 0;
    for (const a of prof.agentes) {
      const ja = lista.find((r) => mesmo(r.data.nome, a.nome));
      if (!ja) continue;
      const novos = {};
      for (const [k, val] of Object.entries(a)) {
        if (['nome', 'tipo', 'vinculos'].includes(k) || !String(val ?? '').trim()) continue;
        if (/^res/.test(k) && val === 'A confirmar' && String(ja.data[k] || '').trim()) continue;
        if (String(ja.data[k] ?? '') !== String(val)) novos[k] = val;
      }
      if (Object.keys(novos).length) { await updateFields(ja.id, novos); n += 1; }
    }
    avisarAlteracao();
    setMsg(n ? `${n} agente(s) atualizado(s) pelos critérios do banco.` : 'Os agentes do caso já seguem os critérios do banco.');
  };
  return (
    <section class="bloco largo">
      <h3>Banco de profissões – {prof.nome}</h3>
      <p class="dica">Agentes avaliados ({prof.agentes.length}), CBO {prof.cbo}, profissiografia e análise de EPI já estudados em laudos anteriores. Os resultados são os seus critérios: revise em cada caso. Roteiro de entrevista: {prof.roteiro.length} itens; documentos a pedir: {prof.documentos.join(', ')}.</p>
      <div class="linha-botoes">
        <button type="button" class="sec" onClick={carregar}>Carregar agentes e profissiografia de {prof.nome}</button>
        <button type="button" class="sec" onClick={aplicar}>Aplicar os critérios atuais do banco aos agentes do caso</button>
      </div>
      {msg && <p class="ok-msg">{msg}</p>}
    </section>
  );
}

const RE_MOTORISTA = /motorista|caminh|carreteir|cobrador|ônibus|onibus|truck|carreta|bitrem|rodotrem|condutor|operador de m[áa]quina/i;
export function Preparacao({ rec, dadosDoCaso = null }) {
  const sintese = CAMPOS_SINTESE.filter(([k]) => k !== 'roteiro' && k !== 'analiseEpi');
  const vazio = !(rec.data.funcoes || '').trim() && !(rec.data.pedidos || '').trim();
  const periodos = useLive(async () => caseChildren(rec.id, 'periodo'), [rec.id], []);
  const nFds = useLive(async () => (await caseChildren(rec.id, 'fds')).length, [rec.id], 0);
  // paradigmas (veículos e máquinas) só para motorista / operador
  const motorista = rec.data.penosidade === 'Sim' || (rec.data.objeto || []).includes('Penosidade (motorista)') || RE_MOTORISTA.test(rec.data.funcoes || '')
    || periodos.some((r) => r.data.paradigmaRuido || r.data.paradigmaVibracao || r.data.veiculoModelo || RE_MOTORISTA.test(`${r.data.cargo || ''} ${r.data.atividades || ''}`));
  const planejado = !!(String(rec.data.roteiro || '').trim() || String(rec.data.analiseEpi || '').trim());
  return (
    <div class="grade">
      <ArquivoDoProcesso rec={rec} />
      <ImportarIA rec={rec} abertoInicial={vazio} />
      <h2 class="largo subtitulo-etapa">Conferência dos dados extraídos</h2>
      {dadosDoCaso}
      <Duplicados rec={rec} />
      <section class="bloco largo">
        <h3>Síntese dos autos</h3>
        <CamposCompactos rec={rec} campos={sintese} sempre={['funcoes', 'agentesAlegados', 'pedidos']} />
      </section>
      <RecordList kind="periodo" largo caseId={rec.id} campos={CAMPOS_PERIODO} titulo="Contratos / períodos" novo="Adicionar período"
        resumo={(r) => [r.data.empresa, r.data.inicio && `${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`, r.data.cargo,
          (r.data.paradigmaRuido || r.data.paradigmaVibracao) && `paradigmas ${[r.data.paradigmaRuido, r.data.paradigmaVibracao].filter(Boolean).join('/')}`].filter(Boolean).join(' · ')}
        extra={(r) => <VeiculoDoPeriodo r={r} />} />
      {motorista && <ParadigmasDosVinculos rec={rec} />}
      {contextoLegal(rec.data).prev && <CarregarProfissao rec={rec} />}
      {contextoLegal(rec.data).prev && (
        <RecordList kind="agenteAvaliado" largo caseId={rec.id} campos={CAMPOS_AGENTE_AVALIADO} titulo="Agentes avaliados (sem medição: biológicos, químicos e físicos)" novo="Adicionar agente"
          inicial={{ tipo: 'Químico' }} compacto
          resumo={(r) => [r.data.tipo, r.data.nome, r.data.vinculos && `vínculos ${r.data.vinculos}`,
            [r.data.resAte97 && `até 1997: ${r.data.resAte97}`, r.data.resDesde97 && `desde 1997: ${r.data.resDesde97}`].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')} />
      )}
      <RecordList kind="fds" largo caseId={rec.id} campos={CAMPOS_FDS} titulo="Produtos químicos – fichas das FDS (uma por produto)" novo="Adicionar produto"
        inicial={{ situacao: 'A conferir' }} compacto vazio="Nenhum produto. Cadastre os produtos químicos do caso ou peça ao Claude a ficha da FDS (abaixo)."
        resumo={(r) => [r.data.nome, r.data.fabricante, r.data.revisao && `FDS ${r.data.revisao}`, componentesDoTexto(r.data.s3Componentes).length && `${componentesDoTexto(r.data.s3Componentes).length} componente(s)`,
          r.data.fonteFds, r.data.situacao !== 'Conferido' && 'a conferir'].filter(Boolean).join(' · ')} />
      <details class="secao-etapa largo" open={nFds > 0}>
        <summary><b>Ficha da FDS pelo Claude</b> <small class="dica">produtos químicos: lê a FDS anexada ou pesquisa a do fabricante</small></summary>
        <PesquisarFds rec={rec} />
      </details>
      <RecordList kind="documento" largo caseId={rec.id} campos={CAMPOS_DOC} titulo="Documentos técnicos analisados" novo="Adicionar documento" limite={5}
        resumo={(r) => [r.data.tipo, r.data.identificacao].filter(Boolean).join(' – ')} />
      <RecordList kind="epi" largo caseId={rec.id} campos={CAMPOS_EPI} titulo="Ficha de EPIs" novo="Adicionar EPI" compacto
        resumo={(r) => [r.data.descricao, r.data.ca && `CA ${r.data.ca}`, r.data.dataEntrega].filter(Boolean).join(' · ')} />
      <details class="secao-etapa largo" open={planejado}>
        <summary><b>Planejamento da diligência e análise dos EPIs</b> <small class="dica">roteiro da vistoria, documentos a solicitar, equipamentos a levar</small></summary>
        <div class="bloco">
          <TF rec={rec} k="roteiro" label="Roteiro da vistoria / documentos a solicitar" area rows={5} />
          <TF rec={rec} k="analiseEpi" label="Análise crítica dos EPIs (fichas, CA, periodicidade)" area />
          <EquipamentosCaso rec={rec} />
        </div>
      </details>
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
  const remover = async (r) => { if (await confirmar(`Remover "${r.data.nome}" do caso?`)) { await softDelete(r.id); avisarAlteracao(); } };
  const mb = (n) => `${(n / 1048576).toFixed(1).replace('.', ',')} MB`;
  return (
    <section class="bloco largo passo-etapa">
      <h3><span class="num-passo">A</span> Arquivo do processo (PDF)</h3>
      <p class="dica">Guarde aqui o PDF completo dos autos (pode ser mais de um arquivo). Ele fica no caso, para abrir no tablet ou no PC e anexar no Claude.</p>
      {lista.map((r) => (
        <div class="linha-arquivo">
          <span><Icone nome="doc" /> {r.data.nome} <small>({mb(r.data.tamanho || 0)}{r.data.soLocal ? ' · só neste aparelho' : ''})</small></span>
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
    setMsg(`Aplicado: ${r.campos} campo(s), ${r.periodos} período(s), ${r.documentos} documento(s), ${r.epis} EPI(s), ${r.agentesAvaliados ? `${r.agentesAvaliados} agente(s) avaliado(s), ` : ''}${r.fotos ? `${r.fotos} foto(s) com legenda ou identificação, ` : ''}${r.produtos ? `${r.produtos} produto(s) químico(s) com ficha da FDS, ` : ''}${r.quesitos} quesito(s)`
      + (r.respostas ? `, ${r.respostas} resposta(s) do laudo` : '') + (r.postos || r.medicoes ? `, ${r.postos} posto(s) e ${r.medicoes} medição(ões) da diligência (veja em 2. Campo)` : '') + (r.ignorados ? `. ${r.ignorados} item(ns) que você já tinha excluído (ex.: vínculo fora do despacho) não foram recriados` : '') + '.');
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
      <p class="dica">O Claude lê os autos (item A) e preenche os dados do caso, a síntese, os vínculos, os documentos, os EPIs e os quesitos. Se o processo já tiver laudo ou diligência, preenche também o campo (diligência, postos e medições), as respostas e a fase. Você confere a prévia e aplica; o que você já preencheu não muda, a menos que marque "substituir".</p>
      <label class="campo"><span class="rotulo">Situação (escolhida pelo tipo do caso; pode trocar)</span>
        <select value={situacao} onChange={(e) => setSituacao(e.currentTarget.value)}>
          {SITUACOES.map((x) => <option value={x.id}>{x.titulo}</option>)}
        </select>
      </label>
      <BotaoClaudeDireto rotulo="Enviar os autos direto ao Claude" instrucao={prompt} anexos={() => anexosDosAutos(rec.id)}
        onResposta={(t) => { setTexto(t); try { setPrevia(lerJsonIA(t)); setErro(''); return 'Confira a prévia abaixo e toque em "Aplicar ao caso".'; } catch (e) { setPrevia(null); setErro(e.message); return ''; } }} />
      <ModoManual rotulo="Alternativa sem a chave de API (ou para colar uma resposta do claude.ai)">
        <ol class="passos">
          <li>Toque em <b>Copiar instrução</b> e cole numa conversa nova no Claude, com o PDF do processo anexado.</li>
          <li>Copie a resposta inteira (o bloco que começa com <code>{'{'}</code>), cole no campo abaixo e toque em <b>Ler e mostrar prévia</b>.</li>
        </ol>
        <div class="linha-botoes"><button type="button" class="sec" onClick={copiar}>Copiar instrução (claude.ai)</button></div>
        <details><summary>Ver a instrução</summary><pre class="prompt">{prompt}</pre></details>
        <label class="campo campo-area"><span class="rotulo">Resposta da IA (JSON)</span>
          <textarea rows={6} value={texto} onInput={(e) => setTexto(e.currentTarget.value)} placeholder='{"processo": {...}, "quesitos": [...]}' />
        </label>
        <div class="linha-botoes"><button type="button" onClick={ler} disabled={!texto.trim()}>Ler e mostrar prévia</button></div>
      </ModoManual>
      <div class="linha-botoes"><button type="button" class="sec mini" onClick={() => setAberto(false)}>Fechar</button></div>
      {erro && <p class="erro-msg">{erro}</p>}
      {previa && (
        <div class="previa">
          <p><b>Prévia:</b> {Object.keys(previa.caso).length} campo(s) do caso, {previa.periodos.length} período(s), {previa.documentos.length} documento(s), {previa.epis.length} EPI(s), {previa.quesitos.length} quesito(s)
            {previa.quesitos.some((q) => q.resposta) && `, ${previa.quesitos.filter((q) => q.resposta).length} com resposta do laudo`}
            {previa.postos.length > 0 && `, ${previa.postos.length} posto(s) e ${previa.postos.reduce((n, p) => n + p.medicoes.length, 0)} medição(ões) da diligência`}
            {(previa.produtos || []).length > 0 && `, ${previa.produtos.length} produto(s) químico(s) com ficha da FDS`}
            {(previa.fotos || []).length > 0 && `, ${previa.fotos.length} foto(s) com legenda ou identificação`}.</p>
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

export function VeiculoDoPeriodo({ r, abertoInicial }) {
  const [aberto, setAberto] = useState(abertoInicial ?? !!(r.data.veiculoModelo || r.data.paradigmaRuido));
  const [res, setRes] = useState(null);
  // o grupo do veículo da entrevista orienta a busca quando o tipo não foi digitado
  const tipoBusca = () => r.data.veiculoTipo || tipoDoGrupo(r.data.grupoVeiculo);
  // o grupo do veículo indica a família técnica do banco (ex.: cavalo antigo sem ar → F5); a família digitada prevalece
  // comparação por pontos com o banco (família provável pelo veículo, similares, modelo, marca, tipo, ar, época)
  const buscar = async () => {
    const s = await sugerirParaVinculo({ caseId: r.caseId, data: { ...r.data, veiculoTipo: tipoBusca() } });
    setRes(s.bloqueado ? { bloqueado: true } : paraResultadoBusca(s));
  };
  const escolher = async (tipo, p) => {
    await updateFields(r.id, tipo === 'ruido' ? { paradigmaRuido: p.data.codigo } : { paradigmaVibracao: p.data.codigo });
    avisarAlteracao();
  };
  if (!aberto) return <button type="button" class="mini" onClick={() => setAberto(true)}><Icone nome="caminhao" /> Veículo, paradigma e penosidade (motorista / operador)</button>;
  return (
    <div class="bloco destaque mt-p">
      <h4>Veículo do requerente neste período</h4>
      <div class="linha2"><Campos rec={r} campos={CAMPOS_VEICULO_PERIODO} /></div>
      {String(r.data.conducaoH || '').trim() && (isFinite(horasDia(r.data.conducaoH))
        ? <small class="dica">Tempo de condução usado nos cálculos: <b>{fmtHoras(horasDia(r.data.conducaoH))}/dia</b>.</small>
        : <small class="erro-msg">"{r.data.conducaoH}" não é um número de horas: os cálculos ficam pendentes. Escreva, por exemplo, 10, 8,5 ou 8h30.</small>)}
      <details class="mt" open={!!(r.data.grupoVeiculo || r.data.tipoCarga || r.data.carroceria)}>
        <summary><b>Entrevista do motorista (veículo, carga, trajetos e ocorrências)</b></summary>
        <p class="dica">Os itens da entrevista por vínculo. Trajetos, pernoite e jornada ficam nos fatores de penosidade abaixo; o tempo diário de condução, no campo acima.</p>
        <div class="linha2"><Campos rec={r} campos={CAMPOS_ENTREVISTA_MOTORISTA} /></div>
      </details>
      <div class="linha-botoes">
        <button type="button" onClick={buscar}>Sugerir paradigmas pelo banco</button>
        <CopiarDoVinculo r={r} />
      </div>
      {res?.bloqueado && <p class="dica">Perícia judicial: o app não sugere paradigmas do banco. Para usar, marque em "Paradigmas dos vínculos" que o juízo indicou o uso de medições anteriores, ou use as medições dos laudos juntados aos autos.</p>}
      {res && !res.bloqueado && <ResultadoBusca res={res} onEscolher={escolher} />}
      {res && !res.bloqueado && !res.ruido.length && !res.vibracao.length && <FichaPesquisa r={r} familia={res.familia || familiaDoGrupo(r.data.grupoVeiculo)} />}
      <details class="mt" open={!!(r.data.jornadaSemanal || r.data.penosidadeConclusao)}>
        <summary><b>Penosidade (motorista / cobrador – a partir de 29/04/1995)</b></summary>
        <p class="dica">Fatores concretos de desgaste, vínculo a vínculo. Até 28/04/1995 basta a categoria profissional; depois, a penosidade depende de perícia técnica individualizada. Os dados saem no quadro de penosidade do laudo, do parecer e do LTCAT.</p>
        <div class="linha2"><Campos rec={r} campos={CAMPOS_PENOSIDADE} /></div>
      </details>
    </div>
  );
}

function Duplicados({ rec }) {
  const [res, setRes] = useState(null);
  const [msg, setMsg] = useState('');
  const n = res ? res.periodos + res.medicoes + res.postos : 0;
  const procurar = async () => { setMsg(''); setRes(await limparDuplicados(rec.id)); };
  const remover = async () => {
    const r = await limparDuplicados(rec.id, { aplicar: true });
    avisarAlteracao();
    setRes(null);
    setMsg(`✓ Para a lixeira: ${r.periodos} período(s), ${r.medicoes} medição(ões) e ${r.postos} posto(s) repetidos. O que só os repetidos tinham foi copiado para os mantidos.`);
  };
  return (
    <div class="largo linha-botoes">
      <button type="button" class="sec" onClick={procurar}>Procurar dados repetidos</button>
      {res && (n ? <><span>{res.periodos} período(s), {res.medicoes} medição(ões) e {res.postos} posto(s) repetidos.</span>
        <button type="button" class="primario" onClick={remover}>Remover os repetidos</button></> : <span>Nenhum dado repetido.</span>)}
      {msg && <span class="ok-msg">{msg}</span>}
    </div>
  );
}

// "Mesma empresa anterior, mesmas atividades": copia veículo, entrevista e penosidade de outro vínculo (só os campos vazios)
function CopiarDoVinculo({ r }) {
  const outros = useLive(async () => (await db.records.where('[caseId+kind]').equals([r.caseId, 'periodo']).toArray())
    .filter((x) => !x.deleted && x.id !== r.id).sort((a, b) => String(a.data.inicio).localeCompare(String(b.data.inicio))), [r.id], []);
  const [msg, setMsg] = useState('');
  if (!outros.length) return null;
  const copiar = async (id) => {
    const o = outros.find((x) => x.id === id);
    if (!o) return;
    const mud = {};
    for (const k of CAMPOS_VEICULO_COPIAVEIS) if (String(o.data[k] ?? '').trim() && !String(r.data[k] ?? '').trim()) mud[k] = o.data[k];
    if (!Object.keys(mud).length) { setMsg('Nada a copiar: os campos deste vínculo já estão preenchidos.'); return; }
    mud.copiadoDe = `${o.data.empresa || ''} (${dataBR(o.data.inicio)})`;
    await updateFields(r.id, mud); avisarAlteracao();
    setMsg(`✓ ${Object.keys(mud).length - 1} campo(s) copiados de ${o.data.empresa || 'outro vínculo'}. Confira e ajuste o que mudou (ex.: trajetos).`);
  };
  return (
    <span class="copiar-vinculo">
      <select aria-label="Copiar dados de outro vínculo" value="" onChange={(e) => copiar(e.currentTarget.value)}>
        <option value="">Copiar do vínculo… (mesmas atividades)</option>
        {outros.map((o) => <option value={o.id}>{o.data.empresa || 'Vínculo'} – {dataBR(o.data.inicio)}</option>)}
      </select>
      {msg && <small class="ok-msg">{msg}</small>}
    </span>
  );
}

// Ficha para pesquisar o paradigma nos laudos do signatário quando o banco não tem
function FichaPesquisa({ r, familia }) {
  const [msg, setMsg] = useState('');
  const copiar = async () => {
    try { await navigator.clipboard.writeText(fichaPesquisaTexto(r, familia)); setMsg('✓ Ficha copiada.'); } catch (e) { setMsg('Selecione o texto da ficha.'); }
  };
  return (
    <div class="evidencias alerta">
      <b>Sem paradigma no banco para este veículo – pesquise nos seus laudos:</b>
      {fichaPesquisa(r, familia).map(([k, t]) => <span><b>{k}:</b> {t}</span>)}
      <small>Achou? Inclua em Bases técnicas → Veículos → Importar / exportar (laudo antigo) e volte aqui para vincular. Se o veículo tiver um similar já medido, cadastre-o em Bases técnicas → Veículos → Similares.</small>
      <span class="linha-botoes"><button type="button" class="mini" onClick={copiar}>Copiar ficha</button><a class="botao sec" href="#/paradigmas/importar">Ir para Bases técnicas → Importar</a>{msg && <small>{msg}</small>}</span>
    </div>
  );
}

// Medições dos laudos de outros peritos juntados aos autos (prova emprestada): extrai pelo Claude, inclui no banco
// marcadas com o processo do caso e, com a opção ligada, só elas entram na sugestão de paradigmas deste caso
function MedicoesDosAutos({ rec }) {
  const [previa, setPrevia] = useState(null);
  const [msg, setMsg] = useState('');
  const numero = rec.data.numero || '';
  const dosAutos = useLive(async () => (await db.records.where('kind').equals('paradigma').toArray()).filter((p) => !p.deleted && doProcesso(p, numero)), [numero], []);
  const alternar = async (e) => { await updateFields(rec.id, { somenteMedicoesAutos: e.currentTarget.checked }); avisarAlteracao(); };
  const incluir = async () => {
    const cods = await adicionarParadigmas(previa, { processoAutos: numero });
    avisarAlteracao();
    setMsg(`✓ ${cods.length} medição(ões) incluída(s): ${cods.join(', ')} (situação "Revisar"). Confira os valores em Bases técnicas → Veículos medidos e depois clique em "Sugerir paradigmas para todos os vínculos".`);
    setPrevia(null);
  };
  return (
    <details class="mt" open={rec.data.somenteMedicoesAutos || dosAutos.length > 0}>
      <summary><b>Medições dos laudos juntados aos autos (prova emprestada)</b>{dosAutos.length ? ` – ${dosAutos.length} no banco` : ''}</summary>
      <label class="check"><input type="checkbox" checked={!!rec.data.somenteMedicoesAutos} onChange={alternar} /> Usar somente as medições dos laudos juntados aos autos deste processo (sem o banco do signatário)</label>
      {!numero && <p class="erro-msg">Informe o número do processo no cadastro do caso: é ele que liga as medições aos autos.</p>}
      {dosAutos.length > 0 && <ul class="lista-curta">{dosAutos.map((p) => <li><b>{rotuloParadigma(p)}</b> – Lavg {p.data.lavg || '—'} · arep {p.data.arep || p.data.arenLaudo || '—'} · VDVR {p.data.vdvrLaudo || '—'} · {citacaoDe(p)}{/não usar/i.test(p.data.situacao || '') ? ' (NÃO USAR)' : ''}</li>)}</ul>}
      <BotaoClaudeDireto rotulo="Extrair as medições dos laudos dos autos" sec instrucao={PROMPT_LAUDOS_DOS_AUTOS} anexos={async () => {
        const a = await anexosDosAutos(rec.id);
        if (!a.length) throw new Error('Anexe primeiro o PDF dos autos na etapa 1. Autos, item A.');
        return a;
      }} onResposta={(t) => { try { const l = lerJsonVeiculos(t); setPrevia(l); setMsg(''); return `${l.length} medição(ões) encontrada(s): confira a prévia e inclua.`; } catch (e) { setPrevia(null); return `Erro ao ler a resposta: ${e.message}`; } }} />
      {previa && (
        <div class="previa">
          <ul>{previa.map((v) => { const i = v.identificacao || {}, r = v.resultados || {}, f = v.fonte || {}; return <li>{i.marca} {i.modelo} {i.ano} – Lavg {r.lavg_q5 ?? '—'} · arep {r.arep ?? r.aren_laudo ?? '—'} · VDVR {r.vdvr_laudo ?? '—'} · perito {f.perito || '?'} · proc. {f.processo || '?'} {f.paginas_autos ? `(${f.paginas_autos})` : ''}{v.observacoes ? <><br /><small>{v.observacoes}</small></> : ''}</li>; })}</ul>
          <button type="button" class="primario" onClick={incluir}>Incluir no banco, ligadas a este processo</button>
        </div>
      )}
      {msg && <p class="ok-msg">{msg}</p>}
    </details>
  );
}

// Todos os vínculos de uma vez: candidato de ruído e de vibração de cada um, para aceitar em bloco
export function ParadigmasDosVinculos({ rec }) {
  const [linhas, setLinhas] = useState(null);
  const [msg, setMsg] = useState('');
  const pesquisar = async () => {
    setMsg('Pesquisando no banco…');
    const ps = (await db.records.where('[caseId+kind]').equals([rec.id, 'periodo']).toArray()).filter((x) => !x.deleted)
      .sort((a, b) => String(a.data.inicio).localeCompare(String(b.data.inicio)));
    const out = [];
    for (const r of ps) {
      const categoria = !!(r.data.fim && r.data.fim <= '1995-04-28');
      out.push({ r, categoria, s: categoria ? null : await sugerirParaVinculo(r) });
    }
    setLinhas(out); setMsg('');
  };
  const aplicar = async () => {
    let n = 0;
    for (const { r, s } of linhas) {
      if (!s) continue;
      const mud = {};
      if (!r.data.paradigmaRuido && s.ruido) mud.paradigmaRuido = s.ruido.p.data.codigo;
      if (!r.data.paradigmaVibracao && s.vibracao) mud.paradigmaVibracao = s.vibracao.p.data.codigo;
      if (Object.keys(mud).length) { await updateFields(r.id, mud); n++; }
    }
    avisarAlteracao();
    setMsg(`✓ Paradigmas vinculados em ${n} vínculo(s) que estavam sem. Os já escolhidos não foram alterados.`);
    setLinhas(null);
  };
  const rot = (x) => (x ? `${rotuloParadigma(x.p)} (${x.papel})` : '—');
  const soAutos = !!rec.data.somenteMedicoesAutos;
  if (!paradigmasPermitidos(rec.data)) return (
    <section class="bloco largo">
      <h3>Paradigmas dos vínculos</h3>
      <p class="dica">Perícia judicial: a avaliação usa as suas medições (inclusive em empresa paradigma, na perícia por similaridade), sem o banco de paradigmas. O banco só entra se o juízo indicar o uso de medições anteriores; as medições dos laudos juntados aos autos ficam abaixo.</p>
      <label class="check"><input type="checkbox" checked={!!rec.data.usarBancoParadigmas} onChange={async (e) => { await updateFields(rec.id, { usarBancoParadigmas: e.currentTarget.checked }); avisarAlteracao(); }} /> O juízo indicou o uso de medições anteriores (banco de paradigmas do signatário)</label>
      <MedicoesDosAutos rec={rec} />
    </section>
  );
  return (
    <section class="bloco largo">
      <div class="linha-botoes entre"><h3>Paradigmas dos vínculos</h3>
        <button type="button" onClick={pesquisar}>Sugerir paradigmas para todos os vínculos</button></div>
      <p class="dica">{soAutos
        ? 'Somente as medições dos laudos juntados aos autos deste processo entram na sugestão (o banco do signatário fica de fora). Sem medição adequada nos autos, o vínculo fica sem paradigma.'
        : 'O app pesquisa no banco cada vínculo (tabela de similares, família do grupo do veículo e tipo). Vínculos sem paradigma recebem uma ficha para você pesquisar nos seus laudos. No documento, um vínculo ainda sem paradigma usa o melhor candidato marcado em amarelo para conferir.'}</p>
      <MedicoesDosAutos rec={rec} />
      {linhas && (
        <>
          <div class="tabela-rolagem"><table class="tabela">
            <thead><tr><th>Vínculo</th><th>Veículo / grupo</th><th>Ruído (motivos)</th><th>Vibração (motivos)</th><th>Família do veículo</th></tr></thead>
            <tbody>{linhas.map(({ r, s, categoria }) => (
              <tr>
                <td><b>{r.data.empresa}</b><br /><small>{dataBR(r.data.inicio)} a {r.data.fim ? dataBR(r.data.fim) : 'atual'}</small></td>
                <td><small>{[r.data.veiculoMarca, r.data.veiculoModelo].filter(Boolean).join(' ') || '—'}<br />{r.data.grupoVeiculo || ''}</small></td>
                {categoria ? <td colSpan={3}><small>Até 28/04/1995: categoria profissional, sem paradigma.</small></td> : <>
                  <td><small>{r.data.paradigmaRuido ? `já vinculado: ${r.data.paradigmaRuido}` : rot(s.ruido)}</small></td>
                  <td><small>{r.data.paradigmaVibracao ? `já vinculado: ${r.data.paradigmaVibracao}` : rot(s.vibracao)}</small></td>
                  <td><small>{s.familia ? `Família ${s.familia} (${s.origemFamilia})` : 'Família não identificada – informe no vínculo'}{s.ruido || s.vibracao ? '' : <><br /><span class="alerta-txt">sem paradigma – pesquisar: {fichaPesquisaTexto(r, s.familia)}</span></>}</small></td>
                </>}
              </tr>))}</tbody>
          </table></div>
          <div class="linha-botoes"><button type="button" class="primario" onClick={aplicar}>Vincular os sugeridos aos vínculos sem paradigma</button>
            <a class="botao sec" href="#/paradigmas/importar">Incluir paradigma pesquisado</a></div>
        </>
      )}
      {msg && <p class="ok-msg">{msg}</p>}
    </section>
  );
}

// Ficha da FDS pelo Claude: lê a FDS anexada ou pesquisa a do fabricante na internet
function PesquisarFds({ rec }) {
  const produtos = useLive(async () => caseChildren(rec.id, 'fds'), [rec.id], []);
  const [nomes, setNomes] = useState('');
  const [json, setJson] = useState('');
  const [msg, setMsg] = useState('');
  const [substituir, setSubstituir] = useState(false);
  // sugestão: produtos já cadastrados ainda sem composição
  const pendentes = produtos.filter((r) => !String(r.data.s3Componentes || '').trim()).map((r) => [r.data.nome, r.data.fabricante].filter(Boolean).join(' – '));
  const copiar = async () => {
    const lista = nomes.split('\n').map((x) => x.trim()).filter(Boolean);
    const alvo = lista.length ? lista : pendentes;
    if (!alvo.length) { setMsg('Escreva os produtos (um por linha), com o fabricante quando souber.'); return; }
    try { await navigator.clipboard.writeText(promptFds(alvo)); setMsg(`✓ Instrução copiada (${alvo.length} produto(s)). Cole no Claude e anexe as FDS que tiver; as que faltarem ele pesquisa e cita o endereço.`); }
    catch (e) { setMsg('Não foi possível copiar.'); }
  };
  const aplicar = async () => {
    try {
      const lista = lerJsonFds(json);
      const r = await aplicarFds(rec.id, lista, { substituir });
      avisarAlteracao();
      setMsg(`✓ ${r.novos} produto(s) novo(s) e ${r.completados} completado(s), como "a conferir".`);
      setJson('');
    } catch (e) { setMsg(`Erro: ${e.message}`); }
  };
  return (
    <section class="bloco largo">
      <h3>Ficha da FDS pelo Claude</h3>
      <p class="dica">Nos documentos, cada produto sai numa ficha própria com as seções 2 (perigos), 3 (composição), 8 (controle de exposição e EPI) e 9 (propriedades) da FDS, além dos quadros obrigatórios de cada tipo de laudo. FDS fornecida pela empresa prevalece sobre a pesquisada; a pesquisada sai com o endereço e o aviso de que a versão pode diferir da usada na época.</p>
      <label class="campo"><span class="rotulo">Produtos (um por linha, com o fabricante){pendentes.length ? ` – em branco: os ${pendentes.length} cadastrados sem composição` : ''}</span>
        <textarea rows={2} value={nomes} onInput={(e) => setNomes(e.currentTarget.value)} placeholder={pendentes.join('\n')} /></label>
      <BotaoClaudeDireto rotulo="Ler / pesquisar as FDS direto com o Claude" web permitirArquivos rotuloArquivos="Anexar as FDS que tiver (PDF ou fotos do rótulo)"
        instrucao={() => { const lista = nomes.split('\n').map((x) => x.trim()).filter(Boolean); const alvo = lista.length ? lista : pendentes; if (!alvo.length) throw new Error('Escreva os produtos (um por linha), com o fabricante quando souber.'); return promptFds(alvo); }}
        onResposta={(t) => { setJson(t); return 'Confira o JSON abaixo e toque em "Aplicar".'; }} />
      <div class="linha-botoes"><button type="button" class="sec" onClick={copiar}>Copiar instrução (claude.ai)</button></div>
      <label class="campo"><span class="rotulo">Resposta do Claude (JSON) – preenchida sozinha pelo envio direto, ou cole aqui</span>
        <textarea rows={3} value={json} onInput={(e) => setJson(e.currentTarget.value)} /></label>
      <label class="check"><input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.currentTarget.checked)} /> Substituir dados já preenchidos</label>
      <div class="linha-botoes"><button type="button" class="primario" disabled={!json.trim()} onClick={aplicar}>Aplicar</button></div>
      {msg && <p class="ok-msg">{msg}</p>}
    </section>
  );
}
