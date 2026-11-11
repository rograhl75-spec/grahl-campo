import { render } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

// Caixa de confirmação no visual do app (no lugar do confirm/alert do navegador).
// confirmar(msg) → Promise<boolean>; avisar(msg) → Promise<void>
function Caixa({ msg, ok, cancelar, perigo, fechar }) {
  const btn = useRef(null);
  useEffect(() => {
    btn.current && btn.current.focus();
    const tecla = (e) => { if (e.key === 'Escape') fechar(false); };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, []);
  return (
    <div class="modal" onClick={() => fechar(false)}>
      <div class="modal-caixa dialogo" role="alertdialog" aria-modal="true" aria-label={msg} onClick={(e) => e.stopPropagation()}>
        <p>{msg}</p>
        <div class="linha-botoes">
          <button type="button" ref={btn} class={perigo ? 'primario perigo-forte' : 'primario'} onClick={() => fechar(true)}>{ok}</button>
          {cancelar && <button type="button" class="sec" onClick={() => fechar(false)}>{cancelar}</button>}
        </div>
      </div>
    </div>
  );
}

function abrir(props) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const fechar = (v) => { render(null, el); el.remove(); resolve(v); };
    render(<Caixa {...props} fechar={fechar} />, el);
  });
}

export const confirmar = (msg, { ok = 'Confirmar', cancelar = 'Cancelar', perigo = /lixeira|remover|desligar|excluir/i.test(msg) } = {}) =>
  abrir({ msg, ok: perigo && ok === 'Confirmar' ? 'Sim, continuar' : ok, cancelar, perigo });
export const avisar = (msg) => abrir({ msg, ok: 'OK', cancelar: null }).then(() => undefined);
