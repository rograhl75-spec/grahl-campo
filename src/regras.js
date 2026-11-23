// ======================================================================
// Enquadramento pelas regras de cada período (tempus regit actum), para os agentes avaliados sem medição:
//  1) até 05/03/1997: consta dos Decretos 53.831/64 ou 83.080/79 → "Caracteriza" (qualitativa, por presunção);
//     não consta → "Não enquadrável";
//  2) a partir de 06/03/1997: não consta do Anexo IV (rol exaustivo) → "Não enquadrável";
//     consta e é de avaliação quantitativa (NR-15, Anexos 11 e 12) sem medição → "Não caracteriza" (vai ao PPP como
//     presente, intensidade não quantificada); consta e é qualitativa (Anexos 13 e 13-A) → "Caracteriza";
//  3) a partir de 08/10/2014: Grupo 1 da LINACH com registro no CAS e no Anexo IV → "Caracteriza" (qualitativa;
//     Dec. 3.048/1999, art. 68, § 4º; IN 128/2022, art. 298).
// Químicos e eletricidade (cód. 1.1.8 até 05/03/1997; fora do Anexo IV depois). Biológicos e físicos medidos ficam
// com o signatário. O código digitado no agente prevalece sobre o banco ("Não consta do Anexo IV" vale como resposta).
// ======================================================================
import { anexoQuantitativo, bancoDoAgente, casValido } from './docx/agentesQuadros.js';
import { tecnicaDoAgente, agenteNoVinculo } from './enquadramento.js';
import { codigosDoDecreto } from './quimicos.js';
import { cancerigenoAnexoIV, codigosNosDecretos } from './normas.js';

const v = (x) => (x === undefined || x === null ? '' : String(x).trim());
const semAc = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const curto = (n) => v(n).replace(/\s+\(.*$/, '');
const consta = (t) => /^\s*\d/.test(v(t));
const naoConsta = (t) => /n[aã]o\s+(consta|h[aá])|sem c[oó]digo|fora do anexo/i.test(v(t));
const limpaCod = (t) => v(t).replace(/\s*\((?:pela|por) (?:classe|família)[^)]*\)/gi, '').trim();

function temMedicao(a, dados) {
  const k = semAc(curto(a.data.nome)).slice(0, 12);
  return (dados.medicoes || []).some((m) => /qu[ií]m|Outro/i.test(m.data.agente || '') && semAc(`${m.data.descricao || ''} ${m.data.obs || ''}`).includes(k));
}

// código de cada época: o digitado no agente; senão, o do banco de químicos; senão, o da tabela do Manual
function codigos(a, dados) {
  const x = a.data;
  const q = bancoDoAgente(a, dados.quimicos);
  const conferir = [];
  const daBase = (decs) => {
    if (!q) return '';
    const cods = decs.map((d) => [d, codigosDoDecreto(q.data, d)]).filter(([, c]) => c);
    if (cods.some(([d]) => /por fam[ií]lia|pela classe/i.test(String(q.data.codDecretos || '').split('\n').find((l) => l.includes(`${d}/`)) || ''))) conferir.push('código do banco por família');
    return cods.map(([d, c]) => `${c} do Dec. ${d}`).join('; ');
  };
  const tab = codigosNosDecretos(x.nome) || {};
  const ate = consta(x.codAte97) ? v(x.codAte97) : naoConsta(x.codAte97) ? '' : daBase(['53.831', '83.080']) || tab.ate97 || '';
  const desde = consta(x.codDesde97) ? v(x.codDesde97) : naoConsta(x.codDesde97) ? '' : daBase(['3.048']) || tab.desde97 || '';
  return { ate: limpaCod(ate), desde: limpaCod(desde), q, conferir };
}

export function regraDoAgente(a, dados) {
  const x = a.data;
  const tipo = x.tipo || 'Químico';
  const eletr = tipo === 'Físico' && /eletric|el[ée]tric|tens[ãa]o/i.test(x.nome || '');
  if (tipo !== 'Químico' && !eletr) return null;
  if (eletr) {
    const ate = consta(x.codAte97) ? v(x.codAte97) : '1.1.8 do Dec. 53.831/64';
    return { resAte97: 'Caracteriza', resDesde97: 'Não enquadrável', resDesde2014: '', codAte97: ate, codDesde97: 'Não consta do Anexo IV',
      motivo: 'até 05/03/1997, cód. 1.1.8 (tensão acima de 250 V); depois, fora do Anexo IV', conferir: [] };
  }
  const { ate, desde, q, conferir } = codigos(a, dados);
  const out = { codAte97: ate || 'Não consta dos Decretos 53.831/64 e 83.080/79', codDesde97: desde || 'Não consta do Anexo IV', conferir, resDesde2014: '' };
  out.resAte97 = ate ? 'Caracteriza' : 'Não enquadrável';
  const partes = [ate ? `até 05/03/1997, presunção (${ate.split(';')[0]})` : 'até 05/03/1997, sem código nos decretos'];
  if (!desde) {
    out.resDesde97 = 'Não enquadrável';
    partes.push('a partir de 06/03/1997, fora do Anexo IV');
  } else {
    const anexo = anexoQuantitativo(a, dados.quimicos) || (/^Quantitativa/.test(tecnicaDoAgente(a, false, { linach: false })) ? 'Anexo 11' : '');
    if (anexo && temMedicao(a, dados)) {
      out.resDesde97 = v(x.resDesde97) && x.resDesde97 !== 'A confirmar' ? x.resDesde97 : 'A confirmar';
      partes.push(`a partir de 06/03/1997, quantitativa (${anexo}) – resultado pela medição`);
      out.medido = true;
    } else if (anexo) {
      out.resDesde97 = 'Não caracteriza';
      partes.push(`a partir de 06/03/1997, quantitativa (NR-15, ${anexo}) sem medição – não caracteriza; vai ao PPP como não quantificada`);
    } else {
      out.resDesde97 = 'Caracteriza';
      partes.push(`a partir de 06/03/1997, qualitativa (${tecnicaDoAgente(a, false, { linach: false }).replace(/^Qualitativa – /, '')})`);
    }
    // LINACH Grupo 1 com CAS e no Anexo IV: qualitativa a partir de 08/10/2014
    const can = cancerigenoAnexoIV(x.nome);
    const linach = (q && /Grupo 1\b/.test(v(q.data.linach))) || !!can;
    const cas = casValido(x.cas) || casValido(q && q.data.cas) || (can && can.cas) || '';
    if (linach && cas && out.resDesde97 !== 'Caracteriza') {
      out.resDesde2014 = 'Caracteriza';
      partes.push('a partir de 08/10/2014, LINACH Grupo 1 com CAS – qualitativa');
    } else if (linach && !cas) out.conferir.push('LINACH Grupo 1 sem CAS: não se aplica a avaliação qualitativa do art. 298');
  }
  out.motivo = partes.join('; ');
  return out;
}

// texto da fundamentação pelas regras (substitui o texto condicional, quando o signatário escolhe)
export function fundamentacaoPelasRegras(a, r) {
  const t = [];
  t.push(r.resAte97 === 'Caracteriza'
    ? `Até 05/03/1997, o agente consta do cód. ${r.codAte97.replace(/^cód\.\s*/, '')}, e o enquadramento é qualitativo, por presunção de exposição (IN 128/2022, art. 297, I).`
    : 'Até 05/03/1997, o agente não consta dos Decretos 53.831/64 e 83.080/79: não há enquadramento por ele.');
  if (r.resDesde97 === 'Não enquadrável') t.push('A partir de 06/03/1997, o agente não consta do Anexo IV dos Decretos 2.172/97 e 3.048/99, cujo rol de agentes é exaustivo: não é enquadrável, ainda que presente no ambiente.');
  else if (r.resDesde97 === 'Não caracteriza') t.push(`A partir de 06/03/1997, o agente consta do Anexo IV (cód. ${r.codDesde97.replace(/^cód\.\s*/, '')}) e tem limite de tolerância na NR-15, com avaliação quantitativa (IN 128/2022, art. 297, II). Sem medição da concentração no ambiente, a exposição não é caracterizada; o agente consta do PPP como presente, com a intensidade "não quantificada".`);
  else if (r.resDesde97 === 'Caracteriza') t.push(`A partir de 06/03/1997, o agente consta do Anexo IV (cód. ${r.codDesde97.replace(/^cód\.\s*/, '')}), com avaliação qualitativa (IN 128/2022, art. 297, II), e a exposição é caracterizada nas atividades descritas.`);
  if (r.resDesde2014 === 'Caracteriza') t.push('A partir de 08/10/2014, por constar do Grupo 1 da LINACH (Portaria Interministerial nº 9/2014), com registro no CAS e presença no Anexo IV, a avaliação é qualitativa (Decreto nº 3.048/1999, art. 68, §§ 2º a 4º; IN 128/2022, art. 298), e a exposição é caracterizada.');
  return t.join(' ');
}

// propostas para o caso: o que muda em cada agente (só resultados e códigos vazios; o texto, se pedido)
export function propostasDasRegras(dados) {
  const out = [];
  for (const a of dados.agentes || []) {
    if (!dados.periodos.some((r, i) => agenteNoVinculo(a, i))) continue;
    const r = regraDoAgente(a, dados);
    if (!r) continue;
    const x = a.data;
    const campos = {};
    for (const k of ['resAte97', 'resDesde97', 'resDesde2014']) if (v(r[k]) !== v(x[k]) && !(k === 'resDesde97' && r.medido)) campos[k] = r[k];
    for (const k of ['codAte97', 'codDesde97']) if (!v(x[k])) campos[k] = r[k];
    if (!Object.keys(campos).length) continue;
    out.push({ a, r, campos });
  }
  return out;
}
