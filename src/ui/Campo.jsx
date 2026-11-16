import { useState, useEffect, useRef } from 'preact/hooks';
import { db, createRecord, softDelete, updateFields } from '../db.js';
import { avisarAlteracao } from '../sync.js';
import { CAMPOS_POSTO, AGENTES_MEDICAO, contextoLegal } from '../schema.js';
import { CAMPOS_MEDICAO, CAMPOS_MEDICAO_COMUNS, calculados } from '../medicoes.js';
import { confrontoAnexo11 } from '../quimicos.js';
import { FormaPrev } from './Quimicos.jsx';
import { fmt } from '../calc.js';
import { lerGps } from '../photos.js';
import { promoverMedicao } from '../paradigmas.js';
import { evidenciasDaDiligencia, aplicarEvidencias } from '../fotosLaudo.js';
import { TF, Campos, salvar } from './fields.jsx';
import { useLive } from './hooks.js';
import { EquipamentosCaso, VeiculoDoPeriodo, ParadigmasDosVinculos } from './Preparacao.jsx';
import { ehParecerTecnico, chaveVistoria, qtdVistorias, vistoriasDoCaso, CAMPOS_VISTORIA, DESC_AUDIO } from '../schema.js';
import { dataBR } from '../docx/reports.js';
import { guardarAnexo, LIMITE_NUVEM } from '../paradigmas.js';
import { obterAnexo } from '../sync.js';
import { DESC_APENDICE, LETRAS, tituloSugerido } from '../apendices.js';
import { lerAnotacao, promptAnotacoes } from '../notas.js';
import { lerJsonIA, aplicarIA, faseAvanca } from '../aiimport.js';
import { BotoesFoto, Miniaturas } from './Fotos.jsx';
import { Icone } from './Icone.jsx';
import { confirmar, avisar } from './dialogo.jsx';

function hojeIso() { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function agoraHM() { return new Date().toTimeString().slice(0, 5); }

export function Campo({ rec }) {
  const postos = useLive(async () => (await db.records.where('[caseId+kind]').equals([rec.id, 'posto']).toArray())
    .filter((r) => !r.deleted).sort((a, b) => (a.data.ordem ?? a.createdAt) - (b.data.ordem ?? b.createdAt)), [rec.id], []);
  const [aberto, setAberto] = useState(null);
  const [gpsMsg, setGpsMsg] = useState('');

  const iniciar = async (n = 1) => {
    const mud = {};
    const k = (campo) => chaveVistoria(n, campo);
    if (!rec.data[k('Data')]) mud[k('Data')] = hojeIso();
    if (!rec.data[k('Inicio')]) mud[k('Inicio')] = agoraHM();
    if (n === 1 && !rec.data.vistoriaLocal && rec.data.reuNome) mud.vistoriaLocal = rec.data.reuNome;
    if (['A preparar', 'Diligência agendada', '', undefined].includes(rec.data.fase)) mud.fase = 'Diligência realizada';
    await updateFields(rec.id, mud);
    avisarAlteracao();
    pegarGps(n);
  };
  const pegarGps = async (n = 1) => {
    setGpsMsg('Obtendo localização…');
    const g = await lerGps(15000);
    if (g) { await salvar(rec.id, chaveVistoria(n, 'Gps'), g); setGpsMsg(''); }
    else setGpsMsg('Não foi possível obter o GPS (verifique a permissão de localização).');
  };
  const novoPosto = async () => {
    const ordem = postos.reduce((m, r) => Math.max(m, r.data.ordem || 0), 0) + 1;
    const r = await createRecord('posto', rec.id, { nome: '', ordem });
    avisarAlteracao();
    setAberto(r.id);
  };
  const removerPosto = async (p) => {
    if (!await confirmar(`Mover o posto "${p.data.nome || 'sem nome'}" para a lixeira? Medições e fotos dele continuam no caso.`)) return;
    await softDelete(p.id); avisarAlteracao();
  };

  return (
    <div class="grade campo-tela">
      <AnotacoesDiligencia rec={rec} />
      {ehEntrevistaMotorista(rec.data) && <EntrevistaVinculos rec={rec} />}

      <Diligencia rec={rec} iniciar={iniciar} pegarGps={pegarGps} gpsMsg={gpsMsg} />

      <section class="bloco largo">
        <h3>Postos / atividades avaliados <span class="contador">{postos.length}</span></h3>
        {!postos.length && <p class="vazio">Cadastre cada posto, setor ou função avaliada. Medições e fotos ficam vinculadas a ele.</p>}
        {postos.map((p) => (
          <div class={`item ${aberto === p.id ? 'aberto' : ''}`} key={p.id}>
            <div class="item-topo" onClick={() => setAberto(aberto === p.id ? null : p.id)}>
              <span class="item-titulo">{p.data.nome || <em>(posto sem nome – toque para preencher)</em>}</span>
              <span class="item-acoes" onClick={(e) => e.stopPropagation()}>
                <ContagemPosto caseId={rec.id} postoId={p.id} />
                <button type="button" class="mini perigo" onClick={() => removerPosto(p)}>✕</button>
              </span>
            </div>
            {aberto === p.id && (
              <div class="item-corpo">
                <Campos rec={p} campos={CAMPOS_POSTO} />
                <VinculosDoPosto rec={p} caseId={rec.id} />
                <Medicoes caseId={rec.id} postoId={p.id} ctx={contextoLegal(rec.data)} caso={rec} />
                <div class="campo">
                  <span class="rotulo">Fotos deste posto</span>
                  <BotoesFoto caseId={rec.id} postoId={p.id} />
                  <Miniaturas caseId={rec.id} postoId={p.id} />
                </div>
              </div>
            )}
          </div>
        ))}
        <button type="button" class="adicionar" onClick={novoPosto}>＋ Adicionar posto / atividade</button>
      </section>

      <section class="bloco largo">
        <h3>Medições sem posto vinculado</h3>
        <Medicoes caseId={rec.id} postoId="" ctx={contextoLegal(rec.data)} caso={rec} />
      </section>

      <RelatoriosMedicao rec={rec} />

      <section class="bloco largo">
        <h3>Fotos gerais</h3>
        <BotoesFoto caseId={rec.id} postoId="" />
        <Miniaturas caseId={rec.id} postoId="" />
      </section>

      <section class="bloco largo">
        <TF rec={rec} k="vistoriaNotas" label="Anotações gerais da diligência" area rows={4} />
      </section>
    </div>
  );
}

// Vínculos (períodos) que o posto representa: liga as medições à conclusão por período
function VinculosDoPosto({ rec, caseId }) {
  const periodos = useLive(async () => (await db.records.where('[caseId+kind]').equals([caseId, 'periodo']).toArray()).filter((r) => !r.deleted)
    .sort((a, b) => String(a.data.inicio || '').localeCompare(String(b.data.inicio || ''))), [caseId], []);
  if (!periodos.length) return null;
  const atual = Array.isArray(rec.data.vinculos) ? rec.data.vinculos : [];
  const alterna = (id) => salvar(rec.id, 'vinculos', atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]);
  const rot = (r) => `${r.data.empresa || 'Vínculo'} (${(r.data.inicio || '?').split('-').reverse().join('/')} a ${r.data.fim ? r.data.fim.split('-').reverse().join('/') : 'atual'})`;
  return (
    <div class="campo">
      <span class="rotulo">Vínculos que este posto representa (liga as medições à conclusão por período)</span>
      <div class="chips">
        {periodos.map((r) => <button type="button" class={`chip ${atual.includes(r.id) ? 'on' : ''}`} onClick={() => alterna(r.id)}>{rot(r)}</button>)}
      </div>
      {!atual.length && <small class="dica">Sem marcação, o app liga pelo nome da empresa no nome do posto ou, havendo um só posto e um só vínculo, liga os dois.</small>}
    </div>
  );
}

function ContagemPosto({ caseId, postoId }) {
  const c = useLive(async () => {
    const l = await db.records.where('caseId').equals(caseId).filter((r) => !r.deleted && r.data.postoId === postoId).toArray();
    return { m: l.filter((r) => r.kind === 'medicao').length, f: l.filter((r) => r.kind === 'foto').length };
  }, [caseId, postoId], { m: 0, f: 0 });
  return <span class="contagem">{c.m} med. · {c.f} fotos</span>;
}

function equipPadrao(equip, agente) {
  const alvo = agente === 'Ruído' ? /dosemax|dosí/i : agente.startsWith('Calor') ? /itemp|ibutg/i : agente.startsWith('Vibra') ? /axpro|vibra/i : null;
  if (!alvo) return '';
  const e = equip.find((x) => alvo.test(`${x.data.modelo} ${x.data.nome}`));
  return e ? e.id : '';
}

// Medição de agente químico: escolha do agente no banco e confronto com o Anexo 11 da NR-15
function QuimicoDoBanco({ m }) {
  const agentes = useLive(async () => (await db.records.where('kind').equals('quimico').toArray()).filter((r) => !r.deleted)
    .sort((a, b) => String(a.data.nome || '').localeCompare(String(b.data.nome || ''), 'pt-BR')), [], []);
  const ag = agentes.find((a) => a.id === m.data.agenteBanco);
  const cf = ag ? confrontoAnexo11(ag.data, m.data.valor, m.data.unidade, { maximo: m.data.maximo }) : null;
  const f = (x) => fmt(x, x < 10 ? 2 : 1);
  return (
    <div class="calculos">
      <label class="campo"><span class="rotulo">Agente do banco de químicos</span>
        <select value={m.data.agenteBanco || ''} onChange={(e) => {
          const a = agentes.find((x) => x.id === e.currentTarget.value);
          salvar(m.id, 'agenteBanco', e.currentTarget.value);
          if (a && !String(m.data.descricao || '').trim()) salvar(m.id, 'descricao', a.data.nome);
        }}>
          <option value="">—</option>
          {agentes.map((a) => <option value={a.id}>{a.data.nome}{a.data.cas ? ` (CAS ${a.data.cas})` : ''}</option>)}
        </select>
      </label>
      {!agentes.length && <small class="dica">O banco está vazio. Carregue a base em Paradigmas → Agentes químicos.</small>}
      {ag && !ag.data.nr15Ppm && !ag.data.nr15Mgm3 && <div>Este agente não tem limite no Quadro 1 do Anexo 11 no banco. {ag.data.nr15Obs || 'Veja os Anexos 12, 13 e 13-A.'}</div>}
      {ag && ag.data.acgihTwa && <div><b>ACGIH{ag.data.acgihEdicao ? ` ${ag.data.acgihEdicao}` : ''}</b> (referência técnica, NR-9): TWA {ag.data.acgihTwa}{ag.data.acgihStel ? ` · ${ag.data.acgihStel}` : ''}{ag.data.acgihNotacoes ? ` · ${ag.data.acgihNotacoes}` : ''}</div>}
      {ag && ag.data.linach && <div><b>LINACH {ag.data.linach}</b>{ag.data.linach === 'Grupo 1' ? ' – previdenciário: avaliação qualitativa para períodos a partir de 08/10/2014, se o agente tiver CAS e constar do Anexo IV (IN 128/2022, art. 298); a partir de 01/07/2020 (Dec. 10.410/2020), medidas de controle que eliminem a nocividade descaracterizam a exposição.' : ''}</div>}
      {ag && <FormaPrev d={ag.data} />}
      {cf && <>
        <div><b>Anexo 11:</b> LT {f(cf.lt)} {cf.un}{cf.teto ? ' (valor teto)' : ''}{cf.grau ? ` – grau ${cf.grau}` : ''}{cf.pele ? ' – absorção também pela pele' : ''}</div>
        <div><b>Resultado:</b> {f(cf.c)} {cf.un} = {fmt(cf.pct, 0)}% do LT – {cf.supera ? 'ACIMA do limite' : 'dentro do limite'}</div>
        {!cf.teto && <div><b>Valor máximo</b> (LT × FD {String(cf.fd).replace('.', ',')}): {f(cf.vmax)} {cf.un}{cf.graveIminente ? ' – SUPERADO: risco grave e iminente (item 7)' : ''}</div>}
      </>}
      {ag && ag.data.situacao !== 'Conferido' && <small class="dica">Ficha do agente "A conferir": confira o limite no texto da NR-15 antes de usar no laudo.</small>}
    </div>
  );
}

function Medicoes({ caseId, postoId, ctx = {}, caso }) {
  const lista = useLive(async () => (await db.records.where('[caseId+kind]').equals([caseId, 'medicao']).toArray())
    .filter((r) => !r.deleted && (r.data.postoId || '') === postoId).sort((a, b) => a.createdAt - b.createdAt), [caseId, postoId], []);
  const equip = useLive(async () => (await db.records.where('kind').equals('equip').toArray()).filter((e) => !e.deleted), [], []);
  const [aberta, setAberta] = useState(null);

  const nova = async (agente) => {
    const d = new Date();
    const r = await createRecord('medicao', caseId, {
      agente, postoId, equipamentoId: equipPadrao(equip, agente),
      dataMedicao: new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10), horaInicio: d.toTimeString().slice(0, 5),
    });
    avisarAlteracao();
    setAberta(r.id);
  };
  const remover = async (m) => {
    if (!await confirmar('Mover esta medição para a lixeira?')) return;
    await softDelete(m.id); avisarAlteracao();
  };

  return (
    <div class="medicoes">
      {lista.map((m) => {
        const calc = calculados(m, ctx);
        const principal = m.data.lavg ? `Lavg ${m.data.lavg}` : m.data.aren ? `aren ${m.data.aren}` : m.data.tbn ? `tbn ${m.data.tbn} / tg ${m.data.tg || '?'}` : (m.data.valor || '');
        return (
          <div class={`item med ${aberta === m.id ? 'aberto' : ''}`} key={m.id}>
            <div class="item-topo" onClick={() => setAberta(aberta === m.id ? null : m.id)}>
              <span class="item-titulo"><Icone nome="regua" /> {m.data.agente} {principal && `· ${principal}`} {calc[0] && `· ${calc[0][0]} ${calc[0][1]}`}</span>
              <span class="item-acoes" onClick={(e) => e.stopPropagation()}>
                <button type="button" class="mini perigo" onClick={() => remover(m)}>✕</button>
              </span>
            </div>
            {aberta === m.id && (
              <div class="item-corpo">
                <label class="campo"><span class="rotulo">Equipamento</span>
                  <select value={m.data.equipamentoId || ''} onChange={(e) => salvar(m.id, 'equipamentoId', e.currentTarget.value)}>
                    <option value="">—</option>
                    {equip.map((e) => <option value={e.id}>{e.data.nome} – {e.data.modelo} {e.data.serie ? `(série ${e.data.serie})` : ''}</option>)}
                  </select>
                </label>
                <div class="linha2">
                  <Campos rec={m} campos={(CAMPOS_MEDICAO[m.data.agente] || CAMPOS_MEDICAO.Outro)} />
                  <Campos rec={m} campos={CAMPOS_MEDICAO_COMUNS.slice(0, 2)} />
                </div>
                {m.data.agente === 'Agente químico' && <QuimicoDoBanco m={m} />}
                {calc.length > 0 && (
                  <div class="calculos">
                    {calc.map(([r, v, f]) => <div><b>{r}:</b> {v} {f && <small>({f})</small>}</div>)}
                  </div>
                )}
                <Campos rec={m} campos={CAMPOS_MEDICAO_COMUNS.slice(2)} />
                {caso && (m.data.agente === 'Ruído' || /corpo inteiro/.test(m.data.agente || '')) && (
                  m.data.paradigmaId
                    ? <p class="ok-msg">✓ Incluída no banco de paradigmas. <a href="#/paradigmas/veiculos">Ver</a></p>
                    : <button type="button" class="mini" onClick={async () => {
                      const r = await promoverMedicao(caso, m, equip.find((e) => e.id === m.data.equipamentoId));
                      avisarAlteracao();
                      avisar(`Incluída no banco de paradigmas como ${r.data.codigo} (situação "Revisar"). Complete marca, modelo, família e características em Paradigmas.`);
                    }}><Icone nome="mais" /> Incluir no banco de paradigmas</button>
                )}
              </div>
            )}
          </div>
        );
      })}
      <div class="chips add-med">
        {AGENTES_MEDICAO.map((a) => <button type="button" class="chip" onClick={() => nova(a)}>＋ {a.replace(' de corpo inteiro', '').replace(' de mãos e braços', '')}</button>)}
      </div>
    </div>
  );
}

// Confere início, término e local da diligência pelos horários das medições e das fotos
// Diligência com uma aba por vistoria (1ª, 2ª…): a 2ª em diante tem os mesmos campos e o "o que foi feito nesta vistoria".
function Diligencia({ rec, iniciar, pegarGps, gpsMsg }) {
  const c = rec.data;
  const qtd = qtdVistorias(c);
  const [sel, setSel] = useState(qtd);
  const n = Math.min(sel, qtd);
  const k = (campo) => chaveVistoria(n, campo);
  const titulo = ehEntrevistaMotorista(c) ? 'Entrevista / diligência' : 'Diligência';
  const novaVistoria = async () => {
    const m = qtd + 1;
    const mud = { vistoriasQtd: String(m) };
    // local e endereço costumam ser os mesmos; ficam preenchidos para editar
    if (c.vistoriaLocal) mud[chaveVistoria(m, 'Local')] = c.vistoriaLocal;
    if (c.vistoriaEndereco) mud[chaveVistoria(m, 'Endereco')] = c.vistoriaEndereco;
    await updateFields(rec.id, mud);
    avisarAlteracao();
    setSel(m);
  };
  const excluirUltima = async () => {
    if (qtd < 2 || n !== qtd) return;
    if (!await confirmar(`Excluir a ${qtd}ª vistoria e apagar os dados dela (data, horários, presentes, condições)? Medições e fotos continuam no caso.`)) return;
    const mud = { vistoriasQtd: String(qtd - 1) };
    for (const campo of CAMPOS_VISTORIA) mud[chaveVistoria(qtd, campo)] = '';
    await updateFields(rec.id, mud);
    avisarAlteracao();
    setSel(qtd - 1);
  };
  const anterior = n > 1 ? String(c[chaveVistoria(n - 1, 'Presentes')] || '').trim() : '';
  const lista = vistoriasDoCaso(c);
  const resumo = (v) => [v.data && v.data.split('-').reverse().join('/'), v.inicio && `${v.inicio}${v.fim ? `–${v.fim}` : ''}`].filter(Boolean).join(' · ');
  return (
    <section class="bloco largo">
      <div class="linha-botoes entre">
        <h3>{titulo}</h3>
        {!c[k('Data')] && <button type="button" class="primario" onClick={() => iniciar(n)}>▶ Iniciar {qtd > 1 ? `a ${n}ª vistoria` : 'diligência'} agora</button>}
      </div>
      <div class="abas-vistoria" role="tablist">
        {Array.from({ length: qtd }, (_, i) => i + 1).map((i) => {
          const v = lista.find((x) => x.n === i) || { data: c[chaveVistoria(i, 'Data')], inicio: c[chaveVistoria(i, 'Inicio')] };
          return (
            <button type="button" role="tab" aria-selected={i === n} class={`aba-vistoria ${i === n ? 'ativa' : ''}`} onClick={() => setSel(i)}>
              <b>{i}ª vistoria</b><small>{resumo(v) || 'sem data'}</small>
            </button>
          );
        })}
        <button type="button" class="aba-vistoria nova" onClick={novaVistoria}>＋ Nova vistoria<small>2ª diligência, continuação</small></button>
      </div>
      <div class="vistoria-corpo" key={`vistoria-${n}`}>
      {n > 1 && (
        <TF rec={rec} k={k('Objetivo')} label="O que foi feito nesta vistoria (continuação, pendências da anterior, novos postos ou medições)" area rows={3} />
      )}
      <div class="linha3">
        <div class="com-botao"><TF rec={rec} k={k('Data')} label="Data" type="date" />
          <button type="button" class="mini" onClick={() => salvar(rec.id, k('Data'), hojeIso())}>Hoje</button></div>
        <div class="com-botao"><TF rec={rec} k={k('Inicio')} label="Início" type="time" />
          <button type="button" class="mini" onClick={() => salvar(rec.id, k('Inicio'), agoraHM())}>Agora</button></div>
        <div class="com-botao"><TF rec={rec} k={k('Fim')} label="Término" type="time" />
          <button type="button" class="mini" onClick={() => salvar(rec.id, k('Fim'), agoraHM())}>Agora</button></div>
      </div>
      <TF rec={rec} k={k('Local')} label={n > 1 ? 'Local (empresa / unidade) – em branco = o da 1ª vistoria' : 'Local (empresa / unidade)'} />
      <TF rec={rec} k={k('Endereco')} label="Endereço" />
      <div class="com-botao"><TF rec={rec} k={k('Gps')} label="Coordenadas GPS" />
        <button type="button" class="mini" onClick={() => pegarGps(n)}><Icone nome="pin" /> GPS</button></div>
      {gpsMsg && <small class="dica">{gpsMsg}</small>}
      {n === 1 && <HorariosPelasEvidencias rec={rec} />}
      <TF rec={rec} k={k('Presentes')} label="Pessoas presentes (nome – função – quem representa)" area />
      {n > 1 && anterior && !String(c[k('Presentes')] || '').trim() && (
        <div class="linha-botoes"><button type="button" class="mini" onClick={async () => { await salvar(rec.id, k('Presentes'), anterior); avisarAlteracao(); }}>
          Copiar os presentes da {n - 1}ª vistoria</button><small class="dica">depois, ajuste quem não veio ou quem chegou</small></div>
      )}
      <TF rec={rec} k={k('Condicoes')} label="Condições do dia (produção normal?, clima, paradas)" area rows={2} />
      <AudioVistoria rec={rec} n={n} key={`audio-${n}`} />
      {n === 1 && <EquipamentosCaso rec={rec} titulo="Equipamentos utilizados" />}
      {n > 1 && <p class="dica">Os equipamentos ficam na 1ª vistoria e valem para o caso todo. Medições e fotos ficam nos postos, com a data de cada uma.</p>}
      {n > 1 && n === qtd && <div class="linha-botoes"><button type="button" class="mini perigo" onClick={excluirUltima}>Excluir a {n}ª vistoria</button></div>}
      </div>
      <p class="dica">Para ditar, use o microfone do teclado do tablet. Tudo é gravado automaticamente enquanto você digita.</p>
    </section>
  );
}

// ---------- Áudio da vistoria: gravação (arquivo) e ditado com transcrição (texto) ----------
const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function AudioVistoria({ rec, n }) {
  const c = rec.data;
  const kT = chaveVistoria(n, 'Transcricao');
  const audios = useLive(async () => (await db.records.where('[caseId+kind]').equals([rec.id, 'anexo']).toArray())
    .filter((r) => !r.deleted && r.data.descricao === DESC_AUDIO && String(r.data.vistoria || '1') === String(n))
    .sort((a, b) => a.createdAt - b.createdAt), [rec.id, n], []);
  const [grav, setGrav] = useState(null); // { mr, stream, inicio, wake }
  const [seg, setSeg] = useState(0);
  const [dit, setDit] = useState(null); // reconhecedor de fala ativo
  const [parcial, setParcial] = useState('');
  const [msg, setMsg] = useState('');
  const [urls, setUrls] = useState({});

  // contador de tempo e aviso ao sair da página durante a gravação
  useEffect(() => {
    if (!grav) return undefined;
    const t = setInterval(() => setSeg((Date.now() - grav.inicio) / 1000), 500);
    const sair = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', sair);
    return () => { clearInterval(t); window.removeEventListener('beforeunload', sair); };
  }, [grav]);
  // ao trocar de aba ou sair da tela: encerra (e salva) a gravação e o ditado
  const vivo = useRef({});
  vivo.current = { grav, dit };
  useEffect(() => () => {
    const { grav: g, dit: d } = vivo.current;
    try { if (g && g.mr.state !== 'inactive') g.mr.stop(); } catch { /* já parado */ }
    try { d?.parar(); } catch { /* idem */ }
  }, []);
  useEffect(() => () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const gravar = async () => {
    setMsg('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setMsg('Este navegador não grava áudio.'); return; }
    if (!await confirmar('Antes de gravar, avise os presentes de que a diligência será gravada (e registre isso nas condições do dia). Começar a gravação?')) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const tipo = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
      const mr = new MediaRecorder(stream, { ...(tipo ? { mimeType: tipo } : {}), audioBitsPerSecond: 32000 });
      const partes = [];
      const inicio = Date.now();
      let wake = null;
      try { wake = await navigator.wakeLock?.request('screen'); } catch { /* sem bloqueio de tela */ }
      mr.ondataavailable = (e) => { if (e.data?.size) partes.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        try { await wake?.release(); } catch { /* ok */ }
        const mime = (mr.mimeType || tipo || 'audio/webm').split(';')[0];
        const blob = new Blob(partes, { type: mime });
        if (!blob.size) { setMsg('A gravação ficou vazia.'); return; }
        const quando = new Date(inicio);
        const nome = `Vistoria${n}_${quando.toISOString().slice(0, 10)}_${quando.toTimeString().slice(0, 5).replace(':', 'h')}.${mime.includes('mp4') ? 'm4a' : 'webm'}`;
        const id = await guardarAnexo(new File([blob], nome, { type: mime }), DESC_AUDIO, rec.id);
        await updateFields(id, { vistoria: String(n), duracaoSeg: Math.round((Date.now() - inicio) / 1000), inicioGravacao: quando.toTimeString().slice(0, 5) });
        avisarAlteracao();
        setMsg(`✓ Áudio salvo (${mmss((Date.now() - inicio) / 1000)}, ${String((blob.size / 1048576).toFixed(1)).replace('.', ',')} MB).`);
      };
      mr.start(10000); // entrega pedaços a cada 10 s
      setSeg(0);
      setGrav({ mr, stream, inicio });
    } catch (err) { setMsg(`Não foi possível usar o microfone: ${err.message || err}`); }
  };
  const pararGravacao = () => { try { grav?.mr.stop(); } catch { /* já parado */ } setGrav(null); };

  const ditar = () => {
    setMsg('');
    if (!SR) { setMsg('A transcrição ao vivo não está disponível neste navegador (use o Chrome no tablet ou no PC).'); return; }
    const r = new SR();
    r.lang = 'pt-BR'; r.continuous = true; r.interimResults = true;
    let ativo = true;
    r.onresult = async (e) => {
      let fim = '', meio = '';
      for (let i = e.resultIndex; i < e.results.length; i++) (e.results[i].isFinal ? (fim += e.results[i][0].transcript) : (meio += e.results[i][0].transcript));
      setParcial(meio);
      if (fim.trim()) {
        const atual = String((await db.records.get(rec.id))?.data?.[kT] || '');
        const linha = `[${new Date().toTimeString().slice(0, 5)}] ${fim.trim()}`;
        await salvar(rec.id, kT, atual ? `${atual}\n${linha}` : linha);
      }
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      setMsg(e.error === 'audio-capture' ? 'O microfone está em uso (por exemplo, pela gravação). Pare a gravação para ditar, ou grave e transcreva depois.'
        : e.error === 'not-allowed' ? 'Permissão do microfone negada.' : e.error === 'network' ? 'A transcrição precisa de internet.' : `Transcrição: ${e.error}`);
      ativo = false;
    };
    // o reconhecedor para sozinho após silêncio: reinicia enquanto o ditado estiver ligado
    r.onend = () => { if (ativo) { try { r.start(); } catch { /* reinício */ } } else { setDit(null); setParcial(''); avisarAlteracao(); } };
    r.parar = () => { ativo = false; r.stop(); };
    try { r.start(); setDit(r); } catch (err) { setMsg(String(err.message || err)); }
  };
  const pararDitado = () => { dit?.parar(); setDit(null); setParcial(''); avisarAlteracao(); };

  const ouvir = async (a) => {
    try { const u = URL.createObjectURL(await obterAnexo(a.id)); setUrls((x) => ({ ...x, [a.id]: u })); } catch (err) { setMsg(err.message); }
  };
  const remover = async (a) => {
    if (!await confirmar(`Mover o áudio "${a.data.nome}" para a lixeira?`)) return;
    await softDelete(a.id); avisarAlteracao();
  };

  return (
    <div class="campo audio-vistoria">
      <span class="rotulo">Áudio e transcrição da {n}ª vistoria</span>
      <div class="linha-botoes">
        {!grav ? <button type="button" class="sec" onClick={gravar}>● Gravar áudio</button>
          : <button type="button" class="perigo" onClick={pararGravacao}>■ Parar e salvar ({mmss(seg)})</button>}
        {!dit ? <button type="button" class="sec" onClick={ditar}>🎙 Ditar / transcrever ao vivo</button>
          : <button type="button" class="perigo" onClick={pararDitado}>■ Parar o ditado</button>}
      </div>
      {grav && <small class="gravando">● Gravando… mantenha o app aberto e a tela ligada.</small>}
      {dit && <small class="gravando">🎙 Ouvindo… {parcial && <em>{parcial}</em>}</small>}
      {msg && <small class="dica">{msg}</small>}
      {audios.map((a) => (
        <div class="audio-item" key={a.id}>
          <span>{a.data.inicioGravacao ? `${a.data.inicioGravacao} · ` : ''}{a.data.duracaoSeg ? mmss(a.data.duracaoSeg) : ''} · {String((Number(a.data.tamanho || 0) / 1048576).toFixed(1)).replace('.', ',')} MB{a.data.soLocal ? ' · só neste aparelho' : ''}</span>
          {urls[a.id] ? <audio controls src={urls[a.id]} preload="metadata" /> : <button type="button" class="mini" onClick={() => ouvir(a)}>▶ Ouvir</button>}
          <button type="button" class="mini perigo" onClick={() => remover(a)}>✕</button>
        </div>
      ))}
      <TF rec={rec} k={kT} label="Transcrição / ditado (cada trecho com o horário; revise antes de usar)" area rows={4} />
    </div>
  );
}

function HorariosPelasEvidencias({ rec }) {
  const ev = useLive(() => evidenciasDaDiligencia(rec.id, rec.data.vistoriaData || ''),
    [rec.id, rec.data.vistoriaData, rec.updatedAt], null);
  const [msg, setMsg] = useState('');
  if (!ev || (!ev.fotos && !ev.medicoes)) return null;
  const c = rec.data;
  const datasVist = vistoriasDoCaso(c).map((v) => v.data);
  const outras = ev.outrasDatas.filter((d) => !datasVist.includes(d));
  const difere = (ev.inicio && c.vistoriaInicio && ev.inicio < c.vistoriaInicio) || (ev.fim && c.vistoriaFim && ev.fim > c.vistoriaFim);
  const falta = (ev.inicio && !c.vistoriaInicio) || (ev.fim && !c.vistoriaFim) || (ev.gps && !c.vistoriaGps) || (ev.data && !c.vistoriaData);
  const usar = async (substituir) => {
    const m = await aplicarEvidencias(rec, ev, { substituir });
    avisarAlteracao();
    setMsg(Object.keys(m).length ? '✓ Diligência ajustada.' : 'Nada a ajustar.');
  };
  return (
    <div class={`evidencias ${difere ? 'alerta' : ''}`}>
      <b>Horários registrados {ev.data ? `em ${ev.data.split('-').reverse().join('/')}` : ''}</b>
      <div>{ev.medicoes ? `Medições: ${ev.medDe || '?'} às ${ev.medAte || '?'} (${ev.medicoes})` : ''}
        {ev.fotos ? `${ev.medicoes ? ' · ' : ''}Fotos com data: ${ev.fotosDe} às ${ev.fotosAte} (${ev.fotos})` : ''}
        {ev.gps ? ` · GPS das fotos: ${ev.gps}` : ''}</div>
      {difere && <small class="alerta-txt">⚠ Há medição ou foto fora do horário informado da diligência ({c.vistoriaInicio || '?'} às {c.vistoriaFim || '?'}). Confira.</small>}
      {outras.length > 0 && <small class="alerta-txt">⚠ Também há fotos ou medições em outra(s) data(s): {outras.map((d) => d.split('-').reverse().join('/')).join(', ')}.</small>}
      <div class="linha-botoes">
        {falta && <button type="button" class="mini" onClick={() => usar(false)}>Preencher o que falta</button>}
        {difere && <button type="button" class="mini" onClick={() => usar(true)}>Usar {ev.inicio} às {ev.fim}</button>}
        {msg && <small>{msg}</small>}
      </div>
    </div>
  );
}

// Relatórios das medições (dosimetria, vibração, IBUTG, certificados): saem como apêndices do laudo
function RelatoriosMedicao({ rec }) {
  const lista = useLive(async () => (await db.records.where('[caseId+kind]').equals([rec.id, 'anexo']).toArray())
    .filter((r) => !r.deleted && r.data.descricao === DESC_APENDICE)
    .sort((a, b) => (Number(a.data.ordem) || 0) - (Number(b.data.ordem) || 0) || a.createdAt - b.createdAt), [rec.id], []);
  const [msg, setMsg] = useState('');
  const anexar = async (e) => {
    const arqs = [...e.currentTarget.files];
    e.currentTarget.value = '';
    let ordem = lista.length;
    for (const f of arqs) {
      const id = await guardarAnexo(f, DESC_APENDICE, rec.id);
      ordem += 1;
      await updateFields(id, { titulo: tituloSugerido(f.name), ordem });
    }
    avisarAlteracao();
    setMsg(arqs.some((f) => f.size > LIMITE_NUVEM) ? 'Arquivo com mais de 39 MB: fica só neste aparelho.' : `${arqs.length} relatório(s) anexado(s). Ajuste o título de cada apêndice.`);
  };
  const abrir = async (r) => { try { window.open(URL.createObjectURL(await obterAnexo(r.id)), '_blank'); } catch (err) { setMsg(err.message); } };
  const remover = async (r) => { if (await confirmar(`Remover "${r.data.nome}"?`)) { await softDelete(r.id); avisarAlteracao(); } };
  const mover = async (i, dir) => {
    const nova = [...lista]; const j = i + dir;
    if (j < 0 || j >= nova.length) return;
    [nova[i], nova[j]] = [nova[j], nova[i]];
    for (let k = 0; k < nova.length; k++) await updateFields(nova[k].id, { ordem: k + 1 });
    avisarAlteracao();
  };
  return (
    <section class="bloco largo">
      <h3>Relatórios das medições (apêndices do laudo)</h3>
      <p class="dica">Anexe os relatórios exportados dos medidores (ruído, vibração, IBUTG) e os certificados de calibração, em PDF ou imagem. Cada arquivo sai no fim do laudo, do parecer ou do LTCAT como Apêndice A, B, C…, com todas as páginas.</p>
      {lista.map((r, i) => (
        <div class="linha-arquivo quebra">
          <b>Apêndice {LETRAS[i]}</b>
          <input type="text" class="cresce" value={r.data.titulo || r.data.nome}
            onChange={async (e) => { await updateFields(r.id, { titulo: e.currentTarget.value }); avisarAlteracao(); }} />
          <small>{r.data.nome}{r.data.soLocal ? ' · só neste aparelho' : ''}</small>
          <span>
            <button type="button" class="mini" onClick={() => mover(i, -1)} disabled={i === 0}>▲</button>{' '}
            <button type="button" class="mini" onClick={() => mover(i, 1)} disabled={i === lista.length - 1}>▼</button>{' '}
            <button type="button" class="mini" onClick={() => abrir(r)}>Abrir</button>{' '}
            <button type="button" class="mini perigo" onClick={() => remover(r)}>✕</button>
          </span>
        </div>
      ))}
      <label class="botao-arquivo">＋ Anexar relatório (PDF ou imagem)<input type="file" accept="application/pdf,.pdf,image/*" multiple hidden onChange={anexar} /></label>
      {msg && <p class="alerta-txt">{msg}</p>}
    </section>
  );
}

// Perícia já feita e laudo por escrever: anotações do Google Keep, Word ou PDF -> instrução para o Claude -> JSON -> caso
function AnotacoesDiligencia({ rec }) {
  const [aberto, setAberto] = useState(false);
  const [textos, setTextos] = useState([]); // {nome, texto, aviso}
  const [colado, setColado] = useState('');
  const [json, setJson] = useState('');
  const [previa, setPrevia] = useState(null);
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');
  const [lendo, setLendo] = useState(false);
  const guardadas = useLive(async () => (await db.records.where('[caseId+kind]').equals([rec.id, 'anexo']).toArray())
    .filter((r) => !r.deleted && r.data.descricao === 'notas'), [rec.id], []);

  const anexar = async (e) => {
    const arqs = [...e.currentTarget.files];
    e.currentTarget.value = '';
    setLendo(true); setErro('');
    const novos = [];
    for (const f of arqs) {
      try { novos.push(await lerAnotacao(f)); } catch (err) { novos.push({ nome: f.name, texto: '', aviso: `não foi possível ler (${err.message}); anexe ao Claude.` }); }
      await guardarAnexo(f, 'notas', rec.id);
    }
    avisarAlteracao();
    setTextos((t) => [...t, ...novos]);
    setLendo(false);
  };
  const todos = () => [...textos, ...(colado.trim() ? [{ nome: 'Texto colado (Google Keep / outro)', texto: colado.trim() }] : [])];
  const copiar = async () => {
    const lista = todos();
    if (!lista.length) { setErro('Anexe um arquivo ou cole o texto das anotações.'); return; }
    const p = await promptAnotacoes(rec, lista);
    try { await navigator.clipboard.writeText(p); setMsg('Instrução copiada com as anotações. Cole numa conversa nova no Claude (anexe também os relatórios dos medidores e as imagens, se houver) e traga a resposta para o campo abaixo.'); }
    catch (err) { setErro('Não foi possível copiar automaticamente.'); }
  };
  const ler = () => { setErro(''); try { setPrevia(lerJsonIA(json)); } catch (err) { setPrevia(null); setErro(err.message); } };
  const aplicar = async () => {
    const r = await aplicarIA(rec.id, previa, { substituir: false, criarPeriodos: false });
    if (previa.caso.fase && faseAvanca(rec.data.fase, previa.caso.fase)) await updateFields(rec.id, { fase: previa.caso.fase });
    avisarAlteracao();
    setMsg(`Aplicado: ${r.campos} campo(s) da diligência, ${r.postos} posto(s), ${r.medicoes} medição(ões), ${r.respostas} resposta(s). Os vínculos foram só completados (nada que você já tinha escrito foi trocado). Confira os postos e as medições abaixo.`);
    setPrevia(null); setJson('');
  };

  if (!aberto) {
    return (
      <section class="bloco largo destaque">
        <div class="linha-botoes entre">
          <div><b>Perícia já feita? Importe as anotações da diligência</b><br /><small>Google Keep, Word, PDF ou texto: o app organiza diligência, postos, medições e entrevista, para você escrever o laudo.</small></div>
          <button type="button" onClick={() => setAberto(true)}>Abrir</button>
        </div>
      </section>
    );
  }
  return (
    <section class="bloco largo destaque">
      <h3>Importar anotações da diligência</h3>
      <ol class="passos">
        <li>Anexe os arquivos das anotações (Word .docx, PDF, .txt ou a exportação do Google Keep) <b>ou</b> cole o texto da nota do Keep no campo abaixo.</li>
        <li>Toque em <b>Copiar instrução</b>: ela já leva o texto das anotações, os vínculos, os postos e os quesitos do caso.</li>
        <li>Abra uma conversa nova no Claude, cole a instrução e anexe os relatórios dos medidores (DoseMax, AxPro, iTemp) e as fotos de anotações em papel, se houver.</li>
        <li>Copie a resposta (o bloco que começa com <code>{'{'}</code>), cole em "Resposta do Claude", toque em <b>Ler e mostrar prévia</b> e depois em <b>Aplicar ao caso</b>.</li>
      </ol>
      <label class="botao-arquivo">{lendo ? 'Lendo…' : '＋ Anexar anotações (Word, PDF, texto, Keep)'}<input type="file" multiple hidden accept=".docx,.doc,.pdf,.txt,.html,.htm,.json,.md,image/*,application/pdf" onChange={anexar} /></label>
      {textos.map((t, i) => (
        <div class="linha-arquivo"><span><Icone nome="nota" /> {t.nome} <small>({t.texto ? `${t.texto.length.toLocaleString('pt-BR')} caracteres` : 'sem texto'}{t.aviso ? ` · ${t.aviso}` : ''})</small></span>
          <button type="button" class="mini perigo" onClick={() => setTextos(textos.filter((_, k) => k !== i))}>✕</button></div>
      ))}
      {guardadas.length > 0 && <small class="dica">{guardadas.length} arquivo(s) de anotações guardado(s) no caso.</small>}
      <label class="campo campo-area"><span class="rotulo">Texto da nota do Google Keep (ou outro texto)</span>
        <textarea rows={5} value={colado} onInput={(e) => setColado(e.currentTarget.value)} placeholder="No Keep: abra a nota, selecione todo o texto, copie e cole aqui." />
      </label>
      <div class="linha-botoes">
        <button type="button" class="primario" onClick={copiar} disabled={lendo}>Copiar instrução</button>
        <button type="button" class="sec" onClick={() => setAberto(false)}>Fechar</button>
      </div>
      <label class="campo campo-area"><span class="rotulo">Resposta do Claude (JSON)</span>
        <textarea rows={5} value={json} onInput={(e) => setJson(e.currentTarget.value)} placeholder='{"diligencia": {...}, "postos": [...]}' />
      </label>
      <div class="linha-botoes"><button type="button" onClick={ler} disabled={!json.trim()}>Ler e mostrar prévia</button></div>
      {previa && (
        <div class="previa">
          <p><b>Prévia:</b> {Object.keys(previa.caso).length} campo(s) da diligência, {previa.postos.length} posto(s) com {previa.postos.reduce((n, p) => n + p.medicoes.length, 0)} medição(ões), {previa.periodos.length} vínculo(s) com informações da entrevista, {previa.quesitos.filter((q) => q.resposta).length} resposta(s) a quesitos.</p>
          <ul>{previa.postos.map((p) => <li><b>{p.nome || 'posto sem nome'}</b>: {p.medicoes.map((m) => m.agente).join(', ') || 'sem medições'}</li>)}</ul>
          <p class="dica">Nada do que já está preenchido será trocado; o app só completa campos vazios e acrescenta postos e medições novos.</p>
          <div class="linha-botoes"><button type="button" class="primario" onClick={aplicar}>Aplicar ao caso</button></div>
        </div>
      )}
      {erro && <p class="erro-msg">{erro}</p>}
      {msg && <p class="ok-msg">{msg}</p>}
    </section>
  );
}

// Parecer de motorista: o "campo" é a entrevista do segurado, vínculo a vínculo
const ehEntrevistaMotorista = (c) => ehParecerTecnico(c) || (c.objeto || []).includes('Penosidade (motorista)');

function EntrevistaVinculos({ rec }) {
  const ps = useLive(async () => (await db.records.where('[caseId+kind]').equals([rec.id, 'periodo']).toArray())
    .filter((r) => !r.deleted).sort((a, b) => String(a.data.inicio).localeCompare(String(b.data.inicio))), [rec.id], []);
  const [aberto, setAberto] = useState(null);
  const resumo = (x) => [
    [x.veiculoMarca, x.veiculoModelo, x.veiculoAno].filter(Boolean).join(' ') || x.grupoVeiculo,
    x.tipoCarga && `carga: ${x.tipoCarga}`, x.vias && `trajetos: ${x.vias}`, x.jornadaSemanal && `jornada: ${x.jornadaSemanal}`,
    x.noturnoPernoite && `pernoite: ${x.noturnoPernoite}`,
  ].filter(Boolean).join(' · ');
  const faltando = (x) => [!x.grupoVeiculo && 'grupo do veículo', !x.tipoCarga && 'carga', !x.vias && 'trajetos', !x.jornadaSemanal && !x.conducaoH && 'jornada',
    !x.noturnoPernoite && 'pernoite', !x.paradigmaRuido && !(x.fim && x.fim <= '1995-04-28') && 'paradigma'].filter(Boolean);
  return (
    <section class="bloco largo destaque">
      <div class="linha-botoes entre"><h3>Entrevista do segurado – vínculos <span class="contador">{ps.length}</span></h3>
        <a class="botao sec" href={`#/caso/${encodeURIComponent(rec.id)}/preparacao`}>Ver na etapa 2</a></div>
      <p class="dica">Neste parecer, o trabalho de campo é a entrevista. Toque no vínculo para registrar ou corrigir as respostas; elas vão direto para o parecer. Os vínculos vêm da CTPS/CNIS (etapa 2).</p>
      {!ps.length && <p class="vazio">Nenhum vínculo cadastrado. Importe a CTPS/CNIS e a entrevista na etapa 2, ou gere o "Roteiro de entrevista do motorista" em Documentos.</p>}
      {ps.map((r) => {
        const x = r.data; const f = faltando(x);
        return (
          <div class={`item ${aberto === r.id ? 'aberto' : ''}`} key={r.id}>
            <div class="item-topo" onClick={() => setAberto(aberto === r.id ? null : r.id)}>
              <span class="item-titulo"><b>{x.empresa || '(empresa)'}</b> <small class="suave">{dataBR(x.inicio)} a {x.fim ? dataBR(x.fim) : 'atual'}{x.cargo ? ` · ${x.cargo}` : ''}</small>
                <br /><small class="suave">{resumo(x) || 'entrevista não registrada'}</small>
                {f.length > 0 && <><br /><small class="alerta-txt">Falta: {f.join(', ')}</small></>}</span>
            </div>
            {aberto === r.id && <div class="item-corpo"><VeiculoDoPeriodo r={r} abertoInicial /></div>}
          </div>
        );
      })}
      {ps.length > 0 && <ParadigmasDosVinculos rec={rec} />}
    </section>
  );
}
