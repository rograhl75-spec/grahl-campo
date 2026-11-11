// ======================================================================
// Banco de ruído e vibração de máquinas e equipamentos
// (tratores, colhedoras, pulverizadores, máquinas de construção, portáteis…).
//
// Os VALORES ficam nos registros "paradigma" (mesma base dos veículos medidos),
// com o campo "categoriaMaquina" e a "origemDado" (medição própria, literatura,
// declaração do fabricante, laudo de terceiro). Este arquivo traz só o catálogo
// de categorias, os limites legais e os cálculos de apoio: nenhum valor de
// medição é inventado aqui.
// ======================================================================
import { num } from './paradigmas.js';

export const ORIGEM_DADO = [
  'Medição própria (perícia / laudo)',
  'Laudo de terceiro (perito do processo, LTCAT, PPRA/PGR)',
  'Literatura técnica (artigo, dissertação, tese)',
  'Declaração do fabricante (manual / Diretiva de Máquinas)',
  'Banco de dados público (ex.: Portale Agenti Fisici – INAIL)',
];

// grupo, código, nome, agentes relevantes, eixo dominante típico da VCI e fatores que mais influenciam
export const CATEGORIAS_MAQUINA = [
  { cod: 'AG-TSC', grupo: 'Agrícola', nome: 'Trator agrícola sem cabine (plataforma aberta / com arco)', agentes: ['Ruído', 'VCI'], eixo: 'z (vertical); x em gradagem', fatores: 'Rotação do motor, marcha, implemento (grade, subsolador, roçadeira), profundidade, rugosidade do terreno, pressão e desgaste dos pneus, assento sem suspensão.' },
  { cod: 'AG-TCO', grupo: 'Agrícola', nome: 'Trator agrícola com cabine original de fábrica', agentes: ['Ruído', 'VCI'], eixo: 'z', fatores: 'Isolamento acústico e vedação da cabine (portas e janelas fechadas?), ar-condicionado, suspensão do assento e da cabine.' },
  { cod: 'AG-TCA', grupo: 'Agrícola', nome: 'Trator agrícola com cabine adaptada / não original (capota)', agentes: ['Ruído', 'VCI'], eixo: 'z', fatores: 'Cabines não originais podem amplificar o ruído por reverberação; confirmar material e vedação.' },
  { cod: 'AG-TFR', grupo: 'Agrícola', nome: 'Trator fruteiro / cafeeiro / estreito', agentes: ['Ruído', 'VCI'], eixo: 'z', fatores: 'Atomizador ou roçadeira acoplados, terreno declivoso, entrelinhas.' },
  { cod: 'AG-MTC', grupo: 'Agrícola', nome: 'Microtrator / motocultivador', agentes: ['Ruído', 'VMB'], eixo: '— (mãos e braços nas rabiças)', fatores: 'Rabiças sem amortecimento, enxada rotativa, motor monocilíndrico.' },
  { cod: 'AG-CGR', grupo: 'Agrícola', nome: 'Colhedora de grãos (automotriz)', agentes: ['Ruído', 'VCI'], eixo: 'z / x', fatores: 'Cabine original ou plataforma aberta (modelos antigos), plataforma de corte, sistema de trilha, tráfego em carreadores.' },
  { cod: 'AG-CCA', grupo: 'Agrícola', nome: 'Colhedora de cana-de-açúcar', agentes: ['Ruído', 'VCI'], eixo: 'z / x', fatores: 'Esteiras ou pneus, corte de base, extratores, terreno sulcado.' },
  { cod: 'AG-CCF', grupo: 'Agrícola', nome: 'Colhedora de café / algodão / forragem', agentes: ['Ruído', 'VCI'], eixo: 'z', fatores: 'Vibradores (café), declividade, plataforma aberta.' },
  { cod: 'AG-PAP', grupo: 'Agrícola', nome: 'Pulverizador autopropelido', agentes: ['Ruído', 'VCI'], eixo: 'z', fatores: 'Barras longas, velocidade de deslocamento, suspensão do chassi.' },
  { cod: 'AG-PLA', grupo: 'Agrícola', nome: 'Conjunto trator + plantadora / semeadora / adubadora', agentes: ['Ruído', 'VCI'], eixo: 'z', fatores: 'Considerar o trator que traciona; distribuidores e turbina (plantio a vácuo) somam ruído.' },
  { cod: 'AG-QUA', grupo: 'Agrícola', nome: 'Quadriciclo / UTV agrícola', agentes: ['Ruído', 'VCI', 'VMB'], eixo: 'z', fatores: 'Marcha, velocidade, carreadores sem pavimento.' },
  { cod: 'FL-MSE', grupo: 'Florestal e portáteis', nome: 'Motosserra', agentes: ['Ruído', 'VMB'], eixo: '—', fatores: 'Sistema antivibratório, afiação da corrente, cilindrada, tipo de madeira.' },
  { cod: 'FL-RCO', grupo: 'Florestal e portáteis', nome: 'Roçadeira costal / lateral motorizada', agentes: ['Ruído', 'VMB'], eixo: '—', fatores: 'Fio de náilon ou lâmina, rotação, empunhadura, manutenção do antivibratório.' },
  { cod: 'FL-DER', grupo: 'Florestal e portáteis', nome: 'Derriçadora / vibradora portátil (café, azeitona)', agentes: ['Ruído', 'VMB'], eixo: '—', fatores: 'Haste longa, motor 2 tempos, tempo diário efetivo.' },
  { cod: 'FL-ATO', grupo: 'Florestal e portáteis', nome: 'Pulverizador / atomizador costal motorizado', agentes: ['Ruído'], eixo: '—', fatores: 'Motor 2 tempos junto às costas e ao ouvido do operador.' },
  { cod: 'FL-SKI', grupo: 'Florestal e portáteis', nome: 'Máquinas florestais (harvester, forwarder, skidder, feller)', agentes: ['Ruído', 'VCI'], eixo: 'z / x / y', fatores: 'Terreno com tocos, cabine nivelada, implemento de corte.' },
  { cod: 'CO-PCA', grupo: 'Construção e terraplenagem', nome: 'Pá carregadeira', agentes: ['Ruído', 'VCI'], eixo: 'x / z', fatores: 'Ciclos de carga, pátio irregular, ar-condicionado.' },
  { cod: 'CO-RET', grupo: 'Construção e terraplenagem', nome: 'Retroescavadeira', agentes: ['Ruído', 'VCI'], eixo: 'z / x', fatores: 'Deslocamento x escavação, assento giratório.' },
  { cod: 'CO-ESC', grupo: 'Construção e terraplenagem', nome: 'Escavadeira hidráulica', agentes: ['Ruído', 'VCI'], eixo: 'x', fatores: 'Esteiras, rompedor hidráulico (eleva muito a VCI e o ruído).' },
  { cod: 'CO-MOT', grupo: 'Construção e terraplenagem', nome: 'Motoniveladora', agentes: ['Ruído', 'VCI'], eixo: 'z', fatores: 'Patrolamento x deslocamento, estradas rurais.' },
  { cod: 'CO-TES', grupo: 'Construção e terraplenagem', nome: 'Trator de esteira (dozer)', agentes: ['Ruído', 'VCI'], eixo: 'x', fatores: 'Esteiras metálicas, escarificador, terreno pedregoso.' },
  { cod: 'CO-ROL', grupo: 'Construção e terraplenagem', nome: 'Rolo compactador', agentes: ['Ruído', 'VCI'], eixo: 'z', fatores: 'Vibração do cilindro ligada ou desligada.' },
  { cod: 'CO-MRT', grupo: 'Construção e terraplenagem', nome: 'Martelete / rompedor / perfuratriz manual', agentes: ['Ruído', 'VMB'], eixo: '—', fatores: 'Pneumático ou elétrico; atividade expressamente prevista no cód. 1.1.5 / 2.0.2 dos decretos previdenciários.' },
  { cod: 'MC-EMP', grupo: 'Movimentação de carga', nome: 'Empilhadeira', agentes: ['Ruído', 'VCI'], eixo: 'z', fatores: 'Rodas maciças, piso com juntas e desníveis, combustão x elétrica.' },
  { cod: 'TR-CAM', grupo: 'Transporte', nome: 'Caminhão / ônibus (ver famílias F1–F8)', agentes: ['Ruído', 'VCI'], eixo: 'z', fatores: 'Use as famílias técnicas F1–F8 do banco de paradigmas.' },
  { cod: 'OUT', grupo: 'Outros', nome: 'Outra máquina ou equipamento', agentes: ['Ruído', 'VCI', 'VMB'], eixo: '', fatores: '' },
];

export const GRUPOS_MAQUINA = [...new Set(CATEGORIAS_MAQUINA.map((c) => c.grupo))];
export const categoriaPorCodigo = (cod) => CATEGORIAS_MAQUINA.find((c) => c.cod === cod) || null;
export const rotuloCategoria = (cod) => { const c = categoriaPorCodigo(cod); return c ? `${c.cod} – ${c.nome}` : (cod || ''); };
export const OPCOES_CATEGORIA = CATEGORIAS_MAQUINA.map((c) => `${c.cod} – ${c.nome}`);
// aceita "AG-TSC" ou "AG-TSC – Trator…"
export const codigoCategoria = (t) => String(t || '').split(' – ')[0].trim();

// Famílias técnicas sugeridas para máquinas (complementam as F1–F8 de caminhões e ônibus)
export const FAMILIAS_MAQUINAS = [
  { codigo: 'A1', descricao: 'Tratores sem cabine (plataforma aberta), motor dianteiro, assento sem suspensão pneumática', criterios: 'Potência, ano/geração, presença de arco, tipo de assento, implemento predominante.' },
  { codigo: 'A2', descricao: 'Tratores com cabine original de fábrica, com isolamento acústico e ar-condicionado', criterios: 'Geração da cabine, suspensão do assento e da cabine, portas fechadas na medição.' },
  { codigo: 'A3', descricao: 'Tratores com cabine adaptada / capota não original', criterios: 'Material da cabine, vedação, reverberação.' },
  { codigo: 'A4', descricao: 'Colhedoras automotrizes (grãos, cana, café, forragem)', criterios: 'Cabine original x plataforma aberta, tipo de rodado (pneu x esteira).' },
  { codigo: 'A5', descricao: 'Pulverizadores autopropelidos', criterios: 'Suspensão do chassi, cabine, velocidade de trabalho.' },
  { codigo: 'C1', descricao: 'Máquinas de construção sobre pneus (pá carregadeira, retroescavadeira, motoniveladora)', criterios: 'Cabine fechada x aberta, ciclo de trabalho.' },
  { codigo: 'C2', descricao: 'Máquinas sobre esteiras (escavadeira, trator de esteira)', criterios: 'Esteira metálica x borracha, rompedor, terreno.' },
  { codigo: 'P1', descricao: 'Ferramentas portáteis motorizadas (motosserra, roçadeira, derriçadora)', criterios: 'Sistema antivibratório, cilindrada, estado de manutenção.' },
];

// Limites e níveis de ação (NR-15 e NR-9, Anexo I – vibrações; Anexo 1 da NR-15 – ruído)
export const LIMITES = {
  ruido: { acao: 80, limite: 85, unidade: 'dB(A)', base: 'NR-15, Anexo 1 (85 dB(A)/8 h, q = 5) e NR-9 (nível de ação: dose de 50%); previdenciário: NEN > 85 dB(A) desde 19/11/2003 (Dec. 4.882/2003; NHO-01)' },
  vciAren: { acao: 0.5, limite: 1.1, unidade: 'm/s²', base: 'NR-9, Anexo I (nível de ação) e NR-15, Anexo 8 (limite), desde 14/08/2014 (Portaria MTE 1.297/2014); NHO-09' },
  vciVdvr: { acao: 9.1, limite: 21.0, unidade: 'm/s^1,75', base: 'NR-9, Anexo I e NR-15, Anexo 8; NHO-09' },
  vmb: { acao: 2.5, limite: 5.0, unidade: 'm/s²', base: 'NR-9, Anexo I e NR-15, Anexo 8; NHO-10' },
};

export function classificar(chave, valor) {
  const L = LIMITES[chave]; const x = num(valor);
  if (!L || !isFinite(x)) return null;
  if (x > L.limite) return { nivel: 'acima', txt: `acima do limite (${String(L.limite).replace('.', ',')} ${L.unidade})` };
  if (x >= L.acao) return { nivel: 'acao', txt: `entre o nível de ação e o limite (${String(L.acao).replace('.', ',')}–${String(L.limite).replace('.', ',')} ${L.unidade})` };
  return { nivel: 'abaixo', txt: `abaixo do nível de ação (${String(L.acao).replace('.', ',')} ${L.unidade})` };
}

// Estatística simples (n, mínimo, mediana, máximo) de um campo numérico
export function estatistica(valores) {
  const v = valores.map(num).filter(isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  const mediana = v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
  return { n: v.length, min: v[0], mediana, max: v[v.length - 1] };
}

export const CAMPOS_ESTAT = [['lavg', 'Ruído – Lavg q=5', 'ruido'], ['leq', 'Ruído – Leq q=3', 'ruido'], ['arep', 'VCI – aren/arep', 'vciAren'], ['vdvrLaudo', 'VCI – VDVR', 'vciVdvr'], ['arenVmb', 'VMB – aren', 'vmb']];

// Resumo por categoria: { cod: { total, lavg: {n,min,mediana,max}, … } }
export function resumoPorCategoria(registros) {
  const out = {};
  for (const r of registros) {
    const cod = codigoCategoria(r.data.categoriaMaquina);
    if (!cod) continue;
    (out[cod] = out[cod] || { total: 0, regs: [] }).total++;
    out[cod].regs.push(r);
  }
  for (const cod of Object.keys(out)) {
    for (const [campo] of CAMPOS_ESTAT) out[cod][campo] = estatistica(out[cod].regs.map((r) => r.data[campo === 'arep' ? (r.data.arep ? 'arep' : 'arenLaudo') : campo]));
    delete out[cod].regs;
  }
  return out;
}

export function ehMaquina(p) {
  const d = p.data || p;
  return !!codigoCategoria(d.categoriaMaquina) || /trator|colhedora|colheitadeira|pulverizador|carregadeira|retroescavadeira|escavadeira|motoniveladora|empilhadeira|motosserra|roçadeira|rocadeira|rolo/i.test(`${d.tipo || ''} ${d.modelo || ''}`);
}

// Instrução para o Claude extrair dados de artigos, manuais e laudos de máquinas
export const PROMPT_MAQUINAS = `Vou incluir no meu banco de ruído e vibração de máquinas e equipamentos os valores que constam do(s) documento(s) anexado(s) (artigo científico, dissertação, tese, manual do fabricante, declaração de emissão, laudo técnico ou LTCAT).

REGRAS
1. Extraia SOMENTE o que está no documento. Não invente, não estime e não arredonde. Campo sem informação = null.
2. Um item por máquina E condição de operação (ex.: o mesmo trator gradeando e roçando = dois itens).
3. Em "categoria" use um destes códigos: ${CATEGORIAS_MAQUINA.map((c) => `${c.cod} (${c.nome})`).join('; ')}.
4. Em "origem" use: "Literatura técnica", "Declaração do fabricante", "Laudo de terceiro", "Banco de dados público" ou "Medição própria".
5. Ruído: informe se o valor é Lavg (q=5), Leq/LEX (q=3) ou nível pontual (NPS). Valor pontual vai em "observacoes" e NÃO em lavg_q5/leq_q3.
6. Vibração de corpo inteiro: aren/A(8) em "arep", VDV(R) em "vdvr_laudo", eixo dominante em "eixo_dominante". Mãos e braços: "aren_vmb".
7. Declaração do fabricante (Diretiva de Máquinas / ISO 5131 / ISO 5008 / EN 1032): copie o valor declarado e a norma de ensaio em "observacoes".
8. Documento de terceiros com pessoas identificadas: NÃO inclua nomes de trabalhadores, segurados ou partes.
9. Em "referencia" escreva a referência completa no padrão ABNT (autores, título, periódico/editora, volume, páginas, ano) e a página/tabela de onde saíram os valores.
10. Números com ponto decimal. Datas no formato DD/MM/AAAA.
11. Responda SOMENTE com um bloco JSON válido, sem texto antes ou depois:

{"veiculos": [{
  "identificacao": {"tipo": "Trator | Colhedora | Pulverizador | Pá carregadeira | Motosserra | Roçadeira | …", "marca": "", "modelo": "", "ano": ""},
  "maquina": {"categoria": "AG-TSC", "origem": "Literatura técnica", "operacao": "gradagem / transporte / roçada…", "implemento": "", "potencia_cv": null, "rotacao_rpm": null, "velocidade_kmh": null, "referencia": ""},
  "caracteristicas": {"familia": "A1", "cabine": "", "ar_condicionado": "", "suspensao_cabine": "", "suspensao_assento": "", "configuracao": "", "via_predominante": "solo / terreno / estrada"},
  "resultados": {"duracao_ruido_min": null, "lavg_q5": null, "leq_q3": null, "jornada_laudo_h": null, "nen_laudo": null, "tempo_vibracao": "", "arep": null, "aren_laudo": null, "vdvr_laudo": null, "eixo_dominante": "", "aren_vmb": null, "ibutg": null},
  "fonte": {"tipo": "Literatura | Fabricante | Judicial | Extrajudicial", "processo": "", "vara": "", "data": "DD/MM/AAAA"},
  "observacoes": "condições do ensaio, norma, página/tabela e qualquer ressalva"
}]}`;
