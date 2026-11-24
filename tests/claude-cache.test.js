// Envio direto ao Claude: PDFs dentro da pergunta (sem Files API) e cache dos autos (dados sintéticos, API simulada)
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
vi.mock('../src/apendices.js', () => ({ carregarPdfjs: async () => ({ getDocument: () => ({ promise: Promise.resolve({ numPages: 3, getPage: async (i) => ({ getTextContent: async () => ({ items: [{ str: `texto da página ${i} com conteúdo suficiente`, hasEOL: true }] }) }) }) }) }) }));

const chamadas = [];
function sse(uso) {
  const ev = [
    ['message_start', { type: 'message_start', message: { id: 'm1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5, ...uso } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  return ev.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
}
let usoSeguinte = {};
globalThis.fetch = vi.fn(async (url, init) => {
  chamadas.push({ u: String(url), metodo: init?.method, corpo: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
  return new Response(sse(usoSeguinte), { status: 200, headers: { 'content-type': 'text/event-stream' } });
});

const { perguntarClaude, salvarConfigClaude } = await import('../src/claudeApi.js');

describe('envio direto: PDF na pergunta e cache dos autos', () => {
  beforeEach(() => { chamadas.length = 0; });
  it('nenhuma chamada à Files API; PDF em base64 primeiro, com a marca de cache', async () => {
    salvarConfigClaude({ chave: 'sk-teste', modelo: 'claude-opus-5-5', esforco: 'high', cache: '1h' });
    const autos = { blob: new Blob(['%PDF-1.4 sintetico']), nome: 'autos.pdf', mime: 'application/pdf', chave: 'autos:1:18' };
    usoSeguinte = { cache_creation_input_tokens: 1000 };
    const r1 = await perguntarClaude({ instrucao: 'Extraia.', anexos: [{ blob: new Blob(['%PDF fds']), nome: 'fds.pdf', mime: 'application/pdf' }, autos] });
    expect(chamadas.some((c) => c.u.includes('/files'))).toBe(false);
    const msg = chamadas.find((c) => c.u.includes('/messages')).corpo;
    const c0 = msg.messages[0].content[0];
    expect(c0.source.type).toBe('base64');
    expect(c0.title).toBe('autos.pdf');
    expect(c0.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(msg.messages[0].content[1].cache_control).toBeUndefined();
    expect(msg.messages[0].content.at(-1)).toEqual({ type: 'text', text: 'Extraia.' });

    chamadas.length = 0; usoSeguinte = { cache_read_input_tokens: 1000 };
    const r2 = await perguntarClaude({ instrucao: 'Responda.', anexos: [autos] });
    const c2 = chamadas.find((c) => c.u.includes('/messages')).corpo.messages[0].content[0];
    expect(c2.source.data).toBe(c0.source.data); // o mesmo começo de pergunta → cache
    expect(r2.economia).toBeGreaterThan(0);
    expect(r2.custo).toBeLessThan(r1.custo);
  });
  it('com o reaproveitamento desligado, sem marca de cache', async () => {
    salvarConfigClaude({ cache: 'nao' });
    usoSeguinte = {};
    await perguntarClaude({ instrucao: 'x', anexos: [{ blob: new Blob(['%PDF']), nome: 'a.pdf', mime: 'application/pdf', chave: 'autos:2:4' }] });
    expect(chamadas.find((c) => c.u.includes('/messages')).corpo.messages[0].content[0].cache_control).toBeUndefined();
  });
  it('PDF grande demais: vai o texto extraído página a página, com a marca de cache', async () => {
    salvarConfigClaude({ cache: '1h' });
    const grande = new Blob([new Uint8Array(23 * 1024 * 1024)]);
    await perguntarClaude({ instrucao: 'x', anexos: [{ blob: grande, nome: 'autos.pdf', mime: 'application/pdf', chave: 'autos:3:g' }] });
    const c0 = chamadas.find((c) => c.u.includes('/messages')).corpo.messages[0].content[0];
    expect(c0.type).toBe('text');
    expect(c0.text).toContain('[Página 2]');
    expect(c0.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
  });
});
