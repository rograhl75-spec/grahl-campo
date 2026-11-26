import { PRODUTOS_REPRESENTATIVOS } from '../data/produtosRepresentativos.js';
import { CAMPOS_FDS } from '../fds.js';
// Bases técnicas → Normas e profissões: consulta às bases do Caracterizador Pericial (decretos, Manual do INSS,
// LINACH, IN 128/2022, NR-15, NR-16, teses) e o banco de profissões usado nos laudos.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { entradasNormas, buscarNormas } from '../normas.js';
import { PROFISSOES } from '../data/profissoes.js';
import { db } from '../db.js';
import { useLive } from './hooks.js';
import { RecordList } from './RecordList.jsx';
import { avisarAlteracao } from '../sync.js';
import { entradasDasNotas, CAMPOS_NOTA, incluirNotasSugeridas, CAMPOS_PROFISSAO, CAMPOS_POSTO_MEDIDO, NOTAS_SUGERIDAS } from '../basesUsuario.js';

export function ConsultaNormas() {
  const [entradas, setEntradas] = useState(null);
  const [q, setQ] = useState('');
  const [fonte, setFonte] = useState('');
  const [msg, setMsg] = useState('');
  const notas = useLive(async () => (await db.records.where('kind').equals('notaNormativa').toArray()).filter((r) => !r.deleted), [], []);
  const [base, setBase] = useState(null);
  useEffect(() => { import('../data/caracterizador/normas.json').then((m) => setBase(entradasNormas(m.default || m))); }, []);
  useEffect(() => { if (base) setEntradas([...entradasDasNotas(notas), ...base]); }, [base, notas]);
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
  // as profissões do signatário (criadas a partir dos casos) entram no mesmo banco; a lista re-renderiza quando mudam
  const minhas = useLive(async () => (await db.records.where('kind').equals('profissao').toArray()).filter((r) => !r.deleted), [], []);
  return (<>
    <section class="bloco largo">
      <h3>Profissões do signatário <span class="contador">{minhas.length}</span></h3>
      <p class="dica">Fichas criadas a partir dos seus casos (Laudo → "Levar para a base técnica" → "Criar a ficha da profissão"). Entram no cadastro do caso, no "Carregar agentes" da etapa 1 e na instrução do Claude, junto com o banco fixo abaixo. Os agentes vêm da ficha gerada; para refazê-los, gere a ficha de novo a partir de um caso.</p>
      <RecordList kind="profissao" caseId={null} campos={CAMPOS_PROFISSAO} titulo="" novo="Adicionar profissão" compacto
        resumo={(r) => [r.data.nome, r.data.cbo && `CBO ${r.data.cbo}`, `${(r.data.agentes || []).length} agente(s)`].filter(Boolean).join(' · ')} />
    </section>
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
  </>);
}

// Notas normativas do signatário: como aplica cada norma; pesquisáveis na consulta e enviadas ao Claude
export function NotasSignatario() {
  const [msg, setMsg] = useState('');
  return (
    <section class="bloco largo">
      <h3>Notas normativas do signatário</h3>
      <p class="dica">Como você aplica as normas (faixas, critérios, interpretações técnicas). Aparecem na Consulta normativa e, marcadas "Enviar ao Claude", vão como critério em toda instrução de redação. Confira a redação oficial antes de citar.</p>
      <div class="linha-botoes">
        <button type="button" class="sec" onClick={async () => { const n = await incluirNotasSugeridas(); avisarAlteracao(); setMsg(n ? `✓ ${n} nota(s) sugerida(s) incluída(s). Revise o texto de cada uma.` : 'As notas sugeridas já estão cadastradas.'); }}>Incluir as {NOTAS_SUGERIDAS.length} notas sugeridas (das auditorias)</button>
      </div>
      {msg && <p class="ok-msg">{msg}</p>}
      <RecordList kind="notaNormativa" caseId={null} campos={CAMPOS_NOTA} titulo="" novo="Adicionar nota" inicial={{ usarNoClaude: 'Sim' }}
        resumo={(r) => [r.data.titulo, r.data.tema, r.data.usarNoClaude === 'Não' ? 'não vai ao Claude' : 'vai ao Claude'].filter(Boolean).join(' · ')} />
    </section>
  );
}

// Postos de trabalho medidos (não motorista): referência para casos parecidos
export function PostosMedidos() {
  return (
    <section class="bloco largo">
      <h3>Postos de trabalho medidos</h3>
      <p class="dica">Postos avaliados nos seus casos (padeiro, soldador, operador de máquina…), com os resultados e as condições da medição. Inclua a partir do caso em Laudo → "Levar para a base técnica". Extrajudicial: sem nomes de pessoas ou empresas na citação.</p>
      <RecordList kind="postoMedido" caseId={null} campos={CAMPOS_POSTO_MEDIDO} titulo="" novo="Adicionar posto"
        resumo={(r) => [r.data.funcao, r.data.ramo, r.data.dataMedicao, r.data.situacao].filter(Boolean).join(' · ')} />
    </section>
  );
}

// Produtos representativos (FDS de produtos de uso comum) para quando a marca usada no local não foi identificada:
// os do app (pesquisados em FDS públicas) e os que você cadastrar; no caso, entram em Preparação → Produtos químicos
export function ProdutosRepresentativos() {
  return (
    <section class="bloco largo">
      <h3>Produtos representativos (FDS)</h3>
      <p class="dica">Fichas de produtos de uso comum para quando a marca usada no local não foi identificada (combustível usado na lavagem de peças, fluido de corte, graxa…). No caso, use Preparação → Produtos químicos → "Incluir produto representativo da base". Entram "a conferir", com a observação de que são representativos.</p>
      <h4>Do app</h4>
      <ul class="lista-simples">
        {PRODUTOS_REPRESENTATIVOS.map((p) => <li><b>{p.para}</b> – {p.nome} ({p.fabricante}; {p.revisao}). <a href={p.url} target="_blank" rel="noopener">FDS</a></li>)}
      </ul>
      <h4>Seus</h4>
      <RecordList kind="produtoBase" caseId={null} campos={[['para', 'Representa (ex.: "Fluido de corte sintético")', 'text'], ...CAMPOS_FDS.filter(([k]) => k !== 'situacao')]} titulo="" novo="Adicionar produto representativo"
        resumo={(r) => [r.data.para, r.data.nome, r.data.fabricante].filter(Boolean).join(' · ')} />
    </section>
  );
}
