// ======================================================================
// Integração direta com a API do Claude (Anthropic), sem copiar e colar.
//
// O app roda no navegador, sem servidor próprio: a chamada sai do aparelho com a chave de API do usuário,
// guardada só neste aparelho (localStorage – não vai para a nuvem do app). A conta de API é separada da
// assinatura do claude.ai e cobra por uso; o limite de gasto mensal se define na plataforma da Anthropic.
//
// - modelo: Claude Opus 5.5 por padrão (pode ser trocado em Configurações);
// - PDFs vão dentro da própria pergunta (a Files API não aceita chamadas do navegador): até ~22 MB e 550 páginas
//   como PDF (o Claude vê texto e imagens); acima disso, o texto extraído página a página (páginas só com imagem ficam
//   sem conteúdo – o app avisa);
// - imagens (fotos) vão reduzidas, em JPEG; textos (.txt, .md, .json) vão como texto;
// - pesquisa na internet (FDS, químicos) pela ferramenta web_search do próprio Claude;
// - recusa por política de segurança: o próprio servidor tenta o modelo alternativo (fallback "default").
// ======================================================================
// o SDK só é carregado no primeiro envio (não pesa na abertura do app)
let sdk = null;
const carregarSdk = async () => (sdk ||= await import('@anthropic-ai/sdk'));

export const MODELOS_CLAUDE = [
  { id: 'claude-opus-5-5', nome: 'Claude Opus 5.5 (padrão – recomendado)', entrada: 4, saida: 20 },
  { id: 'claude-sonnet-5-5', nome: 'Claude Sonnet 5.5 (metade do preço)', entrada: 2, saida: 10 },
  { id: 'claude-fable-5-2', nome: 'Claude Fable 5.2 (o mais capaz – o dobro do Opus)', entrada: 8, saida: 40 },
];
export const ESFORCOS = [['medium', 'Médio (mais rápido e barato)'], ['high', 'Alto (padrão do app)'], ['xhigh', 'Muito alto (casos complexos)']];
const CHAVE_LS = 'grahl.claude.api';
const PADRAO = { chave: '', modelo: 'claude-opus-5-5', esforco: 'high', cache: '1h' };
// reaproveitamento dos autos (cache de prompt): o mesmo PDF reenviado dentro do prazo custa 10% da leitura
export const OPCOES_CACHE = [['1h', 'Por 1 hora (padrão: várias etapas seguidas no mesmo caso)'], ['5m', 'Por 5 minutos (envios em sequência rápida)'], ['nao', 'Desligado']];

export function configClaude() {
  try { return { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE_LS) || '{}') }; } catch { return { ...PADRAO }; }
}
export function salvarConfigClaude(cfg) {
  const atual = configClaude();
  try { localStorage.setItem(CHAVE_LS, JSON.stringify({ ...atual, ...cfg })); } catch { /* sem armazenamento local */ }
}
export const temClaude = () => !!configClaude().chave;

function cliente(cfg) {
  const Anthropic = sdk.default;
  // dangerouslyAllowBrowser: o app é pessoal e a chave é do próprio usuário, guardada só no aparelho dele
  return new Anthropic({ apiKey: cfg.chave, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 30 * 60 * 1000 });
}

// foto grande → JPEG com no máximo 1568 px no maior lado (limite útil do modelo para imagens)
async function reduzirImagem(blob) {
  const bmp = await createImageBitmap(blob);
  const f = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const out = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
  const buf = new Uint8Array(await out.arrayBuffer());
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

const tipoDo = (a) => a.mime || a.blob?.type || (/\.pdf$/i.test(a.nome || '') ? 'application/pdf' : /\.(jpe?g|png|webp|gif|heic)$/i.test(a.nome || '') ? 'image/jpeg' : 'text/plain');

// Limites de uma pergunta: 32 MB no total e 1 milhão de tokens (entrada + resposta). Cada página de PDF enviada
// inteira custa texto + imagem (~2 a 3 mil tokens): autos grandes estouram o limite. Por isso, o PDF inteiro só vai
// até ~100 páginas no total; acima disso vai o texto página a página (~500 tokens por página) e as páginas
// digitalizadas (sem texto: CTPS, documentos em imagem) vão como imagem reduzida, até 40 por pergunta.
const MAX_PDF_BYTES = 22 * 1024 * 1024;
const MAX_PAGINAS_PDF_INTEIRO = 100;
const MAX_IMAGENS_ESCANEADAS = 40;
const ORCAMENTO_TOKENS = 850000;
const extraido = new Map(); // chave do PDF → { blocos, avisos } já preparados nesta sessão (a mesma forma mantém o cache)

async function paraBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function abrirPdf(blob) {
  const { carregarPdfjs } = await import('./apendices.js');
  const pdfjs = await carregarPdfjs();
  return pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
}
// página do PDF → JPEG reduzido (base64), para as páginas digitalizadas
async function paginaComoImagem(page) {
  const v0 = page.getViewport({ scale: 1 });
  const escala = Math.min(2, 1100 / Math.max(v0.width, v0.height));
  const vp = page.getViewport({ scale: escala });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  const out = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.7));
  return paraBase64(out);
}
// texto do PDF página a página ("[Página N]"); as páginas sem texto viram imagem (até "vagas")
async function textoDoPdf(pdf, onEtapa, nome, vagas) {
  const partes = []; const imagens = []; let semTexto = 0; let semImagem = 0;
  for (let i = 1; i <= pdf.numPages; i += 1) {
    if (i % 25 === 1) onEtapa?.(`Lendo ${nome} – página ${i} de ${pdf.numPages}…`);
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const t = tc.items.map((x) => `${x.str}${x.hasEOL ? '\n' : ' '}`).join('').replace(/[ \t]+/g, ' ').trim();
    if (t.length < 40) {
      semTexto += 1;
      if (imagens.length < vagas && typeof document !== 'undefined') {
        try { imagens.push({ pagina: i, data: await paginaComoImagem(page) }); partes.push(`[Página ${i}]\n(página digitalizada – enviada como imagem, logo após este texto)`); continue; } catch { /* sem canvas */ }
      }
      semImagem += 1;
      partes.push(`[Página ${i}]\n${t || '(página digitalizada, sem texto)'}`);
      continue;
    }
    partes.push(`[Página ${i}]\n${t}`);
  }
  return { texto: partes.join('\n\n'), imagens, semTexto, semImagem, paginas: pdf.numPages };
}
const tokensDe = (blocos) => blocos.reduce((s, b) => s + (b.type === 'text' ? b.text.length / 3.2 : b.type === 'image' ? 1600 : b.type === 'document' ? (b._paginas || 1) * 2500 : 0), 0);

// anexos: [{ blob, nome, mime, chave? }] → blocos de conteúdo. Os PDFs com "chave" (autos do caso) vão primeiro e
// sempre na mesma ordem e forma, com a marca de cache no último bloco deles: o começo da pergunta fica igual entre
// os envios do caso e a API reaproveita a leitura (cache de prompt). Devolve também os avisos.
async function blocosDosAnexos(anexos, onEtapa, cache) {
  const blocos = []; const avisos = [];
  const ordem = [...anexos.filter((a) => a.chave).sort((x, y) => String(x.chave).localeCompare(String(y.chave))), ...anexos.filter((a) => !a.chave)];
  // páginas de todos os PDFs: decide se cabem inteiros
  const pdfs = new Map();
  for (const a of ordem) if (/pdf/i.test(tipoDo(a)) && !(a.chave && extraido.get(a.chave))) { onEtapa?.(`Abrindo ${a.nome || 'PDF'}…`); pdfs.set(a, await abrirPdf(a.blob)); }
  const totalPaginas = [...pdfs.values()].reduce((s, p) => s + p.numPages, 0);
  const totalBytes = [...pdfs.keys()].reduce((s, a) => s + a.blob.size, 0);
  const inteiros = totalPaginas <= MAX_PAGINAS_PDF_INTEIRO && totalBytes <= MAX_PDF_BYTES;
  let vagas = MAX_IMAGENS_ESCANEADAS;
  let ultimoFixo = -1;
  for (const a of ordem) {
    const mime = tipoDo(a);
    const nome = a.nome || 'documento.pdf';
    if (/pdf/i.test(mime)) {
      let prontos = a.chave && extraido.get(a.chave);
      if (!prontos) {
        const pdf = pdfs.get(a);
        if (inteiros) {
          prontos = { blocos: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await paraBase64(a.blob) }, title: nome, _paginas: pdf.numPages }], avisos: [] };
        } else {
          const r = await textoDoPdf(pdf, onEtapa, nome, vagas);
          vagas -= r.imagens.length;
          const bs = [{ type: 'text', text: `Documento "${nome}" (${r.paginas} páginas) – texto extraído página a página${r.imagens.length ? `; as ${r.imagens.length} página(s) digitalizada(s) seguem como imagem` : ''}:\n\n${r.texto}` }];
          for (const im of r.imagens) bs.push({ type: 'text', text: `${nome} – página ${im.pagina} (imagem):` }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: im.data } });
          prontos = { blocos: bs, avisos: r.semImagem ? [`${nome}: ${r.semImagem} página(s) digitalizada(s) não couberam como imagem (limite de ${MAX_IMAGENS_ESCANEADAS} por envio) e ficaram sem leitura.`] : [] };
        }
        if (a.chave) extraido.set(a.chave, prontos);
      }
      blocos.push(...prontos.blocos); avisos.push(...prontos.avisos);
      if (a.chave) ultimoFixo = blocos.length - 1;
    } else if (/^image\//i.test(mime)) {
      // o nome vai antes da imagem ("Foto 01"), para o Claude saber qual é qual
      if (a.nome) blocos.push({ type: 'text', text: a.nome });
      blocos.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await reduzirImagem(a.blob) } });
    } else if (/text|json|markdown|csv/i.test(mime) || /\.(txt|md|json|csv)$/i.test(a.nome || '')) {
      blocos.push({ type: 'text', text: `Arquivo anexado – ${a.nome || 'texto'}:\n\n${await a.blob.text()}` });
    } else {
      throw new Error(`O arquivo "${a.nome}" não pode ir direto ao Claude (envie em PDF, imagem ou texto). Arquivos do Word: salve como PDF.`);
    }
  }
  const tokens = tokensDe(blocos);
  if (tokens > ORCAMENTO_TOKENS) throw new Error(`Os anexos somam cerca de ${Math.round(tokens / 1000)} mil tokens, acima do limite de uma pergunta ao Claude (~${Math.round(ORCAMENTO_TOKENS / 1000)} mil). Separe dos autos só as peças necessárias (inicial, despachos, PPP/LTCAT, CTPS/CNIS, laudos) num PDF menor e anexe-o no item A.`);
  // cópias (os blocos preparados ficam guardados para o próximo envio): sem o campo interno e com a marca de cache
  const saida = blocos.map(({ _paginas, cache_control, ...b }) => b);
  if (ultimoFixo >= 0 && cache !== 'nao') saida[ultimoFixo].cache_control = { type: 'ephemeral', ...(cache === '1h' ? { ttl: '1h' } : {}) };
  return { blocos: saida, avisos };
}

// texto final da resposta: os blocos de texto, sem a fala que antecede cada pesquisa na internet
function textoDaResposta(conteudos) {
  const partes = [];
  for (const blocos of conteudos) {
    blocos.forEach((b, i) => {
      if (b.type !== 'text') return;
      const depois = blocos.slice(i + 1);
      if (depois.some((x) => x.type === 'server_tool_use')) return; // "Vou pesquisar…" antes de uma busca
      partes.push(b.text);
    });
  }
  return partes.join('').trim();
}

// custo: entrada normal, gravação do cache (1,25× em 5 min; 2× em 1 h), leitura do cache (0,1×) e saída
export function custoEstimado(modelo, uso, cache = '1h') {
  const m = MODELOS_CLAUDE.find((x) => x.id === modelo) || MODELOS_CLAUDE[0];
  const fatorGrava = cache === '5m' ? 1.25 : 2;
  return ((uso.entrada || 0) * m.entrada + (uso.gravado || 0) * m.entrada * fatorGrava + (uso.lido || 0) * m.entrada * 0.1 + (uso.saida || 0) * m.saida) / 1e6;
}
export function economiaDoCache(modelo, uso) {
  const m = MODELOS_CLAUDE.find((x) => x.id === modelo) || MODELOS_CLAUDE[0];
  return ((uso.lido || 0) * m.entrada * 0.9) / 1e6;
}

// Pergunta ao Claude com a instrução do app e os anexos. Devolve { texto, uso, custo, modelo }.
// onEtapa(texto) informa o andamento (envio dos arquivos, caracteres recebidos).
export async function perguntarClaude({ instrucao, anexos = [], web = false, maxTokens = 64000, onEtapa } = {}) {
  const cfg = configClaude();
  if (!cfg.chave) throw new Error('Configure a chave de API do Claude em Configurações → Claude (API).');
  await carregarSdk();
  const client = cliente(cfg);
  try {
    const r = await blocosDosAnexos(anexos, onEtapa, cfg.cache);
    const resposta = await conversar(client, cfg, r.blocos, instrucao, web, maxTokens, onEtapa);
    return { ...resposta, avisos: r.avisos, custo: custoEstimado(cfg.modelo, resposta.uso, cfg.cache), economia: economiaDoCache(cfg.modelo, resposta.uso) };
  } catch (e) {
    throw new Error(mensagemDeErro(e));
  }
}

async function conversar(client, cfg, blocos, instrucao, web, maxTokens, onEtapa) {
  const pergunta = { role: 'user', content: [...blocos, { type: 'text', text: instrucao }] };
  let messages = [pergunta];
  const conteudos = []; const uso = { entrada: 0, gravado: 0, lido: 0, saida: 0 };
  let recebidos = 0; let final = null;
  // pesquisa na internet: o servidor pode pausar a volta (pause_turn); reenvia a conversa para continuar
  for (let volta = 0; volta < 6; volta += 1) {
    onEtapa?.(volta ? 'Continuando a pesquisa…' : 'O Claude está trabalhando…');
    const stream = client.beta.messages.stream({
      model: cfg.modelo,
      max_tokens: maxTokens,
      output_config: { effort: cfg.esforco || 'high' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages,
      ...(web ? { tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 10 }] } : {}),
    });
    stream.on('text', (delta) => { recebidos += delta.length; onEtapa?.(`Recebendo a resposta… ${Math.round(recebidos / 1000)} mil caracteres`); });
    final = await stream.finalMessage();
    uso.entrada += final.usage.input_tokens || 0;
    uso.gravado += final.usage.cache_creation_input_tokens || 0;
    uso.lido += final.usage.cache_read_input_tokens || 0;
    uso.saida += final.usage.output_tokens || 0;
    conteudos.push(final.content);
    if (final.stop_reason !== 'pause_turn') break;
    messages = [pergunta, { role: 'assistant', content: conteudos.flat() }];
  }
  if (final.stop_reason === 'refusal') throw new Error('O Claude recusou o pedido (política de segurança). Revise a instrução ou os anexos e tente de novo.');
  const texto = textoDaResposta(conteudos);
  if (!texto) throw new Error('O Claude não devolveu texto. Tente de novo.');
  return { texto, uso, modelo: final.model || cfg.modelo, cortada: final.stop_reason === 'max_tokens' };
}

function mensagemDeErro(e) {
  const Anthropic = sdk?.default;
  if (!Anthropic) return e?.message || String(e);
  if (e instanceof Anthropic.AuthenticationError) return 'Chave de API inválida. Confira em Configurações → Claude (API).';
  if (e instanceof Anthropic.PermissionDeniedError) return 'A chave não tem permissão para este modelo ou recurso. Confira a conta na plataforma da Anthropic.';
  if (e instanceof Anthropic.RateLimitError) return 'Limite de uso da conta atingido. Aguarde um minuto e tente de novo.';
  if (e instanceof Anthropic.BadRequestError) {
    const m = String(e.message || '');
    if (/credit|balance|billing/i.test(m)) return 'Sem créditos na conta de API. Adicione créditos na plataforma da Anthropic (Billing).';
    if (/too long|too large|pages|exceed|prompt is too long/i.test(m)) return `Os anexos excedem o limite de uma pergunta ao Claude. Separe dos autos só as peças necessárias (inicial, despachos, PPP/LTCAT, CTPS/CNIS, laudos) num PDF menor. (Detalhe da API: ${m.slice(0, 160)})`;
    return `Pedido recusado pela API: ${m}`;
  }
  if (e instanceof Anthropic.APIConnectionTimeoutError) return 'A resposta demorou demais. Tente de novo (com autos grandes, prefira o Wi-Fi).';
  if (e instanceof Anthropic.APIConnectionError) return 'Sem conexão com a API do Claude. Verifique a internet; com autos muito grandes, tente pelo Wi-Fi.';
  if (e instanceof Anthropic.APIError) return `Erro da API do Claude (${e.status}): ${e.message}`;
  return e?.message || String(e);
}

// teste rápido da chave (Configurações)
export async function testarClaude() {
  const r = await perguntarClaude({ instrucao: 'Responda apenas: OK', maxTokens: 2000 });
  return r;
}
