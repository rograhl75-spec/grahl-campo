import { useEffect, useState } from 'preact/hooks';
import { liveQuery } from '../db.js';

// Consulta ao banco local que se atualiza sozinha quando os dados mudam
export function useLive(fn, deps = [], inicial = undefined) {
  const [v, setV] = useState(inicial);
  useEffect(() => {
    const sub = liveQuery(fn).subscribe({ next: setV, error: (e) => console.error(e) });
    return () => sub.unsubscribe();
  }, deps);
  return v;
}

export function useHash() {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const f = () => setH(location.hash);
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return h;
}

export function ir(caminho) {
  location.hash = caminho;
}
