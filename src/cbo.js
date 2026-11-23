// ======================================================================
// CBO 2002 (Classificação Brasileira de Ocupações – MTE): tabela de ocupações em public/bases/cbo2002.json
// ([["9503-05", "Supervisor de manutenção eletromecânica"], …]) e sugestão do código pelo cargo, pela função,
// pelo setor e pelas atividades do vínculo. A sugestão é só um ponto de partida: quem escolhe é o signatário.
// ======================================================================

let tabela = null;
let carregando = null;

// para os testes (e para quem já tem a tabela em memória)
export function definirTabelaCbo(linhas) { tabela = Array.isArray(linhas) ? linhas : null; }

export async function carregarCbo() {
  if (tabela) return tabela;
  if (!carregando) {
    carregando = (async () => {
      try {
        const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
        const r = await fetch(`${base}bases/cbo2002.json`);
        if (!r.ok) return null;
        tabela = await r.json();
        return tabela;
      } catch { return null; } finally { carregando = null; }
    })();
  }
  return carregando;
}

const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos', 'a', 'o', 'as', 'os', 'para', 'com', 'por', 'sem', 'ao', 'aos', 'ou',
  'que', 'se', 'um', 'uma', 'seu', 'sua', 'atividades', 'atividade', 'trabalho', 'trabalhos', 'empresa', 'cliente', 'clientes', 'geral', 'outros', 'outras', 'tipo']);
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// radical curto: "manutenção" e "manutenções", "elétrica" e "eletromecânica" se encontram pelos 5 primeiros caracteres
const raiz = (w) => (w.length > 5 ? w.slice(0, 5) : w);
const palavras = (t) => norm(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !PARADAS.has(w));

// "950305", "9503-05", "9503.05 – Supervisor…" → "9503-05"
export function codigoCbo(t) {
  const m = String(t || '').match(/\b(\d{4})[-.\s]?(\d{2})\b/);
  return m ? `${m[1]}-${m[2]}` : '';
}
export const tituloCbo = (cod, lst = tabela) => ((lst || []).find(([k]) => k === codigoCbo(cod)) || [])[1] || '';

// código + título para o PPP ("9503-05 – Supervisor de manutenção eletromecânica")
export function cboComTitulo(t, lst = tabela) {
  const cod = codigoCbo(t);
  if (!cod) return String(t || '').trim();
  if (/[a-zà-ú]{3}/i.test(String(t).replace(/\b\d{4}[-.\s]?\d{2}\b/, ''))) return String(t).trim().replace(/\b(\d{4})[.\s]?(\d{2})\b/, '$1-$2');
  const tit = tituloCbo(cod, lst);
  return tit ? `${cod} – ${tit}` : cod;
}

// sugestões para o vínculo: o cargo, a função e o setor pesam mais que o texto das atividades
export function sugerirCbo(vinculo, lst = tabela, n = 5) {
  if (!lst || !lst.length) return [];
  const x = vinculo.data || vinculo || {};
  const forte = new Map();
  for (const w of palavras(`${x.cargo || ''} ${x.funcao || ''} ${x.setor || ''}`)) forte.set(raiz(w), 3);
  for (const w of palavras(`${x.profissiografia || ''} ${x.atividades || ''}`).slice(0, 400)) if (!forte.has(raiz(w))) forte.set(raiz(w), (forte.get(raiz(w)) || 0) + 0.25);
  if (!forte.size) return [];
  const pontos = [];
  for (const [cod, tit] of lst) {
    const ws = [...new Set(palavras(tit).map(raiz))];
    if (!ws.length) continue;
    let p = 0; let fortes = 0;
    for (const w of ws) {
      const peso = forte.get(w) || 0;
      p += Math.min(peso, 3);
      if (peso >= 3) fortes += 1;
    }
    if (!fortes) continue; // ao menos uma palavra do cargo, da função ou do setor
    // títulos com palavras que não aparecem no vínculo perdem pontos (evita "supervisor de …" qualquer)
    const faltam = ws.filter((w) => !forte.has(w)).length;
    // sem detalhe no vínculo, a ocupação geral ("clínico geral", "em geral") vem antes das especialidades
    const geral = /\bgera(?:l|is)\b/i.test(tit) && !forte.has('geral') ? 0.9 : 0;
    pontos.push({ codigo: cod, titulo: tit, pontos: p - (faltam - (geral ? 1 : 0)) * 0.8 + fortes * 0.5 + geral * 0.1 });
  }
  return pontos.sort((a, b) => b.pontos - a.pontos || a.titulo.length - b.titulo.length).slice(0, n);
}
