import { linhasFichaFds, FONTE_FICHA_FDS } from '../fds.js';

// Uma ficha por produto químico do caso (dados da FDS: seções 2, 3, 8 e 9).
// Sai uma vez por documento: os modelos chamam no ponto da avaliação química e o
// marcador em "dados" evita repetir quando mais de uma seção trata de químicos.
export function fichasFds(d, dados, { intro = true } = {}) {
  const lista = (dados.produtos || []).filter((p) => String(p.data.nome || '').trim());
  if (!lista.length || dados._fdsImpressas) return false;
  dados._fdsImpressas = true;
  if (intro) d.texto(`${lista.length > 1 ? 'Os produtos químicos identificados têm' : 'O produto químico identificado tem'} as características abaixo, transcritas da respectiva Ficha com Dados de Segurança (FDS – ABNT NBR 14725): identificação dos perigos (seção 2), composição (seção 3), controle de exposição e proteção individual (seção 8) e propriedades físicas e químicas (seção 9). Os dados da FDS caracterizam o produto; o enquadramento segue os critérios legais da finalidade deste documento.`);
  for (const p of lista) {
    const linhas = linhasFichaFds(p.data);
    d.quadro(`Ficha do produto – ${p.data.nome}`, [['Item', 'Conteúdo'], ...linhas],
      { larguras: [0.26, 0.74], tam: 8.5, alinhar: 'left', fonte: FONTE_FICHA_FDS(p.data) });
  }
  return true;
}
