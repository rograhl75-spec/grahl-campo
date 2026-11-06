import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { db, getMeta, setMeta, requestPersistentStorage, mergeIncoming } from './db.js';
import { normalize } from './merge.js';
import { EQUIPAMENTOS_INICIAIS } from './schema.js';
import { iniciarSync } from './sync.js';
import { PERFIL_ID, PERFIL_PADRAO } from './docx/base.js';
import { walRecuperar } from './wal.js';
import { App } from './ui/App.jsx';
import './styles.css';

async function semearEquipamentos() {
  if (await getMeta('equipSemeados')) return;
  // IDs fixos e horário "antigo": em outro aparelho não duplica e não
  // sobrescreve dados que você já tenha corrigido.
  const ids = ['equip-dosemax', 'equip-itemp', 'equip-axpro', 'equip-calpro'];
  for (let i = 0; i < EQUIPAMENTOS_INICIAIS.length; i++) {
    const data = EQUIPAMENTOS_INICIAIS[i];
    const ts = Object.fromEntries(Object.keys(data).map((k) => [k, 1]));
    await mergeIncoming(normalize({ id: ids[i], kind: 'equip', caseId: null, createdAt: Date.now(), data, ts }));
  }
  await setMeta('equipSemeados', true);
}

// Atualiza dados de fábrica (CalPro, perfil) sem sobrescrever o que você editou:
// os valores entram com horário "antigo" e qualquer edição sua prevalece.
async function atualizarDadosPadrao() {
  if ((await getMeta('dadosPadraoV')) >= 2) return;
  const calpro = EQUIPAMENTOS_INICIAIS[3];
  await mergeIncoming(normalize({ id: 'equip-calpro', kind: 'equip', caseId: null, createdAt: Date.now(), data: calpro,
    ts: Object.fromEntries(Object.keys(calpro).map((k) => [k, 2])) }), { markDirtyIfLocalNewer: true });
  await mergeIncoming(normalize({ id: PERFIL_ID, kind: 'perfil', caseId: null, createdAt: Date.now(), data: PERFIL_PADRAO,
    ts: Object.fromEntries(Object.keys(PERFIL_PADRAO).map((k) => [k, 2])) }), { markDirtyIfLocalNewer: true });
  await setMeta('dadosPadraoV', 2);
}

async function iniciar() {
  try {
    await db.open();
  } catch (e) {
    document.body.innerHTML = `<p style="padding:2rem;font:18px sans-serif">Não foi possível abrir o banco de dados do aparelho: ${e.message}</p>`;
    return;
  }
  await semearEquipamentos();
  await atualizarDadosPadrao();
  const recuperados = await walRecuperar();
  if (recuperados) console.info(`${recuperados} campo(s) recuperados do registro de segurança.`);
  requestPersistentStorage();
  render(<App />, document.getElementById('app'));
  iniciarSync();
  registerSW({ immediate: true });
}

iniciar();
