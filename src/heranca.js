// "Adotar os textos de penosidade de períodos anteriores", "idem ao anterior", "além dos anteriores, Curitiba":
// o vínculo continua o trabalho do vínculo anterior. Os campos de penosidade e de carga que ficaram vazios
// (ou com "idem") são herdados do vínculo anterior mais próximo que os tenha; o trajeto "além dos anteriores, X"
// soma as cidades do anterior. Os dados gravados não mudam: só o que vai para os documentos e as pendências.

import { ehInstrucao } from './ortografia.js';

export const CAMPOS_HERDADOS = ['penosidadeResultado', 'penosidadeConclusao', 'tipoTransporte', 'jornadaSemanal', 'pausas', 'noturnoPernoite',
  'cargaDescarga', 'vias', 'cabine', 'riscoAcidente', 'pressao', 'fisiologicas', 'carroceria', 'tipoCarga', 'carregaDescarrega'];

const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
// pedido de adotar o anterior, em qualquer campo do vínculo
const RE_ADOTAR = /\b(adot|utiliz|us|consider|repet|copi|segu|mant)\w*\b[^.\n]{0,60}\b(anterior|anteriores)\b|\b(mesm[oa]s?|igua(l|is))\s+(a[oa]s?|d[oa]s?)\s+(v[ií]nculos?\s+|per[ií]odos?\s+)?anterior(es)?\b/i;
// o campo inteiro é só uma referência ao anterior
const RE_IDEM = /^\s*(idem|o mesmo|a mesma|os mesmos|as mesmas|igual|mesm[oa]s?)\b[^.\n]{0,40}(anterior(es)?)?\s*\.?\s*$/i;
const RE_ALEM = /^\s*(al[ée]m\s+d[oa]s?\s+anterior(es)?|mais os anteriores|os anteriores e)\s*[,;:]?\s*/i;

// só vale como pedido uma linha de instrução ("adotar…", "utilizar…"), não um texto narrativo que cite o anterior
const linhas = (x) => String(x).split('\n').map((l) => l.trim()).filter(Boolean);
export function pedeAdotarAnterior(data) {
  return Object.values(data || {}).some((x) => typeof x === 'string' && linhas(x).some((l) => ehInstrucao(l) && RE_ADOTAR.test(l)));
}
const soInstrucoes = (x) => linhas(x).length > 0 && linhas(x).every((l) => ehInstrucao(l));

// recs: vínculos em ordem cronológica ({ id, data }); devolve cópias com os campos herdados
export function herdarDoAnterior(recs) {
  const out = [];
  for (const r of recs) {
    const d = { ...r.data };
    const adotar = pedeAdotarAnterior(r.data);
    const anterior = (campo) => { for (let j = out.length - 1; j >= 0; j--) { const x = v(out[j].data[campo]); if (x && !RE_IDEM.test(x)) return x; } return ''; };
    for (const c of CAMPOS_HERDADOS) {
      const atual = v(d[c]);
      if (c === 'vias' && RE_ALEM.test(atual)) {
        const ant = anterior('vias');
        const resto = atual.replace(RE_ALEM, '').trim();
        if (ant) d.vias = [ant.replace(/[.;,\s]+$/, ''), resto].filter(Boolean).join('; ');
        continue;
      }
      // o campo só com a instrução de adotar também é substituído pelo do anterior
      if (RE_IDEM.test(atual) || (adotar && (!atual || soInstrucoes(atual)))) {
        const ant = anterior(c);
        if (ant) { d[c] = ant; d[`${c}Herdado`] = true; }
      }
    }
    out.push({ ...r, data: d });
  }
  return out;
}
