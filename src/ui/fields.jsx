import { useEffect, useRef, useState, useLayoutEffect } from 'preact/hooks';
import { updateField, fieldHistory } from '../db.js';
import { avisarAlteracao } from '../sync.js';
import { walGravar, walConfirmar } from '../wal.js';

// Todos os campos com gravação pendente, para gravar ao sair/minimizar o app
const pendentes = new Set();
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
  const remoto = rec && rec.data[k] !== undefined && rec.data[k] !== null ? String(rec.data[k]) : '';
  const [val, setVal] = useState(remoto);
  const valRef = useRef(remoto);
  const idRef = useRef(rec && rec.id);
  const timer = useRef(null);
  const sujo = useRef(false);
  const foco = useRef(false);
  const taRef = useRef(null);

  const flush = useRef(() => {});
  flush.current = () => {
    clearTimeout(timer.current);
    if (!sujo.current) return;
    sujo.current = false;
    pendentes.delete(flushProxy.current);
    salvar(idRef.current, k, valRef.current);
  };
  const flushProxy = useRef(() => flush.current());

  // trocou o registro exibido neste lugar da tela: grava o anterior e recarrega
  useLayoutEffect(() => {
    if (rec && rec.id !== idRef.current) {
      flush.current();
      idRef.current = rec.id;
      valRef.current = remoto;
      setVal(remoto);
    }
  }, [rec && rec.id]);

  // valor mudou em outro aparelho: atualiza só se o campo não estiver em edição
  useEffect(() => {
    if (!foco.current && !sujo.current && remoto !== valRef.current) {
      valRef.current = remoto;
      setVal(remoto);
    }
  }, [remoto]);

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
    <label class={`campo ${area ? 'campo-area' : ''} ${className}`}>
      <span class="rotulo">
        {label}
        {historico && rec && <BotaoHistorico rec={rec} k={k} aplicar={(v) => { valRef.current = v; setVal(v); sujo.current = true; flush.current(); }} />}
      </span>
      {area
        ? <textarea ref={taRef} rows={rows} {...comum} />
        : <input type={type === 'num' ? 'text' : type} inputMode={type === 'num' ? 'decimal' : inputMode} {...comum} />}
      {hint && <small class="dica">{hint}</small>}
    </label>
  );
}

export function Sel({ rec, k, label, opcoes, vazio = true }) {
  const v = rec ? rec.data[k] ?? '' : '';
  const lista = [...opcoes];
  if (v && !lista.includes(v)) lista.push(v);
  return (
    <label class="campo">
      <span class="rotulo">{label}</span>
      <select value={v} onChange={(e) => salvar(rec.id, k, e.currentTarget.value)}>
        {vazio && <option value="">—</option>}
        {lista.map((o) => <option value={o}>{o}</option>)}
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
      <button type="button" class="hist" title="Versões anteriores deste campo" onClick={abrir}>⟲ versões</button>
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
