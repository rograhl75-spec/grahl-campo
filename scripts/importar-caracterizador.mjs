// Importa as bases do Caracterizador Pericial (outro app do signatário) para src/data/caracterizador/.
// Lê os arquivos de dados como TEXTO e converte os literais (const X = …) pela árvore sintática (acorn),
// sem executar o código. Uso: node scripts/importar-caracterizador.mjs <pasta do caracterizador-pericial>
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as acorn from 'acorn';

const pasta = process.argv[2];
if (!pasta) { console.error('Informe a pasta do caracterizador-pericial.'); process.exit(1); }
const ARQS = ['normas-base.js', 'atualizacoes.js', 'biblioteca.js', 'in128-artigos.js', 'nr15-anexo11.js', 'nr15-anexo13.js', 'nr16.js'];

const consts = {};
function valor(n) {
  switch (n.type) {
    case 'Literal': return n.value;
    case 'TemplateLiteral': if (n.expressions.length) throw new Error('template com expressão'); return n.quasis.map((q) => q.value.cooked).join('');
    case 'ArrayExpression': return n.elements.map((e) => (e ? valor(e) : null));
    case 'ObjectExpression': {
      const o = {};
      for (const p of n.properties) {
        if (p.type !== 'Property') throw new Error(`propriedade ${p.type}`);
        const k = p.key.type === 'Identifier' && !p.computed ? p.key.name : valor(p.key);
        o[k] = valor(p.value);
      }
      return o;
    }
    case 'UnaryExpression': if (n.operator === '-') return -valor(n.argument); if (n.operator === '+') return +valor(n.argument); break;
    case 'BinaryExpression': if (n.operator === '+') return valor(n.left) + valor(n.right); break;
    case 'Identifier': if (n.name in consts) return consts[n.name]; if (n.name === 'undefined') return null; break;
    default: break;
  }
  throw new Error(`nó não suportado: ${n.type} ${n.name || n.operator || ''}`);
}

for (const a of ARQS) {
  const src = await readFile(join(pasta, 'dados', a), 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script' });
  for (const st of ast.body) {
    if (st.type !== 'VariableDeclaration') continue;
    for (const dec of st.declarations) {
      try { consts[dec.id.name] = valor(dec.init); } catch (e) { console.warn(`${a}: ${dec.id.name} ignorado (${e.message})`); }
    }
  }
}

const L = consts.LIB || {};
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// base compacta, usada no documento (técnica pelo Manual e códigos por agente)
const manual = {
  fonte: 'Caracterizador Pericial (rograhl75-spec/caracterizador-pericial) – Manual de Aposentadoria Especial do INSS (2018), Decretos e LINACH',
  quantitativos: (L.aq_quant || []).map((r) => ({ nome: String(r[0]).replace(/\s+/g, ' ').trim(), ppm: r[3] || '', mgm3: r[4] || '' })),
  qualitativos: (L.aq_qual || []).map((r) => String(r[0]).replace(/\s+/g, ' ').trim()),
  cancerigenos: (L.ag_cancer || []).map((r) => (Array.isArray(r) ? r.map((x) => String(x ?? '').replace(/\s+/g, ' ').trim()) : r)),
  agentes: (consts.AGENTS || []).map((g) => ({ id: g.id, nome: g.nome, grupo: g.grupo, c53: g.c53 || [], c83: g.c83 || [], cIV: g.cIV || '', nr15: g.nr15 || '', periodos: g.periodos || [] })),
};
// base completa para a consulta normativa
const normas = {
  fonte: manual.fonte,
  marcos: consts.MARCOS || [], agentes: consts.AGENTS || [], teses: consts.TESES || {},
  decreto53831Agentes: L.d53831_ag || [], decreto53831Atividades: L.d53831_at || [], linach: L.linach || [],
  manualQuantitativos: L.aq_quant || [], manualQualitativos: L.aq_qual || [], cancerigenos: L.ag_cancer || [],
  textos: { resumo: L.txt_resumo || [], regressivas: L.txt_regressivas || [], cpc: L.txt_cpc || [], legislacao: L.txt_legcompl || [] },
  in128: consts.IN128 || {}, nr15Anexo11: consts.A11 || [], nr15Anexo13: consts.A13FULL || [], nr16Geral: consts.NR16_GERAL || [], nr16: consts.NR16 || [],
  isoVibracao: consts.ISO_VIB || [],
};
await mkdir('src/data/caracterizador', { recursive: true });
await writeFile('src/data/caracterizador/manual.json', JSON.stringify(manual));
await writeFile('src/data/caracterizador/normas.json', JSON.stringify(normas));
console.log('manual:', manual.quantitativos.length, 'quant.', manual.qualitativos.length, 'qual.', manual.cancerigenos.length, 'cancerígenos', manual.agentes.length, 'agentes');
console.log('normas:', Object.entries(normas).map(([k, x]) => `${k}=${Array.isArray(x) ? x.length : typeof x === 'object' ? Object.keys(x).length : ''}`).join(' '));
