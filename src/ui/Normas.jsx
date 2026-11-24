// Bases técnicas → Normas e profissões: consulta às bases do Caracterizador Pericial (decretos, Manual do INSS,
// LINACH, IN 128/2022, NR-15, NR-16, teses) e o banco de profissões usado nos laudos.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { entradasNormas, buscarNormas } from '../normas.js';
import { PROFISSOES } from '../data/profissoes.js';

export function ConsultaNormas() {
  const [entradas, setEntradas] = useState(null);
  const [q, setQ] = useState('');
  const [fonte, setFonte] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { import('../data/caracterizador/normas.json').then((m) => setEntradas(entradasNormas(m.default || m))); }, []);
  const fontes = useMemo(() => (entradas ? [...new Set(entradas.map((e) => e.fonte))] : []), [entradas]);
  const achados = useMemo(() => (entradas ? buscarNormas(entradas, q, fonte) : []), [entradas, q, fonte]);
  const copiar = async (e) => {
    try { await navigator.clipboard.writeText([e.titulo, e.texto].filter(Boolean).join('\n') + `\n(${e.fonte}${e.ref ? `, ${e.ref}` : ''})`); setMsg('Copiado.'); } catch (err) { setMsg('Não foi possível copiar.'); }
    setTimeout(() => setMsg(''), 1500);
  };
  if (!entradas) return <p class="vazio">Carregando as bases…</p>;
  return (
    <section class="bloco largo">
      <h3>Consulta normativa</h3>
      <p class="dica">Decretos 53.831/64 e 83.080/79, Anexo IV, quadros do Manual de Aposentadoria Especial do INSS (2018), LINACH, IN 128/2022 (arts. 286 a 302), NR-15 (Anexos 11 e 13), NR-16, marcos legais e teses. Bases do Caracterizador Pericial; confira a redação oficial antes de citar.</p>
      <div class="linha-botoes">
        <input type="search" class="cresce" placeholder="Pesquisar (ex.: mercúrio, odontológica, art. 291, álcalis)" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        <select value={fonte} onChange={(e) => setFonte(e.currentTarget.value)}>
          <option value="">Todas as fontes ({entradas.length})</option>
          {fontes.map((f) => <option value={f}>{f}</option>)}
        </select>
      </div>
      <p class="dica">{achados.length} resultado(s){achados.length > 100 ? ' – mostrando os 100 primeiros; refine a pesquisa' : ''}. {msg}</p>
      {achados.slice(0, 100).map((e) => (
        <div class="norma-item">
          <small>{e.fonte}{e.ref ? ` · ${e.ref}` : ''}</small>
          <b>{e.titulo}</b>
          {e.texto && <p style="white-space: pre-line">{e.texto}</p>}
          <button type="button" class="mini" onClick={() => copiar(e)}>Copiar</button>
        </div>
      ))}
    </section>
  );
}

const RES = (r, c) => `${r || 'a confirmar'}${c ? ` – ${c}` : ''}`;
export function ProfissoesBanco() {
  return (
    <section class="bloco largo">
      <h3>Banco de profissões</h3>
      <p class="dica">Agentes e critérios já adotados nos seus laudos. No caso, escolha a profissão no cadastro (etapa 1. Autos → Dados do caso) e use "Carregar agentes e profissiografia" na etapa 1. Autos; a instrução do Claude leva a mesma referência.</p>
      {PROFISSOES.map((p) => (
        <details class="bloco">
          <summary><b>{p.nome}</b> <small class="dica">CBO {p.cbo} · {p.agentes.length} agente(s)</small></summary>
          <p><b>Profissiografia:</b> {p.profissiografia}</p>
          <p><b>EPI:</b> {p.epi}</p>
          <table class="tabela-simples">
            <thead><tr><th>Agente</th><th>Até 05/03/1997</th><th>A partir de 06/03/1997</th></tr></thead>
            <tbody>{p.agentes.map((a) => <tr><td>{a.nome}</td><td>{RES(a.resAte97, a.codAte97)}</td><td>{RES(a.resDesde97, a.codDesde97)}</td></tr>)}</tbody>
          </table>
          <p><b>Roteiro de entrevista:</b></p><ul>{p.roteiro.map((r) => <li>{r}</li>)}</ul>
          <p><b>Documentos a pedir:</b> {p.documentos.join('; ')}.</p>
        </details>
      ))}
    </section>
  );
}
