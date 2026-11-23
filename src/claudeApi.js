// ======================================================================
// Integração direta com a API do Claude (Anthropic), sem copiar e colar.
//
// O app roda no navegador, sem servidor próprio: a chamada sai do aparelho com a chave de API do usuário,
// guardada só neste aparelho (localStorage – não vai para a nuvem do app). A conta de API é separada da
// assinatura do claude.ai e cobra por uso; o limite de gasto mensal se define na plataforma da Anthropic.
//
// - modelo: Claude Opus 5.5 por padrão (pode ser trocado em Configurações);
// - PDFs vão pela Files API (até 500 MB por arquivo) e são apagados da conta logo depois da resposta;
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
const PADRAO = { chave: '', modelo: 'claude-opus-5-5', esforco: 'high' };

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

// anexos: [{ blob, nome, mime }] → blocos de conteúdo; devolve também os file_id enviados (para apagar depois)
async function blocosDosAnexos(client, anexos, onEtapa) {
  const blocos = []; const enviados = [];
  for (const a of anexos) {
    const mime = tipoDo(a);
    if (/pdf/i.test(mime)) {
      onEtapa?.(`Enviando ${a.nome || 'PDF'}…`);
      const f = await client.files.upload({ file: await sdk.toFile(a.blob, a.nome || 'documento.pdf', { type: 'application/pdf' }) });
      enviados.push(f.id);
      blocos.push({ type: 'document', source: { type: 'file', file_id: f.id }, title: a.nome || 'documento.pdf' });
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
  return { blocos, enviados };
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

export function custoEstimado(modelo, uso) {
  const m = MODELOS_CLAUDE.find((x) => x.id === modelo) || MODELOS_CLAUDE[0];
  return ((uso.entrada || 0) * m.entrada + (uso.saida || 0) * m.saida) / 1e6;
}

// Pergunta ao Claude com a instrução do app e os anexos. Devolve { texto, uso, custo, modelo }.
// onEtapa(texto) informa o andamento (envio dos arquivos, caracteres recebidos).
export async function perguntarClaude({ instrucao, anexos = [], web = false, maxTokens = 64000, onEtapa } = {}) {
  const cfg = configClaude();
  if (!cfg.chave) throw new Error('Configure a chave de API do Claude em Configurações → Claude (API).');
  await carregarSdk();
  const client = cliente(cfg);
  let enviados = [];
  try {
    const r = await blocosDosAnexos(client, anexos, onEtapa);
    enviados = r.enviados;
    const pergunta = { role: 'user', content: [...r.blocos, { type: 'text', text: instrucao }] };
    let messages = [pergunta];
    const conteudos = []; const uso = { entrada: 0, saida: 0 };
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
      uso.entrada += (final.usage.input_tokens || 0) + (final.usage.cache_creation_input_tokens || 0) + (final.usage.cache_read_input_tokens || 0);
      uso.saida += final.usage.output_tokens || 0;
      conteudos.push(final.content);
      if (final.stop_reason !== 'pause_turn') break;
      messages = [pergunta, { role: 'assistant', content: conteudos.flat() }];
    }
    if (final.stop_reason === 'refusal') throw new Error('O Claude recusou o pedido (política de segurança). Revise a instrução ou os anexos e tente de novo.');
    const texto = textoDaResposta(conteudos);
    if (!texto) throw new Error('O Claude não devolveu texto. Tente de novo.');
    return { texto, uso, custo: custoEstimado(cfg.modelo, uso), modelo: final.model || cfg.modelo, cortada: final.stop_reason === 'max_tokens' };
  } catch (e) {
    throw new Error(mensagemDeErro(e));
  } finally {
    // os PDFs enviados não ficam guardados na conta da Anthropic
    for (const id of enviados) { try { await client.files.delete(id); } catch { /* já apagado */ } }
  }
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
    if (/too long|too large|pages|exceed/i.test(m)) return 'Os anexos excedem o limite de uma pergunta (600 páginas). Envie o PDF em partes ou só as peças necessárias.';
    return `Pedido recusado pela API: ${m}`;
  }
  if (e instanceof Anthropic.APIConnectionError) return 'Sem conexão com a API do Claude. Verifique a internet.';
  if (e instanceof Anthropic.APIError) return `Erro da API do Claude (${e.status}): ${e.message}`;
  return e?.message || String(e);
}

// teste rápido da chave (Configurações)
export async function testarClaude() {
  const r = await perguntarClaude({ instrucao: 'Responda apenas: OK', maxTokens: 2000 });
  return r;
}
