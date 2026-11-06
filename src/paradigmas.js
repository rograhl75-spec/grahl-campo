import { db, mergeIncoming, createRecord, updateFields } from './db.js';
import { normalize, mergeRecords, sameContent } from './merge.js';

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
  const fonteTipo = s(f.tipo);
  const extra = /extrajudicial/i.test(fonteTipo);
  return {
    codigo: s(v.id),
    idsAnteriores: [s((v.ids_banco_anterior || {}).ruido), s((v.ids_banco_anterior || {}).vibracao)].filter(Boolean).join(' / '),
    tipo: s(i.tipo), marca: s(i.marca), modelo: s(i.modelo), ano: s(i.ano),
    familia: s(c.familia), posicaoMotor: s(c.posicao_motor), cabine: s(c.cabine), arCondicionado: s(c.ar_condicionado),
    suspensaoCabine: s(c.suspensao_cabine), suspensaoAssento: s(c.suspensao_assento), configuracao: s(c.configuracao), via: s(c.via_predominante),
    duracaoRuidoMin: n(r.duracao_ruido_min), lavg: n(r.lavg_q5), leq: n(r.leq_q3), jornadaLaudo: n(r.jornada_laudo_h), nenLaudo: n(r.nen_laudo),
    tempoVibracao: s(r.tempo_vibracao), arep: n(r.arep), arenLaudo: n(r.aren_laudo), vdvrLaudo: n(r.vdvr_laudo),
    eixoDominante: s(r.eixo_dominante), arenVmb: n(r.aren_vmb), ibutg: n(r.ibutg),
    fonteTipo,
    processo: extra ? '' : s(f.processo), vara: extra ? '' : s(f.vara), dataMedicao: s(f.data),
    citacao: extra ? `Extrajudicial – ${s(f.data)}` : s(f.citacao),
    ruidoEquip: s(ir.equipamento), ruidoSerie: s(ir.serie), ruidoCert: s(ir.certificado), ruidoCertData: s(ir.data_certificado),
    calibEquip: s(ic.equipamento), calibSerie: s(ic.serie), calibCertData: s(ic.data_certificado),
    vibEquip: s(iv.equipamento), vibSerie: s(iv.serie), vibCert: s(iv.certificado), vibCertData: s(iv.data_certificado),
    situacao: s(v.situacao) || 'OK', servePara: s(v.serve_de_paradigma_para), observacoes: s(v.observacoes),
  };
}

export const FAMILIAS_PADRAO_TEXTO = 'Cadastre as famílias técnicas em Paradigmas → Famílias.';

function registro(id, kind, data, tsVal = 1) {
  const ts = {};
  for (const k of Object.keys(data)) ts[k] = tsVal;
  return normalize({ id, kind, caseId: null, createdAt: Date.now(), data, ts });
}

// Grava um registro importado: só altera (e marca para envio) se algo mudou
async function gravarImportado(rec) {
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
export async function importarBaseJson(obj) {
  if (!obj || !Array.isArray(obj.veiculos)) throw new Error('Arquivo sem a lista "veiculos".');
  const familias = new Map();
  const falhas = [];
  let nv = 0, ns = 0;
  for (const v of obj.veiculos) {
    const d = veiculoParaDados(v);
    if (!d.codigo) continue;
    const fam = (v.caracteristicas || {}).familia;
    if (fam && !familias.has(fam)) familias.set(fam, s((v.caracteristicas || {}).familia_descricao));
    try {
      if (await gravarImportado(registro(`par-${slug(d.codigo)}`, 'paradigma', d))) nv++;
    } catch (e) { falhas.push(`${d.codigo}: ${e.message || e}`); }
  }
  for (const x of obj.similares || []) {
    const d = {
      marca: s(x.marca), modelo: s(x.modelo), tipo: s(x.tipo), epoca: s(x.epoca), familia: s(x.familia),
      paradigmaRuido: s(x.paradigma_ruido), paradigmaRuidoAlt: s(x.paradigma_ruido_alt), paradigmaVibracao: s(x.paradigma_vibracao),
      status: s(x.status), obs: s(x.obs),
    };
    const id = `sim-${slug(`${d.marca} ${d.modelo}`)}`;
    try {
      if (await gravarImportado(registro(id, 'similar', d))) ns++;
    } catch (e) { falhas.push(`${d.marca} ${d.modelo}: ${e.message || e}`); }
  }
  for (const [cod, desc] of familias) {
    const id = `fam-${slug(cod)}`;
    await gravarImportado(registro(id, 'familia', { codigo: cod, descricao: desc }));
  }
  if (obj.regra_alerta_certificado_meses) {
    const id = 'cfg-paradigmas';
    await gravarImportado(registro(id, 'config', { regraCertMeses: String(obj.regra_alerta_certificado_meses) }));
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
    const id = `par-${slug(d.codigo)}`;
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

// ---------- Busca por similaridade ----------
export function tokensModelo(t) {
  return norm(t).replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2').split(' ')
    .filter((x) => x && !/^(19|20)\d\d$/.test(x) && !['serie', 'series', 'de', 'e'].includes(x));
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
    fam.sort((a, b) => ordem(a) - ordem(b) || String(b.data.dataMedicao).localeCompare(String(a.data.dataMedicao)));
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
export const num = (t) => { const x = Number(String(t ?? '').replace(',', '.').replace(/[^\d.-]/g, '')); return String(t ?? '').trim() === '' ? NaN : x; };
export function nenParaJornada(lavg, T) { return num(lavg) + 16.61 * Math.log10(num(T) / 8); }
export function arenParaJornada(arep, T) { return num(arep) * Math.sqrt(num(T) / 8); }
export function vdvrParaJornada(vdvr, T, Tlaudo) { return num(vdvr) * Math.pow(num(T) / num(Tlaudo), 0.25); }

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
5. Família técnica (use a que melhor se aplica): F1 Rígidos com motor dianteiro (bicudo) – MB série L/LK; F2 Ônibus com motor dianteiro; F3 Leves / VUC / vans; F4 Rígidos médios e pesados com cabine avançada; F5 Cavalos com cabine convencional ou semiavançada, projeto antigo; F6 Cavalos com cabine avançada, 1990–2008; F7 Volvo NH / FH; F8 Cavalos modernos pós-2010. Se nenhuma servir, deixe null e explique em "observacoes".
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
