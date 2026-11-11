// Banco de agentes químicos: consulta, base de fontes abertas, importação pelo Claude e calculadora
import { useState } from 'preact/hooks';
import { db, createRecord, softDelete } from '../db.js';
import { avisarAlteracao } from '../sync.js';
import {
  CAMPOS_QUIMICO, GRUPOS_QUIMICOS, PROMPT_QUIMICOS, carregarBaseQuimicos, importarBaseQuimicos, importarAgentesColados, filtrarAgentes,
  ppmParaMgm3, mgm3ParaPpm, fatorBriefScalaDiario, fatorBriefScalaSemanal, fatorDesvio, somaMistura, num,
} from '../quimicos.js';
import { fmt } from '../calc.js';
import { useLive } from './hooks.js';
import { Campos } from './fields.jsx';
import { Icone } from './Icone.jsx';
import { confirmar } from './dialogo.jsx';

const f = (x, c) => (isFinite(x) ? fmt(x, c ?? (Math.abs(x) < 10 ? 3 : 1)) : '—');

export function Quimicos() {
  const lista = useLive(async () => (await db.records.where('kind').equals('quimico').toArray()).filter((r) => !r.deleted), [], []);
  const [busca, setBusca] = useState('');
  const [grupo, setGrupo] = useState('');
  const [aberto, setAberto] = useState(null);
  const [msg, setMsg] = useState('');
  const filtrados = filtrarAgentes(lista, busca, grupo);

  const carregarBase = async () => {
    setMsg('Carregando…');
    try {
      const r = await importarBaseQuimicos(await carregarBaseQuimicos());
      avisarAlteracao();
      setMsg(`✓ Base lida: ${r.lidos} agentes, ${r.gravados} novos ou atualizados.${r.falhas.length ? ` Falhas: ${r.falhas.join('; ')}` : ''} O que você editou no app não foi alterado.`);
    } catch (e) { setMsg(`Erro: ${e.message}`); }
  };
  const novo = async () => { const r = await createRecord('quimico', null, { nome: '', situacao: 'A conferir' }); avisarAlteracao(); setAberto(r.id); };

  return (
    <div class="grade">
      <section class="bloco largo">
        <p class="dica">Fichas com propriedades físico-químicas, toxicologia, limites da NR-15 (Anexo 11), LINACH e IARC. A base inicial vem de fontes abertas (PubChem, NIOSH Pocket Guide, NR-15, LINACH, IARC), com a fonte em cada ficha, e entra como <b>"A conferir"</b>: confira no original antes de usar em laudo e marque "Conferido". Os valores da ACGIH não vêm prontos: digite-os do seu livreto, com a edição.</p>
        <div class="barra-casos">
          <input class="busca" type="search" placeholder="Buscar nome, sinônimo, CAS ou fórmula…" value={busca} onInput={(e) => setBusca(e.currentTarget.value)} />
          <button type="button" class="primario" onClick={novo}>＋ Novo agente</button>
        </div>
        <div class="chips filtros mt">
          <button type="button" class={`chip ${!grupo ? 'on' : ''}`} onClick={() => setGrupo('')}>Todos ({lista.length})</button>
          {GRUPOS_QUIMICOS.map((g) => <button type="button" class={`chip ${grupo === g ? 'on' : ''}`} onClick={() => setGrupo(g)}>{g}</button>)}
        </div>
        <div class="linha-botoes">
          <button type="button" class="sec" onClick={carregarBase}><Icone nome="pasta" /> {lista.length ? 'Atualizar com a base de fontes abertas' : 'Carregar a base de fontes abertas'}</button>
        </div>
        {msg && <p class="ok-msg">{msg}</p>}
      </section>
      {!lista.length && <section class="bloco largo"><p class="vazio">Banco vazio. Toque em "Carregar a base de fontes abertas".</p></section>}
      <div class="largo">
        {filtrados.map((r) => {
          const d = r.data;
          const lt = [d.nr15Ppm && `${d.nr15Ppm} ppm`, d.nr15Mgm3 && `${d.nr15Mgm3} mg/m³`].filter(Boolean).join(' / ');
          return (
            <div class={`item ${aberto === r.id ? 'aberto' : ''}`} key={r.id}>
              <div class="item-topo" onClick={() => setAberto(aberto === r.id ? null : r.id)}>
                <span class="item-titulo">
                  <b>{d.nome || '(sem nome)'}</b>{d.cas && <small class="suave"> · CAS {d.cas}</small>}{' '}
                  {d.linach && <span class="etq fase">LINACH {d.linach}</span>}{' '}
                  {d.situacao !== 'Conferido' && <span class="etq">A conferir</span>}
                  <br /><small class="suave">{[lt && `NR-15: ${lt}${d.nr15Teto === 'Sim' ? ' (teto)' : ''}${d.nr15Grau ? ` – grau ${d.nr15Grau}` : ''}`, d.iarc && `IARC ${d.iarc}`, d.grupos].filter(Boolean).join(' · ')}</small>
                </span>
                <span class="item-acoes" onClick={(e) => e.stopPropagation()}>
                  <button type="button" class="mini perigo" onClick={async () => { if (await confirmar('Mover para a lixeira?')) { await softDelete(r.id); avisarAlteracao(); } }}>✕</button>
                </span>
              </div>
              {aberto === r.id && (
                <div class="item-corpo">
                  {Object.entries(CAMPOS_QUIMICO).map(([g, campos]) => (
                    <details open={g === 'Identificação' || g === 'Legislação brasileira'}>
                      <summary><b>{g}</b></summary>
                      <div class="linha2"><Campos rec={r} campos={campos} /></div>
                    </details>
                  ))}
                  {d.nioshUrl && <a class="botao sec" href={d.nioshUrl} target="_blank" rel="noopener">Abrir no NIOSH Pocket Guide</a>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <ImportarClaude />
      <Calculadora agentes={lista} />
    </div>
  );
}

function ImportarClaude() {
  const [nomes, setNomes] = useState('');
  const [json, setJson] = useState('');
  const [msg, setMsg] = useState('');
  const copiar = async () => {
    const t = PROMPT_QUIMICOS + (nomes.trim() || '[[nomes dos agentes ou produtos – anexe as FISPQs]]');
    try { await navigator.clipboard.writeText(t); setMsg('✓ Instrução copiada. Cole no Claude e anexe as FISPQs, se tiver.'); } catch (e) { setMsg('Não foi possível copiar.'); }
  };
  const aplicar = async () => {
    try { const n = await importarAgentesColados(json); avisarAlteracao(); setMsg(`✓ ${n} agente(s) incluído(s) ou atualizado(s), como "A conferir".`); setJson(''); } catch (e) { setMsg(`Erro: ${e.message}`); }
  };
  return (
    <section class="bloco largo">
      <h3>Incluir agentes com o Claude (FISPQ, NIOSH, artigo)</h3>
      <label class="campo"><span class="rotulo">Agentes ou produtos (um por linha)</span>
        <textarea rows={2} value={nomes} onInput={(e) => setNomes(e.currentTarget.value)} /></label>
      <div class="linha-botoes"><button type="button" class="sec" onClick={copiar}>Copiar instrução</button></div>
      <label class="campo"><span class="rotulo">Cole aqui o JSON devolvido pelo Claude</span>
        <textarea rows={3} value={json} onInput={(e) => setJson(e.currentTarget.value)} /></label>
      <div class="linha-botoes"><button type="button" class="primario" disabled={!json.trim()} onClick={aplicar}>Aplicar</button></div>
      {msg && <p class="ok-msg">{msg}</p>}
    </section>
  );
}

function Calculadora({ agentes }) {
  const [ag, setAg] = useState('');
  const [mm, setMm] = useState('');
  const [ppm, setPpm] = useState('');
  const [mg, setMg] = useState('');
  const [hd, setHd] = useState('');
  const [hs, setHs] = useState('');
  const [lt, setLt] = useState('');
  const [mist, setMist] = useState('');
  const a = agentes.find((x) => x.id === ag);
  const massa = mm || (a && a.data.massaMolar) || '';
  const soma = somaMistura(mist.split('\n').map((l) => l.split(/[;\t]/)).filter((x) => x.length >= 2).map(([c, l]) => ({ c, lt: l })));
  const ordenados = [...agentes].sort((x, y) => String(x.data.nome || '').localeCompare(String(y.data.nome || ''), 'pt-BR'));
  return (
    <section class="bloco largo">
      <h3>Calculadora</h3>
      <div class="linha2">
        <label class="campo"><span class="rotulo">Agente (preenche a massa molar)</span>
          <select value={ag} onChange={(e) => setAg(e.currentTarget.value)}><option value="">—</option>{ordenados.map((x) => <option value={x.id}>{x.data.nome}</option>)}</select></label>
        <label class="campo"><span class="rotulo">Massa molar (g/mol)</span><input inputMode="decimal" value={massa} onInput={(e) => setMm(e.currentTarget.value)} /></label>
        <label class="campo"><span class="rotulo">ppm</span><input inputMode="decimal" value={ppm} onInput={(e) => setPpm(e.currentTarget.value)} /></label>
        <label class="campo"><span class="rotulo">mg/m³</span><input inputMode="decimal" value={mg} onInput={(e) => setMg(e.currentTarget.value)} /></label>
      </div>
      <p class="calculos">
        {ppm && <>{ppm} ppm = <b>{f(ppmParaMgm3(ppm, massa))} mg/m³</b>. </>}
        {mg && <>{mg} mg/m³ = <b>{f(mgm3ParaPpm(mg, massa))} ppm</b>. </>}
        <small>(25 °C e 1 atm: 24,45 L/mol)</small>
      </p>
      <div class="linha2">
        <label class="campo"><span class="rotulo">Limite de tolerância</span><input inputMode="decimal" value={lt} onInput={(e) => setLt(e.currentTarget.value)} /></label>
        <label class="campo"><span class="rotulo">Jornada diária (h)</span><input inputMode="decimal" value={hd} onInput={(e) => setHd(e.currentTarget.value)} /></label>
        <label class="campo"><span class="rotulo">Jornada semanal (h)</span><input inputMode="decimal" value={hs} onInput={(e) => setHs(e.currentTarget.value)} /></label>
      </div>
      {lt && <p class="calculos">
        Valor máximo (NR-15, Anexo 11, item 7): LT × FD {String(fatorDesvio(lt)).replace('.', ',')} = <b>{f(num(lt) * fatorDesvio(lt))}</b>.
        {hd && <> Brief & Scala diário: FR {f(fatorBriefScalaDiario(hd), 3)} → LT corrigido <b>{f(num(lt) * fatorBriefScalaDiario(hd))}</b>.</>}
        {hs && <> Brief & Scala semanal: FR {f(fatorBriefScalaSemanal(hs), 3)} → LT corrigido <b>{f(num(lt) * fatorBriefScalaSemanal(hs))}</b>.</>}
        <br /><small>Brief & Scala é critério técnico: o Anexo 11 vale para até 48 h semanais (item 10) e, acima disso, remete ao art. 60 da CLT (item 10.1). Não há correção de limite no texto da norma.</small>
      </p>}
      <label class="campo"><span class="rotulo">Mistura com efeito aditivo – uma linha por agente: concentração;limite</span>
        <textarea rows={3} value={mist} onInput={(e) => setMist(e.currentTarget.value)} placeholder={'50;78\n20;100'} /></label>
      {mist.trim() && <p class="calculos">Σ C/LT = <b>{f(soma, 2)}</b> – {soma > 1 ? 'excede (> 1)' : 'não excede (≤ 1)'}.</p>}
    </section>
  );
}
