import { useEffect, useState } from 'preact/hooks';
import { db, getMeta, setMeta, restore } from '../db.js';
import { onSyncState, parseConfig, iniciarSync, entrar, sair, sincronizarAgora, avisarAlteracao } from '../sync.js';
import { exportarBackup, importarBackup, baixarArquivo, carimbo } from '../backup.js';
import { migrarDoFirebase, migrarDeZip } from '../migrate.js';
import { CAMPOS_EQUIP, tituloCaso } from '../schema.js';
import { dataBR } from '../docx/reports.js';
import { RecordList } from './RecordList.jsx';
import { useLive } from './hooks.js';

const ABAS = [['nuvem', 'Nuvem'], ['backup', 'Backup'], ['antigo', 'App antigo'], ['equipamentos', 'Equipamentos'], ['lixeira', 'Lixeira'], ['aparelho', 'Este aparelho']];

export function Config({ aba }) {
  return (
    <div class="pagina">
      <nav class="abas">{ABAS.map(([k, r]) => <a href={`#/config/${k}`} class={aba === k ? 'ativo' : ''}>{r}</a>)}</nav>
      {aba === 'nuvem' && <Nuvem />}
      {aba === 'backup' && <Backup />}
      {aba === 'antigo' && <Antigo />}
      {aba === 'equipamentos' && (
        <div class="grade"><div class="largo">
          <RecordList kind="equip" caseId={null} campos={CAMPOS_EQUIP} titulo="Equipamentos e certificados" novo="Adicionar equipamento"
            resumo={(r) => [r.data.nome, r.data.modelo, r.data.serie && `série ${r.data.serie}`, r.data.dataCalibracao && `cal. ${dataBR(r.data.dataCalibracao)}`].filter(Boolean).join(' · ')} />
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
      setMsg(`✓ Backup gerado: ${r.total} registros, ${r.fotos - r.semArquivo} fotos.${r.semArquivo ? ` ${r.semArquivo} foto(s) ainda não baixadas neste aparelho.` : ''}`);
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
      setMsg(`✓ Restaurado: ${r.novos} novo(s), ${r.atualizados} mesclado(s), ${r.fotos} foto(s). Nada foi apagado.`);
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
    </div>
  );
}

const NOMES_KIND = { caso: 'Caso', quesito: 'Quesito', periodo: 'Período', documento: 'Documento', epi: 'EPI', posto: 'Posto', medicao: 'Medição', foto: 'Foto', equip: 'Equipamento' };

function Lixeira() {
  const itens = useLive(async () => {
    const del = await db.records.where('deleted').equals(1).toArray();
    const casos = new Map((await db.records.where('kind').equals('caso').toArray()).map((c) => [c.id, c]));
    return del.sort((a, b) => b.updatedAt - a.updatedAt).map((r) => ({ r, caso: r.caseId ? casos.get(r.caseId) : null }));
  }, [], []);
  const resumo = (r) => {
    const d = r.data;
    if (r.kind === 'caso') return tituloCaso(d);
    return d.nome || d.descricao || d.legenda || d.texto || d.empresa || d.tipo || d.agente || '';
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
