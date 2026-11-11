import { db, caseChildren } from '../db.js';
import { resumoMedicao, calculados } from '../medicoes.js';
import { nen, num, fmt, fatorQ, doseJornada } from '../calc.js';
import { ORIGEM_QUESITO, contextoLegal, ehSuplementar , reuEhInss, localVistoria } from '../schema.js';
import { Doc, p, run, rich, montarDocx, ordinalDia1 } from './ooxml.js';
import { nenParaJornada, arenParaJornada, vdvrParaJornada, certificadoVencido, rotuloParadigma, num as numP } from '../paradigmas.js';

export const PERFIL_ID = 'perfil';

export function dataBR(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}
export function dataHoraBR(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function menosCincoAnos(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  // 29/02 de ano bissexto → 28/02 do ano sem o dia 29
  const ano = Number(m[1]) - 5, mes = Number(m[2]);
  const ultimo = new Date(ano, mes, 0).getDate();
  return `${String(Math.min(Number(m[3]), ultimo)).padStart(2, '0')}/${m[2]}/${ano}`;
}
// data de hoje no fuso do aparelho (toISOString é UTC: depois das 21 h em Brasília daria o dia seguinte)
export function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// comparação única com o limite: arredonda para 1 casa (a mesma exibida nos quadros) e exige superar
export const superaLimite = (x, lim) => isFinite(x) && Math.round(x * 10) / 10 > lim;
// prefixo do quesito sem repetir a numeração que o próprio texto já traz ("1) …", "a) …")
export function prefixoQuesito(q, sep = ') ') {
  const texto = String(q.data.texto || '').trim();
  const num = String(q.data.numero || '').trim();
  if (!num) return '';
  const lider = ((texto.match(/^\(?([0-9]+|[a-z]|[ivx]+)\s*[).\-–]/i) || [])[1] || '').toLowerCase();
  const partes = num.toLowerCase().split(/[-.\s]+/).filter(Boolean);
  if (lider && partes.includes(lider)) return partes.length > 1 && lider === partes[partes.length - 1] ? `${partes.slice(0, -1).join('.')}.` : '';
  return `${num}${sep}`;
}
const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
export const ou = (x, pend) => (v(x) ? v(x) : `[[${pend}]]`);

export function limpaRefsPdf(t) {
  if (typeof t !== 'string' || !/Parte\s+\d|\d{4}-\d{2}-\d{2}|\(pp?\.\s*\d/.test(t) || /^\d{4}-\d{2}-\d{2}/.test(t.trim())) return t;
  return t
    .replace(/,?\s*Parte\s+\d+,?\s+(?:pp?\.|p[áa]g(?:inas?)?\.?)\s*\d+(?:\s*[-–]\s*\d+)?(?:\s*(?:,|e)\s*\d+(?:\s*[-–]\s*\d+)?)*/gi, '')
    .replace(/,?\s*Parte\s+\d+\b/gi, '')
    .replace(/\s*\(pp?\.\s*\d+(?:\s*[-–]\s*\d+)?\)/g, '')
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3/$2/$1')
    .replace(/\(\s*[,;–-]\s*/g, '(').replace(/\s*[,;]\s*\)/g, ')').replace(/\(\s*\)/g, '')
    .replace(/[ \t]+([,;.)])/g, '$1').replace(/([,;])\s*([,;])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();
}
const limpaDados = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, val]) => [k, limpaRefsPdf(val)]));

export async function carregar(caseId) {
  const caso = await db.records.get(caseId);
  if (!caso) throw new Error('Caso não encontrado.');
  const kinds = ['quesito', 'periodo', 'documento', 'epi', 'posto', 'medicao', 'foto'];
  const [quesitos, periodos, documentos, epis, postos, medicoes, fotos] = await Promise.all(kinds.map((k) => caseChildren(caseId, k)));
  const equipamentos = (await db.records.where('kind').equals('equip').toArray()).filter((e) => !e.deleted)
    .sort((a, b) => (a.data.ordem || 0) - (b.data.ordem || 0));
  const paradigmas = new Map((await db.records.where('kind').equals('paradigma').toArray()).filter((r) => !r.deleted).map((r) => [r.data.codigo, r]));
  const quimicos = (await db.records.where('kind').equals('quimico').toArray()).filter((r) => !r.deleted);
  const cfgPar = await db.records.get('cfg-paradigmas');
  const perfilRec = await db.records.get(PERFIL_ID);
  const perfil = { ...PERFIL_PADRAO, ...(perfilRec ? perfilRec.data : {}) };
  // duplicados de extrações repetidas não entram nos documentos
  const pers = unicos(periodos, (x) => [normTxt(x.empresa).slice(0, 30), x.inicio, x.fim]);
  pers.sort((a, b) => String(a.data.inicio || '').localeCompare(String(b.data.inicio || '')));
  // medição repetida: fica a mais recente (a última extração costuma ser a mais completa)
  const meds = unicos(medicoes, (x) => [x.agente, x.lavg, x.dose, x.aren, x.vdv, x.tbn, x.valor, x.dataMedicao, x.horaInicio], true);
  const comMed = new Set(meds.map((m) => m.data.postoId));
  // posto sem medição que repete o veículo/posto de outro com medição = duplicado
  const chaveP = (x) => normTxt(x.nome).split(' ').slice(0, 2).join(' ');
  const psts = postos.filter((ps) => comMed.has(ps.id) || !postos.some((o) => o !== ps && comMed.has(o.id) && chaveP(o.data) === chaveP(ps.data)))
    .map((ps) => ({ ...ps, data: { ...ps.data } }));
  for (const ps of psts) { // completa o posto mantido com o que só o repetido tinha
    for (const o of postos) if (!psts.some((k) => k.id === o.id) && chaveP(o.data) === chaveP(ps.data)) {
      for (const [c, val] of Object.entries(o.data)) if (!v(ps.data[c]) && v(val)) ps.data[c] = val;
    }
  }
  // referências internas aos arquivos PDF (Parte N, p. X) e datas ISO no meio do texto não vão para o documento
  const limpa = (lst) => lst.map((r) => ({ ...r, data: limpaDados(r.data) }));
  const dados = { id: caseId, c: limpaDados(caso.data), quesitos: limpa(quesitos), periodos: limpa(pers), documentos: limpa(documentos), epis, postos: limpa(psts), medicoes: meds, fotos, equipamentos, perfil, paradigmas, quimicos,
    regraCertMeses: Number((cfgPar && cfgPar.data.regraCertMeses) || 24) };
  // ordem cronológica: cada posto/veículo vai para a posição do primeiro vínculo que representa
  const ordemP = new Map(dados.postos.map((ps) => [ps.id, (periodosDoPosto(ps, dados)[0] || {}).data?.inicio || '9999']));
  dados.postos.sort((a, b) => ordemP.get(a.id).localeCompare(ordemP.get(b.id)) || (a.data.ordem ?? a.createdAt) - (b.data.ordem ?? b.createdAt));
  const posP = new Map(dados.postos.map((ps, i) => [ps.id, i]));
  meds.sort((a, b) => (posP.get(a.data.postoId) ?? 99) - (posP.get(b.data.postoId) ?? 99) || String(a.data.dataMedicao || '').localeCompare(String(b.data.dataMedicao || '')));
  return dados;
}

export const normTxt = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// mantém o primeiro de cada grupo, completando os campos vazios com os dos repetidos
function unicos(lista, chave, maisRecente = false) {
  const mapa = new Map();
  for (const r of [...lista].sort((a, b) => (maisRecente ? -1 : 1) * (a.createdAt - b.createdAt))) {
    const k = JSON.stringify(chave(r.data).map((x) => String(x ?? '').trim()));
    const ja = mapa.get(k);
    if (!ja) { mapa.set(k, { ...r, data: { ...r.data } }); continue; }
    for (const [c, val] of Object.entries(r.data)) if (!v(ja.data[c]) && v(val)) ja.data[c] = val;
  }
  return [...mapa.values()];
}

// Vínculos que um posto/veículo representa: pelo nome da empresa ou pelas datas citadas no posto
export function periodosDoPosto(ps, dados) {
  const txt = normTxt(`${ps.data.nome} ${ps.data.descricao || ''} ${ps.data.infoEmpresa || ''}`);
  const datas = (`${ps.data.nome} ${ps.data.descricao || ''}`.match(/\d{4}-\d{2}-\d{2}/g) || []);
  return dados.periodos.filter((r) => {
    const palavras = normTxt(r.data.empresa).split(' ').filter((w) => w.length >= 5 && !['transportes', 'transporte', 'industria', 'comercio', 'rodoviarios', 'papeis', 'ltda'].includes(w));
    if (palavras.length && txt.includes(palavras[0])) return true;
    return datas.some((d) => d >= (r.data.inicio || '') && d <= (r.data.fim || '9999'));
  });
}
export function postosDoPeriodo(r, dados) {
  return dados.postos.filter((ps) => periodosDoPosto(ps, dados).includes(r));
}
export const nomeCurto = (nome) => String(nome || 'Posto').split(/\s+[–-]\s+(?=paradigma|zona|aplicado)/i)[0].trim();


export const PERFIL_PADRAO = {
  nome: 'ROGÉRIO GRAHL',
  titulos: 'Engenheiro Químico e Engenheiro de Segurança do Trabalho',
  crea: 'CREA-SC nº 10392239/D',
  vistoCrea: 'visto CREA-PR nº 081075',
  cidade: 'Londrina/PR',
};

export function credencial(perfil) {
  return [perfil.crea, perfil.vistoCrea].filter(Boolean).join(' – ');
}

// Rótulos das partes conforme a matéria
export function partes(c) {
  const trab = (c.materia === 'Trabalhista' || c.justica === 'Justiça do Trabalho') && !(reuEhInss(c) && c.justica !== 'Justiça do Trabalho');
  // prev = finalidade de tempo especial (legislação previdenciária); acidentária só muda os rótulos
  const prev = contextoLegal(c).prev === true;
  const inss = prev || c.materia === 'Acidentária';
  return {
    autor: trab ? 'Reclamante' : inss ? 'Autor' : 'Requerente',
    reu: trab ? 'Reclamada' : inss ? 'Réu' : 'Requerido(a)',
    autorCurto: trab ? 'Reclamante' : inss ? 'Autor' : 'Requerente',
    reuCurto: trab ? 'Reclamada' : inss ? 'INSS' : 'Requerido(a)',
    trab, prev,
  };
}

// artigos conforme a parte: "o Reclamante", "a Reclamada", "o Autor", "o INSS"
export function art(nome) {
  const fem = /Reclamada|Requerida/.test(nome || '');
  return { o: fem ? 'a' : 'o', pelo: fem ? 'pela' : 'pelo', do: fem ? 'da' : 'do', O: fem ? 'A' : 'O' };
}

export function papelAssinatura(c) {
  const pt = partes(c);
  if (c.papel === 'Perito do Juízo') return 'Perito do Juízo';
  if (/autor/i.test(c.papel || '')) return `Assistente Técnico ${art(pt.autorCurto).do} ${pt.autorCurto}`;
  if (/réu/i.test(c.papel || '')) return `Assistente Técnico ${art(pt.reuCurto).do} ${pt.reuCurto}`;
  return 'Responsável Técnico';
}

// "EXCELENTÍSSIMO SENHOR JUIZ FEDERAL DA ...", "... JUIZ DO TRABALHO DA ...", "... DOUTOR JUIZ DE DIREITO DA ..."
// Juízo para o endereçamento: na carta precatória, o deprecado (onde a carta tramita), sem o nome do juiz,
// sem a unidade de autuação entre parênteses e sem "Juízo Federal da" antes da vara
export function juizoLimpo(c) {
  let j = v(c.juizo);
  let deprecante = v(c.juizoDeprecante);
  const mDep = j.match(/deprecante\s*:\s*([^;]+)/i);
  if (mDep && !deprecante) deprecante = mDep[1].trim();
  const mDo = j.match(/deprecado\s*:\s*([^;]+)/i);
  if (mDo) j = mDo[1];
  else if (mDep) j = j.replace(/;?\s*deprecante\s*:[^;]+/i, '');
  j = j.replace(/\s*\([^)]*\)/g, '').replace(/\s+[–-]\s+ju[ií]z[a]?\b.*$/i, '').replace(/\s+[–-]\s+(dr|dra)\.?\s.*$/i, '')
    .replace(/^ju[ií]zo\s+(federal\s+)?d[ao]\s+(?=\d+ª|\d+º)/i, '').replace(/[;,.\s]+$/, '').trim();
  return { juizo: j, deprecante };
}
export function enderecamentoTexto(c) {
  const j = juizoLimpo(c).juizo;
  const cidade = v(c.comarca).split(/[\/–-]/)[0].trim().toLowerCase();
  // a vara federal já traz a cidade ("6ª Vara Federal de Londrina"): não repete a comarca nem o local da perícia
  const comarcaLimpa = v(c.comarca).split(/;/)[0].replace(/\s*\([^)]*\)/g, '').trim();
  const comarca = comarcaLimpa && !(cidade && j.toLowerCase().includes(cidade)) && !/vara\b.*\bde\s+\S/i.test(j) ? ` – ${comarcaLimpa}` : '';
  const just = c.justica || '';
  const trat = /Federal/i.test(just) ? 'EXCELENTÍSSIMO SENHOR JUIZ FEDERAL'
    : /Trabalho/i.test(just) ? 'EXCELENTÍSSIMO SENHOR JUIZ DO TRABALHO'
      : /Estadual/i.test(just) ? 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO' : 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ';
  const prep = /^(juizado|juízo|juizo|foro|tribunal)\b/i.test(j) ? 'DO ' : 'DA ';
  return `${trat} ${j ? prep + j : '[[VARA / JUÍZO]]'}${comarca}`;
}

export function linhasProcesso(c, extra = []) {
  const pt = partes(c);
  const classe = v(c.classe) ? `${c.classe} nº` : 'Processo nº';
  return [[classe, ou(c.numero, 'número do processo')], ['Juízo Deprecante', juizoLimpo(c).deprecante], [pt.autor, c.autorNome], [pt.reu, c.reuNome], ...extra];
}

export function qualificacaoCurta(perfil) {
  const visto = perfil.vistoCrea ? ` (${perfil.vistoCrea})` : '';
  return `**${perfil.nome}**, ${perfil.titulos}, ${perfil.crea}${visto}`;
}

// ---------- contas bancárias (duas, escolhidas a cada petição) ----------
export function contasDoPerfil(perfil) {
  const out = [];
  if (v(perfil.conta1) || v(perfil.dadosBancarios)) out.push({ id: 'conta1', rotulo: perfil.conta1Rotulo || 'Conta 1', dados: perfil.conta1 || perfil.dadosBancarios });
  if (v(perfil.conta2)) out.push({ id: 'conta2', rotulo: perfil.conta2Rotulo || 'Conta 2', dados: perfil.conta2 });
  return out;
}
export function dadosDaConta(perfil, escolha) {
  const contas = contasDoPerfil(perfil);
  const c = contas.find((x) => x.id === escolha) || contas[0];
  return c ? c.dados : '[[dados bancários – cadastre em Configurações → Meus dados]]';
}

// ---------- datas e valores por extenso ----------
const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export function dataPorExtenso(iso, { semana = false } = {}) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const txt = ordinalDia1(d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }));
  return semana ? `${txt} (${DIAS_SEMANA[d.getDay()]})` : txt;
}
export function horaPorExtenso(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return v(hhmm);
  return `${Number(m[1])}h${m[2] === '00' ? '' : m[2]}`;
}

const UN = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CEM = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
function ate999(n) {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), r = n % 100, d = Math.floor(r / 10), u = r % 10;
  const partes = [];
  if (c) partes.push(CEM[c]);
  if (r) partes.push(r < 20 ? UN[r] : [DEZ[d], u ? UN[u] : ''].filter(Boolean).join(' e '));
  return partes.join(' e ');
}
export function numeroPorExtenso(n, { feminino = false } = {}) {
  n = Math.floor(Number(n));
  if (!isFinite(n) || n <= 0) return '';
  if (feminino && n < 1000) return ate999(n).replace(/\bum$/, 'uma').replace(/\bdois$/, 'duas').replace(/^duzentos/, 'duzentas');
  if (n < 1000) return ate999(n);
  const mil = Math.floor(n / 1000), r = n % 1000;
  return [mil === 1 ? 'mil' : `${ate999(mil)} mil`, r ? ate999(r) : ''].filter(Boolean).join(r < 100 || r % 100 === 0 ? ' e ' : ' ');
}
export function reaisPorExtenso(valor) {
  const total = Math.round(Number(valor) * 100);
  if (!isFinite(total) || total < 0) return '';
  const inteiro = Math.floor(total / 100), cent = total % 100;
  const mil = Math.floor(inteiro / 1000), resto = inteiro % 1000;
  const p = [];
  if (mil) p.push(mil === 1 ? 'mil' : `${ate999(mil)} mil`);
  if (resto) p.push(ate999(resto));
  let txt = p.length === 2 && (resto < 100 || resto % 100 === 0) ? p.join(' e ') : p.join(' ');
  if (inteiro) txt += inteiro === 1 ? ' real' : ' reais';
  if (cent) txt += `${inteiro ? ' e ' : ''}${ate999(cent)} ${cent === 1 ? 'centavo' : 'centavos'}`;
  return txt.trim();
}
export function moeda(n) {
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ');
}
export function lerValor(t) {
  const s = String(t ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return NaN;
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
}

export function qualificacaoCompleta(perfil) {
  const partesQ = [`**${perfil.nome}**, ${perfil.titulos}`];
  if (perfil.cpf) partesQ.push(`portador do CPF nº ${perfil.cpf}${perfil.rg ? ` e do RG nº ${perfil.rg}` : ''}`);
  partesQ.push(`inscrito no ${credencial(perfil).replace(/^CREA-SC nº/, 'CREA/SC sob o nº')}`);
  if (perfil.endereco) partesQ.push(`com endereço profissional na ${perfil.endereco}`);
  const contatos = [perfil.telefone && `telefone ${perfil.telefone}`, perfil.email && `e-mail ${perfil.email}`].filter(Boolean).join(' e ');
  if (contatos) partesQ.push(`com contatos pelo ${contatos}`);
  return partesQ.join(', ');
}

export function blocoAssinatura(d, { c, perfil }, papel, { linha = false } = {}) {
  return d.assinatura({
    local: perfil.cidade || 'Londrina – PR',
    nome: perfil.nome,
    linha,
    linhas: [perfil.titulos, credencial(perfil).replace(' – visto', ' – Visto'), papel || papelAssinatura(c)],
  });
}

// ---------- quadros reutilizáveis ----------
export function equipamentosUsados(dados) {
  const { c, medicoes, equipamentos } = dados;
  const ids = new Set([...(c.equipamentos || []), ...medicoes.map((m) => m.data.equipamentoId).filter(Boolean)]);
  return equipamentos.filter((e) => ids.has(e.id));
}

export function quadroEquipamentos(d, lista, titulo = 'Instrumentos utilizados') {
  if (!lista.length) return d.texto('[[Selecionar os equipamentos utilizados na aba Campo do caso.]]');
  return d.quadro(titulo, [['Equipamento', 'Marca / modelo', 'Nº de série', 'Certificado / laboratório', 'Calibração'],
    ...lista.map((e) => [e.data.nome, `${e.data.fabricante || ''} ${e.data.modelo || ''}`.trim(), ou(e.data.serie, 'série'),
      [e.data.certificado, e.data.laboratorio].filter(Boolean).join(' – ') || '[[certificado]]', dataBR(e.data.dataCalibracao) || '[[data]]'])],
  { larguras: [0.21, 0.17, 0.17, 0.29, 0.16], alinhar: 'left', tam: 9 });
}

export function quadroDiligencia(d, c, titulo = 'Registro da diligência') {
  return d.quadro(titulo, [['Campo', 'Informação'],
    ['Data e horário', [dataBR(c.vistoriaData) || dataBR(c.dataDiligencia), [c.vistoriaInicio || c.horaDiligencia, c.vistoriaFim].filter(Boolean).join(' às ')].filter(Boolean).join(', ') || '[[data e horário]]'],
    ['Local', [localVistoria(c), c.vistoriaEndereco].filter(Boolean).join(' – ') || '[[local]]'],
    ...(c.vistoriaGps ? [['Coordenadas', c.vistoriaGps]] : []),
    ['Presentes', c.vistoriaPresentes || '[[pessoas presentes]]'],
    ...(c.vistoriaIntimacao ? [['Comunicação às partes e aos assistentes (art. 474 do CPC)', c.vistoriaIntimacao]]
      : c.papel === 'Perito do Juízo' ? [['Comunicação às partes e aos assistentes (art. 474 do CPC)', '[[mov. / data da intimação]]']] : []),
    ...(c.vistoriaCondicoes ? [['Condições operacionais no dia', c.vistoriaCondicoes]] : []),
  ], { larguras: [0.3, 0.7], alinhar: 'left' });
}

export function quadroPeriodos(d, periodos, titulo = 'Períodos avaliados') {
  if (!periodos.length) return d.texto('[[Cadastrar os vínculos/períodos na aba Preparação.]]');
  return d.quadro(titulo, [['Empresa', 'Período', 'Cargo / setor', 'Fonte'],
    ...periodos.map((r) => [[r.data.empresa, r.data.cnpj && `CNPJ ${r.data.cnpj}`].filter(Boolean).join('\n'),
      `${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`, [r.data.cargo, r.data.setor].filter(Boolean).join(' / '), r.data.fonte || ''])],
  { larguras: [0.32, 0.22, 0.26, 0.2], alinhar: 'left' });
}

export function quadroEpis(d, epis, { extra = false } = {}) {
  if (!epis.length) return d.texto(extra ? 'Não foram apresentados registros de fornecimento de EPI (fichas de entrega com CA, periodicidade de troca, treinamento e higienização), cuja guarda é de responsabilidade do empregador.' : 'Não foram apresentados nos autos registros de fornecimento de EPI (fichas de entrega com CA, periodicidade de troca, treinamento e higienização), cuja guarda é de responsabilidade do empregador.');
  return d.quadro('Equipamentos de proteção individual registrados', [['EPI', 'CA', 'Entrega', 'Observações'],
    ...epis.map((e) => [e.data.descricao, e.data.ca, dataBR(e.data.dataEntrega), e.data.obs])], { larguras: [0.34, 0.12, 0.16, 0.38] });
}

export function quadroDocumentos(d, documentos) {
  if (!documentos.length) return d;
  return d.quadro('Documentos analisados', [['Documento', 'Identificação', 'O que consta'],
    ...documentos.map((x) => [x.data.tipo || 'Documento', x.data.identificacao || '', x.data.analise || ''])], { larguras: [0.2, 0.2, 0.6] });
}

// ---------- ruído: critério legal por período (padrão do signatário) ----------
const JANELAS_RUIDO = [
  { ini: '0000-01-01', fim: '1997-03-05', crit: 'Lavg', lim: 80, fund: 'Lavg > 80 dB(A) – cód. 1.1.6 do Decreto 53.831/1964 (art. 292, I, da IN 128/2022)' },
  { ini: '1997-03-06', fim: '2003-11-18', crit: 'Lavg', lim: 90, fund: 'Lavg > 90 dB(A) – cód. 2.0.1 dos Decretos 2.172/1997 e 3.048/1999 (art. 292, II e III, da IN 128/2022; a partir de 11/10/2001, com histograma ou memória de cálculo). A legislação remetia ao Anexo 1 da NR-15 na íntegra; compara-se o Lavg com q = 5' },
  { ini: '2003-11-19', fim: '9999-12-31', crit: 'NEN', lim: 85, fund: 'NEN > 85 dB(A) – cód. 2.0.1 com a redação do Decreto 4.882/2003; NEN calculado para a jornada com q = 5 (Anexo 1 da NR-15), com os procedimentos de medição da NHO-01 (art. 292, IV, da IN 128/2022: obrigatória a partir de 01/01/2004, facultativa desde 19/11/2003)' },
];
const fimJanela = (j) => (j.fim === '9999-12-31' ? 'em diante' : dataBR(j.fim));

export function quadroCriteriosRuido(d) {
  return d.quadro('Critérios – Ruído', [['Período', 'Critério e fundamento'],
    ['Até 05/03/1997', JANELAS_RUIDO[0].fund], ['06/03/1997 a 18/11/2003', JANELAS_RUIDO[1].fund], ['A partir de 19/11/2003', JANELAS_RUIDO[2].fund]],
  { larguras: [0.27, 0.73], fonte: 'Elaborado pelo autor com base em Brasil (2022, art. 292).' });
}

// divide cada período cadastrado pelas janelas legais do ruído
export function subperiodosRuido(periodos) {
  const out = [];
  for (const r of periodos) {
    const ini = r.data.inicio, fim = r.data.fim || hojeLocal();
    if (!ini) continue;
    for (const j of JANELAS_RUIDO) {
      const a = ini > j.ini ? ini : j.ini;
      const b = fim < j.fim ? fim : j.fim;
      if (a <= b) out.push({ periodo: r, ini: a, fim: b, janela: j });
    }
  }
  return out;
}

export function quadroConfrontoRuido(d, dados) {
  const ruido = dados.medicoes.filter((m) => m.data.agente === 'Ruído');
  // vínculos com paradigma de ruído saem na memória de cálculo dos paradigmas
  const subs = subperiodosRuido(dados.periodos.filter((r) => !r.data.paradigmaRuido));
  if (!subs.length) return d;
  const nomeP = nomePostoFn(dados.postos);
  let semVinculo = false;
  const refDo = (r) => {
    const ids = new Set(postosDoPeriodo(r, dados).map((ps) => ps.id));
    const m = ruido.find((x) => ids.has(x.data.postoId));
    // sem posto vinculado, não se usa a medição de outro posto (evita confronto com o veículo errado)
    if (!m && ruido.length) semVinculo = true;
    return m;
  };
  return d.quadro('Confronto do ruído com o limite de cada período', [['Vínculo / subperíodo', 'Medição representativa', 'Critério', 'Valor', 'Limite', 'Resultado'],
    ...subs.map((s) => {
      const ref = refDo(s.periodo);
      const q = ref ? fatorQ(ref) : 5;
      const q3antes = ref && q === 3 && s.janela.crit === 'Lavg';
      const val = !ref || q3antes ? NaN : s.janela.crit === 'Lavg' ? num(ref.data.lavg) : nen(ref.data.lavg, s.periodo.data.conducaoH ? `${s.periodo.data.conducaoH}h` : ref.data.jornada, q);
      const res = q3antes ? '[[q = 3 não serve antes de 19/11/2003]]' : isFinite(val) ? (superaLimite(val, s.janela.lim) ? 'Supera' : 'Não supera') : '[[medir]]';
      return [`${s.periodo.data.empresa || ''}\n${dataBR(s.ini)} a ${dataBR(s.fim)}`, ref ? nomeP(ref.data.postoId) : '—', s.janela.crit,
        isFinite(val) ? `${fmt(val)} dB(A)` : ref ? '[[valor]]' : '[[vincular posto]]', `${s.janela.lim} dB(A)`, ref ? res : '[[vincular posto ao vínculo]]'];
    })], { larguras: [0.3, 0.22, 0.1, 0.13, 0.11, 0.14],
    fonte: `Elaborado pelo autor. Cada vínculo usa a medição do veículo/posto que o representa${semVinculo ? ' [[há vínculo sem posto vinculado: vincule o veículo/posto que o representa]]' : ''}; NEN calculado para o tempo diário de condução do vínculo, quando informado.` });
}

// ---------- medições por agente ----------
export function quadroMedicoesRuido(d, ms, eq, nomePosto, ctx = {}) {
  if (!ms.length) return d;
  const e0 = ms[0] && eq.get(ms[0].data.equipamentoId);
  const qs = [...new Set(ms.map(fatorQ))];
  const qTxt = qs.length === 1 ? `q = ${qs[0]}${qs[0] === 3 ? ' (NHO-01)' : ' (NR-15, Anexo 1)'}` : 'q indicado em cada linha';
  const fonte = `Elaborado pelo autor. ${e0 ? `Dosímetro ${e0.data.modelo}, série ${e0.data.serie}; ` : ''}critério 85 dB(A), limiar 80 dB(A), ${qTxt}, circuito A, resposta lenta.`;
  const rotNivel = qs.length === 1 ? (qs[0] === 3 ? 'Leq (q = 3)' : 'Lavg (q = 5)') : 'Lavg / Leq';
  if (ctx.prev) {
    return d.quadro('Resultados – Ruído', [['Posto / trabalhador', 'Amostragem', 'Dose', rotNivel, 'Jornada', qs.length === 1 ? `NEN (q = ${qs[0]})` : 'NEN'],
      ...ms.map((m) => {
        const x = m.data;
        const n = nen(x.lavg, x.jornada, fatorQ(m));
        return [[nomePosto(x.postoId), x.posicao].filter(Boolean).join(' – '), [x.tempoAmostragem, x.horaInicio && x.horaFim && `${x.horaInicio}–${x.horaFim}`].filter(Boolean).join(', '),
          x.dose ? `${x.dose}%` : '', x.lavg ? `${x.lavg} dB(A)` : '', x.jornada || '', isFinite(n) ? `${fmt(n)} dB(A)` : ''];
      })], { larguras: [0.28, 0.18, 0.1, 0.15, 0.12, 0.17], alinhar: 'left', tam: 9, fonte });
  }
  // trabalhista: NR-15, Anexo 1 – dose e nível médio; NEN não se aplica
  return d.quadro('Resultados – Ruído (NR-15, Anexo 1)', [['Posto / trabalhador', 'Amostragem', 'Jornada', 'Dose (jornada)', rotNivel, 'Situação'],
    ...ms.map((m) => {
      const x = m.data;
      // dose projetada para a jornada; dosímetro com q = 3 não serve para a NR-15
      const dj = doseJornada(x.dose, x.tempoAmostragem, x.jornada);
      const proj = isFinite(dj) && Math.abs(dj - num(x.dose)) > 0.05;
      const sit = fatorQ(m) === 3 ? '[[q = 3: refazer com q = 5]]' : isFinite(dj) ? (dj > 100 ? 'Acima do LT' : 'Dentro do LT') : '[[conferir]]';
      return [[nomePosto(x.postoId), x.posicao].filter(Boolean).join(' – '), [x.tempoAmostragem, x.horaInicio && x.horaFim && `${x.horaInicio}–${x.horaFim}`].filter(Boolean).join(', '),
        x.jornada || '', x.dose ? (proj ? `${fmt(dj)}%\n(medida ${x.dose}%)` : `${x.dose}%`) : '', x.lavg ? `${x.lavg} dB(A)` : '', sit];
    })], { larguras: [0.27, 0.17, 0.12, 0.12, 0.14, 0.18], alinhar: 'left', tam: 9, fonte: `${fonte} Dose projetada para a jornada: D × TE / T amostrado.` });
}

export function quadroMedicoesGenerico(d, titulo, ms, nomePosto, ctx = {}) {
  if (!ms.length) return d;
  const quando = (x) => [x.dataMedicao && dataBR(x.dataMedicao), x.horaInicio && `${x.horaInicio}${x.horaFim ? `–${x.horaFim}` : ''}`].filter(Boolean).join('\n');
  if (/corpo inteiro/i.test(ms[0].data.agente || '')) {
    return d.quadro(titulo, [['Posto / veículo', 'Data e horário', 'aren (m/s²)', 'VDVR (m/s^1,75)'],
      ...ms.map((m) => { const x = m.data; return [nomePosto(x.postoId), quando(x), x.aren || '', x.vdv || '']; })],
    { larguras: [0.4, 0.24, 0.18, 0.18], fonte: 'Elaborado pelo autor. Valores de aceleração resultante de exposição normalizada (aren) e de dose de vibração resultante (VDVR) para a exposição diária.' });
  }
  if (/mãos e braços/i.test(ms[0].data.agente || '')) {
    return d.quadro(titulo, [['Posto / ferramenta', 'Data e horário', 'aren (m/s²)', 'T diária', 'Observações'],
      ...ms.map((m) => { const x = m.data; return [[nomePosto(x.postoId), x.ferramenta].filter(Boolean).join('\n'), quando(x), x.aren || '', x.tempoExposicao || '', x.obs || '']; })],
    { larguras: [0.25, 0.14, 0.12, 0.14, 0.35], tam: 9 });
  }
  if (/calor/i.test(ms[0].data.agente || '')) {
    return d.quadro(titulo, [['Posto', 'Data e horário', 'tbn (°C)', 'tbs (°C)', 'tg (°C)', 'IBUTG (°C)', 'Atividade / regime'],
      ...ms.map((m) => { const x = m.data; const c = calculados(m, ctx); const ib = (c.find(([r]) => /IBUTG/i.test(r)) || [])[1] || x.ibutgLido || '';
        return [nomePosto(x.postoId), quando(x), x.tbn || '', x.tbs || '', x.tg || '', ib, [x.atividade, x.regime, x.obs].filter(Boolean).join('\n')]; })],
    { larguras: [0.2, 0.14, 0.08, 0.08, 0.08, 0.1, 0.32], tam: 9 });
  }
  return d.quadro(titulo, [['Posto / atividade', 'Resultados'],
    ...ms.map((m) => [nomePosto(m.data.postoId), [resumoMedicao(m, ctx), m.data.obs].filter(Boolean).join('\n')])],
  { larguras: [0.3, 0.7], alinhar: 'left', tam: 9.5 });
}

// ---------- critérios por período (somente previdenciário) ----------
export function quadroCriteriosCalor(d) {
  return d.quadro('Critérios – Calor', [['Período', 'Critério e fundamento'],
    ['Até 05/03/1997', 'Cód. 1.1.1 do Decreto 53.831/1964: operações em locais com temperatura excessivamente alta, capaz de ser nociva à saúde e proveniente de fontes artificiais; jornada normal em locais com TE acima de 28 °C, sem exigência de IBUTG. Cód. 1.1.1 do Anexo I do Decreto 83.080/1979: alimentação de caldeiras a vapor a carvão ou a lenha (art. 293, I, da IN 128/2022)'],
    ['06/03/1997 a 10/12/2019', 'Cód. 2.0.4 dos Decretos 2.172/1997 e 3.048/1999: exposição ao calor acima dos limites de tolerância da NR-15, Anexo 3, na redação original (IBUTG e quadros de regime e taxa metabólica). A partir de 01/01/2004, avaliação conforme a NHO-06, facultativa desde 19/11/2003 (art. 293, II e III, da IN 128/2022)'],
    ['A partir de 11/12/2019', 'Cód. 2.0.4 do Decreto 3.048/1999, com os limites da NR-15, Anexo 3, na redação da Portaria SEPRT nº 1.359/2019 (DOU de 11/12/2019), avaliados conforme a NHO-06 (2ª ed., 2017)'],
  ], { larguras: [0.27, 0.73], fonte: 'Elaborado pelo autor com base em Brasil (2022, art. 293). O Decreto 3.048/1999 prevalece sobre a redação mais restritiva da IN, que limita o calor a ambientes fechados ou com fonte artificial (hierarquia normativa).' });
}

export function quadroCriteriosVibracao(d) {
  return d.quadro('Critérios – Vibração', [['Período', 'Critério e fundamento'],
    ['Até 05/03/1997', 'Cód. 1.1.5 do Decreto 53.831/1964 (trepidações e vibrações industriais: operadores de perfuratrizes e marteletes pneumáticos, e outros; jornada normal com máquinas acionadas a ar comprimido e velocidade acima de 120 golpes por minuto) e cód. 1.1.4 do Anexo I do Decreto 83.080/1979 (trabalhos com perfuratrizes e marteletes pneumáticos) – art. 296, I, da IN 128/2022'],
    ['06/03/1997 a 13/08/2014', 'Cód. 2.0.2 dos Decretos 2.172/1997 e 3.048/1999 (perfuratrizes e marteletes pneumáticos), com os limites das normas ISO 2631 e ISO/DIS 5349 (art. 296, II, da IN 128/2022). Fora dessas atividades, apresentam-se as duas leituras, inclusive pela ISO (VCI: fronteira superior da zona de cautela da ISO 2631-1; VMB: 5 m/s², Diretiva 2002/44/CE)'],
    ['A partir de 14/08/2014', 'Cód. 2.0.2 do Decreto 3.048/1999, com os limites da NR-15, Anexo 8 (Portaria MTE nº 1.297, de 13/08/2014, vigente desde a publicação no DOU de 14/08/2014; a IN 128/2022 indica 13/08/2014): VCI aren 1,1 m/s² ou VDVR 21,0 m/s^1,75; VMB aren 5 m/s², avaliados conforme as NHO-09 e NHO-10 (art. 296, III, da IN 128/2022; facultativas desde 10/09/2012)'],
  ], { larguras: [0.27, 0.73], fonte: 'Elaborado pelo autor com base em Brasil (2022, art. 296).' });
}

// documentos a requerer conforme a finalidade
export function documentosARequerer(ctx = {}) {
  if (ctx.prev) {
    return [
      'PPP do(a) segurado(a) e LTCAT ou laudos ambientais contemporâneos a cada período (PPRA, PGR, PCMSO, laudos de insalubridade da época)',
      'ficha de registro de empregado, descrição de cargo e ordens de serviço',
      'avaliações quantitativas dos agentes ambientais, com metodologia, equipamentos e certificados de calibração',
      'fichas de entrega de EPI com os números de CA e comprovantes de troca (para os períodos a partir de 03/12/1998)',
      'Fichas com Dados de Segurança (FDS/FISPQ) dos produtos químicos utilizados',
      'para motoristas: registros de jornada e de viagem (tacógrafo, rastreamento, diários de bordo, controles de frete), para a avaliação da penosidade',
    ];
  }
  return [
    'PPRA (até 2021) e PGR com inventário de riscos e plano de ação (a partir de 2022), PCMSO e laudo de insalubridade e periculosidade, abrangendo o período discutido',
    'avaliações quantitativas dos agentes ambientais, com metodologia, equipamentos e certificados de calibração',
    'fichas de entrega de EPI com os números de CA, comprovantes de troca e registros de treinamento (NR-6)',
    'descrição de cargo, ordens de serviço (NR-1) e relação dos empregados do setor',
    'Fichas com Dados de Segurança (FDS/FISPQ) dos produtos químicos utilizados',
  ];
}

export function medicoesPorAgente(dados) {
  const g = {};
  for (const m of dados.medicoes) (g[m.data.agente || 'Outro'] = g[m.data.agente || 'Outro'] || []).push(m);
  return g;
}

export function nomePostoFn(postos) {
  const mp = new Map(postos.map((p) => [p.id, nomeCurto(p.data.nome)]));
  return (id) => mp.get(id) || 'Geral';
}

export function profissiografia(d, postos, dados, { numero, base } = {}) {
  if (!postos.length) return d.redigir('descrição do ambiente e das atividades observadas (cadastrar os postos na aba Campo).');
  if (numero) d.h2(numero, 'Vistoria pericial – postos e veículos avaliados');
  postos.forEach((ps, i) => {
    const temMed = dados && dados.medicoes.some((m) => m.data.postoId === ps.id);
    const limpa = (t) => (temMed ? String(t || '').replace(/\s*\[\[[^\]]*medi[çc][õo]?[^\]]*\]\]/gi, '') : t);
    const x = Object.fromEntries(Object.entries(ps.data).map(([k, val]) => [k, typeof val === 'string' ? limpa(val) : val]));
    const vincs = dados ? periodosDoPosto(ps, dados) : [];
    const meds = dados ? dados.medicoes.filter((m) => m.data.postoId === ps.id) : [];
    const quando = meds.map((m) => [m.data.dataMedicao && dataBR(m.data.dataMedicao), m.data.horaInicio && `${m.data.horaInicio}${m.data.horaFim ? `–${m.data.horaFim}` : ''}`].filter(Boolean).join(', ')).filter(Boolean);
    const pref = numero || base;
    d.h3(pref ? `${pref}.${i + 1}` : `${i + 1}.`, nomeCurto(x.nome));
    const linhas = [['Posto / veículo avaliado', x.nome], ['Descrição', x.descricao],
      ['Vínculo(s) representado(s)', vincs.map((r) => `${empresaCurta(r.data.empresa)} (${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'})`).join('\n')],
      ['Medições (data e horário)', [...new Set(quando)].join('\n')],
      ['Informações do trabalhador', x.infoTrabalhador], ['Informações da empresa / acompanhante', x.infoEmpresa],
      ['Agentes identificados', x.agentes], ['Fontes geradoras e localização', x.fontes], ['Via e periodicidade da exposição', x.viaPeriodicidade],
      ['Jornada / exposição', x.jornada], ['EPC', x.epc], ['EPI observado', x.epi]].filter(([, t]) => v(t));
    if (linhas.length) d.quadro(`Registro da vistoria – ${nomeCurto(x.nome)}`, [['Item', 'Registro'], ...linhas], { larguras: [0.27, 0.73], fonte: 'Vistoria e informações colhidas na diligência.' });
  });
  return d;
}

export async function figurasDoCaso(dados, filtro = () => true) {
  const nome = nomePostoFn(dados.postos);
  const lista = [];
  let faltando = 0;
  for (const f of dados.fotos.filter(filtro)) {
    const b = await db.blobs.get(f.id);
    if (!b) { faltando++; continue; }
    const { reduzirFoto } = await import('../apendices.js');
    const red = typeof document !== 'undefined' ? await reduzirFoto(b.blob) : null;
    lista.push({
      bytes: red ? red.bytes : new Uint8Array(await b.blob.arrayBuffer()), w: (red && red.w) || f.data.largura || 4, h: (red && red.h) || f.data.altura || 3,
      legenda: f.data.legenda || (f.data.postoId ? nome(f.data.postoId) : 'Registro fotográfico'),
      detalhe: [dataHoraBR(f.data.tiradaEm), f.data.gps && `GPS ${f.data.gps}`].filter(Boolean).join(' · '),
    });
  }
  return { lista, faltando };
}

// "da parte autora", "do INSS", "do Juízo"...
export function nomeOrigemQuesito(o, c) {
  const pt = partes(c);
  if (o === 'Autor / Reclamante') return pt.trab ? 'do Reclamante' : 'da parte autora';
  if (o === 'Réu / Reclamada') return pt.trab ? 'da Reclamada' : pt.reuCurto === 'INSS' ? 'do INSS' : 'da parte ré';
  if (o === 'Juízo') return 'do Juízo';
  if (o === 'INSS') return 'do INSS';
  if (o === 'Complementares') return 'de esclarecimento';
  return (o || '').toLowerCase();
}

// Quesitos do laudo: os suplementares (formulados depois do laudo) ficam de fora;
// eles saem na petição de resposta aos quesitos suplementares.
export function respostasQuesitos(d, quesitos, numBase, c) {
  const nomeOrigem = (o) => nomeOrigemQuesito(o, c);
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^\s*(\d+|[a-z])\s*[).\-–]\s*/, '').replace(/\W+/g, ' ').trim();
  const vistos = new Map(); // quesito repetido por outra parte: remete à primeira resposta
  let n = 0;
  const rotulosVistos = new Set();
  for (const origem of ORIGEM_QUESITO) {
    const rot = nomeOrigem(origem);
    if (rotulosVistos.has(rot)) continue; // ex.: "Réu" e "INSS" quando o réu é o INSS → um título só
    rotulosVistos.add(rot);
    const lista = quesitos.filter((q) => !ehSuplementar(q) && nomeOrigem(q.data.origem || 'Outro') === rot);
    if (!lista.length) continue;
    n += 1;
    d.h2(`${numBase}.${n}`, `Quesitos ${rot}`);
    for (const q of lista) {
      const texto = String(q.data.texto || '').trim();
      const num = String(q.data.numero || '').trim();
      // não repete a numeração quando o próprio texto já começa com ela ("1) …", "a) …")
      // número composto ("1-b", "4-c"): o texto já traz a letra; mostra só o grupo antes dela ("1.b) …")
      const prefixo = prefixoQuesito(q, ' – ');
      void num;
      d.add(p([run(prefixo, { b: true }), rich(texto, { i: true })], { after: 100, keepNext: true }));
      const k = norm(texto);
      let resp;
      if (q.data.resposta) resp = [rich(q.data.resposta)];
      else if (k.length > 15 && vistos.has(k)) resp = [run(`Vide resposta ao quesito ${vistos.get(k)}.`)];
      else resp = [run('Responder', { b: true, hl: true })];
      if (k.length > 15 && !vistos.has(k)) vistos.set(k, `${num.replace(/-/g, '.')} ${nomeOrigem(origem)}`.trim());
      d.add(p([run('Resposta: ', { b: true })].concat(resp), { first: 709, after: 240 }));
    }
  }
  if (!n) d.texto('[[Não há quesitos cadastrados. Transcreva-os na aba Quesitos.]]');
  return d;
}

export function rodapeTecnico(d, c, dados) {
  void c; void dados;
  return d;
}

// Carrega o modelo timbrado (vertical ou paisagem)
export async function modelo(nome = 'timbrado-vertical.docx') {
  const r = await fetch(`${import.meta.env.BASE_URL}modelos/${nome}`);
  if (!r.ok) throw new Error('Não foi possível carregar o modelo timbrado.');
  return r.arrayBuffer();
}

export async function finalizar(d, { titulo, arquivo, c }) {
  const nomeArq = `${arquivo}_${(c.numero || c.autorNome || 'caso').replace(/[^\w.-]+/g, '_').slice(0, 60)}.docx`;
  const blob = await montarDocx(await modelo(), d.xml(), { imagens: d.imagens, tituloDoc: titulo, comCampos: true });
  return { blob, nome: nomeArq };
}

// filete horizontal (cor do timbrado) para separar blocos da capa
const filete = (cor = 'C9A44C', after = 240) => `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="${cor}"/></w:pBdr><w:spacing w:before="0" w:after="${after}" w:line="240" w:lineRule="auto"/><w:ind w:left="2268" w:right="2268"/><w:jc w:val="center"/></w:pPr></w:p>`;

export function capaTecnica(d, { titulo, subtitulo, linha2, pares, perfil, data = new Date(), orgao = '' }) {
  d.add(p([run(perfil.nome, { b: true, color: '1B365D', size: 13 })], { align: 'center', after: 0 }));
  d.add(p([run(perfil.titulos, { size: 10, color: '475569' })], { align: 'center', after: 0 }));
  d.add(p([run(credencial(perfil), { size: 10, color: '475569' })], { align: 'center', after: orgao ? 600 : 1400 }));
  if (orgao) d.add(p([run(orgao.toUpperCase(), { b: true, size: 10, color: '475569' })], { align: 'center', after: 600, line: 276 }));
  d.add(filete('C9A44C', 360));
  d.add(p([run(titulo, { b: true, size: 22, color: '1B365D' })], { align: 'center', after: 120, line: 276 }));
  if (subtitulo) d.add(p([run(subtitulo, { size: 12, color: '475569' })], { align: 'center', after: 60, line: 276 }));
  if (linha2) d.add(p([run(linha2, { b: true, size: 12, color: '1B365D' })], { align: 'center', after: 120, line: 276 }));
  d.add(filete('C9A44C', 360));
  d.identificacao(pares);
  d.add(p('', { after: pares.length > 6 ? 600 : 1200 }));
  d.add(p([run(`${perfil.cidade || 'Londrina – PR'}`, { b: true, color: '1B365D' })], { align: 'center', after: 0 }));
  d.add(p([run(String(data.getFullYear()), { b: true, color: '1B365D' })], { align: 'center', after: 0 }));
  return d;
}

export { Doc, calculados };


// ======================================================================
// Paradigmas por vínculo (motorista / operador): quadros e memórias de cálculo
// no padrão do parecer do signatário (similaridade, normalização pela jornada)
// ======================================================================

const f2 = (x) => (isFinite(x) ? x.toFixed(2).replace('.', ',') : '—');
const vinculoNome = (r, i) => `V${i + 1} – ${r.data.empresa || ''}`.trim();
const per = (r) => `${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`;

export function usaParadigmas(dados) {
  return dados.periodos.some((r) => r.data.paradigmaRuido || r.data.paradigmaVibracao);
}

export function quadrosParadigmasMetodologia(d, dados) {
  if (!usaParadigmas(dados)) return false;
  const P = dados.paradigmas;
  d.texto('A quantificação do ruído e da vibração usa medições realizadas pelo signatário em veículos com as mesmas características técnicas dos conduzidos pelo requerente (prova emprestada, art. 372 do CPC). A similaridade considera, nesta ordem: posição do motor, geração e isolamento da cabine, suspensão da cabine e do assento, configuração do veículo e tipo de via predominante.');
  d.quadro('Veículos do requerente e paradigmas de medição', [['Vínculo', 'Veículo do requerente', 'Família', 'Veículo efetivamente medido', 'Fonte (processo e data)', 'Jornada (h)'],
    ...dados.periodos.map((r, i) => {
      const pr = P.get(r.data.paradigmaRuido), pv = P.get(r.data.paradigmaVibracao);
      const medido = [pr && `Ruído: ${rotuloParadigma(pr)}`, pv && pv !== pr && `VCI: ${rotuloParadigma(pv)}`].filter(Boolean).join('\n')
        || '[[PESQUISAR: sem paradigma no banco]]';
      const fontes = [...new Set([pr, pv].filter(Boolean).map((x) => x.data.citacao))].join('\n');
      return [vinculoNome(r, i), [r.data.veiculoMarca, r.data.veiculoModelo, r.data.veiculoAno].filter(Boolean).join(' ') || '[[veículo]]',
        (pr || pv) ? `${(pr || pv).data.familia}` : '', medido, fontes, (pr || pv) ? `${(pr || pv).data.jornadaLaudo || '?'} h` : ''];
    })], { larguras: [0.15, 0.17, 0.1, 0.22, 0.26, 0.1], tam: 8.5, alinhar: 'left', fonte: 'Banco de paradigmas do signatário.' });
  d.quadro('Equações de normalização pela jornada', [['Grandeza', 'Equação'],
    ['Ruído (q = 5)', 'NEN = Lavg + 16,61 · log(T / 8)'], ['Vibração – aceleração', 'aren(T) = arep · √(T / 8)'], ['Vibração – dose', 'VDVR(T) = VDVR(laudo) · (T / Tlaudo)^0,25']],
  { larguras: [0.35, 0.65], fonte: 'Manual de Aposentadoria Especial do INSS (2017); NHO-09.' });
  d.texto('Até 18/11/2003 o valor comparado ao limite é o Lavg, pois a legislação remetia integralmente ao Anexo 1 da NR-15; a partir de 19/11/2003, somente o NEN, normalizado para a jornada.');
  d.quadro('Tempo de condução adotado por vínculo', [['Vínculo', 'Período', 'T (h/dia)', 'Base da informação'],
    ...dados.periodos.map((r, i) => [vinculoNome(r, i), per(r), r.data.conducaoH ? `${r.data.conducaoH} h` : '[[T]]', r.data.conducaoBase || '[[base da informação]]'])],
  { larguras: [0.22, 0.2, 0.13, 0.45], alinhar: 'left' });
  const usados = [...new Set(dados.periodos.flatMap((r) => [r.data.paradigmaRuido, r.data.paradigmaVibracao]).filter(Boolean))].map((c) => P.get(c)).filter(Boolean);
  if (usados.length) {
    d.quadro('Instrumentação dos paradigmas', [['Paradigma', 'Fonte', 'Equipamento, número de série e calibração'],
      ...usados.map((p) => {
        const x = p.data;
        const partes = [];
        if (x.ruidoEquip) partes.push(`${x.ruidoEquip}, SN ${x.ruidoSerie || '?'}, certificado ${x.ruidoCert || 'n/i'} (${x.ruidoCertData || '?'})${certificadoVencido(x.ruidoCertData, x.dataMedicao, dados.regraCertMeses) ? ` [[VERIFICAR: certificado com mais de ${dados.regraCertMeses} meses na data da medição]]` : ''}`);
        if (x.calibEquip) partes.push(`calibrador ${x.calibEquip}, SN ${x.calibSerie || '?'}${x.calibCertData ? ` (${x.calibCertData})` : ''}`);
        if (x.vibEquip) partes.push(`${x.vibEquip}, série ${x.vibSerie || '?'}${x.vibCertData ? ` (calibrado em ${x.vibCertData})` : ''}${certificadoVencido(x.vibCertData, x.dataMedicao, dados.regraCertMeses) ? ` [[VERIFICAR: certificado com mais de ${dados.regraCertMeses} meses]]` : ''}`);
        return [rotuloParadigma(p), x.citacao || '', partes.join('; ') || '[[instrumentação]]'];
      })], { larguras: [0.22, 0.28, 0.5], tam: 8.5, alinhar: 'left', fonte: 'Relatórios de medição dos laudos de origem.' });
  }
  return true;
}

// Janelas de vibração (previdenciário)
const LIM_ISO_AREN = 0.86; // fronteira superior da zona de cautela, ISO 2631-1 (8 h, Figura B.1), conforme a Nota Técnica ASPEJUDI nº 001/2013
const LIM_ISO_VDV = 17;
const LIM_NR15_AREN = 1.1;
const LIM_NR15_VDV = 21;

function subperiodosVibracao(r) {
  const ini = r.data.inicio, fim = r.data.fim || hojeLocal();
  const J = [{ ini: '0000-01-01', fim: '1997-03-05', crit: 'cod115' }, { ini: '1997-03-06', fim: '2014-08-13', crit: 'iso' }, { ini: '2014-08-14', fim: '9999-12-31', crit: 'nr15' }];
  return J.map((j) => ({ ini: ini > j.ini ? ini : j.ini, fim: fim < j.fim ? fim : j.fim, crit: j.crit })).filter((x) => ini && x.ini <= x.fim);
}

export function memoriasParadigmas(d, dados, { numero = '' } = {}) {
  if (!usaParadigmas(dados)) return false;
  let sub = 0; let titulo = false;
  const cab = (t) => { if (!titulo && numero) { d.h2(numero, 'Memória de cálculo dos paradigmas'); titulo = true; } sub += 1; d.h3(numero ? `${numero}.${sub}` : '', t); };
  const P = dados.paradigmas;
  const linhasR = [];
  dados.periodos.forEach((r, i) => {
    const p = P.get(r.data.paradigmaRuido);
    if (!r.data.paradigmaRuido) return;
    for (const sp of subperiodosRuido([r])) {
      const lavg = p ? numP(p.data.lavg) : NaN;
      const T = numP(r.data.conducaoH);
      const nen = sp.janela.crit === 'NEN' && isFinite(T) ? nenParaJornada(lavg, T) : NaN;
      const valor = sp.janela.crit === 'Lavg' ? lavg : nen;
      const supera = isFinite(valor) ? (superaLimite(valor, sp.janela.lim) ? 'SIM' : 'NÃO') : '[[?]]';
      linhasR.push([`V${i + 1} – ${dataBR(sp.ini)} a ${dataBR(sp.fim)}`, p ? `${p.data.marca} ${p.data.modelo}`.trim() : `[[${r.data.paradigmaRuido}?]]`,
        f2(lavg), isFinite(T) ? `${String(r.data.conducaoH).replace('.', ',')} h` : '[[T]]', sp.janela.crit === 'NEN' ? f2(nen) : '—',
        `${sp.janela.crit} > ${sp.janela.lim}`, f2(valor), supera]);
    }
  });
  if (linhasR.length) {
    cab('Ruído (q = 5)');
    d.quadro('Memória de cálculo do ruído (q = 5)', [['Subperíodo', 'Paradigma', 'Lavg (dB(A))', 'T', 'NEN (dB(A))', 'Critério da época', 'Valor comparado', 'Supera?'], ...linhasR],
      { larguras: [0.2, 0.15, 0.1, 0.08, 0.1, 0.13, 0.12, 0.12], tam: 8.5, alinhar: 'left' });
  }
  const linhasV = [];
  dados.periodos.forEach((r, i) => {
    if (!r.data.paradigmaVibracao) return;
    const p = P.get(r.data.paradigmaVibracao);
    const T = numP(r.data.conducaoH);
    const arep = p ? numP(p.data.arep || p.data.arenLaudo) : NaN;
    const aren = arenParaJornada(arep, T);
    const vdv = p ? vdvrParaJornada(p.data.vdvrLaudo, T, p.data.jornadaLaudo || 8) : NaN;
    for (const sp of subperiodosVibracao(r)) {
      let crit, res;
      if (sp.crit === 'cod115') { crit = 'Cód. 1.1.5 (Dec. 53.831/64)'; res = '[[avaliar: perfuratrizes e marteletes]]'; }
      else if (sp.crit === 'iso') {
        crit = 'ISO 2631-1 – zona de cautela';
        res = !isFinite(aren) ? 'Sem dados' : (aren > LIM_ISO_AREN || (isFinite(vdv) && vdv > LIM_ISO_VDV)) ? 'Acima da fronteira superior' : 'Até a fronteira superior';
      } else {
        crit = 'NR-15, Anexo 8';
        res = !isFinite(aren) ? 'Sem dados' : (aren > LIM_NR15_AREN || (isFinite(vdv) && vdv > LIM_NR15_VDV)) ? 'Acima do LE' : 'Abaixo do LE';
      }
      linhasV.push([`V${i + 1} – ${dataBR(sp.ini)} a ${dataBR(sp.fim)}`, p ? `${p.data.marca} ${p.data.modelo}`.trim() : 'Sem dados', f2(arep),
        isFinite(T) ? `${String(r.data.conducaoH).replace('.', ',')} h` : '[[T]]', f2(aren), f2(vdv), crit, res]);
    }
  });
  if (linhasV.length) {
    cab('Vibração de corpo inteiro');
    d.quadro('Memória de cálculo da vibração de corpo inteiro', [['Subperíodo', 'Paradigma', 'arep (m/s²)', 'T', 'aren(T) (m/s²)', 'VDVR(T)', 'Critério da época', 'Resultado'], ...linhasV],
      { larguras: [0.2, 0.15, 0.09, 0.07, 0.1, 0.09, 0.15, 0.15], tam: 8.5, alinhar: 'left',
        fonte: `Elaborado pelo autor. ISO 2631-1: fronteira superior da zona de cautela (aren ${String(LIM_ISO_AREN).replace('.', ',')} m/s² para 8 h, conforme a Nota Técnica ASPEJUDI nº 001/2013, ou VDV ${LIM_ISO_VDV} m/s^1,75); NR-15, Anexo 8: limite de exposição aren 1,1 m/s² ou VDVR 21,0 m/s^1,75.` });
  }
  return sub > 0;
}


// Forma de enquadramento, prova e medidas de controle por período (IN 128/2022)
export function quadroFormaEnquadramento(d) {
  return d.quadro('Forma de enquadramento, prova e medidas de controle', [['Período', 'Enquadramento', 'Documentos', 'Permanência', 'EPC / EPI'],
    ['Até 28/04/1995', 'Categoria profissional ou agente nocivo', 'CTPS para categoria; formulário e laudo para ruído', 'Não exigida (art. 286, § 2º)', 'Não considerados'],
    ['29/04/1995 a 13/10/1996', 'Agente nocivo', 'Formulário; laudo para ruído', 'Exigida', 'Não considerados'],
    ['14/10/1996 a 02/12/1998', 'Agente nocivo', 'Formulário com base em LTCAT ou PPP', 'Exigida', 'EPC informado; EPI não considerado'],
    ['03/12/1998 a 31/12/2003', 'Agente nocivo', 'Formulário com base em LTCAT ou PPP', 'Exigida', 'EPC e EPI considerados (art. 291)'],
    ['A partir de 01/01/2004', 'Agente nocivo', 'PPP com base em LTCAT', 'Exigida', 'EPC e EPI considerados; NHO obrigatórias (art. 289)']],
  { larguras: [0.2, 0.18, 0.24, 0.14, 0.24], tam: 9, fonte: 'Elaborado pelo autor com base em Brasil (2022, arts. 274, 285, 286, 289 e 291).' });
}

// Requisitos cumulativos do EPI (art. 291 da IN 128/2022), para preencher por período
export function quadroRequisitosEpi(d, dados) {
  if (dados && !dados.epis.length) {
    d.quadro('Requisitos do EPI – art. 291 da IN 128/2022', [['Requisito', 'Situação', 'Evidência'],
      ...['I – hierarquia: medidas coletivas e administrativas antes do EPI', 'II – funcionamento e uso ininterrupto, conforme o fabricante', 'III – Certificado de Aprovação válido', 'IV – periodicidade de troca comprovada por recibo', 'V – higienização'].map((t) => [t, 'Não comprovado', 'Sem registros nos autos'])],
    { larguras: [0.5, 0.18, 0.32], tam: 9, fonte: 'Elaborado pelo autor com base em Brasil (2022, art. 291). Os requisitos são cumulativos.' });
    return d.texto('Não comprovados os requisitos cumulativos do art. 291, não se considera neutralizada a exposição pelo uso de EPI.');
  }
  return d.quadro('Requisitos do EPI – art. 291 da IN 128/2022', [['Requisito', 'Atendido?', 'Evidência'],
    ['I – hierarquia: medidas coletivas e administrativas antes do EPI', '[[S/N]]', '[[PGR/PPRA, inventário de riscos]]'],
    ['II – funcionamento e uso ininterrupto, conforme o fabricante', '[[S/N]]', '[[observação / ordens de serviço]]'],
    ['III – Certificado de Aprovação válido', '[[S/N]]', '[[nº do CA e validade]]'],
    ['IV – periodicidade de troca comprovada por recibo', '[[S/N]]', '[[fichas de entrega]]'],
    ['V – higienização', '[[S/N]]', '[[procedimento / registros]]']],
  { larguras: [0.5, 0.14, 0.36], tam: 9, alinhar: 'left', fonte: 'Elaborado pelo autor com base em Brasil (2022, art. 291). Os requisitos são cumulativos e só se aplicam a partir de 03/12/1998.' });
}


// Códigos de enquadramento previdenciário sugeridos pelos agentes do período
// (antes de 06/03/1997: Decretos 53.831/64 e 83.080/79; depois: Anexo IV dos Decretos 2.172/97 e 3.048/99)
const COD = [
  [/ru[ií]do/i, '1.1.6', '2.0.1'], [/calor|temperatura/i, '1.1.1', '2.0.4'], [/vibra|trepida/i, '1.1.5', '2.0.2'],
  [/biol|microrganism|hospital/i, '1.3.2', '3.0.1'], [/esgoto|lixo/i, '', '3.0.1'], [/[óo]leo|graxa|hidrocarb|mineral/i, '1.2.11', '1.0.17'],
  [/s[ií]lica|poeira/i, '1.2.10', '1.0.18'], [/benzeno/i, '1.2.11', '1.0.3'], [/eletric/i, '1.1.8', ''],
];
export function codigosEnquadramento(agentes, inicio, fim) {
  const t = String(agentes || '');
  const ini = inicio || '0000', f = fim || '9999';
  const antes = ini <= '1997-03-05', depois = f >= '1997-03-06';
  const out = [];
  for (const [re, a, b] of COD) {
    if (!re.test(t)) continue;
    const c = [antes && a, depois && b].filter(Boolean).join(' / ');
    if (c) out.push(c);
  }
  if (ini <= '1995-04-28' && /motorista|caminh|[ôo]nibus|cobrador/i.test(t)) out.push('2.4.4 (categoria)');
  return out.length ? out.join('; ') : '[[cód.]]';
}

// Texto da determinação judicial a partir do cadastro
export function textoDeterminacao(dados, prev) {
  const c = dados.c;
  if (!v(c.despachoRef)) return '';
  // usa só a decisão principal (primeiro item); o histórico de intimações não entra no laudo
  const seg = v(c.despachoRef).split(/;\s*/)[0];
  const ev = seg.match(/\b(?:ev(?:ento)?\.?\s*(\d+)|mov(?:\.|imento)?\s*(\d+(?:\.\d+)?)|ID\s*([\w.-]+)|fls?\.\s*([\d\-–]+))/i);
  const dt = seg.match(/\b(\d{4})-(\d{2})-(\d{2})\b/) || seg.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  const data = dt ? (dt[1].length === 4 ? `${dt[3]}/${dt[2]}/${dt[1]}` : dt[0]) : '';
  let ref;
  if (ev) ref = ev[1] ? `da decisão do evento ${ev[1]}` : ev[2] ? `da decisão do mov. ${ev[2]}` : ev[3] ? `da decisão de ID ${ev[3]}` : `do despacho de fls. ${ev[4]}`;
  else ref = /^(d[ae]|conforme)\b/i.test(seg) ? seg.replace(/^conforme\s+/i, '') : `de ${seg.replace(/\s*\(.*$/, '')}`;
  const vinc = dados.periodos.length ? ` nos ${dados.periodos.length > 1 ? `${dados.periodos.length} períodos controvertidos indicados no Quadro 1` : 'período controvertido indicado no Quadro 1'}` : '';
  const obj = prev ? `apurar as condições de trabalho da parte autora e a exposição a agentes nocivos à saúde ou à integridade física${vinc}, para fins de reconhecimento de tempo especial`
    : `apurar as condições de trabalho e a caracterização ou não de ${(c.objeto || []).join(' e ').toLowerCase() || 'insalubridade e/ou periculosidade'}${vinc}`;
  const extras = [/IAC/i.test(c.despachoRef) && 'observados, quanto à penosidade, os parâmetros do IAC nº 5 do TRF4',
    dados.quesitos.some((q) => q.data.origem === 'Juízo') && 'com resposta aos quesitos do Juízo e das partes'].filter(Boolean);
  return `Por meio ${ref}${data ? `, de ${data}` : ''}, foi determinada a realização de perícia técnica para ${obj}${extras.length ? `, ${extras.join(', ')}` : ''}.`;
}

// ---------- Apêndices: relatórios das medições anexados na aba Campo ----------
export async function apendicesDoCaso(dados) {
  const { apendicesRegistros, paginasDoArquivo, LETRAS } = await import('../apendices.js');
  const { obterAnexo } = await import('../sync.js');
  const regs = await apendicesRegistros(dados.id);
  const out = []; let falhas = 0;
  for (const r of regs) {
    try {
      const blob = await obterAnexo(r.id);
      const paginas = await paginasDoArquivo(blob, r.data.mime);
      out.push({ letra: LETRAS[out.length] || String(out.length + 1), titulo: r.data.titulo || r.data.nome, paginas });
    } catch (e) { falhas++; }
  }
  return { apendices: out, falhasApendice: falhas };
}

// "Integram o presente laudo o Anexo I – ... e os Apêndices A a C – ..."
export function textoIntegram(d, { fotos = false, rotuloFotos = 'Anexo I – Relatório fotográfico da diligência', apendices = [], doc = 'laudo' }) {
  const itens = [];
  if (fotos) itens.push(`o ${rotuloFotos}`);
  for (const a of apendices) itens.push(`o Apêndice ${a.letra} – ${a.titulo}`);
  if (!itens.length) return;
  const lista = itens.length > 1 ? `${itens.slice(0, -1).join('; ')}; e ${itens[itens.length - 1]}` : itens[0];
  d.texto(`${itens.length > 1 ? 'Integram' : 'Integra'} o presente ${doc} ${lista}.`);
}

export function inserirApendices(d, apendices) {
  for (const a of apendices) {
    d.h1('', `Apêndice ${a.letra} – ${a.titulo}`);
    d.paginasInteiras(a.paginas, { nota: `Apêndice ${a.letra}` });
  }
}

// ---------- Vínculos: título e descrição (item "Ambiente de trabalho e profissiografia") ----------
// nome da empresa sem os parênteses de situação ("(ativa – Ponta Grossa/PR)"), para títulos
export function empresaCurta(nome = '') {
  return String(nome).replace(/\s*\([^)]*\)/g, '').replace(/\s*[–-]\s*(baixada|ativa|falida|inativa)[^–]*$/i, '').replace(/\s{2,}/g, ' ').trim();
}
export function tituloVinculo(r, { prefixo = '' } = {}) {
  return `${prefixo}${empresaCurta(r.data.empresa) || 'Empresa'} – ${dataBR(r.data.inicio)} a ${r.data.fim ? dataBR(r.data.fim) : 'atual'}`;
}
const minuscula = (t) => (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);

// Parágrafos do vínculo: quem, onde, quando, cargo; atividades com a fonte; veículo; como foi avaliado
export function descricaoVinculo(d, r, dados, { refVistoria = '' } = {}) {
  const x = r.data;
  const per = x.fim ? `No período de ${dataBR(x.inicio)} a ${dataBR(x.fim)}` : `Desde ${dataBR(x.inicio)}`;
  const parens = [...String(x.empresa || '').matchAll(/\(([^)]*)\)/g)].map((m) => m[1]).filter(Boolean);
  const situacao = parens.length ? ` (${parens.join('; ')})` : '';
  const cargo = v(x.cargo) ? `, no cargo de ${minuscula(v(x.cargo))}` : '';
  const setor = v(x.setor) ? `, setor ${v(x.setor)}` : '';
  d.texto(`${per}, o autor trabalhou na empresa ${empresaCurta(x.empresa) || '[[empresa]]'}${v(x.cnpj) ? `, CNPJ ${x.cnpj}` : ''}${situacao}${cargo}${setor}.`);
  let ativ = v(x.atividades);
  if (ativ) {
    let fonte = '';
    const m = ativ.match(/\s*\(([^()]*(?:PPP|Ev\s?\d|evento|inicial|LTCAT|CTPS|laudo|entrevista)[^()]*)\)\.?\s*$/i);
    if (m) { fonte = m[1].trim(); ativ = ativ.slice(0, m.index).trim(); }
    if (!fonte && v(x.fonte) && /PPP|descri/i.test(x.fonte)) fonte = v(x.fonte).split(/[;\n]/)[0];
    ativ = ativ.replace(/\.$/, '');
    // atividade escrita com verbo conjugado ("conduzia caminhão") → "o autor conduzia…"; senão "as atividades consistiam em…"
    const verbo = /^\S+(ia|va|iam|vam)\b/i.test(ativ);
    const abre = fonte ? `Conforme a descrição ${/^PPP/i.test(fonte) ? `do ${fonte}` : `constante de ${fonte}`}, ` : '';
    const corpo = verbo ? `o autor ${minuscula(ativ)}` : `as atividades do autor consistiam em ${minuscula(ativ)}`;
    d.texto(`${abre}${abre ? corpo : corpo.replace(/^./, (k) => k.toUpperCase())}.`);
  } else d.redigir('atividades do vínculo (PPP, descrição do cargo ou entrevista).');
  const veic = [x.veiculoTipo, x.veiculoMarca, x.veiculoModelo, x.veiculoAno].filter(Boolean).join(' ');
  const comp = [veic && `veículo conduzido: ${veic}`, v(x.tipoTransporte) && `transporte: ${minuscula(v(x.tipoTransporte))}`,
    v(x.conducaoH) && `tempo diário de condução informado: cerca de ${String(x.conducaoH).replace('.', ',')} h`].filter(Boolean);
  if (comp.length) d.texto(`Informações complementares do vínculo – ${comp.join('; ')}.`);
  const ps = postosDoPeriodo(r, dados);
  if (ps.length) d.texto(`Na perícia, este vínculo é representado ${ps.length > 1 ? 'pelos veículos/postos' : 'pelo veículo/posto'} ${ps.map((p) => nomeCurto(p.data.nome)).join('; ')}${refVistoria ? `, descrito${ps.length > 1 ? 's' : ''} no item ${refVistoria}` : ''}.`);
}

// "ruído acima do limite (ID 5, p. 6); calor..." -> "ruído, calor e poeira" (só os agentes, sem as fontes)
const AGENTES_CONHECIDOS = [['ru[ií]do', 'ruído'], ['calor', 'calor'], ['vibra', 'vibração'], ['poeira|particulad|s[íi]lica', 'poeiras'],
  ['qu[íi]mic|solvente|hidrocarbonet|[óo]leo|graxa|fumos?', 'agentes químicos'], ['biol[óo]g|esgoto|lixo|hospital', 'agentes biológicos'],
  ['umidade', 'umidade'], ['frio', 'frio'], ['radia[çc]', 'radiações'], ['eletricidade|el[ée]tric', 'eletricidade'], ['inflam[áa]ve', 'inflamáveis'], ['explosiv', 'explosivos']];
export function agentesCurtos(t) {
  const txt = v(t);
  if (!txt) return '';
  const achados = AGENTES_CONHECIDOS.filter(([re]) => new RegExp(re, 'i').test(txt)).map(([, n]) => n);
  if (!achados.length) return txt.length < 80 ? txt.replace(/\n+/g, ', ') : '';
  return achados.length > 1 ? `${achados.slice(0, -1).join(', ')} e ${achados[achados.length - 1]}` : achados[0];
}

// referências do despacho para a abertura das petições: "às decisões dos eventos 10, 11 e 14"
export function refDespachos(c) {
  const t = v(c.despachoRef);
  if (!t) return '';
  // só o evento que abre cada referência ("Ev194 DESPADEC1 – ... indicado no Ev192"): os citados na descrição não são decisões
  const cabecas = t.split(/;\s*/).map((s) => s.split(/\s[–-]\s/)[0]);
  const achar = (txt) => [...txt.matchAll(/\bev(?:ento)?\.?\s*(\d+)/gi)].map((m) => Number(m[1]));
  const evs = [...new Set(cabecas.flatMap(achar))].sort((a, b) => a - b);
  if (evs.length) {
    const lista = evs.length > 1 ? `${evs.slice(0, -1).join(', ')} e ${evs[evs.length - 1]}` : String(evs[0]);
    return evs.length > 1 ? `às decisões dos eventos ${lista}` : `à decisão do evento ${lista}`;
  }
  const seg = t.split(/;\s*/)[0].replace(/\s*\(.*$/, '').trim();
  return /^(decisão|sentença|r\.)/i.test(seg) ? `à ${seg}` : `ao ${seg}`;
}

// Perícia por similaridade e empresa da vistoria, também quando só constam do texto do despacho
// ("perícia por similaridade na Pennacchi")
export function ehSimilaridade(c) {
  return c.similaridade === 'Sim' || (c.similaridade !== 'Não' && (!!v(c.empresaOriginal) || /similaridade|paradigma/i.test(v(c.despachoRef))));
}
export function empresaDoDespacho(c) {
  const t = `${v(c.despachoRef)} ${v(c.observacoes)} ${v(c.roteiro)}`;
  const m = t.match(/(?:similaridade|vistoria|per[íi]cia)\s+(?:ser[áa]\s+realizada\s+)?(?:na|no|em)\s+(?:empresa\s+)?([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ&.\- ]{2,60}?)(?=\s*[);,:]|\s+[–-]\s|\s+(?:em|no|na)\s+[A-Z]|$)/);
  return m ? m[1].trim() : '';
}
