import { useEffect, useState } from 'preact/hooks';
import { db, getMeta, setMeta, restore } from '../db.js';
import { onSyncState, parseConfig, iniciarSync, entrar, sair, sincronizarAgora, avisarAlteracao } from '../sync.js';
import { exportarBackup, importarBackup, baixarArquivo, carimbo } from '../backup.js';
import { migrarDoFirebase, migrarDeZip } from '../migrate.js';
import { CAMPOS_EQUIP, CAMPOS_PERFIL, tituloCaso } from '../schema.js';
import { listarSugestoes, aplicarSugestoes } from '../organizar.js';
import { PERFIL_ID } from '../docx/base.js';
import { Campos } from './fields.jsx';
import { dataBR } from '../docx/reports.js';
import { RecordList } from './RecordList.jsx';
import { useLive } from './hooks.js';

const ABAS = [['meus-dados', 'Meus dados'], ['nuvem', 'Nuvem'], ['backup', 'Backup'], ['antigo', 'App antigo'], ['equipamentos', 'Equipamentos'], ['lixeira', 'Lixeira'], ['aparelho', 'Este aparelho']];

// Validade da calibração: a data informada em "Próxima calibração" ou, na falta dela, 12 meses (prática dos laboratórios RBC)
export function situacaoCalibracao(d) {
  if (!d.dataCalibracao && !d.proximaCalibracao) return '';
  let lim = d.proximaCalibracao;
  if (!lim) { const x = new Date(`${d.dataCalibracao}T12:00:00`); x.setMonth(x.getMonth() + 12); lim = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
  const h = new Date(); const hoje = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
  return lim < hoje ? `⚠ calibração vencida desde ${dataBR(lim)}` : '';
}

function AlertaCalibracao() {
  const lista = useLive(async () => (await db.records.where('kind').equals('equip').toArray()).filter((r) => !r.deleted), [], []);
  const venc = lista.map((r) => [r, situacaoCalibracao(r.data)]).filter(([, x]) => x);
  if (!venc.length) return null;
  return (
    <div class="evidencias alerta" role="status">
      <b>Calibração a conferir antes da próxima medição:</b>
      {venc.map(([r, x]) => <span>{r.data.nome} {r.data.modelo} – {x.replace('⚠ ', '')}</span>)}
      <small>Sem "Próxima calibração" preenchida, o app considera 12 meses a partir da data do certificado. Atualize o certificado ou informe a validade.</small>
    </div>
  );
}

export function Config({ aba }) {
  return (
    <div class="pagina">
      <nav class="abas">{ABAS.map(([k, r]) => <a href={`#/config/${k}`} class={aba === k ? 'ativo' : ''}>{r}</a>)}</nav>
      {aba === 'meus-dados' && <MeusDados />}
      {aba === 'nuvem' && <Nuvem />}
      {aba === 'backup' && <Backup />}
      {aba === 'antigo' && <Antigo />}
      {aba === 'equipamentos' && (
        <div class="grade"><div class="largo">
          <AlertaCalibracao />
          <RecordList kind="equip" caseId={null} campos={CAMPOS_EQUIP} titulo="Equipamentos e certificados" novo="Adicionar equipamento"
            resumo={(r) => [r.data.nome, r.data.modelo, r.data.serie && `série ${r.data.serie}`, r.data.dataCalibracao && `cal. ${dataBR(r.data.dataCalibracao)}`, situacaoCalibracao(r.data)].filter(Boolean).join(' · ')} />
        </div></div>
      )}
      {aba === 'lixeira' && <Lixeira />}
      {aba === 'aparelho' && <Aparelho />}
    </div>
  );
}

function useSync() {
  const [s, setS] = useState({});
  useEffect(() => onSyncState(setS), []);
  return s;
}

function Nuvem() {
  const s = useSync();
  const [texto, setTexto] = useState('');
  const [msg, setMsg] = useState('');
  const salvarConfig = async () => {
    try {
      const cfg = parseConfig(texto);
      await setMeta('firebaseConfig', cfg);
      setMsg('Configuração salva. Agora toque em "Entrar com Google".');
      await iniciarSync();
    } catch (e) { setMsg('Erro: ' + e.message); }
  };
  const remover = async () => {
    if (!confirm('Desligar a nuvem neste aparelho? Os dados continuam no aparelho e na nuvem.')) return;
    await sair().catch(() => {});
    await setMeta('firebaseConfig', null);
    location.reload();
  };
  return (
    <div class="grade">
      <section class="bloco largo">
        <h3>Sincronização</h3>
        {!s.configured && <p>A nuvem ainda não foi configurada neste aparelho. Tudo continua sendo gravado aqui.</p>}
        {s.configured && !s.user && (
          <div class="linha-botoes">
            <button type="button" class="primario" onClick={() => entrar().catch((e) => setMsg(e.message))}>Entrar com Google</button>
          </div>
        )}
        {s.user && (
          <>
            <p>Conectado como <b>{s.user.email}</b>.</p>
            <p>Pendentes de envio: <b>{s.pending}</b> registro(s), <b>{s.fotosPendentes}</b> foto(s). {s.lastSync && <>Última sincronização: {new Date(s.lastSync).toLocaleString('pt-BR')}.</>}</p>
            {s.error && <p class="erro-msg">{s.error}</p>}
            <div class="linha-botoes">
              <button type="button" class="primario" onClick={sincronizarAgora}>Sincronizar agora</button>
              <button type="button" class="sec" onClick={() => sair()}>Sair</button>
            </div>
          </>
        )}
        {s.error && !s.user && <p class="erro-msg">{s.error}</p>}
      </section>
      {!s.configured && (
        <section class="bloco largo">
          <h3>Configurar Firebase</h3>
          <p>Cole aqui o bloco <code>firebaseConfig</code> do Console do Firebase (Configurações do projeto → Seus apps → app da Web). O passo a passo está no arquivo LEIA-ME do projeto.</p>
          <label class="campo campo-area"><span class="rotulo">firebaseConfig</span>
            <textarea rows={8} value={texto} onInput={(e) => setTexto(e.currentTarget.value)} placeholder={'{\n  apiKey: "...",\n  authDomain: "...",\n  projectId: "...",\n  storageBucket: "...",\n  appId: "..."\n}'} />
          </label>
          <button type="button" class="primario" onClick={salvarConfig} disabled={!texto.trim()}>Salvar configuração</button>
        </section>
      )}
      {msg && <p class="ok-msg largo">{msg}</p>}
    </div>
  );
}

function Backup() {
  const ultimo = useLive(() => getMeta('ultimoBackup'), [], null);
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const exportar = async () => {
    setOcupado(true); setMsg('');
    try {
      const r = await exportarBackup();
      baixarArquivo(r.blob, `GRAHL_Campo_backup_${carimbo()}.zip`);
      setMsg(`✓ Backup gerado: ${r.total} registros, ${r.fotos - r.semArquivo} fotos.${r.anexos ? ` ${r.anexos - r.anexosSemArquivo} anexo(s) PDF.` : ''}${r.semArquivo ? ` ${r.semArquivo} foto(s) ainda não baixadas neste aparelho.` : ''}${r.anexosSemArquivo ? ` ${r.anexosSemArquivo} anexo(s) não puderam ser baixados (sem internet?).` : ''}${r.anexosSoLocal ? ` Atenção: ${r.anexosSoLocal} anexo(s) grandes existem só neste aparelho – guarde este ZIP fora dele.` : ''}`);
    } catch (e) { setMsg('Erro: ' + e.message); } finally { setOcupado(false); }
  };
  const importar = async (e) => {
    const f = e.currentTarget.files[0];
    e.currentTarget.value = '';
    if (!f) return;
    setOcupado(true); setMsg('Restaurando…');
    try {
      const r = await importarBackup(f);
      avisarAlteracao();
      setMsg(`✓ Restaurado: ${r.novos} novo(s), ${r.atualizados} mesclado(s), ${r.fotos} foto(s), ${r.anexos} anexo(s). Nada foi apagado.`);
    } catch (err) { setMsg('Erro: ' + err.message); } finally { setOcupado(false); }
  };
  const dias = ultimo ? Math.floor((Date.now() - ultimo) / 86400000) : null;
  return (
    <div class="grade">
      <section class="bloco largo">
        <h3>Backup completo</h3>
        <p>Gera um ZIP com todos os casos, itens, histórico de alterações e fotos — inclusive o que está na lixeira. Guarde no Google Drive ou no PC.</p>
        <p>{ultimo ? <>Último backup neste aparelho: <b>{new Date(ultimo).toLocaleString('pt-BR')}</b>{dias >= 7 && <span class="alerta-txt"> (há {dias} dias)</span>}</> : <span class="alerta-txt">Nenhum backup feito neste aparelho ainda.</span>}</p>
        <button type="button" class="primario" disabled={ocupado} onClick={exportar}>Gerar backup agora</button>
      </section>
      <section class="bloco largo">
        <h3>Restaurar backup</h3>
        <p>Mescla o conteúdo do ZIP com o que já existe. Não apaga nada: em cada campo prevalece a versão mais recente.</p>
        <label class="botao-arquivo">Escolher arquivo ZIP<input type="file" accept=".zip,application/zip" hidden onChange={importar} /></label>
      </section>
      {msg && <p class="ok-msg largo">{msg}</p>}
    </div>
  );
}

function Antigo() {
  const s = useSync();
  const [log, setLog] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const add = (l) => setLog((x) => [...x, l]);
  const rodar = async (fn) => {
    setOcupado(true); setLog([]);
    try {
      const r = await fn(add);
      avisarAlteracao();
      add(`Concluído: ${r.casos} caso(s), ${r.fotos} foto(s) importadas${r.falhasFotos ? `, ${r.falhasFotos} foto(s) não lidas` : ''}. Nada foi alterado no app antigo.`);
    } catch (e) { add('ERRO: ' + e.message); } finally { setOcupado(false); }
  };
  return (
    <div class="grade">
      <section class="bloco largo">
        <h3>Trazer os casos do app antigo</h3>
        <p>Copia todos os casos, quesitos, EPIs, textos de campo e fotos do app antigo. O app antigo <b>não é alterado</b>. Pode ser repetido: o que você já editou aqui não é sobrescrito.</p>
        <h4>Opção 1 – direto do Firebase</h4>
        <p class="dica">Requer estar conectado (aba Nuvem) com o mesmo projeto Firebase do app antigo e as regras de leitura descritas no LEIA-ME.</p>
        <button type="button" class="primario" disabled={ocupado || !s.user} onClick={() => rodar(migrarDoFirebase)}>Importar do Firebase</button>
        <h4>Opção 2 – arquivo ZIP</h4>
        <p class="dica">Gerado pelo script <code>tools/exportar_app_antigo.py</code> (também serve como backup do app antigo).</p>
        <label class="botao-arquivo">Importar ZIP do app antigo<input type="file" accept=".zip" hidden disabled={ocupado}
          onChange={(e) => { const f = e.currentTarget.files[0]; e.currentTarget.value = ''; if (f) rodar((l) => migrarDeZip(f, l)); }} /></label>
      </section>
      {log.length > 0 && <section class="bloco largo"><pre class="log">{log.join('\n')}</pre></section>}
      <OrganizarNomes />
    </div>
  );
}

const NOMES_KIND = { paradigma: 'Paradigma', similar: 'Similar', familia: 'Família', anexo: 'Anexo', caso: 'Caso', quesito: 'Quesito', periodo: 'Período', documento: 'Documento', epi: 'EPI', posto: 'Posto', medicao: 'Medição', foto: 'Foto', equip: 'Equipamento' };

function Lixeira() {
  const itens = useLive(async () => {
    const del = await db.records.where('deleted').equals(1).toArray();
    const casos = new Map((await db.records.where('kind').equals('caso').toArray()).map((c) => [c.id, c]));
    return del.sort((a, b) => b.updatedAt - a.updatedAt).map((r) => ({ r, caso: r.caseId ? casos.get(r.caseId) : null }));
  }, [], []);
  const resumo = (r) => {
    const d = r.data;
    if (r.kind === 'caso') return tituloCaso(d);
    return (r.kind === 'paradigma' ? `${d.codigo} ${d.marca} ${d.modelo}` : '') || d.nome || d.descricao || d.legenda || d.texto || d.empresa || d.tipo || d.agente || '';
  };
  return (
    <div class="grade"><section class="bloco largo">
      <h3>Lixeira</h3>
      <p class="dica">Nada é apagado definitivamente pelo app. Itens excluídos ficam aqui e podem ser restaurados.</p>
      {!itens.length && <p class="vazio">Lixeira vazia.</p>}
      {itens.map(({ r, caso }) => (
        <div class="lixo">
          <div><b>{NOMES_KIND[r.kind] || r.kind}</b>: {String(resumo(r)).slice(0, 90)}
            {caso && <small> — caso: {tituloCaso(caso.data)}</small>}
            <br /><small>excluído em {new Date(r.updatedAt).toLocaleString('pt-BR')}</small></div>
          <button type="button" onClick={async () => { await restore(r.id); avisarAlteracao(); }}>Restaurar</button>
        </div>
      ))}
    </section></div>
  );
}

function Aparelho() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    (async () => {
      const persist = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
      const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : {};
      const n = await db.records.count();
      const f = await db.blobs.count();
      setInfo({ persist, uso: est.usage, cota: est.quota, n, f });
    })();
  }, []);
  const mb = (b) => (b ? (b / 1048576).toFixed(0) + ' MB' : '?');
  return (
    <div class="grade"><section class="bloco largo">
      <h3>Armazenamento deste aparelho</h3>
      {info && (
        <ul>
          <li>Armazenamento protegido contra limpeza automática: <b>{info.persist ? 'sim' : info.persist === false ? 'não' : 'desconhecido'}</b>
            {!info.persist && <small> (instale o app na tela inicial; o Chrome passa a proteger os dados)</small>}</li>
          <li>Registros: <b>{info.n}</b> · Fotos guardadas: <b>{info.f}</b></li>
          <li>Espaço usado: <b>{mb(info.uso)}</b> de {mb(info.cota)} disponíveis</li>
        </ul>
      )}
      <p class="dica">Versão {__APP_VERSION__}. Não limpe os "dados do site" no Chrome sem antes conferir que está tudo sincronizado ou com backup.</p>
    </section></div>
  );
}

function MeusDados() {
  const rec = useLive(() => db.records.get(PERFIL_ID), [], null);
  if (!rec) return <p class="vazio">Carregando…</p>;
  return (
    <div class="grade"><section class="bloco largo">
      <h3>Meus dados (saem nos documentos)</h3>
      <p class="dica">Usados na qualificação das petições, na capa e na assinatura dos laudos. CPF, RG e dados bancários ficam só no seu aparelho e na sua nuvem.</p>
      <div class="linha2"><Campos rec={rec} campos={CAMPOS_PERFIL} /></div>
    </section></div>
  );
}

function OrganizarNomes() {
  const [lista, setLista] = useState(null);
  const [msg, setMsg] = useState('');
  const verificar = async () => { setMsg(''); setLista(await listarSugestoes()); };
  const aplicar = async () => {
    const n = await aplicarSugestoes(lista);
    avisarAlteracao();
    setMsg(`✓ ${n} caso(s) organizados. O texto original foi guardado em Observações (aba Preparação) de cada caso.`);
    setLista(null);
  };
  return (
    <section class="bloco largo">
      <h3>Organizar nomes dos casos importados</h3>
      <p>Separa o CPF, o CNPJ e as partes adicionais que vieram juntos no campo de nome (ex.: "Fulano, CPF 000…") e os coloca nos campos próprios. Você vê a sugestão antes de aplicar.</p>
      <button type="button" onClick={verificar}>Verificar casos</button>
      {lista && !lista.length && <p class="vazio">Nenhum caso precisa de ajuste.</p>}
      {lista && lista.length > 0 && (
        <>
          <table class="legado"><tbody>
            {lista.map((s) => (
              <tr><td>
                {Object.entries(s.mud).filter(([k]) => k !== 'observacoes').map(([k, val]) => (
                  <div><b>{k}</b>: <s>{String(s.antes[k] || '—').slice(0, 120)}</s> → {val}</div>
                ))}
                {s.mud.observacoes && <div class="dica">Vai para Observações: {s.mud.observacoes.split('\n').slice(-2).join(' · ').slice(0, 200)}</div>}
              </td></tr>
            ))}
          </tbody></table>
          <div class="linha-botoes"><button type="button" class="primario" onClick={aplicar}>Aplicar a {lista.length} caso(s)</button></div>
        </>
      )}
      {msg && <p class="ok-msg">{msg}</p>}
    </section>
  );
}
