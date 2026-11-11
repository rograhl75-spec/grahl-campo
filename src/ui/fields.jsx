import { useEffect, useRef, useState, useLayoutEffect } from 'preact/hooks';
import { updateField, fieldHistory } from '../db.js';
import { avisarAlteracao } from '../sync.js';
import { walGravar, walConfirmar } from '../wal.js';
import { Icone } from './Icone.jsx';

// Todos os campos com gravação pendente, para gravar ao sair/minimizar o app
const pendentes = new Set();
let contadorCampos = 0;
export function gravarTudoAgora() {
  for (const f of [...pendentes]) f();
}
window.addEventListener('pagehide', gravarTudoAgora);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') gravarTudoAgora(); });

async function salvar(id, k, v) {
  try {
    await updateField(id, k, v);
    walConfirmar(id, k, v);
    avisarAlteracao();
  } catch (e) {
    console.error(e);
    alert('ATENÇÃO: não foi possível gravar no aparelho: ' + e.message);
  }
}

// Campo de texto com gravação automática (sem botão "Salvar")
export function TF({ rec, k, label, type = 'text', area = false, rows = 3, placeholder = '', hint, historico = area, inputMode, className = '' }) {
  let remoto = rec && rec.data[k] !== undefined && rec.data[k] !== null ? String(rec.data[k]) : '';
  // campo de data com valor antigo em texto ("01/03/2023"): mostra convertido em vez de aparecer vazio
  if (type === 'date') { const m = remoto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) remoto = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  const [val, setVal] = useState(remoto);
  const valRef = useRef(remoto);
  const idRef = useRef(rec && rec.id);
  const timer = useRef(null);
  const sujo = useRef(false);
  const foco = useRef(false);
  const taRef = useRef(null);
  const idCampo = useRef(`c${++contadorCampos}`).current;
  // valores gravados por este campo (o eco da própria gravação não é alteração de outro aparelho)
  const proprios = useRef(new Set([remoto]));
  // texto que chegou de outro aparelho enquanto este campo estava em edição
  const [outro, setOutro] = useState(null);

  const flush = useRef(() => {});
  flush.current = () => {
    clearTimeout(timer.current);
    if (!sujo.current) return;
    sujo.current = false;
    pendentes.delete(flushProxy.current);
    proprios.current.add(valRef.current);
    if (proprios.current.size > 50) proprios.current = new Set([...proprios.current].slice(-20));
    salvar(idRef.current, k, valRef.current);
  };
  const flushProxy = useRef(() => flush.current());

  // trocou o registro exibido neste lugar da tela: grava o anterior e recarrega
  useLayoutEffect(() => {
    if (rec && rec.id !== idRef.current) {
      flush.current();
      idRef.current = rec.id;
      valRef.current = remoto;
      proprios.current = new Set([remoto]);
      setOutro(null);
      setVal(remoto);
    }
  }, [rec && rec.id]);

  // valor mudou em outro aparelho: fora de edição, atualiza na hora; em edição, avisa e deixa escolher
  // (antes, a alteração remota sumia e era sobrescrita sem aviso ao continuar digitando)
  useEffect(() => {
    // eco da própria gravação: nada muda (o aviso pendente continua até a escolha)
    if (proprios.current.has(remoto)) return;
    // o outro aparelho chegou ao mesmo texto: não há o que escolher
    if (remoto === valRef.current) { setOutro(null); return; }
    if (!foco.current && !sujo.current) { valRef.current = remoto; setVal(remoto); setOutro(null); return; }
    setOutro(remoto);
  }, [remoto]);
  const usarOutro = () => {
    clearTimeout(timer.current); sujo.current = false; pendentes.delete(flushProxy.current);
    valRef.current = outro; setVal(outro); proprios.current.add(outro); walConfirmar(idRef.current, k, outro); setOutro(null);
  };
  const manterMeu = () => { proprios.current.add(outro); setOutro(null); sujo.current = true; flush.current(); };

  useEffect(() => () => flush.current(), []);

  useLayoutEffect(() => {
    if (area && taRef.current) {
      taRef.current.style.height = 'auto';
      taRef.current.style.height = Math.max(taRef.current.scrollHeight + 2, rows * 26 + 20) + 'px';
    }
  }, [val, area]);

  const onInput = (e) => {
    const v = e.currentTarget.value;
    valRef.current = v;
    setVal(v);
    walGravar(idRef.current, k, v);
    sujo.current = true;
    pendentes.add(flushProxy.current);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush.current(), type === 'date' || type === 'time' ? 50 : 400);
  };

  const comum = {
    value: val, onInput, placeholder, inputMode,
    onFocus: () => { foco.current = true; },
    onBlur: () => { foco.current = false; flush.current(); },
  };
  return (
    // div + label for: os botões (versões, aviso de conflito) não ficam dentro do <label>
    <div class={`campo ${area ? 'campo-area' : ''} ${className}`}>
      <span class="rotulo">
        <label for={idCampo}>{label}</label>
        {historico && rec && <BotaoHistorico rec={rec} k={k} aplicar={(v) => { valRef.current = v; setVal(v); sujo.current = true; flush.current(); }} />}
      </span>
      {area
        ? <textarea id={idCampo} ref={taRef} rows={rows} {...comum} />
        : <input id={idCampo} type={type === 'num' ? 'text' : type} inputMode={type === 'num' ? 'decimal' : inputMode} {...comum} />}
      {outro !== null && (
        <span class="conflito" role="alert">
          <b>Este campo foi alterado em outro aparelho enquanto você editava.</b>
          <span class="conflito-txt">{outro || '(vazio)'}</span>
          <span class="linha-botoes">
            <button type="button" class="mini" onClick={usarOutro}>Usar a versão do outro aparelho</button>
            <button type="button" class="mini sec" onClick={manterMeu}>Manter a minha</button>
          </span>
        </span>
      )}
      {hint && <small class="dica">{hint}</small>}
    </div>
  );
}

export function Sel({ rec, k, label, opcoes, vazio = true }) {
  const v = rec ? rec.data[k] ?? '' : '';
  // opção simples ("Sim") ou par [valor gravado, rótulo exibido]
  const lista = opcoes.map((o) => (Array.isArray(o) ? o : [o, o]));
  if (v && !lista.some(([x]) => x === v)) lista.push([v, v]);
  return (
    <label class="campo">
      <span class="rotulo">{label}</span>
      <select value={v} onChange={(e) => salvar(rec.id, k, e.currentTarget.value)}>
        {vazio && <option value="">—</option>}
        {lista.map(([o, r]) => <option value={o}>{r}</option>)}
      </select>
    </label>
  );
}

// Seleção múltipla em "chips" (ex.: objeto da perícia)
export function Chips({ rec, k, label, opcoes }) {
  const atual = Array.isArray(rec.data[k]) ? rec.data[k] : [];
  const alterna = (o) => {
    const novo = atual.includes(o) ? atual.filter((x) => x !== o) : [...atual, o];
    salvar(rec.id, k, novo);
  };
  return (
    <div class="campo">
      <span class="rotulo">{label}</span>
      <div class="chips">
        {opcoes.map((o) => (
          <button type="button" class={`chip ${atual.includes(o) ? 'on' : ''}`} onClick={() => alterna(o)}>{o}</button>
        ))}
      </div>
    </div>
  );
}

// Escolha única em botões grandes
export function Opcoes({ rec, k, label, opcoes }) {
  const v = rec.data[k] || '';
  return (
    <div class="campo">
      <span class="rotulo">{label}</span>
      <div class="chips">
        {opcoes.map((o) => (
          <button type="button" class={`chip ${v === o ? 'on' : ''}`} onClick={() => salvar(rec.id, k, o)}>{o}</button>
        ))}
      </div>
    </div>
  );
}

export function Campos({ rec, campos }) {
  return campos.map(([k, label, tipo, opcoes]) => {
    if (tipo === 'select') return <Sel key={k} rec={rec} k={k} label={label} opcoes={opcoes} />;
    if (tipo === 'area') return <TF key={k} rec={rec} k={k} label={label} area />;
    return <TF key={k} rec={rec} k={k} label={label} type={tipo} />;
  });
}

function BotaoHistorico({ rec, k, aplicar }) {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState([]);
  const abrir = async (e) => {
    e.preventDefault();
    setLista(await fieldHistory(rec.id, k));
    setAberto(true);
  };
  return (
    <>
      <button type="button" class="hist" title="Versões anteriores deste campo" onClick={abrir}><Icone nome="historico" tam={14} /> versões</button>
      {aberto && (
        <div class="modal" onClick={() => setAberto(false)}>
          <div class="modal-caixa" onClick={(e) => e.stopPropagation()}>
            <h3>Versões anteriores</h3>
            {!lista.length && <p>Nenhuma versão anterior registrada neste aparelho.</p>}
            {lista.map((h) => (
              <div class="versao">
                <div class="versao-data">{new Date(h.at).toLocaleString('pt-BR')}</div>
                <pre>{h.prev || '(vazio)'}</pre>
                <small>↓ passou a ser</small>
                <pre>{h.value || '(vazio)'}</pre>
                <div class="linha-botoes">
                  <button type="button" onClick={() => { aplicar(h.prev || ''); setAberto(false); }}>Restaurar texto anterior</button>
                </div>
              </div>
            ))}
            <button type="button" class="sec" onClick={() => setAberto(false)}>Fechar</button>
          </div>
        </div>
      )}
    </>
  );
}

export { salvar };
