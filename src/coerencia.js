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
import { anexoQuantitativo, bancoDoAgente } from './docx/agentesQuadros.js';
import { agenteNoVinculo } from './enquadramento.js';

const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
const semAc = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const curto = (n) => v(n).replace(/\s*\(.*$/, '');
const br = (iso) => String(iso || '').replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$3/$2/$1');
const G = 'Coerência do laudo';

export const RE_CONDICIONAL = /\b(a confirmar|se confirmad[oa]s?|caso (?:se )?confirme|dependem? d[aoe]s?|dependendo d[aoe]|a depender|ficou de|aguarda(?:ndo)?|pendente de|n[aã]o confirmad[oa])\b/i;
// "não ocasional nem intermitente" é a fórmula da permanência: não conta como exposição eventual
export const RE_EVENTUAL = /\b(eventua(?:l|is|lmente)|ocasiona(?:l|is|lmente)|espor[aá]dic[oa]s?|esporadicamente|intermitente(?:s|mente)?|raramente)\b/i;
const tiraPermanencia = (t) => String(t || '').replace(/n[aã]o\s+ocasional\s+nem\s+intermitente/gi, '').replace(/nem\s+intermitente/gi, '').replace(/n[aã]o\s+(?:é\s+|era\s+)?(?:eventual|ocasional|intermitente)/gi, '');
export const RE_DOC_EMPRESA = /\b(PGR|PPRA|PCMSO|LTCAT|PCMAT|AET)\b/;

const caracteriza = (a) => [a.data.resAte97, a.data.resDesde97].includes('Caracteriza');
const definitivo = (a) => [a.data.resAte97, a.data.resDesde97].some((r) => ['Caracteriza', 'Não caracteriza', 'Não enquadrável'].includes(r));
const ciente = (rec, tag) => v((rec.data || {})[`ciente_${tag}`]) === 'Sim';
const item = (rec, tag, titulo, explicacao, acoes = []) => ({ id: `coer-${tag}-${rec.id}`, grupo: G, tipo: 'aviso', rec: rec.id, respondido: false,
  titulo, explicacao, acoes, ciente: { campo: `ciente_${tag}` } });

// medição de agente químico cadastrada para o agente (pelo nome na descrição da medição)
function temMedicao(a, dados) {
  const k = semAc(curto(a.data.nome)).slice(0, 12);
  return (dados.medicoes || []).some((m) => /qu[ií]m|Outro/i.test(m.data.agente || '') && semAc(`${m.data.descricao || ''} ${m.data.obs || ''}`).includes(k));
}

export function coerenciaDoLaudo(dados) {
  const out = [];
  const { c } = dados;
  const ags = dados.agentes || [];
  for (const a of ags) {
    const x = a.data;
    // 1) Anexo 11/12 sem medição
    if ((x.tipo || 'Químico') === 'Químico' && x.resDesde97 === 'Caracteriza' && !ciente(a, 'quant')) {
      const anexo = anexoQuantitativo(a, dados.quimicos);
      const q = bancoDoAgente(a, dados.quimicos);
      const linach1 = q && /Grupo 1/i.test(v(q.data.linach));
      if (anexo && !linach1 && !temMedicao(a, dados)) {
        out.push(item(a, 'quant', `${curto(x.nome)}: "Caracteriza" a partir de 06/03/1997 sem medição`,
          `O agente tem limite de tolerância no ${anexo} da NR-15 (avaliação quantitativa). Sem medição da concentração, a exposição não se caracteriza a partir de 06/03/1997: o agente vai ao PPP como presente, com a intensidade "não quantificada".`,
          [{ rotulo: 'Mudar para "Não caracteriza"', campo: 'resDesde97', valor: 'Não caracteriza' }]));
      }
    }
    // 2) texto condicional com resultado definitivo
    const cond = ['fundamentacao', 'circunstancias', 'frequencia'].map((k) => v(x[k]).match(RE_CONDICIONAL)).find(Boolean);
    if (cond && definitivo(a) && !ciente(a, 'cond')) {
      out.push(item(a, 'cond', `${curto(x.nome)}: o texto diz "${cond[0]}", mas o resultado é definitivo`,
        'A fundamentação ou a descrição do art. 68 ainda trata a exposição como dependente de confirmação. Reescreva o texto com o que foi confirmado ou marque o resultado como "A confirmar".',
        [{ rotulo: 'Marcar "A confirmar" (a partir de 06/03/1997)', campo: 'resDesde97', valor: 'A confirmar' }]));
    }
    // 3) eventual / intermitente com "Caracteriza" (depois de 28/04/1995 a permanência é exigida)
    const vinculos = dados.periodos.filter((r, i) => agenteNoVinculo(a, i));
    const depois95 = vinculos.some((r) => !r.data.fim || r.data.fim > '1995-04-28');
    const ev = ['frequencia', 'circunstancias', 'fundamentacao'].map((k) => tiraPermanencia(x[k]).match(RE_EVENTUAL)).find(Boolean);
    if (ev && caracteriza(a) && depois95 && !ciente(a, 'eventual')) {
      out.push(item(a, 'eventual', `${curto(x.nome)}: exposição "${ev[0]}" com resultado "Caracteriza"`,
        'A partir de 29/04/1995 o enquadramento exige exposição habitual e permanente, não ocasional nem intermitente (art. 57, § 3º, da Lei nº 8.213/1991). Confirme a frequência ou mude o resultado.',
        [{ rotulo: 'Mudar para "Não caracteriza" (a partir de 06/03/1997)', campo: 'resDesde97', valor: 'Não caracteriza' }]));
    }
  }
  // 4) atividades por fases e agente que caracteriza o vínculo inteiro
  dados.periodos.forEach((r, i) => {
    const fases = (v(r.data.atividades).match(/(?:^|\n)\s*[a-h]\)\s/g) || []).length;
    if (fases < 2) return;
    for (const a of ags) {
      if (!agenteNoVinculo(a, i) || !caracteriza(a) || v(a.data.expInicio) || v(a.data.expFim) || ciente(a, 'fases')) continue;
      out.push(item(a, 'fases', `${curto(a.data.nome)}: caracteriza o vínculo inteiro (${br(r.data.inicio)} a ${r.data.fim ? br(r.data.fim) : 'atual'}), que tem ${fases} fases de atividade`,
        'As atividades do vínculo estão descritas por fases. Se a exposição a este agente não vale para todas, informe no agente "Exposição a partir de" e "Exposição até": a síntese, a conclusão e o PPP passam a usar só esse período.'));
    }
  });
  // 5) documentos da empresa citados quando são só referência
  if (/^Somente/.test(v(c.docsEmpresa))) {
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
