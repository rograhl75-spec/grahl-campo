// Reaproveitamento dos autos: o PDF com "chave" é enviado uma vez e reaproveitado (dados sintéticos, API simulada)
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };

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
  const u = String(url);
  chamadas.push({ u, metodo: init?.method, corpo: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
  if (u.includes('/files') && init?.method === 'POST') return new Response(JSON.stringify({ id: `file_${chamadas.length}`, type: 'file' }), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.includes('/files/') && init?.method === 'DELETE') return new Response(JSON.stringify({ id: 'x', type: 'file_deleted' }), { status: 200, headers: { 'content-type': 'application/json' } });
  return new Response(sse(usoSeguinte), { status: 200, headers: { 'content-type': 'text/event-stream' } });
});

const { perguntarClaude, salvarConfigClaude } = await import('../src/claudeApi.js');

describe('reaproveitamento dos autos (cache)', () => {
  beforeEach(() => { chamadas.length = 0; });
  it('envia o PDF dos autos uma vez, marca o cache e não o apaga', async () => {
    salvarConfigClaude({ chave: 'sk-teste', modelo: 'claude-opus-5-5', esforco: 'high', cache: '1h' });
    const autos = { blob: new Blob(['%PDF-1.4 sintetico']), nome: 'autos.pdf', mime: 'application/pdf', chave: 'autos:1:18' };
    usoSeguinte = { cache_creation_input_tokens: 1000 };
    const r1 = await perguntarClaude({ instrucao: 'Extraia.', anexos: [autos] });
    expect(chamadas.filter((c) => c.u.includes('/files') && c.metodo === 'POST')).toHaveLength(1);
    expect(chamadas.some((c) => c.metodo === 'DELETE')).toBe(false);
    const msg = chamadas.find((c) => c.u.includes('/messages')).corpo;
    expect(msg.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(msg.messages[0].content.at(-1)).toEqual({ type: 'text', text: 'Extraia.' });
    expect(r1.uso.gravado).toBe(1000);

    chamadas.length = 0; usoSeguinte = { cache_read_input_tokens: 1000 };
    const avulso = { blob: new Blob(['%PDF-1.4 fds']), nome: 'fds.pdf', mime: 'application/pdf' };
    const r2 = await perguntarClaude({ instrucao: 'Responda.', anexos: [avulso, autos] });
    const uploads = chamadas.filter((c) => c.u.includes('/files') && c.metodo === 'POST');
    expect(uploads).toHaveLength(1); // só o avulso
    const msg2 = chamadas.find((c) => c.u.includes('/messages')).corpo;
    expect(msg2.messages[0].content[0].source.file_id).toBe(msg.messages[0].content[0].source.file_id); // autos primeiro, mesmo arquivo
    expect(chamadas.filter((c) => c.metodo === 'DELETE')).toHaveLength(1); // apaga só o avulso
    expect(r2.economia).toBeGreaterThan(0);
    expect(r2.custo).toBeLessThan(r1.custo);
  });
  it('com o reaproveitamento desligado, apaga os autos depois', async () => {
    salvarConfigClaude({ chave: 'sk-teste', modelo: 'claude-opus-5-5', esforco: 'high', cache: 'nao' });
    usoSeguinte = {};
    await perguntarClaude({ instrucao: 'x', anexos: [{ blob: new Blob(['%PDF']), nome: 'a.pdf', mime: 'application/pdf', chave: 'autos:2:4' }] });
    const msg = chamadas.find((c) => c.u.includes('/messages')).corpo;
    expect(msg.messages[0].content[0].cache_control).toBeUndefined();
    expect(chamadas.filter((c) => c.metodo === 'DELETE')).toHaveLength(1);
  });
});
