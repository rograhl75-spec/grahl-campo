// ======================================================================
// Conferência de coerência do laudo previdenciário, antes de gerar: o que o documento afirmaria e o que o
// próprio texto (ou a norma) contradiz. Cada item sai na lista de pendências com uma ação rápida
// ("mudar para…") e com "Está correto – manter", que grava a ciência no registro e tira o item da lista.
//  1) agente do Anexo 11 ou 12 da NR-15 (quantitativo) marcado "Caracteriza" a partir de 06/03/1997 sem medição;
//  2) fundamentação ou descrição condicional ("a confirmar", "se confirmado", "depende de") com resultado definitivo;
//  3) exposição "eventual", "ocasional" ou "intermitente" com resultado "Caracteriza" depois de 28/04/1995;
//  4) vínculo com atividades por fases (a), b), c)…) e agente que caracteriza o vínculo inteiro;
//  5) documento da empresa citado no texto quando o caso diz que eles são só referência.
// ======================================================================
import { semDocsEmpresa } from './schema.js';
import { agenteNoVinculo } from './enquadramento.js';
import { propostasDasRegras, regraDoAgente, fundamentacaoPelasRegras, propostasDasFds } from './regras.js';

const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
const semAc = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const curto = (n) => v(n).replace(/\s+\(.*$/, '');
const br = (iso) => String(iso || '').replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$3/$2/$1');
const G = 'Coerência do laudo';

export const RE_CONDICIONAL = /\b(a confirmar|se confirmad[oa]s?|caso (?:se )?confirme|dependem? d[aoe]s?|dependendo d[aoe]|a depender|ficou de|aguarda(?:ndo)?|pendente de|n[aã]o confirmad[oa])\b/i;
// "não ocasional nem intermitente" é a fórmula da permanência: não conta como exposição eventual
export const RE_EVENTUAL = /\b(eventua(?:l|is|lmente)|ocasiona(?:l|is|lmente)|espor[aá]dic[oa]s?|esporadicamente|intermitente(?:s|mente)?|raramente)\b/i;
const tiraPermanencia = (t) => String(t || '').replace(/n[aã]o\s+ocasional\s+nem\s+intermitente/gi, '').replace(/nem\s+intermitente/gi, '').replace(/n[aã]o\s+(?:é\s+|era\s+)?(?:eventual|ocasional|intermitente)/gi, '');
export const RE_DOC_EMPRESA = /\b(PGR|PPRA|PCMSO|LTCAT|PCMAT|AET)\b/;

// tira de um texto as orações condicionais ("habitualidade a confirmar em campo"), mantendo o resto
export function semCondicional(t) {
  // pedaços com o separador que os segue ("; " ou ". "), para remontar sem trocar a pontuação
  const pedacos = String(t || '').match(/[^.;]+(?:[.;]+|$)/g) || [];
  const fica = pedacos.filter((x) => x.trim() && !RE_CONDICIONAL.test(x));
  return fica.join('').replace(/\s+/g, ' ').replace(/[;,]\s*$/, '.').trim();
}
const caracteriza = (a) => [a.data.resAte97, a.data.resDesde97, a.data.resDesde2014].includes('Caracteriza');
const definitivo = (a) => [a.data.resAte97, a.data.resDesde97].some((r) => ['Caracteriza', 'Não caracteriza', 'Não enquadrável'].includes(r));
const ciente = (rec, tag) => v((rec.data || {})[`ciente_${tag}`]) === 'Sim';
const item = (rec, tag, titulo, explicacao, acoes = []) => ({ id: `coer-${tag}-${rec.id}`, grupo: G, tipo: 'aviso', rec: rec.id, respondido: false,
  titulo, explicacao, acoes, ciente: { campo: `ciente_${tag}` } });

export function coerenciaDoLaudo(dados) {
  const out = [];
  const { c } = dados;
  const ags = dados.agentes || [];
  // 1) enquadramento pelas regras de cada período (consta? quantitativo ou qualitativo? LINACH): um item só,
  //    com a prévia de cada agente e "Aplicar a todos"
  const props = propostasDasRegras(dados);
  if (props.length) {
    const rot = { resAte97: 'até 05/03/1997', resDesde97: 'a partir de 06/03/1997', resDesde2014: 'a partir de 08/10/2014' };
    out.push({ id: 'regras', grupo: G, tipo: 'lote', respondido: false,
      titulo: `Enquadramento pelas regras de cada período – ${props.length} agente(s)`,
      explicacao: 'Até 05/03/1997, o agente que consta dos Decretos 53.831/64 ou 83.080/79 caracteriza por presunção. A partir de 06/03/1997, só o que consta do Anexo IV: quantitativo (NR-15, Anexos 11 e 12) sem medição não caracteriza e vai ao PPP como "não quantificada"; qualitativo (Anexos 13 e 13-A) caracteriza; Grupo 1 da LINACH com CAS caracteriza a partir de 08/10/2014.',
      previa: props.map(({ a, r, campos }) => `${curto(a.data.nome)}: ${Object.entries(campos).filter(([k]) => rot[k]).map(([k, val]) => `${rot[k]} → ${val || 'igual a 06/03/1997'}`).join('; ') || 'códigos'} (${r.motivo})${r.conferir.length ? ` [conferir: ${r.conferir.join('; ')}]` : ''}`),
      lotes: [{ rotulo: 'Aplicar a todos', escritas: props.map(({ a, campos }) => ({ rec: a.id, campos })) }] });
  }
  // 1-b) agentes a partir das FDS dos produtos do caso: criar os que faltam e completar os existentes
  const { propostas: pf, semProposta } = propostasDasFds(dados);
  if (pf.length) {
    out.push({ id: 'fds-agentes', grupo: G, tipo: 'lote', respondido: false, caseId: dados.id,
      titulo: `Agentes a partir das FDS – ${pf.filter((x) => x.acao === 'criar').length} novo(s), ${pf.filter((x) => x.acao === 'completar').length} a completar`,
      explicacao: `Componentes da seção 3 das FDS agrupados pelo código do decreto (óleos minerais: cód. 1.0.7, b; demais derivados de petróleo: cód. 1.0.17) ou pelo CAS no banco de químicos, já com o resultado pelas regras de cada período.${semProposta.length ? ` Sem proposta: ${semProposta.slice(0, 6).join('; ')}${semProposta.length > 6 ? '…' : ''}.` : ''}`,
      previa: pf.map((x) => (x.acao === 'criar' ? `Novo: ${x.nome} – ${x.data.fonte}${x.r ? ` (${x.r.motivo})` : ''}${x.data.ip346 ? `; IP 346: ${x.data.ip346}` : ''}` : `Completar ${x.nome}: ${Object.entries(x.campos).map(([k, val]) => `${k} = ${val}`).join('; ')}`)),
      lotes: [{ rotulo: 'Criar e completar os agentes', escritas: pf.map((x) => (x.acao === 'criar' ? { criar: { kind: 'agenteAvaliado', data: x.data } } : { rec: x.a.id, campos: x.campos })) }] });
  }
  // 2) texto condicional ("a confirmar", "se confirmado", "depende de") com resultado definitivo – um item só
  // circunstâncias e frequência só contam nos agentes do quadro do art. 68 (os que caracterizam); a fundamentação, em todos
  const camposCond = (a) => (caracteriza(a) ? ['fundamentacao', 'circunstancias', 'frequencia'] : ['fundamentacao']);
  const cond = ags.filter((a) => definitivo(a) && camposCond(a).some((k) => RE_CONDICIONAL.test(v(a.data[k]))) && !ciente(a, 'cond'));
  if (cond.length) {
    // fundamentação: o texto pelas regras; circunstâncias e frequência: sai só o trecho condicional (o fato fica;
    // o que ficar vazio volta como pergunta do art. 68)
    const reescr = cond.map((a) => {
      const r = regraDoAgente(a, dados);
      const campos = {};
      if (r && RE_CONDICIONAL.test(v(a.data.fundamentacao))) campos.fundamentacao = fundamentacaoPelasRegras(a, r);
      else if (RE_CONDICIONAL.test(v(a.data.fundamentacao))) campos.fundamentacao = semCondicional(a.data.fundamentacao);
      for (const k of ['circunstancias', 'frequencia']) if (RE_CONDICIONAL.test(v(a.data[k]))) campos[k] = semCondicional(a.data[k]);
      return { a, campos };
    }).filter(({ campos }) => Object.keys(campos).length);
    out.push({ id: 'coer-cond', grupo: G, tipo: 'lote', respondido: false,
      titulo: `Fundamentação condicional com resultado definitivo – ${cond.length} agente(s)`,
      explicacao: `O texto ainda trata a exposição como dependente de confirmação ("a confirmar", "se confirmado", "depende de"): ${cond.map((a) => curto(a.data.nome)).join(', ')}. Reescreva no agente ou use o texto pelas regras de cada período.`,
      lotes: [
        ...(reescr.length ? [{ rotulo: 'Reescrever pelas regras', escritas: reescr.map(({ a, campos }) => ({ rec: a.id, campos })) }] : []),
        { rotulo: 'Está correto – manter', sec: true, escritas: cond.map((a) => ({ rec: a.id, campos: { ciente_cond: 'Sim' } })) }] });
  }
  // 3) eventual / intermitente com "Caracteriza" (depois de 28/04/1995 a permanência é exigida)
  for (const a of ags) {
    const x = a.data;
    const vinculos = dados.periodos.filter((r, i) => agenteNoVinculo(a, i));
    // a exposição que termina até 28/04/1995 (campo "Exposição até") não precisa de permanência
    const depois95 = vinculos.some((r) => !r.data.fim || r.data.fim > '1995-04-28') && !(v(x.expFim) && v(x.expFim) <= '1995-04-28');
    const ev = ['frequencia', 'circunstancias', 'fundamentacao'].map((k) => tiraPermanencia(x[k]).match(RE_EVENTUAL)).find(Boolean);
    if (ev && caracteriza(a) && depois95 && !ciente(a, 'eventual')) {
      out.push(item(a, 'eventual', `${curto(x.nome)}: exposição "${ev[0]}" com resultado "Caracteriza"`,
        'De 29/04/1995 em diante o enquadramento exige exposição habitual e permanente, não ocasional nem intermitente (art. 57, § 3º, da Lei nº 8.213/1991). Até 28/04/1995 a permanência não era exigida. Confirme a frequência ou mude o resultado.',
        [{ rotulo: 'Mudar para "Não caracteriza" (a partir de 06/03/1997)', campo: 'resDesde97', valor: 'Não caracteriza' }]));
    }
  }
  // 4) atividades por fases e agentes que caracterizam o vínculo inteiro – um item só por vínculo
  dados.periodos.forEach((r, i) => {
    const fases = (v(r.data.atividades).match(/(?:^|\n)\s*[a-h]\)\s/g) || []).length;
    if (fases < 2 || v(r.data.ciente_fases) === 'Sim') return;
    const lst = ags.filter((a) => agenteNoVinculo(a, i) && caracteriza(a) && !v(a.data.expInicio) && !v(a.data.expFim));
    if (!lst.length) return;
    out.push({ id: `coer-fases-${r.id}`, grupo: G, tipo: 'aviso', rec: r.id, respondido: false, ciente: { campo: 'ciente_fases' },
      titulo: `Vínculo com ${fases} fases de atividade e ${lst.length} agente(s) que caracterizam o período inteiro (${br(r.data.inicio)} a ${r.data.fim ? br(r.data.fim) : 'atual'})`,
      explicacao: `${lst.map((a) => curto(a.data.nome)).join(', ')}. Se a exposição a algum deles não vale para todas as fases, preencha no agente (etapa 2) "Exposição a partir de" e "Exposição até": a síntese, a conclusão e o PPP passam a usar só esse período.` });
  });
  // 5) documentos da empresa citados quando são só referência
  if (semDocsEmpresa(c)) {
    const onde = [];
    dados.periodos.forEach((r, i) => ['atividades', 'profissiografia', 'setor', 'cargo', 'fonte', 'local'].forEach((k) => { if (RE_DOC_EMPRESA.test(v(r.data[k]))) onde.push(`V${i + 1}, ${k}`); }));
    ags.forEach((a) => ['fundamentacao', 'circunstancias', 'fonte', 'vias', 'frequencia'].forEach((k) => { if (RE_DOC_EMPRESA.test(v(a.data[k]))) onde.push(`${curto(a.data.nome)}, ${k}`); }));
    if (onde.length && v(c.ciente_docs) !== 'Sim') {
      out.push({ id: 'coer-docs', grupo: G, tipo: 'aviso', rec: dados.id, respondido: false, ciente: { campo: 'ciente_docs' },
        titulo: 'O texto ainda cita documentos da empresa', explicacao: `O caso diz que o PGR, o LTCAT e o PCMSO da empresa são só referência. O app já retira as citações entre parênteses; restam menções em: ${onde.slice(0, 8).join('; ')}${onde.length > 8 ? '…' : ''}. Reescreva esses trechos sem o nome do documento.` });
    }
  }
  return out;
}

// notas de trabalho que ainda estão no texto de um campo ("[data a confirmar – fim do contrato KM]"):
// pendência com "substituir por" ou "apagar a nota"
export function notasNoTexto(registros, grupo, rotulo) {
  const out = [];
  for (const rec of registros) {
    for (const [k, val] of Object.entries(rec.data || {})) {
      if (typeof val !== 'string' || /^ciente_|Instrucao$/.test(k)) continue;
      for (const m of val.matchAll(/(?<!\[)\[(?!\[)([^[\]\n]{2,120})\](?!\])/g)) {
        if (/^\s*(\.\.\.|…)\s*$/.test(m[1]) || !/confirm|confer|verific|pendente|a definir|\?|data|preencher/i.test(m[1])) continue;
        out.push({ id: `nota-${rec.id}-${k}-${m.index}`, grupo, tipo: 'nota', rec: rec.id, campo: k, respondido: false, valorAtual: val, trecho: m[0],
          titulo: `${rotulo(rec)}: nota no texto – "${m[1].trim()}"`, explicacao: `No campo "${k}". Digite o que entra no lugar da nota (ex.: a data) ou apague a nota.` });
      }
    }
  }
  return out;
}
