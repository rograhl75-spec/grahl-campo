import { useEffect, useState } from 'preact/hooks';
import { onSyncState, sincronizarAgora } from '../sync.js';
import { useHash, ir } from './hooks.js';
import { Casos } from './Casos.jsx';
import { Caso } from './Caso.jsx';
import { Config } from './Config.jsx';

export function App() {
  const hash = useHash();
  const partes = hash.replace(/^#\/?/, '').split('/');
  let tela;
  if (partes[0] === 'caso' && partes[1]) tela = <Caso key={partes[1]} id={decodeURIComponent(partes[1])} aba={partes[2] || 'resumo'} />;
  else if (partes[0] === 'config') tela = <Config aba={partes[1] || 'nuvem'} />;
  else tela = <Casos />;
  return (
    <div class="app">
      <header class="topo">
        <a class="marca" href="#/" title="Casos">
          <img src={`${import.meta.env.BASE_URL}logo-sm.png`} alt="GRAHL" />
          <span class="marca-txt">Campo<small>Perícias</small></span>
        </a>
        <nav>
          <a href="#/" class={partes[0] === '' || partes[0] === 'caso' ? 'ativo' : ''}>Casos</a>
          <a href="#/config" class={partes[0] === 'config' ? 'ativo' : ''}>Configurações</a>
        </nav>
        <ModoCampo />
        <SyncBadge />
      </header>
      <main>{tela}</main>
    </div>
  );
}

function ModoCampo() {
  const ler = () => { try { return localStorage.getItem('modoCampo') === '1'; } catch (e) { return false; } };
  const [on, setOn] = useState(ler());
  useEffect(() => { document.body.classList.toggle('modo-campo', on); }, [on]);
  const alterna = () => { const n = !on; setOn(n); try { localStorage.setItem('modoCampo', n ? '1' : '0'); } catch (e) { /* ignore */ } };
  return (
    <button type="button" class={`modo-btn ${on ? 'on' : ''}`} onClick={alterna} title="Letras e botões maiores, alto contraste">
      {on ? '☀ Modo campo ligado' : '☀ Modo campo'}
    </button>
  );
}

function SyncBadge() {
  const [s, setS] = useState(null);
  useEffect(() => onSyncState(setS), []);
  if (!s) return null;
  let cls = 'ok', txt;
  const pend = s.pending + s.fotosPendentes;
  if (!s.configured) { cls = 'neutro'; txt = 'Salvo neste aparelho (nuvem não configurada)'; }
  else if (!s.user) { cls = 'alerta'; txt = 'Salvo neste aparelho · entre para sincronizar'; }
  else if (!s.online) { cls = 'alerta'; txt = pend ? `Sem internet · ${pend} alteração(ões) guardadas no aparelho` : 'Sem internet · tudo guardado no aparelho'; }
  else if (s.error) { cls = 'erro'; txt = `Salvo no aparelho · nuvem com erro: ${s.error}`; }
  else if (pend) { cls = 'alerta'; txt = `Salvo no aparelho · enviando ${pend}…`; }
  else txt = `Sincronizado${s.lastSync ? ' às ' + new Date(s.lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}`;
  return (
    <button type="button" class={`sync ${cls}`} title={txt}
      onClick={() => (s.configured && s.user ? sincronizarAgora() : ir('/config/nuvem'))}>
      <span class="ponto" />{txt}
    </button>
  );
}
