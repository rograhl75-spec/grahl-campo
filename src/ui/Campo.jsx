import { useState } from 'preact/hooks';
import { db, createRecord, softDelete, updateFields } from '../db.js';
import { avisarAlteracao } from '../sync.js';
import { CAMPOS_POSTO, AGENTES_MEDICAO, contextoLegal } from '../schema.js';
import { CAMPOS_MEDICAO, CAMPOS_MEDICAO_COMUNS, calculados } from '../medicoes.js';
import { lerGps } from '../photos.js';
import { promoverMedicao } from '../paradigmas.js';
import { TF, Campos, salvar } from './fields.jsx';
import { useLive } from './hooks.js';
import { EquipamentosCaso } from './Preparacao.jsx';
import { BotoesFoto, Miniaturas } from './Fotos.jsx';

function hojeIso() { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function agoraHM() { return new Date().toTimeString().slice(0, 5); }

export function Campo({ rec }) {
  const postos = useLive(async () => (await db.records.where('[caseId+kind]').equals([rec.id, 'posto']).toArray())
    .filter((r) => !r.deleted).sort((a, b) => (a.data.ordem ?? a.createdAt) - (b.data.ordem ?? b.createdAt)), [rec.id], []);
  const [aberto, setAberto] = useState(null);
  const [gpsMsg, setGpsMsg] = useState('');

  const iniciar = async () => {
    const mud = {};
    if (!rec.data.vistoriaData) mud.vistoriaData = hojeIso();
    if (!rec.data.vistoriaInicio) mud.vistoriaInicio = agoraHM();
    if (!rec.data.vistoriaLocal && rec.data.reuNome) mud.vistoriaLocal = rec.data.reuNome;
    if (['A preparar', 'Diligência agendada', '', undefined].includes(rec.data.fase)) mud.fase = 'Diligência realizada';
    await updateFields(rec.id, mud);
    avisarAlteracao();
    pegarGps();
  };
  const pegarGps = async () => {
    setGpsMsg('Obtendo localização…');
    const g = await lerGps(15000);
    if (g) { await salvar(rec.id, 'vistoriaGps', g); setGpsMsg(''); }
    else setGpsMsg('Não foi possível obter o GPS (verifique a permissão de localização).');
  };
  const novoPosto = async () => {
    const ordem = postos.reduce((m, r) => Math.max(m, r.data.ordem || 0), 0) + 1;
    const r = await createRecord('posto', rec.id, { nome: '', ordem });
    avisarAlteracao();
    setAberto(r.id);
  };
  const removerPosto = async (p) => {
    if (!confirm(`Mover o posto "${p.data.nome || 'sem nome'}" para a lixeira? Medições e fotos dele continuam no caso.`)) return;
    await softDelete(p.id); avisarAlteracao();
  };

  return (
    <div class="grade campo-tela">
      <section class="bloco largo">
        <div class="linha-botoes entre">
          <h3>Diligência</h3>
          {!rec.data.vistoriaData && <button type="button" class="primario" onClick={iniciar}>▶ Iniciar diligência agora</button>}
        </div>
        <div class="linha3">
          <div class="com-botao"><TF rec={rec} k="vistoriaData" label="Data" type="date" />
            <button type="button" class="mini" onClick={() => salvar(rec.id, 'vistoriaData', hojeIso())}>Hoje</button></div>
          <div class="com-botao"><TF rec={rec} k="vistoriaInicio" label="Início" type="time" />
            <button type="button" class="mini" onClick={() => salvar(rec.id, 'vistoriaInicio', agoraHM())}>Agora</button></div>
          <div class="com-botao"><TF rec={rec} k="vistoriaFim" label="Término" type="time" />
            <button type="button" class="mini" onClick={() => salvar(rec.id, 'vistoriaFim', agoraHM())}>Agora</button></div>
        </div>
        <TF rec={rec} k="vistoriaLocal" label="Local (empresa / unidade)" />
        <TF rec={rec} k="vistoriaEndereco" label="Endereço" />
        <div class="com-botao"><TF rec={rec} k="vistoriaGps" label="Coordenadas GPS" />
          <button type="button" class="mini" onClick={pegarGps}>📍 GPS</button></div>
        {gpsMsg && <small class="dica">{gpsMsg}</small>}
        <TF rec={rec} k="vistoriaPresentes" label="Pessoas presentes (nome – função – quem representa)" area />
        <TF rec={rec} k="vistoriaCondicoes" label="Condições do dia (produção normal?, clima, paradas)" area rows={2} />
        <EquipamentosCaso rec={rec} titulo="Equipamentos utilizados" />
        <p class="dica">Para ditar, use o microfone do teclado do tablet. Tudo é gravado automaticamente enquanto você digita.</p>
      </section>

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
    if (!confirm('Mover esta medição para a lixeira?')) return;
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
              <span class="item-titulo">📏 {m.data.agente} {principal && `· ${principal}`} {calc[0] && `· ${calc[0][0]} ${calc[0][1]}`}</span>
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
                      alert(`Incluída no banco de paradigmas como ${r.data.codigo} (situação "Revisar"). Complete marca, modelo, família e características em Paradigmas.`);
                    }}>➕ Incluir no banco de paradigmas</button>
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
