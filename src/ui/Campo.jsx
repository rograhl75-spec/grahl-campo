import { BotaoClaudeDireto, ModoManual } from './ClaudeDireto.jsx';
import { horasDia } from '../calc.js';
import { useState, useEffect, useRef } from 'preact/hooks';
import { termoPresenca } from '../docx/modelos2.js';
import { baixarArquivo } from '../backup.js';
import { iniciarGravacao, pararGravacao as pararGravador, ouvir as ouvirGravador, estado as estadoGravador } from '../gravador.js';
import { db, createRecord, softDelete, updateFields } from '../db.js';
import { avisarAlteracao } from '../sync.js';
import { CAMPOS_POSTO, AGENTES_MEDICAO, contextoLegal } from '../schema.js';
import { CAMPOS_MEDICAO, CAMPOS_MEDICAO_COMUNS, calculados } from '../medicoes.js';
import { confrontoAnexo11 } from '../quimicos.js';
import { FormaPrev } from './Quimicos.jsx';
import { fmt } from '../calc.js';
import { lerGpsDetalhado, AJUDA_GPS } from '../photos.js';
import { promoverMedicao } from '../paradigmas.js';
import { evidenciasDaDiligencia, aplicarEvidencias } from '../fotosLaudo.js';
import { TF, Campos, CamposCompactos, salvar } from './fields.jsx';
import { useLive } from './hooks.js';
import { EquipamentosCaso, VeiculoDoPeriodo, ParadigmasDosVinculos } from './Preparacao.jsx';
import { ehParecerTecnico, chaveVistoria, qtdVistorias, vistoriasDoCaso, CAMPOS_VISTORIA, DESC_AUDIO, reuEhInss, ITENS_ACOMPANHAMENTO } from '../schema.js';
import { dataBR } from '../docx/reports.js';
import { guardarAnexo, LIMITE_NUVEM } from '../paradigmas.js';
import { obterAnexo } from '../sync.js';
import { DESC_APENDICE, DESC_ANEXO_DOC, LETRAS, tituloSugerido } from '../apendices.js';
import { lerAnotacao, promptAnotacoes } from '../notas.js';
import { lerJsonIA, aplicarIA, faseAvanca, promptRevisaoCampo } from '../aiimport.js';
import { anexosDosAutos } from './ClaudeDireto.jsx';
import { pendenciasDoCaso } from '../pendencias.js';
import { BotoesFoto, Miniaturas, Fotos } from './Fotos.jsx';
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
    // o INSS não é local de vistoria: no previdenciário, a empresa vem do vínculo (escolha na Diligência)
    if (n === 1 && !rec.data.vistoriaLocal && rec.data.reuNome && !reuEhInss(rec.data)) mud.vistoriaLocal = rec.data.reuNome;
    if (['A preparar', 'Diligência agendada', '', undefined].includes(rec.data.fase)) mud.fase = 'Diligência realizada';
    await updateFields(rec.id, mud);
    avisarAlteracao();
    pegarGps(n);
  };
  const pegarGps = async (n = 1) => {
    setGpsMsg('Obtendo localização… (até 35 s em local fechado)');
    const g = await lerGpsDetalhado();
    if (g.valor) { await salvar(rec.id, chaveVistoria(n, 'Gps'), g.valor); setGpsMsg(''); }
    else setGpsMsg(`Não foi possível obter a localização. ${AJUDA_GPS[g.erro] || AJUDA_GPS.indisponivel}`);
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

  const papel = rec.data.papel || '';
  const at = /Assistente técnico/i.test(papel);
  const entrevista = ehEntrevistaMotorista(rec.data);
  // assistente técnico e parecer por entrevista: postos e medições ficam recolhidos (não são o centro do trabalho)
  const secundario = at || entrevista;
  const blocoPostos = (
    <>
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
              <CamposCompactos rec={p} campos={CAMPOS_POSTO} sempre={['nome', 'descricao', 'agentes']} />
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
    </>
  );

  return (
    <div class="grade campo-tela">
      <AnotacoesDiligencia rec={rec} />
      {entrevista && <EntrevistaVinculos rec={rec} />}

      <Diligencia rec={rec} iniciar={iniciar} pegarGps={pegarGps} gpsMsg={gpsMsg} />

      {at && <AcompanhamentoPerito rec={rec} />}

      <QuesitosNaMao rec={rec} />

      {secundario ? (
        <details class="bloco largo recolhido">
          <summary><b>Postos e medições próprias</b> <span class="contador">{postos.length}</span> <small class="dica">{at ? 'se a assistência também medir' : 'se houver avaliação no local'}</small></summary>
          {blocoPostos}
          <MedicoesSemPosto rec={rec} />
        </details>
      ) : (
        <section class="bloco largo">
          <h3>Postos / atividades avaliados <span class="contador">{postos.length}</span></h3>
          <p class="dica">Cada posto (setor, função ou veículo avaliado) reúne a descrição, as medições e as fotos dele.</p>
          {blocoPostos}
          <MedicoesSemPosto rec={rec} />
        </section>
      )}

      <section id="sec-fotos" class="largo secao-etapa"><Fotos rec={rec} /></section>

      <section class="bloco largo">
        <TF rec={rec} k="vistoriaNotas" label="Anotações gerais da diligência" area rows={3} />
      </section>

      <RevisaoDaColeta rec={rec} />

      <details class="bloco largo recolhido">
        <summary><b>Relatórios dos medidores e anexos do documento</b> <small class="dica">relatórios (DoseMax, AxPro…) que saem como apêndices; ART, CNIS, certidões que saem como anexos</small></summary>
        <RelatoriosMedicao rec={rec} />
        <RelatoriosMedicao rec={rec} desc={DESC_ANEXO_DOC} rotulo="Anexo" titulo="Anexos do documento (ART, CNIS, certidões, declarações)"
          dica="Documentos de terceiros que acompanham o LTCAT, o laudo previdenciário e o parecer previdenciário: ART, CNIS, certidões, declarações assinadas, fichas de dados de segurança. Cada arquivo sai no fim, com todas as páginas, como Anexo A, B, C… (no laudo judicial, Anexo II, III…, depois do relatório fotográfico)."
          botao="＋ Anexar documento (PDF ou imagem)" />
      </details>
    </div>
  );
}

// Assistente técnico: o que verificar no trabalho do perito, por item, com a constatação e a observação
// para a manifestação. Sai preenchido no "Relatório de acompanhamento da diligência".

// Medições sem posto: só aparecem quando existem; senão, um botão abre o quadro
function MedicoesSemPosto({ rec }) {
  const n = useLive(async () => (await db.records.where('[caseId+kind]').equals([rec.id, 'medicao']).toArray()).filter((r) => !r.deleted && !r.data.postoId).length, [rec.id], 0);
  const [abrir, setAbrir] = useState(false);
  if (!n && !abrir) return <div class="linha-botoes mt"><button type="button" class="mini sec" onClick={() => setAbrir(true)}>＋ Medição sem posto vinculado</button></div>;
  return <><h4 class="mt">Medições sem posto vinculado <span class="contador">{n}</span></h4><Medicoes caseId={rec.id} postoId="" ctx={contextoLegal(rec.data)} caso={rec} /></>;
}

function AcompanhamentoPerito({ rec }) {
  const c = rec.data;
  const feitos = ITENS_ACOMPANHAMENTO.filter((_, i) => String(c[`acomp${i + 1}C`] || '').trim()).length;
  return (
    <section class="bloco largo acompanhamento">
      <h3>Acompanhamento da perícia <span class="contador">{feitos}/{ITENS_ACOMPANHAMENTO.length}</span></h3>
      <p class="dica">O que o perito fez, item a item. Vai preenchido para o relatório de acompanhamento e para a manifestação sobre o laudo.</p>
      <TF rec={rec} k="acompMedicoesPerito" label="Medições feitas pelo perito (agente, local, equipamento, o que o aparelho mostrou, tempo)" area rows={3} />
      {ITENS_ACOMPANHAMENTO.map((t, i) => (
        <details class="acomp-item" open={!!String(c[`acomp${i + 1}C`] || c[`acomp${i + 1}O`] || '').trim()}>
          <summary><span class={`acomp-marca ${String(c[`acomp${i + 1}C`] || '').trim() ? 'ok' : ''}`} aria-hidden="true" />{t}</summary>
          <div class="linha2">
            <TF rec={rec} k={`acomp${i + 1}C`} label="Constatação" area rows={2} />
            <TF rec={rec} k={`acomp${i + 1}O`} label="Observação para a manifestação" area rows={2} />
          </div>
        </details>
      ))}
      <TF rec={rec} k="acompDivergencias" label="Divergências e pontos a impugnar ou reforçar" area rows={3} />
    </section>
  );
}

// Quesitos à mão durante a diligência: texto e anotação de campo, sem sair da aba
function QuesitosNaMao({ rec }) {
  const qs = useLive(async () => (await db.records.where('[caseId+kind]').equals([rec.id, 'quesito']).toArray()).filter((r) => !r.deleted)
    .sort((a, b) => String(a.data.origem || '').localeCompare(String(b.data.origem || '')) || (Number(a.data.numero) || 0) - (Number(b.data.numero) || 0) || a.createdAt - b.createdAt), [rec.id], []);
  if (!qs.length) return null;
  const respondidos = qs.filter((q) => String(q.data.resposta || '').trim()).length;
  return (
    <details class="bloco largo recolhido">
      <summary><b>Quesitos à mão</b> <span class="contador">{respondidos}/{qs.length}</span> <small class="dica">ler e anotar sem sair do Campo</small></summary>
      {qs.map((q) => (
        <div class="quesito-mao" key={q.id}>
          <p><b>{q.data.origem || 'Quesito'} {q.data.numero ? `– ${q.data.numero}` : ''}</b> {q.data.texto}</p>
          <TF rec={q} k="resposta" label="Anotação de campo / resposta" area rows={2} />
        </div>
      ))}
    </details>
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
      {!agentes.length && <small class="dica">O banco está vazio. Carregue a base em Bases técnicas → Agentes químicos.</small>}
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
                      avisar(`Incluída no banco de paradigmas como ${r.data.codigo} (situação "Revisar"). Complete marca, modelo, família e características em Bases técnicas → Veículos.`);
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
    // os áudios dessa vistoria vão para a lixeira (não reaparecem numa próxima "nova vistoria")
    const aud = (await db.records.where('[caseId+kind]').equals([rec.id, 'anexo']).toArray()).filter((r) => !r.deleted && r.data.descricao === DESC_AUDIO && String(r.data.vistoria) === String(qtd));
    for (const a of aud) await softDelete(a.id);
    avisarAlteracao();
    setSel(qtd - 1);
  };
  // termo de presença da vistoria aberta (o gerador usa a vistoria mais recente com data)
  const termo = async () => {
    try { const r = await termoPresenca(rec.id); baixarArquivo(r.blob, r.nome); } catch (e) { avisar(`Não foi possível gerar o termo: ${e.message || e}`); }
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
      <div class="linha2">
        <TF rec={rec} k={k('Local')} label={n > 1 ? 'Local (empresa / unidade) – em branco = o da 1ª vistoria' : 'Local (empresa / unidade)'} />
        <TF rec={rec} k={k('Endereco')} label="Endereço" />
      </div>
      <TF rec={rec} k={k('Presentes')} label="Pessoas presentes (nome – função – quem representa)" area rows={3} />
      {n > 1 && anterior && !String(c[k('Presentes')] || '').trim() && (
        <div class="linha-botoes"><button type="button" class="mini" onClick={async () => { await salvar(rec.id, k('Presentes'), anterior); avisarAlteracao(); }}>
          Copiar os presentes da {n - 1}ª vistoria</button><small class="dica">depois, ajuste quem não veio ou quem chegou</small></div>
      )}
      {n === 1 && c.papel === 'Perito do Juízo' && <TF rec={rec} k="vistoriaIntimacao" label='Comunicação da data às partes (art. 474 do CPC) – ex.: "intimação do evento 52, de 10/10/2026"' />}
      {n === 1 && <EquipamentosCaso rec={rec} titulo="Equipamentos utilizados" />}
      {n > 1 && <p class="dica">Os equipamentos ficam na 1ª vistoria e valem para o caso todo. Medições e fotos ficam nos postos, com a data de cada uma.</p>}
      <details class="opcoes-caso" open={!!String(c[k('Gps')] || c[k('Condicoes')] || '').trim()}>
        <summary>GPS, condições do dia e áudio da vistoria{String(c[k('Gps')] || '').trim() ? ` · GPS ${c[k('Gps')]}` : ''}</summary>
        <div class="com-botao"><TF rec={rec} k={k('Gps')} label="Coordenadas GPS" />
          <button type="button" class="mini" onClick={() => pegarGps(n)}><Icone nome="pin" /> GPS</button></div>
        {n === 1 && <HorariosPelasEvidencias rec={rec} />}
        <TF rec={rec} k={k('Condicoes')} label="Condições do dia (produção normal?, clima, paradas)" area rows={2} />
        <AudioVistoria rec={rec} n={n} key={`audio-${n}`} />
        <p class="dica">Para ditar, use o microfone do teclado do tablet. Tudo é gravado automaticamente enquanto você digita.</p>
      </details>
      {gpsMsg && <small class={/^Não/.test(gpsMsg) ? "erro-msg" : "dica"} role="status">{gpsMsg}</small>}
      <div class="linha-botoes">
        {!/Assistente técnico/i.test(c.papel || '') && <button type="button" class="mini" onClick={termo}><Icone nome="doc" /> Termo de presença da {n}ª vistoria</button>}
        {n > 1 && n === qtd && <button type="button" class="mini perigo" onClick={excluirUltima}>Excluir a {n}ª vistoria</button>}
      </div>
      </div>
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
  const [grav, setGrav] = useState(estadoGravador());
  const [seg, setSeg] = useState(0);
  const [dit, setDit] = useState(null); // reconhecedor de fala ativo
  const [parcial, setParcial] = useState('');
  const [msg, setMsg] = useState('');
  const [urls, setUrls] = useState({});
  // a gravação vive fora da tela (src/gravador.js): continua se trocar de aba; aqui só se acompanha
  useEffect(() => ouvirGravador(setGrav), []);
  const gravandoAqui = grav.gravando && grav.caseId === rec.id && grav.n === n;
  useEffect(() => {
    if (!gravandoAqui) return undefined;
    const t = setInterval(() => setSeg((Date.now() - grav.inicio) / 1000), 500);
    const sair = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', sair);
    return () => { clearInterval(t); window.removeEventListener('beforeunload', sair); };
  }, [gravandoAqui, grav.inicio]);
  // ao sair da tela, só o ditado é encerrado (a gravação continua)
  const vivo = useRef({});
  vivo.current = { dit };
  useEffect(() => () => { try { vivo.current.dit?.parar(); } catch { /* já parado */ } }, []);
  useEffect(() => () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const gravar = async () => {
    setMsg('');
    if (grav.gravando) { setMsg('Já há uma gravação em andamento (veja a barra no topo).'); return; }
    if (!await confirmar('Antes de gravar, avise os presentes de que a diligência será gravada (e registre isso nas condições do dia). Começar a gravação?')) return;
    try { await iniciarGravacao(rec.id, n); setSeg(0); } catch (err) { setMsg(`Não foi possível gravar: ${err.message || err}`); }
  };
  const pararGravacao = async () => {
    const r = await pararGravador();
    avisarAlteracao();
    setMsg(r ? `✓ Áudio salvo (${mmss(r.seg)}, ${String(r.mb.toFixed(1)).replace('.', ',')} MB).` : 'A gravação ficou vazia.');
  };

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
    try { const u = URL.createObjectURL(await obterAnexo(a.id)); setUrls((x) => ({ ...x, [a.id]: u })); } catch (err) {
      // o arquivo ainda não está na nuvem: ficou no aparelho em que foi gravado
      if (/object-not-found/.test(String(err.code || err.message))) {
        setMsg(a.data.nuvem === 'recusado'
          ? 'Este áudio não subiu para a nuvem: as regras do Firebase Storage recusaram o arquivo de áudio. Publique as regras novas (firebase/storage.rules) e, no aparelho em que ele foi gravado, toque em "Sincronizar agora". Até lá, ele só toca nesse aparelho.'
          : 'Este áudio ainda não chegou à nuvem: está no aparelho em que foi gravado, aguardando envio. Abra o app nesse aparelho com internet (Configurações → Nuvem → "Sincronizar agora") e tente de novo.');
      } else setMsg(err.message || String(err));
    }
  };
  const remover = async (a) => {
    if (!await confirmar(`Mover o áudio "${a.data.nome}" para a lixeira?`)) return;
    await softDelete(a.id); avisarAlteracao();
  };

  return (
    <div class="campo audio-vistoria">
      <span class="rotulo">Áudio e transcrição da {n}ª vistoria</span>
      <div class="linha-botoes">
        {!gravandoAqui ? <button type="button" class="sec" onClick={gravar}>● Gravar áudio</button>
          : <button type="button" class="perigo" onClick={pararGravacao}>■ Parar e salvar ({mmss(seg)})</button>}
        {!dit ? <button type="button" class="sec" onClick={ditar}>🎙 Ditar / transcrever ao vivo</button>
          : <button type="button" class="perigo" onClick={pararDitado}>■ Parar o ditado</button>}
      </div>
      {gravandoAqui && <small class="gravando">● Gravando… pode trocar de aba; não feche o app.</small>}
      {dit && <small class="gravando">🎙 Ouvindo… {parcial && <em>{parcial}</em>}</small>}
      {msg && <small class="dica">{msg}</small>}
      {audios.map((a) => (
        <div class="audio-item" key={a.id}>
          <span>{a.data.inicioGravacao ? `${a.data.inicioGravacao} · ` : ''}{a.data.duracaoSeg ? mmss(a.data.duracaoSeg) : ''} · {String((Number(a.data.tamanho || 0) / 1048576).toFixed(1)).replace('.', ',')} MB{a.data.soLocal ? ' · só no aparelho em que foi gravado' : a.data.nuvem === 'recusado' ? ' · não subiu (regras do Storage)' : ''}</span>
          {urls[a.id] ? <audio controls src={urls[a.id]} preload="metadata" /> : <button type="button" class="mini" onClick={() => ouvir(a)}>▶ Ouvir</button>}
          <button type="button" class="mini perigo" onClick={() => remover(a)}>✕</button>
        </div>
      ))}
      {dit ? (
        <div class="campo"><span class="rotulo">Transcrição / ditado (para editar, pare o ditado)</span><pre class="transcricao-viva">{c[kT] || '…'}</pre></div>
      ) : <TF rec={rec} k={kT} label="Transcrição / ditado (cada trecho com o horário; revise antes de usar)" area rows={4} />}
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
export function RelatoriosMedicao({ rec, desc = DESC_APENDICE, rotulo = 'Apêndice', titulo = 'Relatórios das medições (apêndices do laudo)', botao = '＋ Anexar relatório (PDF ou imagem)',
  dica = 'Anexe os relatórios exportados dos medidores (ruído, vibração, IBUTG) e os certificados de calibração, em PDF ou imagem. Cada arquivo sai no fim do laudo, do parecer ou do LTCAT como Apêndice A, B, C…, com todas as páginas.' }) {
  const lista = useLive(async () => (await db.records.where('[caseId+kind]').equals([rec.id, 'anexo']).toArray())
    .filter((r) => !r.deleted && r.data.descricao === desc)
    .sort((a, b) => (Number(a.data.ordem) || 0) - (Number(b.data.ordem) || 0) || a.createdAt - b.createdAt), [rec.id], []);
  const [msg, setMsg] = useState('');
  const anexar = async (e) => {
    const arqs = [...e.currentTarget.files];
    e.currentTarget.value = '';
    let ordem = lista.length;
    for (const f of arqs) {
      const id = await guardarAnexo(f, desc, rec.id);
      ordem += 1;
      await updateFields(id, { titulo: desc === DESC_APENDICE ? tituloSugerido(f.name) : f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim(), ordem });
    }
    avisarAlteracao();
    setMsg(arqs.some((f) => f.size > LIMITE_NUVEM) ? 'Arquivo com mais de 39 MB: fica só neste aparelho.' : `${arqs.length} arquivo(s) anexado(s). Ajuste o título de cada ${rotulo.toLowerCase()}.`);
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
      <h3>{titulo}</h3>
      <p class="dica">{dica}</p>
      {lista.map((r, i) => (
        <div class="linha-arquivo quebra">
          <b>{rotulo} {LETRAS[i]}</b>
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
      <label class="botao-arquivo">{botao}<input type="file" accept="application/pdf,.pdf,image/*" multiple hidden onChange={anexar} /></label>
      {msg && <p class="alerta-txt">{msg}</p>}
    </section>
  );
}

// Perícia já feita e laudo por escrever: anotações do Google Keep, Word ou PDF -> instrução para o Claude -> JSON -> caso
// Revisão da coleta pelo Claude, ainda em campo: o que falta coletar, perguntas, requisitos das medições,
// inconsistências, quesitos sem elementos e fotos que faltam. A última revisão fica guardada no caso.
function RevisaoDaColeta({ rec }) {
  const [comAutos, setComAutos] = useState(true);
  const [copiado, setCopiado] = useState('');
  const instrucao = async () => promptRevisaoCampo(rec.id, await pendenciasDoCaso(rec.id).catch(() => []));
  const copiar = async () => {
    try { await navigator.clipboard.writeText(await instrucao()); setCopiado('✓ Instrução copiada com os dados do caso. Cole no Claude (anexe os autos e os relatórios dos medidores, se quiser).'); }
    catch { setCopiado('Não foi possível copiar.'); }
  };
  const r = rec.data.revisaoCampo;
  return (
    <section class="bloco largo destaque">
      <h3>Revisar a coleta com o Claude</h3>
      <p class="dica">Antes de sair do local: o Claude confere o que foi registrado (cadastro, entrevista, postos, medições, fotos e as pendências do app) contra os autos e os quesitos, e diz o que ainda falta coletar, o que perguntar e o que conferir nas medições. Não redige o laudo nem conclui o enquadramento.</p>
      <label class="check"><input type="checkbox" checked={comAutos} onChange={(e) => setComAutos(e.currentTarget.checked)} /> Enviar também os autos (reaproveitados do cache, quando já enviados)</label>
      <div class="linha-botoes">
        <BotaoClaudeDireto rotulo="Revisar a coleta" instrucao={instrucao} maxTokens={16000} permitirArquivos rotuloArquivos="Anexar relatórios dos medidores ou fotos (opcional)"
          anexos={async () => (comAutos ? anexosDosAutos(rec.id) : [])}
          onResposta={async (t) => { await updateFields(rec.id, { revisaoCampo: { texto: t, em: new Date().toISOString() } }); avisarAlteracao(); return 'Revisão guardada no caso (abaixo).'; }} />
      </div>
      <ModoManual><div class="linha-botoes"><button type="button" class="sec" onClick={copiar}>Copiar instrução</button></div></ModoManual>
      {copiado && <p class="ok-msg">{copiado}</p>}
      {r?.texto && (
        <details open>
          <summary><b>Última revisão</b> <small class="dica">{new Date(r.em).toLocaleString('pt-BR')}</small></summary>
          <pre class="transcricao-viva revisao-campo">{r.texto}</pre>
        </details>
      )}
    </section>
  );
}

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
          <div><b>Diligência já feita? Importe as anotações com o Claude</b><br /><small>Google Keep, Word, PDF, texto, relatórios dos medidores e fotos de anotações: o Claude organiza diligência, postos, medições e entrevista.</small></div>
          <button type="button" onClick={() => setAberto(true)}>Abrir</button>
        </div>
      </section>
    );
  }
  return (
    <section class="bloco largo destaque">
      <h3>Importar anotações da diligência</h3>
      <p class="dica">Anexe as anotações (Word, PDF, texto ou a exportação do Google Keep) ou cole o texto da nota; junte, se tiver, os relatórios dos medidores (DoseMax, AxPro, iTemp) e fotos de anotações em papel. O Claude organiza diligência, postos, medições, entrevista e anotações dos quesitos; você confere a prévia e aplica.</p>
      <label class="botao-arquivo">{lendo ? 'Lendo…' : '＋ Anexar anotações (Word, PDF, texto, Keep)'}<input type="file" multiple hidden accept=".docx,.doc,.pdf,.txt,.html,.htm,.json,.md,image/*,application/pdf" onChange={anexar} /></label>
      {textos.map((t, i) => (
        <div class="linha-arquivo"><span><Icone nome="nota" /> {t.nome} <small>({t.texto ? `${t.texto.length.toLocaleString('pt-BR')} caracteres` : 'sem texto'}{t.aviso ? ` · ${t.aviso}` : ''})</small></span>
          <button type="button" class="mini perigo" onClick={() => setTextos(textos.filter((_, k) => k !== i))}>✕</button></div>
      ))}
      {guardadas.length > 0 && <small class="dica">{guardadas.length} arquivo(s) de anotações guardado(s) no caso.</small>}
      <label class="campo campo-area"><span class="rotulo">Texto da nota do Google Keep (ou outro texto)</span>
        <textarea rows={5} value={colado} onInput={(e) => setColado(e.currentTarget.value)} placeholder="No Keep: abra a nota, selecione todo o texto, copie e cole aqui." />
      </label>
      <BotaoClaudeDireto rotulo="Enviar as anotações direto ao Claude" permitirArquivos rotuloArquivos="Anexar relatórios dos medidores e fotos de anotações em papel"
        instrucao={async () => { const lista = todos(); if (!lista.length) throw new Error('Anexe um arquivo ou cole o texto das anotações.'); return promptAnotacoes(rec, lista); }}
        onResposta={(t) => { setJson(t); try { setPrevia(lerJsonIA(t)); setErro(''); return 'Confira a prévia abaixo e toque em "Aplicar ao caso".'; } catch (err) { setPrevia(null); setErro(err.message); return ''; } }} />
      <ModoManual rotulo="Alternativa sem a chave de API (ou para colar uma resposta do claude.ai)">
        <p class="dica">Copie a instrução (já leva o texto das anotações, os vínculos, os postos e os quesitos), cole numa conversa nova no Claude com os relatórios e fotos anexados e traga a resposta (o bloco que começa com <code>{'{'}</code>) para o campo abaixo.</p>
        <div class="linha-botoes"><button type="button" class="sec" onClick={copiar} disabled={lendo}>Copiar instrução (claude.ai)</button></div>
        <label class="campo campo-area"><span class="rotulo">Resposta do Claude (JSON)</span>
          <textarea rows={5} value={json} onInput={(e) => setJson(e.currentTarget.value)} placeholder='{"diligencia": {...}, "postos": [...]}' />
        </label>
        <div class="linha-botoes"><button type="button" onClick={ler} disabled={!json.trim()}>Ler e mostrar prévia</button></div>
      </ModoManual>
      <div class="linha-botoes"><button type="button" class="sec mini" onClick={() => setAberto(false)}>Fechar</button></div>
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
  const faltando = (x) => [!x.grupoVeiculo && 'grupo do veículo', !x.tipoCarga && 'carga', !x.vias && 'trajetos', !x.jornadaSemanal && !x.conducaoH && 'jornada', !isFinite(horasDia(x.conducaoH)) && !(rec.data.foraDirecaoH && x.jornadaSemanal) && 'horas de condução por dia', (x.paradigmaRuido || x.paradigmaVibracao) && !x.paradigmaVibracao && 'paradigma de vibração',
    !x.noturnoPernoite && 'pernoite', !x.paradigmaRuido && !(x.fim && x.fim <= '1995-04-28') && 'paradigma'].filter(Boolean);
  return (
    <section class="bloco largo destaque">
      <div class="linha-botoes entre"><h3>Entrevista do segurado – vínculos <span class="contador">{ps.length}</span></h3>
        <a class="botao sec" href={`#/caso/${encodeURIComponent(rec.id)}/preparacao`}>Ver na etapa 1. Autos</a></div>
      <p class="dica">Neste parecer, o trabalho de campo é a entrevista. Toque no vínculo para registrar ou corrigir as respostas; elas vão direto para o parecer. Os vínculos vêm da CTPS/CNIS (etapa 1. Autos).</p>
      <div class="regra-caso">
        <TF rec={rec} k="foraDirecaoH" label="Regra do caso: horas por dia fora da direção (carga, descarga, paradas) – ex.: 5" inputMode="decimal" />
        <small class="dica">Com a regra, o tempo de condução de cada vínculo sem horas digitadas = jornada da entrevista − estas horas (sai no parecer com a explicação).</small>
      </div>
      {!ps.length && <p class="vazio">Nenhum vínculo cadastrado. Importe a CTPS/CNIS e a entrevista na etapa 1. Autos, ou gere o "Roteiro de entrevista do motorista" em 4. Petições → Outros documentos do caso.</p>}
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
