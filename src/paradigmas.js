import { db, mergeIncoming, createRecord, updateFields, newId } from './db.js';
import { normalize, mergeRecords, sameContent } from './merge.js';
import { num as numBR, horasDia, fmtHoras } from './calc.js';
import { familiaDoGrupo, tipoDoGrupo } from './schema.js';
import { familiaProvavel, pontuar, MINIMO_SUGESTAO } from './similaridade.js';

// ======================================================================
// Banco de paradigmas (veículos e máquinas medidos), similares e famílias.
// Formato de importação = o do arquivo cadastro_veiculos_medidos.json.
// Os dados ficam só no aparelho e na nuvem do usuário (nunca no código).
// ======================================================================

export const REGRA_CERT_MESES_PADRAO = 24;

const s = (v) => (v === null || v === undefined || v === 'n/i' ? '' : String(v).trim());
const n = (v) => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','));

export function slug(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Converte um veículo do JSON (formato do cadastro) em dados planos do app
export function veiculoParaDados(v) {
  const i = v.identificacao || {}, c = v.caracteristicas || {}, r = v.resultados || {}, f = v.fonte || {}, ins = v.instrumentacao || {};
  const ir = ins.ruido || {}, ic = ins.calibrador || {}, iv = ins.vibracao || {};
  const mq = v.maquina || {};
  const fonteTipo = s(f.tipo);
  const extra = /extrajudicial/i.test(fonteTipo);
  const literatura = /literatura|fabricante|banco/i.test(`${fonteTipo} ${s(mq.origem)}`);
  const maquina = {};
  if (Object.keys(mq).length) {
    Object.assign(maquina, {
      categoriaMaquina: s(mq.categoria), origemDado: s(mq.origem), operacao: s(mq.operacao), implemento: s(mq.implemento),
      potencia: n(mq.potencia_cv), rotacao: n(mq.rotacao_rpm), velocidade: n(mq.velocidade_kmh), referencia: s(mq.referencia),
    });
  }
  return {
    ...maquina,
    codigo: s(v.id),
    idsAnteriores: [s((v.ids_banco_anterior || {}).ruido), s((v.ids_banco_anterior || {}).vibracao)].filter(Boolean).join(' / '),
    tipo: s(i.tipo), marca: s(i.marca), modelo: s(i.modelo), ano: s(i.ano), anoFonte: s(i.ano_fonte), epocaFabricacao: s(i.epoca_fabricacao),
    familia: s(c.familia), posicaoMotor: s(c.posicao_motor), cabine: s(c.cabine), arCondicionado: s(c.ar_condicionado),
    suspensaoCabine: s(c.suspensao_cabine), suspensaoAssento: s(c.suspensao_assento), configuracao: s(c.configuracao), via: s(c.via_predominante),
    duracaoRuidoMin: n(r.duracao_ruido_min), lavg: n(r.lavg_q5), leq: n(r.leq_q3), jornadaLaudo: n(r.jornada_laudo_h), nenLaudo: n(r.nen_laudo),
    tempoVibracao: s(r.tempo_vibracao), arep: n(r.arep), arenLaudo: n(r.aren_laudo), vdvrLaudo: n(r.vdvr_laudo),
    eixoDominante: s(r.eixo_dominante), arenVmb: n(r.aren_vmb), ibutg: n(r.ibutg),
    fonteTipo,
    processo: extra ? '' : s(f.processo), vara: extra ? '' : s(f.vara), dataMedicao: s(f.data),
    citacao: extra ? `Extrajudicial – ${s(f.data)}` : (literatura && s(mq.referencia)) || s(f.citacao),
    ruidoEquip: s(ir.equipamento), ruidoSerie: s(ir.serie), ruidoCert: s(ir.certificado), ruidoCertData: s(ir.data_certificado),
    calibEquip: s(ic.equipamento), calibSerie: s(ic.serie), calibCertData: s(ic.data_certificado),
    vibEquip: s(iv.equipamento), vibSerie: s(iv.serie), vibCert: s(iv.certificado), vibCertData: s(iv.data_certificado),
    situacao: s(v.situacao) || 'OK', servePara: s(v.serve_de_paradigma_para), observacoes: s(v.observacoes),
    // laudo de origem já guardado no app e as páginas dos relatórios do medidor nele
    ...(s((v.laudo_de_origem || {}).anexo_id) ? { anexoId: s(v.laudo_de_origem.anexo_id) } : {}),
    ...(s((v.laudo_de_origem || {}).paginas_relatorios) ? { paginasRelatorios: s(v.laudo_de_origem.paginas_relatorios) } : {}),
  };
}

// ---------- Exportar a base (mesmo formato da importação) ----------
// Só os paradigmas, similares e famílias (sem casos), com o nome do laudo de origem anexado a cada um.
const nb = (t) => { const x = String(t ?? '').trim(); if (!x) return null; const k = Number(x.replace(',', '.')); return isFinite(k) && /^-?[\d.,]+$/.test(x) ? k : x; };
const tx = (t) => (String(t ?? '').trim() || null);
export function dadosParaVeiculo(d, { anexoNome = '' } = {}) {
  return {
    id: d.codigo, situacao: tx(d.situacao), serve_de_paradigma_para: tx(d.servePara), observacoes: tx(d.observacoes),
    identificacao: { tipo: tx(d.tipo), marca: tx(d.marca), modelo: tx(d.modelo), ano: tx(d.ano), ano_fonte: tx(d.anoFonte), epoca_fabricacao: tx(d.epocaFabricacao) },
    caracteristicas: { familia: tx(d.familia), posicao_motor: tx(d.posicaoMotor), cabine: tx(d.cabine), ar_condicionado: tx(d.arCondicionado),
      suspensao_cabine: tx(d.suspensaoCabine), suspensao_assento: tx(d.suspensaoAssento), configuracao: tx(d.configuracao), via_predominante: tx(d.via) },
    resultados: { duracao_ruido_min: nb(d.duracaoRuidoMin), lavg_q5: nb(d.lavg), leq_q3: nb(d.leq), jornada_laudo_h: nb(d.jornadaLaudo), nen_laudo: nb(d.nenLaudo),
      tempo_vibracao: tx(d.tempoVibracao), arep: nb(d.arep), aren_laudo: nb(d.arenLaudo), vdvr_laudo: nb(d.vdvrLaudo), eixo_dominante: tx(d.eixoDominante), aren_vmb: nb(d.arenVmb), ibutg: nb(d.ibutg) },
    fonte: { tipo: tx(d.fonteTipo), processo: tx(d.processo), vara: tx(d.vara), data: tx(d.dataMedicao), citacao: tx(d.citacao) },
    instrumentacao: {
      ruido: { equipamento: tx(d.ruidoEquip), serie: tx(d.ruidoSerie), certificado: tx(d.ruidoCert), data_certificado: tx(d.ruidoCertData) },
      calibrador: { equipamento: tx(d.calibEquip), serie: tx(d.calibSerie), data_certificado: tx(d.calibCertData) },
      vibracao: { equipamento: tx(d.vibEquip), serie: tx(d.vibSerie), certificado: tx(d.vibCert), data_certificado: tx(d.vibCertData) },
    },
    ...(d.categoriaMaquina ? { maquina: { categoria: tx(d.categoriaMaquina), origem: tx(d.origemDado), operacao: tx(d.operacao), implemento: tx(d.implemento), referencia: tx(d.referencia) } } : {}),
    laudo_de_origem: anexoNome ? { anexo_id: d.anexoId, arquivo: anexoNome, ...(d.paginasRelatorios ? { paginas_relatorios: d.paginasRelatorios } : {}) } : null,
  };
}
export async function exportarBaseJson() {
  const todos = (await db.records.where('kind').anyOf('paradigma', 'similar', 'familia', 'anexo').toArray()).filter((r) => !r.deleted);
  const anexos = new Map(todos.filter((r) => r.kind === 'anexo').map((r) => [r.id, r.data.nome || r.id]));
  const pars = todos.filter((r) => r.kind === 'paradigma').sort((a, b) => String(a.data.codigo).localeCompare(String(b.data.codigo), 'pt', { numeric: true }));
  return {
    formato: 'cadastro_veiculos_medidos', exportado_em: new Date().toISOString(),
    veiculos: pars.map((p) => dadosParaVeiculo(p.data, { anexoNome: p.data.anexoId ? anexos.get(p.data.anexoId) || '' : '' })),
    similares: todos.filter((r) => r.kind === 'similar').map((x) => ({ marca: tx(x.data.marca), modelo: tx(x.data.modelo), tipo: tx(x.data.tipo), epoca: tx(x.data.epoca), familia: tx(x.data.familia),
      paradigma_ruido: tx(x.data.paradigmaRuido), paradigma_ruido_alt: tx(x.data.paradigmaRuidoAlt), paradigma_vibracao: tx(x.data.paradigmaVibracao), status: tx(x.data.status), obs: tx(x.data.obs) })),
    familias: todos.filter((r) => r.kind === 'familia').map((f) => ({ codigo: tx(f.data.codigo), descricao: tx(f.data.descricao), criterios: tx(f.data.criterios) })),
  };
}

export const FAMILIAS_PADRAO_TEXTO = 'Cadastre as famílias técnicas em Bases técnicas → Veículos → Famílias.';

export function registro(id, kind, data, tsVal = 1) {
  const ts = {};
  for (const k of Object.keys(data)) ts[k] = tsVal;
  return normalize({ id, kind, caseId: null, createdAt: Date.now(), data, ts });
}

// Grava um registro importado: só altera (e marca para envio) se algo mudou
export async function gravarImportado(rec) {
  return db.transaction('rw', db.records, async () => {
    const local = await db.records.get(rec.id);
    const m = mergeRecords(local, rec);
    if (local && sameContent(local, m)) return false;
    m.dirty = 1;
    await db.records.put(m);
    return true;
  });
}

// Importa o arquivo de base (JSON). Idempotente: o que você editou no app prevalece.
// Relógio da base = data do arquivo em SEGUNDOS (~1,7e9), sempre menor que o de uma edição no app
// (milissegundos, ~1,7e12): uma base corrigida atualiza os campos vindos da base anterior, mas nunca
// passa por cima do que foi editado no app.
export const tsDaBase = (ms = Date.now()) => Math.floor(Number(ms) / 1000);
export async function importarBaseJson(obj, { versao = 1 } = {}) {
  if (!obj || !Array.isArray(obj.veiculos)) throw new Error('Arquivo sem a lista "veiculos".');
  const familias = new Map();
  const falhas = [];
  const porCodigoExistente = new Map((await db.records.where('kind').equals('paradigma').toArray()).filter((r) => !r.deleted && r.data.codigo).map((r) => [String(r.data.codigo).toUpperCase(), r.id]));
  let nv = 0, ns = 0;
  for (const v of obj.veiculos) {
    const d = veiculoParaDados(v);
    if (!d.codigo) continue;
    const fam = (v.caracteristicas || {}).familia;
    if (fam && !familias.has(fam)) familias.set(fam, s((v.caracteristicas || {}).familia_descricao));
    try {
      // paradigma já existente com o mesmo código (ex.: incluído a partir de laudo, com id próprio): atualiza o mesmo registro
      const id = porCodigoExistente.get(String(d.codigo).toUpperCase()) || `par-${slug(d.codigo)}`;
      if (await gravarImportado(registro(id, 'paradigma', d, versao))) nv++;
    } catch (e) { falhas.push(`${d.codigo}: ${e.message || e}`); }
  }
  const vistosSim = new Set();
  for (const x of obj.similares || []) {
    const d = {
      marca: s(x.marca), modelo: s(x.modelo), tipo: s(x.tipo), epoca: s(x.epoca), familia: s(x.familia),
      paradigmaRuido: s(x.paradigma_ruido), paradigmaRuidoAlt: s(x.paradigma_ruido_alt), paradigmaVibracao: s(x.paradigma_vibracao),
      status: s(x.status), obs: s(x.obs),
    };
    // mesmo modelo em épocas diferentes (ex.: cabine antiga x nova) são registros distintos.
    // Regra determinística (igual em todos os aparelhos): a 1ª ocorrência do modelo no arquivo mantém o id
    // de sempre, sem a época; as seguintes recebem a época no id. Antes, a última sobrescrevia as outras.
    const base = `sim-${slug(`${d.marca} ${d.modelo}`)}`;
    const id = vistosSim.has(base) ? `sim-${slug(`${d.marca} ${d.modelo} ${d.epoca || vistosSim.size}`)}` : base;
    vistosSim.add(base);
    try {
      if (await gravarImportado(registro(id, 'similar', d, versao))) ns++;
    } catch (e) { falhas.push(`${d.marca} ${d.modelo}: ${e.message || e}`); }
  }
  for (const [cod, desc] of familias) {
    const id = `fam-${slug(cod)}`;
    await gravarImportado(registro(id, 'familia', { codigo: cod, descricao: desc }, versao));
  }
  if (obj.regra_alerta_certificado_meses) {
    const id = 'cfg-paradigmas';
    await gravarImportado(registro(id, 'config', { regraCertMeses: String(obj.regra_alerta_certificado_meses) }, versao));
  }
  return { veiculos: nv, similares: ns, familias: familias.size, lidos: obj.veiculos.length, falhas };
}

// Novos paradigmas vindos de laudos antigos (JSON extraído pelo Claude)
export async function proximoCodigo() {
  const lista = await db.records.where('kind').equals('paradigma').toArray();
  const max = lista.reduce((m, r) => Math.max(m, Number(String(r.data.codigo || '').replace(/\D/g, '')) || 0), 0);
  return `M${String(max + 1).padStart(2, '0')}`;
}

export async function adicionarParadigmas(veiculos, { anexoId = '' } = {}) {
  const criados = [];
  for (const v of veiculos) {
    const d = veiculoParaDados({ ...v, id: v.id && !/^M\d+$/.test(v.id) ? v.id : '' });
    d.codigo = await proximoCodigo();
    if (anexoId) d.anexoId = anexoId;
    if (!d.situacao || d.situacao === 'OK') d.situacao = 'Revisar';
    // id aleatório: dois aparelhos sem internet podem gerar o mesmo código "M12", mas nunca o mesmo id
    // (com id derivado do código, a sincronização fundiria dois veículos diferentes num só)
    const id = `par-${newId()}`;
    await gravarImportado(registro(id, 'paradigma', d, Date.now()));
    criados.push(d.codigo);
  }
  return criados;
}

export const LIMITE_NUVEM = 39 * 1024 * 1024; // acima disso o arquivo fica só neste aparelho
export async function guardarAnexo(file, descricao = '', caseId = null) {
  const soLocal = file.size > LIMITE_NUVEM;
  const rec = await createRecord('anexo', caseId, { nome: file.name, tamanho: file.size, mime: file.type || 'application/pdf', descricao, soLocal });
  await db.blobs.put({ id: rec.id, blob: file, uploaded: soLocal ? 2 : 0, mime: file.type || 'application/pdf' });
  return rec.id;
}

// ---------- Códigos duplicados entre aparelhos ----------
// O mais antigo (createdAt) mantém o código; os outros recebem o próximo código livre e guardam o anterior
// em "codigoAnterior", para conferência das referências (vínculos e similares) feitas com o código repetido.
export async function resolverCodigosDuplicados() {
  const todos = await db.records.where('kind').equals('paradigma').toArray();
  const ativos = todos.filter((r) => !r.deleted && String(r.data.codigo || '').trim());
  const grupos = new Map();
  for (const r of ativos) {
    const k = String(r.data.codigo).trim().toUpperCase();
    (grupos.get(k) || grupos.set(k, []).get(k)).push(r);
  }
  let max = todos.reduce((m, r) => Math.max(m, Number(String(r.data.codigo || '').replace(/\D/g, '')) || 0), 0);
  const renomeados = [];
  for (const [cod, lista] of grupos) {
    if (lista.length < 2) continue;
    // ordem determinística: todos os aparelhos escolhem o mesmo "dono" do código
    lista.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)));
    for (const r of lista.slice(1)) {
      max += 1;
      const novo = `M${String(max).padStart(2, '0')}`;
      const obs = [r.data.observacoes, `Código alterado de ${cod} para ${novo}: o mesmo código foi gerado em dois aparelhos sem internet. Confira os vínculos e similares que citam ${cod}.`].filter(Boolean).join('\n');
      await updateFields(r.id, { codigo: novo, codigoAnterior: cod, situacao: 'Revisar', observacoes: obs });
      renomeados.push({ id: r.id, de: cod, para: novo });
    }
  }
  return renomeados;
}

// Vínculos e similares que citam um código que foi renumerado (para o aviso na tela)
export async function referenciasARevisar() {
  const pars = (await db.records.where('kind').equals('paradigma').toArray()).filter((r) => !r.deleted && r.data.codigoAnterior);
  if (!pars.length) return [];
  const antigos = new Map(pars.map((r) => [r.data.codigoAnterior, r]));
  const refs = (await db.records.where('kind').anyOf('periodo', 'similar').toArray()).filter((r) => !r.deleted);
  const out = [];
  for (const r of refs) {
    for (const campo of ['paradigmaRuido', 'paradigmaRuidoAlt', 'paradigmaVibracao']) {
      const p = antigos.get(r.data[campo]);
      if (p) out.push({ ref: r, campo, de: p.data.codigoAnterior, para: p.data.codigo });
    }
  }
  return out;
}

// ---------- Busca por similaridade ----------
export function tokensModelo(t) {
  // ano só quando vem entre parênteses ou depois de "/" ou "ano" (ex.: "(2008)", "2007/2008"); "Axor 2035" é modelo
  const semAno = String(t || '').replace(/\(\s*(?:19|20)\d\d\s*(?:[+–-]\s*(?:(?:19|20)\d\d)?)?\s*\)|\b(?:19|20)\d\d\s*\+|\b(?:19|20)\d\d\s*\/\s*(?:19|20)\d\d\b|\bano\s*(?:19|20)\d\d\b/gi, ' ');
  return norm(semAno).replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2').split(' ')
    .filter((x) => x && !['serie', 'series', 'de', 'e'].includes(x));
}
export function melhorSimilar(sims, marca, modelo) {
  const mt = tokensModelo(modelo);
  if (!mt.length) return null;
  let melhor = null, nota = 0;
  for (const x of sims) {
    if (marca && norm(x.data.marca) !== norm(marca)) continue;
    const tk = new Set(tokensModelo(x.data.modelo));
    const achados = mt.filter((t) => tk.has(t)).length;
    const numeros = mt.filter((t) => /\d/.test(t));
    if (numeros.some((t) => !tk.has(t))) continue; // números do modelo precisam bater
    const sc = achados / mt.length - tk.size * 0.001; // prefere a linha mais específica
    if (achados && sc > nota) { nota = sc; melhor = x; }
  }
  return nota >= 0.5 ? melhor : null;
}

const norm = (t) => slug(t).replace(/-/g, ' ');
export async function sugerirParadigmas({ marca = '', modelo = '', tipo = '', familia = '' }) {
  const [pars, sims] = await Promise.all([
    db.records.where('kind').equals('paradigma').toArray(),
    db.records.where('kind').equals('similar').toArray(),
  ]);
  const ativos = pars.filter((p) => !p.deleted);
  const porCodigo = new Map(ativos.map((p) => [p.data.codigo, p]));
  const resultado = { similar: null, ruido: [], vibracao: [], familia: familia || '', criterio: '' };

  // 1) tabela de similares (marca igual; tokens do modelo – "R440" = "R 440"; ano opcional)
  const sim = melhorSimilar(sims.filter((x) => !x.deleted), marca, modelo);
  if (sim) {
    resultado.similar = sim;
    resultado.familia = sim.data.familia || resultado.familia;
    resultado.criterio = `Tabela de similares (${sim.data.status || 'sem status'})`;
    for (const [campo, papel] of [['paradigmaRuido', 'principal'], ['paradigmaRuidoAlt', 'alternativo']]) {
      const p = porCodigo.get(sim.data[campo]);
      if (p) resultado.ruido.push({ p, papel });
    }
    const pv = porCodigo.get(sim.data.paradigmaVibracao);
    if (pv) resultado.vibracao.push({ p: pv, papel: 'principal' });
  }
  // 2) mesma família técnica (situação OK primeiro, depois a mais recente)
  if (resultado.familia) {
    const fam = ativos.filter((p) => p.data.familia === resultado.familia);
    const ordem = (p) => (/não usar/i.test(p.data.situacao) ? 3 : /^ok$/i.test(p.data.situacao) ? 0 : 1);
    fam.sort((a, b) => ordem(a) - ordem(b) || ((dataBRparaDate(b.data.dataMedicao) || 0) - (dataBRparaDate(a.data.dataMedicao) || 0)));
    for (const p of fam) {
      if (/não usar/i.test(p.data.situacao)) continue;
      if (p.data.lavg && !resultado.ruido.some((x) => x.p.id === p.id)) resultado.ruido.push({ p, papel: 'mesma família' });
      if ((p.data.arep || p.data.arenLaudo) && !resultado.vibracao.some((x) => x.p.id === p.id)) resultado.vibracao.push({ p, papel: 'mesma família' });
    }
    if (!resultado.criterio) resultado.criterio = `Mesma família técnica (${resultado.familia})`;
  }
  // 3) mesmo tipo de veículo
  if (!resultado.ruido.length && tipo) {
    for (const p of ativos.filter((x) => norm(x.data.tipo).includes(norm(tipo)) && !/não usar/i.test(x.data.situacao))) {
      if (p.data.lavg) resultado.ruido.push({ p, papel: 'mesmo tipo' });
      if (p.data.arep || p.data.arenLaudo) resultado.vibracao.push({ p, papel: 'mesmo tipo' });
    }
    if (resultado.ruido.length) resultado.criterio = 'Mesmo tipo de veículo (sem família definida) – validar';
  }
  return resultado;
}

// ---------- Promover medição de um caso a paradigma ----------
export async function promoverMedicao(caso, medicao, equipamento) {
  const c = caso.data, m = medicao.data;
  const extra = c.tipoAtuacao === 'Extrajudicial';
  const [marca, ...resto] = String(m.veiculo || '').split(' ');
  const d = {
    codigo: await proximoCodigo(), tipo: '', marca: marca || '', modelo: resto.join(' '), ano: '',
    via: m.condicaoVia || '', fonteTipo: extra ? 'Extrajudicial' : 'Judicial',
    processo: extra ? '' : (c.numero || ''), vara: extra ? '' : (c.juizo || ''), dataMedicao: (m.dataMedicao || c.vistoriaData || '').split('-').reverse().join('/'),
    situacao: 'Revisar', origemCaso: caso.id,
  };
  d.citacao = extra ? `Extrajudicial – ${d.dataMedicao}` : [d.processo && `Proc. ${d.processo}`, d.vara, d.dataMedicao].filter(Boolean).join(' – ');
  if (m.agente === 'Ruído') Object.assign(d, { lavg: m.lavg || '', duracaoRuidoMin: m.tempoAmostragem || '', jornadaLaudo: m.jornada || '' });
  if (/corpo inteiro/.test(m.agente || '')) Object.assign(d, { arep: m.aren || '', arenLaudo: m.aren || '', vdvrLaudo: m.vdv || '', eixoDominante: m.eixo || '' });
  if (equipamento) {
    const e = equipamento.data;
    if (m.agente === 'Ruído') Object.assign(d, { ruidoEquip: `${e.nome} ${e.fabricante} ${e.modelo}`.trim(), ruidoSerie: e.serie, ruidoCert: e.certificado, ruidoCertData: (e.dataCalibracao || '').split('-').reverse().join('/') });
    else Object.assign(d, { vibEquip: `${e.nome} ${e.fabricante} ${e.modelo}`.trim(), vibSerie: e.serie, vibCert: e.certificado, vibCertData: (e.dataCalibracao || '').split('-').reverse().join('/') });
  }
  const rec = await createRecord('paradigma', null, d);
  await updateFields(medicao.id, { paradigmaId: rec.id });
  return rec;
}

// ---------- Cálculos (Manual de Aposentadoria Especial do INSS; NHO-09) ----------
export const num = (t) => numBR(String(t ?? '').replace(/[^\d.,-]/g, ''));
export function nenParaJornada(lavg, T) { return num(lavg) + 16.61 * Math.log10(num(T) / 8); }
export function arenParaJornada(arep, T) { return num(arep) * Math.sqrt(num(T) / 8); }
export function vdvrParaJornada(vdvr, T, Tlaudo) { return num(vdvr) * Math.pow(num(T) / num(Tlaudo), 0.25); }
// Vibração do paradigma normalizada para T (h/dia), usada na conclusão e na memória de cálculo.
// arep = aceleração do período amostrado → A(T) = arep·√(T/8); sem arep, o aren do laudo já está
// normalizado para a jornada do laudo de origem: A(T) = aren·√(T/Tlaudo).
export function vibracaoDoParadigma(pv, T) {
  const d = pv?.data || pv || {};
  const tLaudo = num(d.jornadaVibracaoLaudo) || num(d.jornadaLaudo) || 8;
  const temArep = String(d.arep || '').trim() !== '';
  const base = temArep ? num(d.arep) : num(d.arenLaudo);
  if (!isFinite(T)) return { aren: NaN, vdv: NaN, base, temArep, tLaudo };
  const aren = temArep ? arenParaJornada(d.arep, T) : arenParaJornada(d.arenLaudo, T * 8 / tLaudo);
  return { aren, vdv: vdvrParaJornada(d.vdvrLaudo, T, tLaudo), base, temArep, tLaudo };
}

export function dataBRparaDate(br) {
  const m = String(br || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}
export function certificadoVencido(dataCert, dataMedicao, meses = REGRA_CERT_MESES_PADRAO) {
  const c = dataBRparaDate(dataCert), m = dataBRparaDate(dataMedicao);
  if (!c || !m) return false;
  const lim = new Date(c); lim.setMonth(lim.getMonth() + Number(meses || 24));
  return m > lim;
}

// citação do paradigma; sem ela (ex.: paradigma incluído a partir de laudo), monta com processo, vara e data
export function citacaoDe(p) {
  const d = p.data || p;
  const c = String(d.citacao || '').trim();
  if (c) return c;
  if (/extrajudicial/i.test(d.fonteTipo || '')) return d.dataMedicao ? `Extrajudicial – ${d.dataMedicao}` : '';
  const proc = String(d.processo || '').trim().replace(/\/[A-Z]{2}$/, '');
  return [proc && `Proc. ${proc}`, String(d.vara || '').replace(/\s*\(.*\)\s*$/, '').trim(), d.dataMedicao].filter(Boolean).join(' – ');
}

export function rotuloParadigma(p) {
  const d = p.data || p;
  return [d.codigo, [d.marca, d.modelo].filter(Boolean).join(' '), d.ano && d.ano !== 'n/i' ? `(${d.ano})` : ''].filter(Boolean).join(' – ').replace(' – (', ' (');
}

// ---------- Instrução para o Claude extrair dados de laudos antigos ----------
export const PROMPT_LAUDO_ANTIGO = `Vou incluir no meu banco de paradigmas as medições de veículos e máquinas (caminhões, ônibus, vans, tratores) contidas no(s) laudo(s) anexado(s), elaborados por mim em outras épocas.

REGRAS
1. Extraia SOMENTE o que está no laudo. Não invente. Campo sem informação = null.
2. Um item por veículo/máquina medido. Se o laudo mediu ruído e vibração no mesmo veículo, é um item só.
3. Laudo EXTRAJUDICIAL: NÃO inclua o nome do segurado nem o processo; em "fonte" use tipo "Extrajudicial" e apenas a data da medição.
4. Laudo JUDICIAL: inclua o número do processo e a vara, sem nomes das partes.
5. Família técnica (use a que melhor se aplica): F1 Rígidos com motor dianteiro (bicudo) – MB série L/LK; F2 Ônibus com motor dianteiro; F3 Leves / VUC / vans; F4 Rígidos médios e pesados com cabine avançada; F5 Cavalos com cabine convencional ou semiavançada, projeto antigo; F6 Cavalos com cabine avançada, 1990–2008; F7 Volvo NH / FH; F8 Cavalos modernos pós-2010; F9 Ônibus com motor traseiro ou central. Se nenhuma servir, deixe null e explique em "observacoes".
6. Números com ponto decimal. Datas no formato DD/MM/AAAA.
7. Responda SOMENTE com um bloco JSON válido, sem texto antes ou depois, neste formato:

{"veiculos": [{
  "identificacao": {"tipo": "Toco | Truck | Cavalo | Bitrem | Ônibus | Van | Trator | Outro", "marca": "", "modelo": "", "ano": ""},
  "caracteristicas": {"familia": "F1", "posicao_motor": "", "cabine": "", "ar_condicionado": "", "suspensao_cabine": "", "suspensao_assento": "", "configuracao": "", "via_predominante": ""},
  "resultados": {"duracao_ruido_min": null, "lavg_q5": null, "leq_q3": null, "jornada_laudo_h": null, "nen_laudo": null, "tempo_vibracao": "", "arep": null, "aren_laudo": null, "vdvr_laudo": null, "eixo_dominante": "", "aren_vmb": null, "ibutg": null},
  "fonte": {"tipo": "Judicial | Judicial trabalhista | Extrajudicial", "processo": "", "vara": "", "data": "DD/MM/AAAA"},
  "instrumentacao": {
    "ruido": {"equipamento": "", "serie": "", "certificado": "", "data_certificado": ""},
    "calibrador": {"equipamento": "", "serie": "", "data_certificado": ""},
    "vibracao": {"equipamento": "", "serie": "", "certificado": "", "data_certificado": ""}
  },
  "observacoes": "página do laudo de onde saíram os valores e qualquer ressalva"
}]}`;

export function lerJsonVeiculos(texto) {
  let t = String(texto || '').trim();
  const bloco = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (bloco) t = bloco[1];
  const ini = t.indexOf('{'), fim = t.lastIndexOf('}');
  if (ini < 0 || fim < ini) throw new Error('Não encontrei um JSON no texto colado.');
  const obj = JSON.parse(t.slice(ini, fim + 1));
  const lista = Array.isArray(obj) ? obj : obj.veiculos;
  if (!Array.isArray(lista) || !lista.length) throw new Error('O JSON não traz a lista "veiculos".');
  return lista;
}


// ---------- Paradigma por vínculo (motorista) ----------
// Busca automática para um vínculo: marca/modelo (tabela de similares), família (do vínculo ou do grupo do veículo)
// e tipo. Devolve o melhor candidato de ruído e de vibração (fora os "NÃO USAR") e o critério usado.
export async function sugerirParaVinculo(r) {
  const x = r.data || r;
  // família: a digitada no vínculo; senão, a provável pelo veículo (marca, modelo, ano) ou pelo grupo da entrevista
  const prov = familiaProvavel({ marca: x.veiculoMarca, modelo: x.veiculoModelo, ano: x.veiculoAno || x.inicio, grupo: x.grupoVeiculo, tipo: x.veiculoTipo });
  const familia = String(x.familiaVeiculo || '').trim() || prov.familia || familiaDoGrupo(x.grupoVeiculo);
  const origemFamilia = String(x.familiaVeiculo || '').trim() ? 'informada no vínculo' : prov.familia ? prov.motivo : familia ? 'grupo do veículo' : '';
  const [pars, sims] = await Promise.all([db.records.where('kind').equals('paradigma').toArray(), db.records.where('kind').equals('similar').toArray()]);
  const ativos = pars.filter((p) => !p.deleted && !/não usar/i.test(p.data.situacao || ''));
  const sim = melhorSimilar(sims.filter((y) => !y.deleted), x.veiculoMarca || '', x.veiculoModelo || '');
  const daTabela = new Set(sim ? [sim.data.paradigmaRuido, sim.data.paradigmaRuidoAlt, sim.data.paradigmaVibracao].filter(Boolean) : []);
  const veic = { familia, marca: x.veiculoMarca, modelo: x.veiculoModelo, ano: x.veiculoAno || String(x.inicio || '').slice(0, 4), tipo: x.veiculoTipo || tipoDoGrupo(x.grupoVeiculo), grupo: x.grupoVeiculo, cabine: x.cabine };
  const ranking = ativos.map((p) => ({ p, ...pontuar(veic, p, { similar: daTabela.has(p.data.codigo) }) }))
    .filter((c) => c.pontos >= MINIMO_SUGESTAO).sort((a, b) => b.pontos - a.pontos);
  const ruidos = ranking.filter((c) => String(c.p.data.lavg || '').trim());
  const vibs = ranking.filter((c) => String(c.p.data.arep || c.p.data.arenLaudo || '').trim());
  const desc = (c) => (c ? `${c.motivos.join(', ')}` : '');
  const ruido = ruidos[0] ? { p: ruidos[0].p, papel: desc(ruidos[0]) } : null;
  const vibracao = vibs[0] ? { p: vibs[0].p, papel: desc(vibs[0]) } : null;
  const criterio = ruido || vibracao ? `${desc(ruidos[0] || vibs[0])}${familia ? `; família do veículo ${familia} (${origemFamilia})` : ''}` : '';
  return { ruido, vibracao, criterio, familia, origemFamilia, ranking: { ruido: ruidos.slice(0, 3), vibracao: vibs.slice(0, 3) } };
}

// formato da lista "Buscar paradigma" (ResultadoBusca) a partir da comparação por pontos
export function paraResultadoBusca(s) {
  const l = (arr) => arr.map((c) => ({ p: c.p, papel: `${c.pontos} pts – ${c.motivos.join(', ')}` }));
  return { similar: null, ruido: l(s.ranking.ruido), vibracao: l(s.ranking.vibracao), familia: s.familia,
    criterio: s.familia ? `Família do veículo ${s.familia} (${s.origemFamilia}); comparação por pontos` : 'Família não identificada – informe a família ou o grupo do veículo' };
}

// Ficha para pesquisar o paradigma nos documentos do signatário quando o banco não tem
const br = (iso) => String(iso || '').replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$3/$2/$1');
export function fichaPesquisa(r, familiaSugerida = '') {
  const x = r.data || r;
  const veic = [x.veiculoTipo, x.veiculoMarca, x.veiculoModelo, x.veiculoAno].map((t) => String(t || '').trim()).filter(Boolean).join(' ');
  return [
    ['Vínculo', `${x.empresa || ''} (${br(x.inicio) || '?'} a ${br(x.fim) || 'atual'})`],
    ['Veículo', veic || 'não informado'],
    ['Grupo', x.grupoVeiculo || 'não informado'],
    ['Família técnica sugerida', familiaSugerida || 'definir pelo modelo (motor dianteiro x cabine avançada)'],
    ['Cabine / conforto', x.cabine || ''], ['Carroceria / reboque', x.carroceria || ''], ['Carga', x.tipoCarga || ''],
    ['Tempo diário de condução', x.conducaoH ? (isFinite(horasDia(x.conducaoH)) ? fmtHoras(horasDia(x.conducaoH)) : `${x.conducaoH} (informe um número)`) : 'informar'],
  ].filter(([, t]) => String(t).trim());
}
export const fichaPesquisaTexto = (r, fam) => fichaPesquisa(r, fam).map(([k, t]) => `${k}: ${t}`).join('; ');
