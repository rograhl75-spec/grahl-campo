import { useEffect, useState } from 'preact/hooks';
import { db, getMeta, setMeta, restore } from '../db.js';
import { onSyncState, parseConfig, iniciarSync, entrar, sair, sincronizarAgora, avisarAlteracao } from '../sync.js';
import { exportarBackup, importarBackup, baixarArquivo, carimbo } from '../backup.js';
import { migrarDoFirebase, migrarDeZip } from '../migrate.js';
import { CAMPOS_EQUIP, CAMPOS_PERFIL, CAMPOS_ART, tituloCaso } from '../schema.js';
import { listarSugestoes, aplicarSugestoes } from '../organizar.js';
import { PERFIL_ID, credencial, registrosCrq } from '../docx/base.js';
import { Icone } from './Icone.jsx';
import { Campos } from './fields.jsx';
import { dataBR } from '../docx/reports.js';
import { RecordList } from './RecordList.jsx';
import { useLive } from './hooks.js';
import { confirmar } from './dialogo.jsx';
import { guardarAnexo } from '../paradigmas.js';
import { obterAnexo } from '../sync.js';
import { updateFields, softDelete } from '../db.js';
import { configClaude, salvarConfigClaude, testarClaude, MODELOS_CLAUDE, ESFORCOS, OPCOES_CACHE } from '../claudeApi.js';

const ABAS = [['meus-dados', 'Meus dados'], ['claude', 'Claude (API)'], ['nuvem', 'Nuvem'], ['backup', 'Backup'], ['antigo', 'App antigo'], ['equipamentos', 'Equipamentos'], ['arts', 'ARTs'], ['lixeira', 'Lixeira'], ['aparelho', 'Este aparelho']];

// Validade da calibração: a data informada em "Próxima calibração" ou, na falta dela, 12 meses (prática dos laboratórios RBC)
export function situacaoCalibracao(d) {
  if (!d.dataCalibracao && !d.proximaCalibracao) return '';
  let lim = d.proximaCalibracao;
  if (!lim) { const x = new Date(`${d.dataCalibracao}T12:00:00`); x.setMonth(x.getMonth() + 12); lim = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
  const h = new Date(); const hoje = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
  return lim < hoje ? `⚠ calibração vencida desde ${dataBR(lim)}` : '';
}

// PDF do certificado de calibração: sai como apêndice em todo laudo que usar o equipamento
function CertificadoDoEquip({ r }) {
  const [msg, setMsg] = useState('');
  const reg = useLive(async () => (r.data.certificadoAnexoId ? db.records.get(r.data.certificadoAnexoId) : null), [r.data.certificadoAnexoId], null);
  const anexar = async (e) => {
    const f = e.currentTarget.files[0]; e.currentTarget.value = '';
    if (!f) return;
    if (r.data.certificadoAnexoId) await softDelete(r.data.certificadoAnexoId);
    const id = await guardarAnexo(f, 'certificado de calibração', null);
    await updateFields(r.id, { certificadoAnexoId: id }); avisarAlteracao();
    setMsg('✓ Certificado anexado: sai como apêndice nos laudos que usarem este equipamento.');
  };
  const abrir = async () => { try { window.open(URL.createObjectURL(await obterAnexo(r.data.certificadoAnexoId)), '_blank'); } catch (err) { setMsg(err.message); } };
  return (
    <div class="campo">
      <span class="rotulo">Certificado de calibração (PDF) – sai como apêndice nos laudos que usarem o equipamento</span>
      <div class="linha-botoes">
        {reg && !reg.deleted && <><span>{reg.data.nome}</span><button type="button" class="mini" onClick={abrir}>Abrir</button></>}
        <label class="botao-arquivo mini">{reg && !reg.deleted ? 'Trocar o PDF' : '＋ Anexar o certificado (PDF)'}<input type="file" accept="application/pdf,.pdf,image/*" hidden onChange={anexar} /></label>
      </div>
      {msg && <small class="ok-msg">{msg}</small>}
    </div>
  );
}

// PDF guardado num registro de configuração (ART etc.)
function ArquivoDoRegistro({ r, campo, desc, rotulo, ok }) {
  const [msg, setMsg] = useState('');
  const reg = useLive(async () => (r.data[campo] ? db.records.get(r.data[campo]) : null), [r.data[campo]], null);
  const anexar = async (e) => {
    const f = e.currentTarget.files[0]; e.currentTarget.value = '';
    if (!f) return;
    if (r.data[campo]) await softDelete(r.data[campo]);
    const id = await guardarAnexo(f, desc, null);
    await updateFields(r.id, { [campo]: id }); avisarAlteracao();
    setMsg(ok);
  };
  const abrir = async () => { try { window.open(URL.createObjectURL(await obterAnexo(r.data[campo])), '_blank'); } catch (err) { setMsg(err.message); } };
  return (
    <div class="campo">
      <span class="rotulo">{rotulo}</span>
      <div class="linha-botoes">
        {reg && !reg.deleted && <><span>{reg.data.nome}</span><button type="button" class="mini" onClick={abrir}>Abrir</button></>}
        <label class="botao-arquivo mini">{reg && !reg.deleted ? 'Trocar o PDF' : '＋ Anexar o PDF'}<input type="file" accept="application/pdf,.pdf,image/*" hidden onChange={anexar} /></label>
      </div>
      {msg && <small class="ok-msg">{msg}</small>}
    </div>
  );
}

function AlertaCalibracao() {
  const lista = useLive(async () => (await db.records.where('kind').equals('equip').toArray()).filter((r) => !r.deleted), [], []);
  const venc = lista.map((r) => [r, situacaoCalibracao(r.data)]).filter(([, x]) => x);
  if (!venc.length) return null;
  return (
    <div class="evidencias alerta" role="status">
      <b>Calibração a conferir antes da próxima medição:</b>
      {venc.map(([r, x]) => <span>{r.data.nome} {r.data.modelo} – {x.replace('⚠ ', '')}</span>)}
      <small>Sem "Próxima calibração" preenchida, o app considera 12 meses (recomendação do fabricante) a partir da data do certificado. Nos laudos, a calibração é aceita até 24 meses (critério do signatário); acima disso, o documento marca para verificar.</small>
    </div>
  );
}

export function Config({ aba }) {
  return (
    <div class="pagina">
      <nav class="abas">{ABAS.map(([k, r]) => <a href={`#/config/${k}`} class={aba === k ? 'ativo' : ''}>{r}</a>)}</nav>
      {aba === 'meus-dados' && <MeusDados />}
      {aba === 'claude' && <ClaudeApi />}
      {aba === 'nuvem' && <Nuvem />}
      {aba === 'backup' && <Backup />}
      {aba === 'antigo' && <Antigo />}
      {aba === 'equipamentos' && (
        <div class="grade"><div class="largo">
          <AlertaCalibracao />
          <RecordList kind="equip" caseId={null} campos={CAMPOS_EQUIP} titulo="Equipamentos e certificados" novo="Adicionar equipamento"
            resumo={(r) => [r.data.nome, r.data.modelo, r.data.serie && `série ${r.data.serie}`, r.data.dataCalibracao && `cal. ${dataBR(r.data.dataCalibracao)}`, r.data.certificadoAnexoId ? 'certificado anexado' : 'sem PDF do certificado', situacaoCalibracao(r.data)].filter(Boolean).join(' · ')}
            extra={(r) => <CertificadoDoEquip r={r} />} />
        </div></div>
      )}
      {aba === 'arts' && (
        <div class="grade"><div class="largo">
          <p class="dica">Cadastre aqui as suas ARTs (uma por finalidade: perícias judiciais, LTCAT, laudos extrajudiciais…), com o PDF. Em cada caso, escolha a ART em Laudo → Redigir e gerar → "ART deste documento": o número sai no documento e o PDF, como anexo.</p>
          <RecordList kind="artCad" caseId={null} campos={CAMPOS_ART} titulo="ARTs" novo="Adicionar ART"
            resumo={(r) => [r.data.numero && `nº ${r.data.numero}`, r.data.finalidade, r.data.conselho, r.data.fim ? `até ${dataBR(r.data.fim)}` : '', r.data.anexoId ? 'PDF anexado' : 'sem PDF'].filter(Boolean).join(' · ')}
            extra={(r) => <ArquivoDoRegistro r={r} campo="anexoId" desc="ART" rotulo="PDF da ART – sai como anexo nos documentos dos casos que a escolherem" ok="✓ PDF anexado." />} />
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
    if (!await confirmar('Desligar a nuvem neste aparelho? Os dados continuam no aparelho e na nuvem.')) return;
    await sair().catch(() => {});
    await setMeta('nuvemDesligada', true);
    location.reload();
  };
  const religar = async () => { await setMeta('nuvemDesligada', false); location.reload(); };
  return (
    <div class="grade">
      <section class="bloco largo">
        <h3>Sincronização</h3>
        {!s.configured && !s.desligada && <p>A nuvem ainda não foi configurada neste aparelho. Tudo continua sendo gravado aqui.</p>}
        {s.desligada && (
          <>
            <p>A nuvem está <b>desligada neste aparelho</b>. Tudo continua sendo gravado aqui; nada é enviado nem recebido.</p>
            <div class="linha-botoes"><button type="button" class="primario" onClick={religar}>Religar a nuvem</button></div>
          </>
        )}
        {s.configured && !s.user && (
          <div class="linha-botoes">
            <button type="button" class="primario" onClick={() => entrar().catch((e) => setMsg(e.message))}>Entrar com Google</button>
          </div>
        )}
        {s.user && (
          <>
            <p>Conectado como <b>{s.user.email}</b>.</p>
            <p>Pendentes de envio: <b>{s.pending}</b> registro(s), <b>{s.fotosPendentes}</b> foto(s) ou anexo(s){s.fotosComFalha ? <>, <b class="erro-msg">{s.fotosComFalha} com falha</b></> : null}. {s.lastSync && <>Última sincronização: {new Date(s.lastSync).toLocaleString('pt-BR')}.</>}</p>
            {s.error && <p class="erro-msg">{s.error}</p>}
            <div class="linha-botoes">
              <button type="button" class="primario" onClick={sincronizarAgora}>Sincronizar agora</button>
              <button type="button" class="sec" onClick={() => sair()}>Sair</button>
              <button type="button" class="sec" onClick={remover}>Desligar a nuvem neste aparelho</button>
            </div>
          </>
        )}
        {s.error && !s.user && <p class="erro-msg">{s.error}</p>}
      </section>
      {!s.configured && !s.desligada && (
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

// Meus dados: cartão de visita (como sai nos documentos) e os dados em cartões por assunto
const GRUPOS_PERFIL = [
  { id: 'prof', icone: 'pessoa', titulo: 'Identificação profissional', dica: 'Sai na capa, na qualificação das petições e na assinatura.', campos: ['nome', 'titulos', 'crea', 'vistoCrea', 'crqSp', 'crqPr', 'nit', 'curriculoUrl'] },
  { id: 'contato', icone: 'contato', titulo: 'Contato e local da assinatura', dica: 'Endereço profissional, telefone e e-mail saem na qualificação completa.', campos: ['endereco', 'telefone', 'email', 'cidade'] },
  { id: 'pessoal', icone: 'cadeado', titulo: 'Documentos pessoais', dica: 'Só na petição de indicação e no aceite do encargo. Ficam neste aparelho e na sua nuvem.', campos: ['cpf', 'rg'] },
  { id: 'docs', icone: 'ajuste', titulo: 'Preferências dos documentos', dica: 'Padrão para os casos novos; cada caso pode mudar.', campos: ['jurisprudenciaPadrao', 'penosidadeTextoSim', 'penosidadeTextoNao'] },
];
const campoPerfil = (k) => CAMPOS_PERFIL.find(([x]) => x === k);

function MeusDados() {
  const rec = useLive(() => db.records.get(PERFIL_ID), [], null);
  const [verContas, setVerContas] = useState(false);
  if (!rec) return <p class="vazio">Carregando…</p>;
  const p = rec.data || {};
  const iniciais = String(p.nome || 'G').split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  const faltam = ['nome', 'titulos', 'crea', 'cidade'].filter((k) => !String(p[k] || '').trim()).map((k) => campoPerfil(k)[1].split(' (')[0]);
  const resumoConta = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2).join(' · ').replace(/\d(?=\d{3})/g, '•');
  return (
    <div class="meus-dados">
      <section class="cartao-visita">
        <div class="cv-monograma" aria-hidden="true">{iniciais}</div>
        <div class="cv-texto">
          <span class="cv-rotulo">Como você aparece nos documentos</span>
          <b class="cv-nome">{p.nome || 'Seu nome'}</b>
          <span class="cv-formacao">{p.titulos || 'Formação'}</span>
          <span class="cv-registro">{credencial(p) || 'Registro profissional'}</span>
          {registrosCrq(p) && <span class="cv-registro">{registrosCrq(p)}</span>}
          <span class="cv-contato">{[p.cidade, p.telefone, p.email].filter(Boolean).join('  ·  ')}</span>
        </div>
        {faltam.length > 0 && <small class="cv-falta">Falta preencher: {faltam.join(', ')}.</small>}
      </section>

      <div class="md-grade">
        {GRUPOS_PERFIL.map((g) => (
          <section class={`bloco md-cartao md-${g.id}`} key={g.id}>
            <h3 class="md-titulo"><Icone nome={g.icone} /> {g.titulo}</h3>
            <p class="dica">{g.dica}</p>
            <Campos rec={rec} campos={g.campos.map(campoPerfil)} />
          </section>
        ))}

        <section class="bloco md-cartao md-contas">
          <div class="linha-botoes entre">
            <h3 class="md-titulo"><Icone nome="banco" /> Contas para honorários</h3>
            <button type="button" class="mini" onClick={() => setVerContas(!verContas)}><Icone nome="olho" tam={15} /> {verContas ? 'Ocultar' : 'Mostrar e editar'}</button>
          </div>
          <p class="dica">Escolhidas a cada petição de honorários ou de levantamento. Ficam ocultas na tela.</p>
          <div class="md-contas-grade">
            {[1, 2].map((i) => (
              <div class="md-conta" key={i}>
                {verContas ? (
                  <Campos rec={rec} campos={[campoPerfil(`conta${i}Rotulo`), campoPerfil(`conta${i}`)]} />
                ) : (
                  <>
                    <b>{p[`conta${i}Rotulo`] || `Conta ${i}`}</b>
                    <small>{p[`conta${i}`] ? resumoConta(p[`conta${i}`]) : 'não cadastrada'}</small>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
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

// Chave de API e modelo do Claude: ficam só neste aparelho (não vão para a nuvem do app)
function ClaudeApi() {
  const [cfg, setCfg] = useState(configClaude());
  const [ver, setVer] = useState(false);
  const [msg, setMsg] = useState('');
  const [testando, setTestando] = useState(false);
  const muda = (k, val) => { const novo = { ...cfg, [k]: val }; setCfg(novo); salvarConfigClaude({ [k]: val }); setMsg(''); };
  const testar = async () => {
    setTestando(true); setMsg('');
    try { const r = await testarClaude(); setMsg(`✓ Conexão funcionando (${r.modelo}). Custo do teste: menos de US$ 0,01.`); }
    catch (e) { setMsg(`✗ ${e.message}`); } finally { setTestando(false); }
  };
  return (
    <div class="grade">
      <section class="bloco largo">
        <h3>Claude direto pelo app (API)</h3>
        <p>Com a chave configurada, os botões <b>Enviar direto ao Claude</b> aparecem em todas as etapas que hoje pedem para copiar a instrução e colar no claude.ai: o app manda a instrução e os PDFs dos autos e recebe a resposta sozinho.</p>
        <ol class="passos">
          <li>Crie a conta em <a href="https://platform.claude.com" target="_blank" rel="noopener">platform.claude.com</a> (é separada da assinatura do claude.ai e cobra por uso).</li>
          <li>Em <b>Billing</b>, adicione créditos e, em <b>Limits</b>, defina um limite de gasto mensal.</li>
          <li>Em <b>API Keys</b>, crie uma chave (por exemplo, "app GRAHL") e cole abaixo.</li>
          <li>Toque em <b>Testar conexão</b>.</li>
        </ol>
        <label class="campo"><span class="rotulo">Chave de API (começa com sk-ant-)</span>
          <input type={ver ? 'text' : 'password'} value={cfg.chave} autocomplete="off" onInput={(e) => muda('chave', e.currentTarget.value.trim())} placeholder="sk-ant-..." />
        </label>
        <div class="linha-botoes">
          <button type="button" class="sec mini" onClick={() => setVer(!ver)}>{ver ? 'Ocultar' : 'Mostrar'}</button>
          {cfg.chave && <button type="button" class="sec mini perigo" onClick={async () => { if (await confirmar('Apagar a chave deste aparelho?')) muda('chave', ''); }}>Apagar chave</button>}
        </div>
        <label class="campo"><span class="rotulo">Modelo</span>
          <select value={cfg.modelo} onChange={(e) => muda('modelo', e.currentTarget.value)}>
            {MODELOS_CLAUDE.map((m) => <option value={m.id}>{m.nome} – US$ {m.entrada} / {m.saida} por milhão de tokens</option>)}
          </select>
        </label>
        <label class="campo"><span class="rotulo">Esforço de raciocínio</span>
          <select value={cfg.esforco} onChange={(e) => muda('esforco', e.currentTarget.value)}>
            {ESFORCOS.map(([v, r]) => <option value={v}>{r}</option>)}
          </select>
        </label>
        <label class="campo"><span class="rotulo">Reaproveitamento dos autos (cache)</span>
          <select value={cfg.cache} onChange={(e) => muda('cache', e.currentTarget.value)}>
            {OPCOES_CACHE.map(([v, r]) => <option value={v}>{r}</option>)}
          </select>
        </label>
        <p class="dica">Com o reaproveitamento, dentro do prazo escolhido cada novo envio do mesmo caso (extração, quesitos, redação, revisão de campo…) paga só 10% da leitura dos autos. O primeiro envio custa um pouco mais na parte dos autos (1,25 vez com 5 minutos; 2 vezes com 1 hora). Vale a pena quando você usa duas ou mais etapas seguidas no mesmo caso.</p>
        <div class="linha-botoes"><button type="button" class="primario" disabled={!cfg.chave || testando} onClick={testar}>{testando ? 'Testando…' : 'Testar conexão'}</button></div>
        {msg && <p class={msg.startsWith('✓') ? 'ok-msg' : 'erro-msg'}>{msg}</p>}
        <p class="dica">A chave fica guardada só neste aparelho (não vai para a nuvem do app nem para o backup): configure em cada aparelho que for usar. Os arquivos vão dentro da própria pergunta e não ficam guardados na conta da Anthropic. PDFs de até ~22 MB e 550 páginas vão inteiros (texto e imagens); acima disso vai o texto extraído, e páginas digitalizadas sem texto ficam de fora (o app avisa). Custo aproximado com o Opus 5.5: LTCAT com cerca de 50 páginas de documentos, US$ 0,30 a 0,60; autos com cerca de 300 páginas, US$ 2 a 4. Cada envio mostra o custo estimado.</p>
      </section>
    </div>
  );
}
