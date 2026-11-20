import { useState, useEffect } from 'preact/hooks';
import { db, createRecord, softDelete, updateFields } from '../db.js';
import { avisarAlteracao, obterAnexo } from '../sync.js';
import {
  importarBaseJson, exportarBaseJson, tsDaBase, sugerirParaVinculo, paraResultadoBusca, lerJsonVeiculos, adicionarParadigmas, guardarAnexo, PROMPT_LAUDO_ANTIGO,
  rotuloParadigma, certificadoVencido, REGRA_CERT_MESES_PADRAO, resolverCodigosDuplicados, referenciasARevisar,
} from '../paradigmas.js';
import {
  CATEGORIAS_MAQUINA, GRUPOS_MAQUINA, OPCOES_CATEGORIA, ORIGEM_DADO, FAMILIAS_MAQUINAS, LIMITES, CAMPOS_ESTAT, PROMPT_MAQUINAS,
  resumoPorCategoria, codigoCategoria, classificar, ehMaquina,
} from '../maquinas.js';
import { fmt } from '../calc.js';
import { baixarArquivo, carimbo } from '../backup.js';
import { familiaProvavel, DESCRICAO_FAMILIAS } from '../similaridade.js';
import { useLive } from './hooks.js';
import { Campos } from './fields.jsx';
import { RecordList } from './RecordList.jsx';
import { Icone } from './Icone.jsx';
import { confirmar } from './dialogo.jsx';
import { Quimicos } from './Quimicos.jsx';

export const CAMPOS_PARADIGMA = {
  'Identificação': [
    ['codigo', 'Código', 'text'], ['tipo', 'Tipo (toco, truck, cavalo, bitrem, ônibus, van, trator…)', 'text'],
    ['marca', 'Marca', 'text'], ['modelo', 'Modelo', 'text'], ['ano', 'Ano', 'text'],
    ['anoFonte', 'Fonte do ano', 'select', ['Laudo', 'CRLV / documento do veículo', 'Foto (placa, plaqueta do chassi)', 'Faixa de fabricação do modelo (aproximado)']],
    ['epocaFabricacao', 'Época de fabricação, sem o ano (faixa, ex.: 1975–1987)', 'text'],
    ['situacao', 'Situação', 'select', ['OK', 'Revisar', 'Ressalva', 'Confirmar modelo', 'RECALCULAR VDVR', 'NÃO USAR']],
  ],
  'Máquina e condição de operação': [
    ['categoriaMaquina', 'Categoria da máquina', 'select', OPCOES_CATEGORIA], ['origemDado', 'Origem do dado', 'select', ORIGEM_DADO],
    ['operacao', 'Operação (gradagem, roçada, transporte, colheita…)', 'text'], ['implemento', 'Implemento acoplado', 'text'],
    ['potencia', 'Potência (cv)', 'num'], ['rotacao', 'Rotação do motor (rpm)', 'num'], ['velocidade', 'Velocidade (km/h)', 'num'],
    ['referencia', 'Referência bibliográfica (ABNT) / documento de origem', 'area'],
  ],
  'Características técnicas (ordem da similaridade)': [
    ['familia', 'Família técnica (F1, F2…)', 'text'], ['posicaoMotor', 'Posição do motor', 'text'], ['cabine', 'Cabine – geração e isolamento', 'text'],
    ['arCondicionado', 'Ar-condicionado', 'text'], ['suspensaoCabine', 'Suspensão da cabine', 'text'], ['suspensaoAssento', 'Suspensão do assento', 'text'],
    ['configuracao', 'Configuração (eixos, implemento, carga)', 'text'], ['via', 'Via predominante', 'text'],
  ],
  'Resultados': [
    ['duracaoRuidoMin', 'Duração da amostra de ruído (min)', 'num'], ['lavg', 'Lavg q=5 (dB(A))', 'num'], ['leq', 'Leq q=3 (dB(A))', 'num'],
    ['jornadaLaudo', 'Jornada do laudo de origem (h)', 'num'], ['nenLaudo', 'NEN no laudo (dB(A))', 'num'],
    ['tempoVibracao', 'Tempo amostrado de vibração', 'text'], ['arep', 'arep VCI (m/s²)', 'num'], ['arenLaudo', 'aren no laudo (m/s²)', 'num'],
    ['vdvrLaudo', 'VDVR no laudo (m/s^1,75)', 'num'], ['eixoDominante', 'Eixo dominante', 'text'], ['arenVmb', 'aren VMB (m/s²)', 'num'], ['ibutg', 'IBUTG (°C)', 'num'],
  ],
  'Fonte (laudo extrajudicial: sem nome do segurado)': [
    ['fonteTipo', 'Tipo de fonte', 'select', ['Judicial', 'Judicial trabalhista', 'Judicial (perita terceira)', 'Extrajudicial', 'Literatura', 'Fabricante']],
    ['processo', 'Processo', 'text'], ['vara', 'Vara', 'text'], ['dataMedicao', 'Data da medição (DD/MM/AAAA)', 'text'], ['citacao', 'Como citar no laudo (extrajudicial: sempre "Medição extrajudicial – data")', 'text'],
    ['clienteOrigem', 'Cliente / contratante (controle interno – não sai nos documentos)', 'text'],
    ['relatoriosSemNomes', 'Relatórios sem nomes de pessoas e empresas (extrajudicial: só assim vão como apêndice)', 'select', ['Não', 'Sim']],
  ],
  'Instrumentação': [
    ['ruidoEquip', 'Dosímetro', 'text'], ['ruidoSerie', 'Série', 'text'], ['ruidoCert', 'Certificado', 'text'], ['ruidoCertData', 'Data do certificado', 'text'],
    ['calibEquip', 'Calibrador', 'text'], ['calibSerie', 'Série do calibrador', 'text'], ['calibCertData', 'Data do certificado do calibrador', 'text'],
    ['vibEquip', 'Medidor de vibração', 'text'], ['vibSerie', 'Série', 'text'], ['vibCert', 'Certificado', 'text'], ['vibCertData', 'Data do certificado', 'text'],
  ],
  'Uso e observações': [
    ['servePara', 'Serve de paradigma para', 'area'], ['observacoes', 'Observações', 'area'], ['idsAnteriores', 'IDs do banco anterior', 'text'],
  ],
};

// Bases técnicas em três seções: veículos (paradigmas de motorista, com similares, famílias e busca),
// máquinas e equipamentos, e agentes químicos (limites e enquadramento – não são paradigmas).
const SECOES = [
  { id: 'veic', titulo: 'Veículos', sub: 'Paradigmas de motorista: medições, similares e famílias', icone: 'caminhao',
    abas: [['veiculos', 'Veículos medidos'], ['similares', 'Similares'], ['familias', 'Famílias'], ['buscar', 'Buscar paradigma'], ['importar', 'Importar / exportar']] },
  { id: 'maq', titulo: 'Máquinas', sub: 'Tratores, máquinas agrícolas e de construção, ferramentas', icone: 'regua', abas: [['maquinas', 'Máquinas – ruído e vibração']] },
  { id: 'qui', titulo: 'Agentes químicos', sub: 'Limites (NR-15, Anexo 11), LINACH e códigos dos decretos', icone: 'nota', abas: [['quimicos', 'Agentes químicos']] },
];

export function Paradigmas({ aba = 'veiculos' }) {
  const secao = SECOES.find((x) => x.abas.some(([k]) => k === aba)) || SECOES[0];
  return (
    <div class="pagina">
      <div class="caso-topo"><div class="caso-id">
        <h1>Bases técnicas</h1>
        <div class="caso-sub">Paradigmas medidos (veículos e máquinas) para a prova por similaridade e o banco de agentes químicos.</div>
      </div></div>
      <nav class="secoes-base" aria-label="Seções">
        {SECOES.map((x) => (
          <a href={`#/paradigmas/${x.abas[0][0]}`} class={`secao-base ${x.id === secao.id ? 'ativa' : ''}`}>
            <Icone nome={x.icone} tam={22} /><span><b>{x.titulo}</b><small>{x.sub}</small></span>
          </a>
        ))}
      </nav>
      {secao.abas.length > 1 && <nav class="abas">{secao.abas.map(([k, r]) => <a href={`#/paradigmas/${k}`} class={aba === k ? 'ativo' : ''}>{r}</a>)}</nav>}
      {aba === 'veiculos' && <Veiculos />}
      {aba === 'maquinas' && <Maquinas />}
      {aba === 'quimicos' && <Quimicos />}
      {aba === 'similares' && <Similares />}
      {aba === 'familias' && <Familias />}
      {aba === 'buscar' && <Buscar />}
      {aba === 'importar' && <Importar />}
    </div>
  );
}

function useParadigmas() {
  return useLive(async () => (await db.records.where('kind').equals('paradigma').toArray()).filter((r) => !r.deleted)
    .sort((a, b) => String(a.data.codigo).localeCompare(String(b.data.codigo), 'pt', { numeric: true })), [], []);
}

function alertas(p, meses) {
  const d = p.data, out = [];
  if (certificadoVencido(d.ruidoCertData, d.dataMedicao, meses)) out.push(`certificado do dosímetro com mais de ${meses} meses na data da medição`);
  if (certificadoVencido(d.vibCertData, d.dataMedicao, meses)) out.push(`certificado do medidor de vibração com mais de ${meses} meses na data da medição`);
  return out;
}

function Veiculos() {
  const lista = useParadigmas();
  const cfg = useLive(() => db.records.get('cfg-paradigmas'), [], null);
  const meses = Number((cfg && cfg.data.regraCertMeses) || REGRA_CERT_MESES_PADRAO);
  const [busca, setBusca] = useState('');
  const [fam, setFam] = useState('');
  const [aberto, setAberto] = useState(null);
  const fams = [...new Set(lista.map((p) => p.data.familia).filter(Boolean))].sort();
  const t = busca.toLowerCase();
  const filtrados = lista.filter((p) => (!fam || p.data.familia === fam) && (!t || JSON.stringify(p.data).toLowerCase().includes(t)));
  const novo = async () => { const r = await createRecord('paradigma', null, { codigo: '', situacao: 'Revisar' }); avisarAlteracao(); setAberto(r.id); };
  return (
    <div class="grade">
      <AvisoCodigos />
      <SaudeBanco lista={lista} />
      <section class="bloco largo">
        <div class="barra-casos">
          <input class="busca" type="search" placeholder="Buscar marca, modelo, processo…" value={busca} onInput={(e) => setBusca(e.currentTarget.value)} />
          <button type="button" class="primario" onClick={novo}>＋ Novo veículo medido</button>
        </div>
        <div class="chips filtros mt">
          <button type="button" class={`chip ${!fam ? 'on' : ''}`} onClick={() => setFam('')}>Todas</button>
          {fams.map((f) => <button type="button" class={`chip ${fam === f ? 'on' : ''}`} onClick={() => setFam(f)}>{f}</button>)}
        </div>
      </section>
      {!lista.length && <section class="bloco largo"><p class="vazio">Banco vazio. Importe a sua base em "Importar".</p></section>}
      <div class="largo">
        {filtrados.map((p) => {
          const d = p.data;
          const al = alertas(p, meses);
          return (
            <div class={`item ${aberto === p.id ? 'aberto' : ''}`} key={p.id}>
              <div class="item-topo" onClick={() => setAberto(aberto === p.id ? null : p.id)}>
                <span class="item-titulo">
                  <b>{rotuloParadigma(p) || '(sem identificação)'}</b>{' '}
                  <span class="etq">{d.familia || 'sem família'}</span>{' '}
                  {d.situacao && d.situacao !== 'OK' && <span class="etq fase">{d.situacao}</span>}{' '}
                  {d.relatoriosAnexoId ? <span class="etq">relatórios ✓</span> : d.anexoId ? <span class="etq">laudo ✓{d.paginasRelatorios ? ` p. ${d.paginasRelatorios}` : ''}</span> : <span class="etq fase">sem arquivo</span>}
                  <br /><small class="suave">
                    {[d.lavg && `Lavg ${d.lavg}`, d.arep && `arep ${d.arep}`, d.vdvrLaudo && `VDVR ${d.vdvrLaudo}`, d.citacao].filter(Boolean).join(' · ')}
                  </small>
                  {al.length > 0 && <><br /><small class="alerta-txt">⚠ {al.join('; ')}</small></>}
                </span>
                <span class="item-acoes" onClick={(e) => e.stopPropagation()}>
                  <button type="button" class="mini perigo" onClick={async () => { if (await confirmar('Mover para a lixeira?')) { await softDelete(p.id); avisarAlteracao(); } }}>✕</button>
                </span>
              </div>
              {aberto === p.id && (
                <div class="item-corpo">
                  {Object.entries(CAMPOS_PARADIGMA).map(([g, campos]) => (
                    <details open={g === 'Identificação' || g === 'Resultados'}>
                      <summary><b>{g}</b></summary>
                      <div class="linha2"><Campos rec={p} campos={campos} /></div>
                    </details>
                  ))}
                  <RelatoriosParadigma p={p} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Banco de máquinas: ruído e vibração ----------
const f2 = (x, c = 1) => (isFinite(x) ? fmt(x, c) : '—');
function Faixa({ e, casas = 1, chave }) {
  if (!e) return <span class="suave">—</span>;
  const cl = classificar(chave, e.max);
  return (
    <span class={`faixa ${cl ? `nv-${cl.nivel}` : ''}`} title={cl ? `Máximo ${cl.txt}` : ''}>
      {e.n > 1 ? `${f2(e.min, casas)} – ${f2(e.max, casas)}` : f2(e.min, casas)}
      <small> {e.n > 1 ? `med. ${f2(e.mediana, casas)} · n=${e.n}` : 'n=1'}</small>
    </span>
  );
}

function Maquinas() {
  const lista = useParadigmas();
  const [grupo, setGrupo] = useState('');
  const [cat, setCat] = useState('');
  const [aberto, setAberto] = useState(null);
  const [msg, setMsg] = useState('');
  const maquinas = lista.filter(ehMaquina);
  const resumo = resumoPorCategoria(maquinas);
  const cats = CATEGORIAS_MAQUINA.filter((c) => !grupo || c.grupo === grupo);
  const doFiltro = maquinas.filter((p) => {
    const cod = codigoCategoria(p.data.categoriaMaquina);
    if (cat) return cod === cat;
    if (grupo) return cats.some((c) => c.cod === cod);
    return true;
  });
  const novo = async (origem) => {
    const r = await createRecord('paradigma', null, { codigo: '', situacao: 'Revisar', categoriaMaquina: cat ? OPCOES_CATEGORIA[CATEGORIAS_MAQUINA.findIndex((c) => c.cod === cat)] : '', origemDado: origem, fonteTipo: /Literatura/.test(origem) ? 'Literatura' : '' });
    avisarAlteracao(); setAberto(r.id);
  };
  const criarFamilias = async () => {
    const existentes = new Set((await db.records.where('kind').equals('familia').toArray()).filter((r) => !r.deleted).map((r) => r.data.codigo));
    let n = 0;
    for (const f of FAMILIAS_MAQUINAS) if (!existentes.has(f.codigo)) { await createRecord('familia', null, f); n++; }
    avisarAlteracao();
    setMsg(n ? `✓ ${n} família(s) de máquinas incluída(s) em Famílias.` : 'As famílias de máquinas já estavam cadastradas.');
  };
  return (
    <div class="grade">
      <section class="bloco largo">
        <div class="linha-botoes entre">
          <h3>Banco de ruído e vibração de máquinas e equipamentos</h3>
          <span class="contagem">{maquinas.length} registro(s)</span>
        </div>
        <p class="dica">Tratores, colhedoras, pulverizadores, máquinas de construção, empilhadeiras e ferramentas portáteis. Cada registro guarda a origem do dado
          (medição própria, laudo de terceiro, literatura técnica ou declaração do fabricante) e a condição de operação. Valores de literatura e de fabricante servem
          para triagem e para fundamentar a similaridade; na conclusão pericial, prefira medições em condições equivalentes às do trabalhador.</p>
        <div class="chips filtros">
          <button type="button" class={`chip ${!grupo ? 'on' : ''}`} onClick={() => { setGrupo(''); setCat(''); }}>Todos os grupos</button>
          {GRUPOS_MAQUINA.map((g) => <button type="button" class={`chip ${grupo === g ? 'on' : ''}`} onClick={() => { setGrupo(g); setCat(''); }}>{g}</button>)}
        </div>
        <div class="linha-botoes">
          <button type="button" class="primario" onClick={() => novo(ORIGEM_DADO[0])}>＋ Medição própria</button>
          <button type="button" onClick={() => novo(ORIGEM_DADO[2])}>＋ Valor de literatura</button>
          <button type="button" onClick={() => novo(ORIGEM_DADO[3])}>＋ Declaração do fabricante</button>
          <button type="button" class="sec" onClick={criarFamilias}>Incluir famílias A1–P1</button>
        </div>
        {msg && <p class="ok-msg">{msg}</p>}
      </section>

      <section class="bloco largo">
        <h3>Resumo por categoria</h3>
        <div class="tabela-rolagem">
          <table class="tabela">
            <thead><tr><th>Categoria</th><th>Agentes</th><th>Reg.</th>{CAMPOS_ESTAT.map(([, r]) => <th>{r}</th>)}</tr></thead>
            <tbody>
              {cats.map((c) => {
                const r = resumo[c.cod];
                return (
                  <tr class={`${cat === c.cod ? 'sel' : ''} ${r ? '' : 'sem-dado'}`} onClick={() => setCat(cat === c.cod ? '' : c.cod)}>
                    <td><b>{c.cod}</b><br /><small>{c.nome}</small></td>
                    <td><small>{c.agentes.join(', ')}</small></td>
                    <td class="num">{r ? r.total : 0}</td>
                    {CAMPOS_ESTAT.map(([k, , chave]) => <td class="num"><Faixa e={r && r[k]} chave={chave} casas={/ruido/.test(chave) ? 1 : 2} /></td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p class="legenda-niveis"><span class="faixa nv-abaixo">abaixo do nível de ação</span> <span class="faixa nv-acao">entre ação e limite</span> <span class="faixa nv-acima">acima do limite</span> <small class="suave">(cor pelo valor máximo da categoria)</small></p>
      </section>

      {cat && (() => {
        const c = CATEGORIAS_MAQUINA.find((x) => x.cod === cat);
        return (
          <section class="bloco largo destaque">
            <h3>{c.cod} – {c.nome}</h3>
            <p><b>Agentes:</b> {c.agentes.join(', ')}{c.eixo ? <> · <b>Eixo dominante típico da VCI:</b> {c.eixo}</> : null}</p>
            {c.fatores && <p><b>O que mais influencia:</b> {c.fatores}</p>}
          </section>
        );
      })()}

      <div class="largo">
        {!doFiltro.length && <p class="vazio">Nenhum registro {cat ? 'nesta categoria' : 'de máquina'} ainda. Use os botões acima ou importe artigos, manuais e laudos em “Importar”.</p>}
        {doFiltro.map((p) => {
          const d = p.data;
          const cls = [['ruido', d.lavg || d.leq], ['vciAren', d.arep || d.arenLaudo], ['vciVdvr', d.vdvrLaudo], ['vmb', d.arenVmb]].map(([k, v]) => classificar(k, v)).filter(Boolean);
          const pior = cls.some((x) => x.nivel === 'acima') ? 'acima' : cls.some((x) => x.nivel === 'acao') ? 'acao' : cls.length ? 'abaixo' : '';
          return (
            <div class={`item ${aberto === p.id ? 'aberto' : ''}`} key={p.id}>
              <div class="item-topo" onClick={() => setAberto(aberto === p.id ? null : p.id)}>
                <span class="item-titulo">
                  <b>{rotuloParadigma(p) || '(sem identificação)'}</b>{' '}
                  <span class="etq">{codigoCategoria(d.categoriaMaquina) || 'sem categoria'}</span>{' '}
                  {d.origemDado && <span class="etq">{d.origemDado.split(' (')[0]}</span>}{' '}
                  {pior && <span class={`faixa nv-${pior}`}>{pior === 'acima' ? 'acima do limite' : pior === 'acao' ? 'nível de ação' : 'abaixo da ação'}</span>}
                  <br /><small class="suave">
                    {[d.operacao, d.lavg && `Lavg ${d.lavg} dB(A)`, d.leq && `Leq ${d.leq} dB(A)`, (d.arep || d.arenLaudo) && `aren ${d.arep || d.arenLaudo} m/s²`, d.vdvrLaudo && `VDVR ${d.vdvrLaudo}`, d.arenVmb && `VMB ${d.arenVmb} m/s²`].filter(Boolean).join(' · ')}
                  </small>
                </span>
                <span class="item-acoes" onClick={(e) => e.stopPropagation()}>
                  <button type="button" class="mini perigo" aria-label="Mover para a lixeira" onClick={async () => { if (await confirmar('Mover para a lixeira?')) { await softDelete(p.id); avisarAlteracao(); } }}>✕</button>
                </span>
              </div>
              {aberto === p.id && (
                <div class="item-corpo">
                  {Object.entries(CAMPOS_PARADIGMA).filter(([g]) => !/Instrumentação/.test(g) || /própria|terceiro/i.test(d.origemDado || '')).map(([g, campos]) => (
                    <details open={g === 'Identificação' || g === 'Resultados' || g.startsWith('Máquina')}>
                      <summary><b>{g}</b></summary>
                      <div class="linha2"><Campos rec={p} campos={campos} /></div>
                    </details>
                  ))}
                  {d.anexoId && <AbrirAnexo id={d.anexoId} />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <section class="bloco largo">
        <h3>Limites de referência</h3>
        <div class="tabela-rolagem">
          <table class="tabela">
            <thead><tr><th>Agente</th><th>Nível de ação</th><th>Limite</th><th>Base normativa</th></tr></thead>
            <tbody>
              {[['Ruído', 'ruido'], ['VCI – aren', 'vciAren'], ['VCI – VDVR', 'vciVdvr'], ['VMB – aren', 'vmb']].map(([r, k]) => (
                <tr><td><b>{r}</b></td><td class="num">{String(LIMITES[k].acao).replace('.', ',')} {LIMITES[k].unidade}</td><td class="num">{String(LIMITES[k].limite).replace('.', ',')} {LIMITES[k].unidade}</td><td><small>{LIMITES[k].base}</small></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="dica">Previdenciário: de 06/03/1997 a 13/08/2014, o cód. 2.0.2 descreve trabalhos com perfuratrizes e marteletes pneumáticos; para a VCI em outras atividades, a ISO 2631-1 é referência técnica (fronteira superior da zona de cautela para 8 h: 0,86 m/s², conforme a Nota Técnica ASPEJUDI 001/2013, / VDV 17). Antes de 06/03/1997, o cód. 1.1.5 do Dec. 53.831/64 abrange trepidações e vibrações industriais (perfuratrizes e marteletes pneumáticos, e outros; máquinas a ar comprimido acima de 120 golpes/min), e o cód. 1.1.4 do Dec. 83.080/79, perfuratrizes e marteletes pneumáticos.</p>
      </section>
    </div>
  );
}

// Paradigmas renumerados por código repetido entre aparelhos: mostra o que conferir
function AvisoCodigos() {
  useEffect(() => { resolverCodigosDuplicados().then((r) => { if (r.length) avisarAlteracao(); }).catch(() => {}); }, []);
  const renomeados = useLive(async () => (await db.records.where('kind').equals('paradigma').toArray()).filter((r) => !r.deleted && r.data.codigoAnterior), [], []);
  const refs = useLive(() => referenciasARevisar(), [], []);
  if (!renomeados.length) return null;
  const conferido = async (r) => { await updateFields(r.id, { codigoAnterior: '' }); avisarAlteracao(); };
  return (
    <section class="bloco largo evidencias alerta" role="status">
      <b>Códigos de paradigma repetidos entre aparelhos – conferir</b>
      {renomeados.map((r) => (
        <div class="lixo">
          <span>{rotuloParadigma(r)}: era <b>{r.data.codigoAnterior}</b>, passou a <b>{r.data.codigo}</b>. O código {r.data.codigoAnterior} continua com o outro veículo.</span>
          <button type="button" class="mini" onClick={() => conferido(r)}>Conferido</button>
        </div>
      ))}
      {refs.length > 0 && (
        <small>Registros que citam um código renumerado (confira se se referem ao veículo que manteve o código ou ao renumerado): {refs.map((x) => `${x.ref.kind === 'periodo' ? `vínculo ${x.ref.data.empresa || ''}` : `similar ${x.ref.data.marca || ''} ${x.ref.data.modelo || ''}`} (${x.campo}: ${x.de})`).join('; ')}.</small>
      )}
    </section>
  );
}

// Conferência do banco: o que impede a comparação por família (família, tipo, ano, valores) e família provável
function SaudeBanco({ lista }) {
  const [ver, setVer] = useState(false);
  const [msg, setMsg] = useState('');
  const fams = useLive(async () => (await db.records.where('kind').equals('familia').toArray()).filter((r) => !r.deleted), [], []);
  if (!lista.length) return null;
  const ativos = lista.filter((p) => !/não usar/i.test(p.data.situacao || ''));
  const semFam = ativos.filter((p) => !String(p.data.familia || '').trim());
  const semTipo = ativos.filter((p) => !String(p.data.tipo || '').trim());
  const semAno = ativos.filter((p) => (!String(p.data.ano || '').trim() || /n\/i/i.test(p.data.ano)) && !String(p.data.epocaFabricacao || '').trim());
  const semValor = ativos.filter((p) => !String(p.data.lavg || '').trim() && !String(p.data.arep || p.data.arenLaudo || '').trim());
  const revisar = ativos.filter((p) => p.data.situacao && !/^ok$/i.test(p.data.situacao));
  const propostas = semFam.map((p) => ({ p, f: familiaProvavel({ marca: p.data.marca, modelo: p.data.modelo, ano: p.data.ano, tipo: p.data.tipo }) })).filter((x) => x.f.familia);
  const codigos = new Set(fams.map((f) => String(f.data.codigo || '').toUpperCase()));
  const faltamFam = Object.keys(DESCRICAO_FAMILIAS).filter((k) => !codigos.has(k));
  const aplicar = async () => {
    for (const { p, f } of propostas) await updateFields(p.id, { familia: f.familia, observacoes: [p.data.observacoes, `Família ${f.familia} atribuída pelo app (${f.motivo}).`].filter(Boolean).join('\n') });
    avisarAlteracao(); setMsg(`✓ Família atribuída a ${propostas.length} paradigma(s). Confira cada um (situação continua a mesma).`);
  };
  const criarFamilias = async () => {
    for (const k of faltamFam) await createRecord('familia', null, { codigo: k, descricao: DESCRICAO_FAMILIAS[k] });
    avisarAlteracao(); setMsg(`✓ ${faltamFam.length} família(s) cadastradas.`);
  };
  const n = semFam.length + semTipo.length + semValor.length;
  const nome = (l) => l.slice(0, 12).map((p) => p.data.codigo).join(', ') + (l.length > 12 ? '…' : '');
  return (
    <section class={`bloco largo saude-banco ${n ? 'alerta' : ''}`}>
      <div class="linha-botoes entre"><b>Conferência do banco para a comparação por família</b>
        <button type="button" class="mini" onClick={() => setVer(!ver)}>{ver ? 'Fechar' : 'Ver detalhes'}</button></div>
      <span>{ativos.length} paradigma(s) ativos · {semFam.length} sem família · {semTipo.length} sem tipo · {semAno.length} sem ano · {semValor.length} sem valores · {revisar.length} a revisar</span>
      {ver && <>
        <small>A busca do paradigma compara, nesta ordem de peso: tabela de similares, família técnica, modelo, marca, tipo (rígido, cavalo, ônibus), climatização e época. Paradigma sem família ou sem tipo quase não é encontrado.</small>
        {semFam.length > 0 && <span><b>Sem família:</b> {nome(semFam)}</span>}
        {semTipo.length > 0 && <span><b>Sem tipo:</b> {nome(semTipo)}</span>}
        {semAno.length > 0 && <span><b>Sem ano:</b> {nome(semAno)}</span>}
        {semValor.length > 0 && <span><b>Sem Lavg nem aren:</b> {nome(semValor)}</span>}
        {revisar.length > 0 && <span><b>Situação diferente de OK:</b> {nome(revisar)}</span>}
        {propostas.length > 0 && <>
          <span><b>Família provável (pela marca, modelo e ano):</b></span>
          {propostas.slice(0, 20).map(({ p, f }) => <small>{rotuloParadigma(p)} → <b>{f.familia}</b> ({f.motivo})</small>)}
          <span class="linha-botoes"><button type="button" class="primario mini" onClick={aplicar}>Atribuir as {propostas.length} famílias prováveis</button></span>
        </>}
        {faltamFam.length > 0 && <span class="linha-botoes"><small>Famílias {faltamFam.join(', ')} não estão em Bases técnicas → Veículos → Famílias.</small>
          <button type="button" class="mini" onClick={criarFamilias}>Cadastrar F1–F9 com a descrição</button></span>}
      </>}
      {msg && <p class="ok-msg">{msg}</p>}
    </section>
  );
}

// Relatórios de medição do paradigma (dosimetria, vibração): vão como apêndice nos documentos que o usam.
// Normalmente estão no final do laudo de origem: o app acha as páginas pelo texto do aparelho; o perito confere.
function RelatoriosParadigma({ p }) {
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const d = p.data;
  const id = d.relatoriosAnexoId;
  const anexarLaudo = async (e) => {
    const f = e.currentTarget.files[0];
    e.currentTarget.value = '';
    if (!f) return;
    const novo = await guardarAnexo(f, `Laudo de origem – paradigma ${d.codigo || ''}`.trim());
    await updateFields(p.id, { anexoId: novo, paginasRelatorios: '' });
    avisarAlteracao();
    setMsg(`✓ ${f.name} guardado como laudo de origem.`);
    await detectar(novo);
  };
  const detectar = async (idLaudo = d.anexoId) => {
    setOcupado(true); setMsg('Lendo o laudo…');
    try {
      const { textosDoPdf, paginasDeRelatorio, faixaDePaginas } = await import('../apendices.js');
      const textos = await textosDoPdf(await obterAnexo(idLaudo));
      const pags = paginasDeRelatorio(textos);
      if (!pags.length) {
        setMsg(textos.join('').trim().length < 200
          ? 'O laudo parece digitalizado (sem texto). Informe as páginas dos relatórios no campo acima.'
          : 'Não achei relatórios de medidor no laudo. Informe as páginas no campo acima.');
      } else {
        const faixa = faixaDePaginas(pags);
        await updateFields(p.id, { paginasRelatorios: faixa });
        avisarAlteracao();
        setMsg(`✓ Páginas ${faixa} de ${textos.length}. Confira abrindo o laudo; corrija o campo se precisar.`);
      }
    } catch (e) { setMsg(`Não consegui ler o laudo: ${e.message}`); }
    setOcupado(false);
  };
  const anexar = async (e) => {
    const f = e.currentTarget.files[0];
    e.currentTarget.value = '';
    if (!f) return;
    const novo = await guardarAnexo(f, `Relatórios de medição – paradigma ${d.codigo || ''}`.trim());
    await updateFields(p.id, { relatoriosAnexoId: novo, relatoriosNome: f.name });
    avisarAlteracao();
    setMsg(`✓ ${f.name} anexado. Ele substitui as páginas do laudo de origem no apêndice.`);
  };
  const remover = async () => {
    if (!await confirmar('Tirar o arquivo de relatórios deste paradigma? O arquivo vai para a lixeira.')) return;
    if (id) await softDelete(id);
    await updateFields(p.id, { relatoriosAnexoId: '', relatoriosNome: '' });
    avisarAlteracao(); setMsg('');
  };
  return (
    <div class="campo relatorios-paradigma">
      <span class="rotulo">Relatórios de medição – saem como apêndice nos pareceres e laudos que usam este paradigma</span>
      {d.anexoId ? (
        <>
          <div class="linha-botoes">
            <AbrirAnexo id={d.anexoId} />
            <button type="button" class="mini" disabled={ocupado} onClick={() => detectar()}>Achar páginas dos relatórios</button>
            <label class="botao sec mini">Trocar laudo<input type="file" accept="application/pdf" hidden onChange={anexarLaudo} /></label>
          </div>
          <div class="linha2"><Campos rec={p} campos={[['paginasRelatorios', 'Páginas dos relatórios no laudo de origem (ex.: 45-52, 60)', 'text']]} /></div>
          {!id && <small class="dica">Sem páginas informadas, o app procura os relatórios ao gerar o documento.</small>}
        </>
      ) : (
        <label class="botao sec">＋ Anexar o laudo de origem (PDF)<input type="file" accept="application/pdf" hidden onChange={anexarLaudo} /></label>
      )}
      <details>
        <summary>Relatórios em arquivo separado</summary>
        {id ? (
          <div class="linha-botoes">
            <AbrirAnexo id={id} rotulo={`Abrir ${d.relatoriosNome || 'relatórios'}`} />
            <label class="botao sec mini">Trocar arquivo<input type="file" accept="application/pdf,image/*" hidden onChange={anexar} /></label>
            <button type="button" class="mini perigo" onClick={remover}>Tirar</button>
          </div>
        ) : (
          <label class="botao sec mini">＋ Anexar PDF ou imagens dos relatórios<input type="file" accept="application/pdf,image/*" hidden onChange={anexar} /></label>
        )}
        <small class="dica">Use só se os relatórios não estiverem no laudo de origem. Tendo arquivo separado, ele é usado no lugar das páginas do laudo.</small>
      </details>
      {msg && <small class={msg.startsWith('✓') ? 'ok-msg' : 'dica'}>{msg}</small>}
    </div>
  );
}

function AbrirAnexo({ id, rotulo = 'Abrir laudo de origem' }) {
  const [msg, setMsg] = useState('');
  const abrir = async () => {
    try { const b = await obterAnexo(id); window.open(URL.createObjectURL(b), '_blank'); } catch (e) { setMsg(e.message); }
  };
  return <p><button type="button" class="mini" onClick={abrir}><Icone nome="doc" /> {rotulo}</button> {msg && <span class="erro-msg">{msg}</span>}</p>;
}

function Similares() {
  return (
    <div class="grade"><div class="largo">
      <RecordList kind="similar" caseId={null} titulo="Tabela de similares" novo="Adicionar veículo similar"
        campos={[['marca', 'Marca', 'text'], ['modelo', 'Modelo', 'text'], ['tipo', 'Tipo', 'text'], ['epoca', 'Época de fabricação', 'text'],
          ['familia', 'Família técnica', 'text'], ['paradigmaRuido', 'Paradigma de ruído (código, ex.: M01)', 'text'], ['paradigmaRuidoAlt', 'Paradigma de ruído alternativo', 'text'],
          ['paradigmaVibracao', 'Paradigma de vibração', 'text'], ['status', 'Status', 'select', ['Medido', 'Proposta – validar', 'Validado', 'Não usar']], ['obs', 'Observações', 'area']]}
        resumo={(r) => `${r.data.marca || ''} ${r.data.modelo || ''} · ${r.data.familia || '?'} · ruído ${r.data.paradigmaRuido || '—'} · VCI ${r.data.paradigmaVibracao || '—'} · ${r.data.status || ''}`} />
    </div></div>
  );
}

function Familias() {
  return (
    <div class="grade"><div class="largo">
      <p class="dica">A similaridade considera, nesta ordem: posição do motor, geração e isolamento da cabine, suspensão da cabine e do assento, configuração do veículo e tipo de via predominante.</p>
      <RecordList kind="familia" caseId={null} titulo="Famílias técnicas" novo="Adicionar família"
        campos={[['codigo', 'Código (F1, F2…)', 'text'], ['descricao', 'Descrição', 'text'], ['criterios', 'Critérios que definem a família', 'area']]}
        resumo={(r) => `${r.data.codigo || ''} – ${r.data.descricao || ''}`} />
    </div></div>
  );
}

function Buscar() {
  const [q, setQ] = useState({ marca: '', modelo: '', tipo: '', familia: '' });
  const [res, setRes] = useState(null);
  const buscar = async () => setRes(paraResultadoBusca(await sugerirParaVinculo({ data: { veiculoMarca: q.marca, veiculoModelo: q.modelo, veiculoTipo: q.tipo, familiaVeiculo: q.familia } })));
  const campo = (k, r) => (
    <label class="campo"><span class="rotulo">{r}</span><input value={q[k]} onInput={(e) => setQ({ ...q, [k]: e.currentTarget.value })} /></label>
  );
  return (
    <div class="grade">
      <section class="bloco largo">
        <h3>Veículo do requerente</h3>
        <div class="linha2">{campo('marca', 'Marca')}{campo('modelo', 'Modelo')}{campo('tipo', 'Tipo')}{campo('familia', 'Família (se já souber)')}</div>
        <button type="button" class="primario" onClick={buscar}>Buscar paradigmas</button>
      </section>
      {res && <ResultadoBusca res={res} />}
    </div>
  );
}

export function ResultadoBusca({ res, onEscolher }) {
  const linha = ({ p, papel }, tipo) => (
    <div class="lixo">
      <div><b>{rotuloParadigma(p)}</b> <span class="etq">{papel}</span><br />
        <small class="suave">{tipo === 'ruido' ? `Lavg ${p.data.lavg || '—'} · jornada do laudo ${p.data.jornadaLaudo || '?'} h` : `arep ${p.data.arep || '—'} · VDVR ${p.data.vdvrLaudo || '—'}`} · {p.data.citacao} · {p.data.situacao}</small></div>
      {onEscolher && <button type="button" class="mini" onClick={() => onEscolher(tipo, p)}>Usar</button>}
    </div>
  );
  return (
    <section class="bloco largo">
      <p><b>Critério:</b> {res.criterio || 'nenhuma correspondência'}{res.familia ? ` · família ${res.familia}` : ''}</p>
      {res.similar && res.similar.data.obs && <p class="dica">{res.similar.data.obs}</p>}
      <h4>Ruído</h4>
      {res.ruido.length ? res.ruido.map((x) => linha(x, 'ruido')) : <p class="alerta-txt">[PESQUISAR] Sem paradigma de ruído no banco.</p>}
      <h4>Vibração de corpo inteiro</h4>
      {res.vibracao.length ? res.vibracao.map((x) => linha(x, 'vibracao')) : <p class="alerta-txt">[PESQUISAR] Sem paradigma de vibração no banco.</p>}
    </section>
  );
}

// Anexar os laudos de origem (e relatórios avulsos) de vários paradigmas de uma vez
function LaudosEmLote() {
  const lista = useParadigmas();
  const [itens, setItens] = useState([]); // { file, r, marcados: Set, erro }
  const [estado, setEstado] = useState('');
  const porId = new Map(lista.map((p) => [p.id, p]));
  const ler = async (e) => {
    const files = [...e.currentTarget.files];
    e.currentTarget.value = '';
    if (!files.length) return;
    const { textosDoPdf } = await import('../apendices.js');
    const { casarArquivo } = await import('../laudosLote.js');
    const out = [];
    for (const [i, f] of files.entries()) {
      setEstado(`Lendo ${i + 1} de ${files.length}: ${f.name}`);
      try {
        const textos = /pdf/i.test(f.type || f.name) ? await textosDoPdf(f) : [];
        const r = casarArquivo({ nome: f.name, textos }, lista);
        // já ligado a outro laudo: fica desmarcado (o perito decide se troca)
        const marcados = new Set(r.ids.filter((id) => { const d = porId.get(id)?.data || {}; return r.certo && !(r.tipo === 'laudo' ? d.anexoId : d.relatoriosAnexoId); }));
        out.push({ file: f, r, marcados, semTexto: textos.join('').trim().length < 200 });
      } catch (err) { out.push({ file: f, r: { ids: [] }, marcados: new Set(), erro: err.message }); }
    }
    setItens(out); setEstado('');
  };
  const alternar = (i, id) => setItens(itens.map((x, k) => {
    if (k !== i) return x;
    const m = new Set(x.marcados); if (m.has(id)) m.delete(id); else m.add(id);
    return { ...x, marcados: m };
  }));
  const ligar = async () => {
    let n = 0, arq = 0;
    for (const x of itens) {
      if (!x.marcados.size) continue;
      setEstado(`Guardando ${x.file.name}…`);
      const cods = [...x.marcados].map((id) => porId.get(id)?.data.codigo).filter(Boolean).join(', ');
      const id = await guardarAnexo(x.file, `${x.r.tipo === 'laudo' ? 'Laudo de origem' : 'Relatórios de medição'} – paradigmas ${cods}`);
      arq++;
      for (const pid of x.marcados) {
        await updateFields(pid, x.r.tipo === 'laudo' ? { anexoId: id, paginasRelatorios: x.r.paginas || '' } : { relatoriosAnexoId: id, relatoriosNome: x.file.name });
        n++;
      }
    }
    avisarAlteracao();
    setItens([]); setEstado(`✓ ${arq} arquivo(s) guardado(s) e ligado(s) a ${n} paradigma(s). Os relatórios saem como apêndice nos documentos que usam esses paradigmas.`);
  };
  const semLaudo = lista.filter((p) => !p.data.anexoId && !p.data.relatoriosAnexoId).map((p) => p.data.codigo).filter(Boolean);
  const total = itens.reduce((s, x) => s + x.marcados.size, 0);
  return (
    <section class="bloco largo">
      <h3>Anexar laudos de origem em lote</h3>
      <p>Selecione de uma vez os PDFs dos laudos (e dos relatórios avulsos). O app liga cada arquivo ao paradigma pelo código no nome do arquivo (ex.: <code>M07_M61 - Laudo.pdf</code>), pelo número do processo no cabeçalho do laudo ou pela data da medição com o modelo do veículo, e acha as páginas dos relatórios do medidor.</p>
      <p class="dica">{semLaudo.length ? `Sem laudo nem relatórios anexados: ${semLaudo.join(', ')}.` : 'Todos os paradigmas têm laudo ou relatórios anexados.'}</p>
      <label class="botao-arquivo">Escolher PDFs<input type="file" accept="application/pdf" multiple hidden onChange={ler} /></label>
      {estado && <p class={estado.startsWith('✓') ? 'ok-msg' : 'dica'}>{estado}</p>}
      {!!itens.length && (
        <div class="lote-laudos mt">
          {itens.map((x, i) => (
            <div class="item" key={i}>
              <div class="item-topo">
                <span class="item-titulo"><b>{x.file.name}</b><br />
                  <small class="suave">{x.erro ? `Erro: ${x.erro}` : [
                    x.r.tipo === 'laudo' ? 'laudo de origem' : 'relatórios (arquivo separado)',
                    x.r.paginas && `relatórios nas páginas ${x.r.paginas}`,
                    x.semTexto && 'sem texto (digitalizado): informe as páginas no paradigma',
                    x.r.como && `ligado por ${x.r.como}${x.r.certo ? '' : ' – confira'}`,
                  ].filter(Boolean).join(' · ')}</small>
                </span>
              </div>
              <div class="chips">
                {x.r.ids.map((id) => {
                  const p = porId.get(id); const d = p?.data || {};
                  const ja = x.r.tipo === 'laudo' ? d.anexoId : d.relatoriosAnexoId;
                  return <button type="button" class={`chip ${x.marcados.has(id) ? 'on' : ''}`} onClick={() => alternar(i, id)} title={ja ? 'Já tem arquivo: marcar troca o atual' : ''}>{x.marcados.has(id) ? '✓ ' : ''}{rotuloParadigma(p)}{ja ? ' (já tem)' : ''}</button>;
                })}
                {!x.r.ids.length && !x.erro && <small class="erro-msg">Não achei o paradigma. Renomeie o arquivo com o código (ex.: M20 - …) ou anexe no próprio paradigma.</small>}
              </div>
            </div>
          ))}
          <div class="linha-botoes mt">
            <button type="button" class="primario" disabled={!total} onClick={ligar}>Ligar {total} paradigma(s)</button>
            <button type="button" class="sec" onClick={() => setItens([])}>Cancelar</button>
          </div>
        </div>
      )}
    </section>
  );
}

function Importar() {
  const [msg, setMsg] = useState('');
  const [texto, setTexto] = useState('');
  const [previa, setPrevia] = useState(null);
  const [anexoId, setAnexoId] = useState('');
  const [nomeAnexo, setNomeAnexo] = useState('');
  const [msgBase, setMsgBase] = useState('');
  const total = useLive(async () => {
    const l = await db.records.where('kind').anyOf('paradigma', 'similar').toArray();
    return { v: l.filter((r) => r.kind === 'paradigma' && !r.deleted).length, s: l.filter((r) => r.kind === 'similar' && !r.deleted).length };
  }, [], { v: 0, s: 0 });

  const importarBase = async (e) => {
    const f = e.currentTarget.files[0]; e.currentTarget.value = '';
    if (!f) return;
    setMsgBase('Importando…');
    try {
      // a data do arquivo marca a versão da base: um arquivo corrigido atualiza o que veio da base anterior
      const r = await importarBaseJson(JSON.parse(await f.text()), { versao: tsDaBase(f.lastModified || Date.now()) });
      avisarAlteracao();
      if (r.falhas.length) { setMsgBase(`Erro: ${r.falhas.length} item(ns) não gravados – ${r.falhas.slice(0, 3).join(' | ')}. Mande um print desta mensagem.`); return; }
      setMsgBase(r.veiculos + r.similares + r.familias
        ? `✓ Importação concluída: ${r.veiculos} veículo(s), ${r.similares} similar(es) e ${r.familias} família(s) novos ou atualizados. O que você já editou no app foi mantido.`
        : '✓ Importação concluída: a base já estava atualizada neste aparelho, nada mudou.');
    } catch (err) { setMsgBase('Erro: ' + err.message); }
  };
  const anexar = async (e) => {
    const f = e.currentTarget.files[0]; e.currentTarget.value = '';
    if (!f) return;
    setAnexoId(await guardarAnexo(f, 'Laudo antigo – origem de paradigmas')); setNomeAnexo(f.name); avisarAlteracao();
  };
  const copiar = async () => { try { await navigator.clipboard.writeText(PROMPT_LAUDO_ANTIGO); setMsg('Instrução copiada. Cole no Claude e anexe o PDF do laudo.'); } catch (e) { setMsg('Selecione o texto da instrução abaixo.'); } };
  const ler = () => { try { setPrevia(lerJsonVeiculos(texto)); setMsg(''); } catch (e) { setPrevia(null); setMsg('Erro: ' + e.message); } };
  const aplicar = async () => {
    const cods = await adicionarParadigmas(previa, { anexoId });
    avisarAlteracao();
    setMsg(`✓ ${cods.length} veículo(s) incluídos: ${cods.join(', ')} (situação "Revisar" – confira e ajuste em Veículos medidos).`);
    setPrevia(null); setTexto(''); setAnexoId(''); setNomeAnexo('');
  };
  return (
    <div class="grade">
      <section class="bloco largo">
        <h3>Importar a base (arquivo JSON)</h3>
        <p>Use o arquivo <code>cadastro_veiculos_medidos.json</code>. Pode importar de novo depois de atualizar a planilha: nada é duplicado e o que você editou no app prevalece.</p>
        <p><b>No banco agora:</b> {total.v} veículo(s) medido(s) e {total.s} similar(es). Com a nuvem conectada, basta importar em um aparelho: os outros recebem a base sozinhos.</p>
        <div class="linha-botoes">
          <label class="botao-arquivo">Escolher arquivo JSON<input type="file" accept=".json,application/json,text/plain,*/*" hidden onChange={importarBase} /></label>
          <button type="button" class="sec" onClick={async () => { const j = await exportarBaseJson(); baixarArquivo(new Blob([JSON.stringify(j, null, 1)], { type: 'application/json' }), `cadastro_veiculos_medidos_${carimbo()}.json`); setMsgBase(`✓ Base exportada: ${j.veiculos.length} veículo(s), ${j.similares.length} similar(es) e ${j.familias.length} família(s), com o nome do laudo de origem de cada um.`); }}>Exportar a base (JSON)</button>
        </div>
        {msgBase && <p class={msgBase.startsWith('Erro') ? 'erro-msg' : 'ok-msg'}>{msgBase}</p>}
      </section>
      <LaudosEmLote />
      <section class="bloco largo destaque">
        <h3>Incluir laudos antigos</h3>
        <ol class="passos">
          <li>Anexe o PDF do laudo (fica guardado e vinculado aos veículos incluídos).</li>
          <li>Copie a instrução, cole no Claude e anexe o mesmo PDF.</li>
          <li>Cole aqui a resposta (JSON), confira a prévia e inclua.</li>
        </ol>
        <div class="linha-botoes">
          <label class="botao-arquivo">{nomeAnexo ? <><Icone nome="doc" /> {nomeAnexo}</> : '1. Anexar PDF do laudo'}<input type="file" accept="application/pdf,.pdf" hidden onChange={anexar} /></label>
          <button type="button" class="primario" onClick={copiar}>2. Copiar instrução</button>
        </div>
        <details><summary>Ver a instrução</summary><pre class="prompt">{PROMPT_LAUDO_ANTIGO}</pre></details>
        <label class="campo campo-area"><span class="rotulo">3. Resposta do Claude (JSON)</span>
          <textarea rows={6} value={texto} onInput={(e) => setTexto(e.currentTarget.value)} placeholder='{"veiculos": [...]}' />
        </label>
        <button type="button" onClick={ler} disabled={!texto.trim()}>Ler e mostrar prévia</button>
        {previa && (
          <div class="previa">
            <p><b>{previa.length} veículo(s):</b></p>
            <ul>{previa.map((v) => <li>{(v.identificacao || {}).marca} {(v.identificacao || {}).modelo} {(v.identificacao || {}).ano} – Lavg {(v.resultados || {}).lavg_q5 ?? '—'} · arep {(v.resultados || {}).arep ?? '—'} · {(v.fonte || {}).tipo} {(v.fonte || {}).data}</li>)}</ul>
            <button type="button" class="primario" onClick={aplicar}>Incluir no banco</button>
          </div>
        )}
      </section>
      <section class="bloco largo">
        <h3>Incluir máquinas a partir de artigos, manuais ou laudos</h3>
        <p>Para tratores, colhedoras, máquinas de construção e ferramentas portáteis use esta instrução: ela pede a categoria, a origem do dado, a condição de operação e a referência bibliográfica. Depois cole a resposta no passo 3 acima.</p>
        <div class="linha-botoes">
          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(PROMPT_MAQUINAS); setMsg('Instrução de máquinas copiada. Cole no Claude e anexe o artigo, manual ou laudo.'); } catch (e) { setMsg('Selecione o texto da instrução abaixo.'); } }}>Copiar instrução de máquinas</button>
        </div>
        <details><summary>Ver a instrução</summary><pre class="prompt">{PROMPT_MAQUINAS}</pre></details>
      </section>
      {msg && <p class="ok-msg largo">{msg}</p>}
    </div>
  );
}
