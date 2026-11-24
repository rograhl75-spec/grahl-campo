// Botão "Enviar direto ao Claude": manda a instrução do app e os anexos pela API e devolve a resposta para a
// tela (no lugar de copiar, colar no claude.ai e colar a resposta de volta). Sem chave configurada, mostra só
// o caminho para configurar – o botão de copiar da tela continua funcionando como antes.
import { useState } from 'preact/hooks';
import { db } from '../db.js';
import { obterAnexo } from '../sync.js';
import { perguntarClaude, temClaude, configClaude, MODELOS_CLAUDE } from '../claudeApi.js';

// PDFs dos autos guardados na etapa 1. Autos (item A)
export async function anexosDosAutos(caseId) {
  const regs = (await db.records.where('[caseId+kind]').equals([caseId, 'anexo']).toArray())
    .filter((r) => !r.deleted && r.data.descricao === 'autos').sort((a, b) => a.createdAt - b.createdAt);
  const out = [];
  // "chave": o mesmo PDF dos autos é reaproveitado entre os envios do caso (cache) – muda se o arquivo for trocado
  for (const r of regs) { const blob = await obterAnexo(r.id); out.push({ blob, nome: r.data.nome || 'autos.pdf', mime: 'application/pdf', chave: `autos:${r.id}:${blob.size}` }); }
  return out;
}

// Com a chave de API, o caminho por copiar e colar no claude.ai fica recolhido (alternativa); sem ela, aberto
export function ModoManual({ children, rotulo = 'Alternativa sem a chave de API: copiar e colar no claude.ai' }) {
  if (!temClaude()) return <>{children}</>;
  return <details class="modo-manual"><summary>{rotulo}</summary>{children}</details>;
}

const brl = (usd) => `US$ ${usd.toFixed(2).replace('.', ',')}`;

// instrucao: texto ou função async que o devolve; anexos: função async → [{ blob, nome, mime }]
// permitirArquivos: mostra o seletor de arquivos (FDS, relatórios, laudos); web: pesquisa na internet
// onResposta(texto, r): recebe a resposta (pode ser async); rotulo: texto do botão
export function BotaoClaudeDireto({ instrucao, anexos, permitirArquivos = false, rotuloArquivos = 'Anexar arquivos (PDF, fotos ou texto)', web = false, maxTokens, onResposta, rotulo = 'Enviar direto ao Claude', sec = false }) {
  const [ocupado, setOcupado] = useState(false);
  const [etapa, setEtapa] = useState('');
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');
  const [arquivos, setArquivos] = useState([]);
  if (!temClaude()) {
    return <p class="dica">Para enviar direto ao Claude, sem copiar e colar, configure a chave de API em <a href="#/config">Configurações → Claude (API)</a>.</p>;
  }
  const enviar = async () => {
    setOcupado(true); setErro(''); setMsg(''); setEtapa('Preparando…');
    try {
      const texto = typeof instrucao === 'function' ? await instrucao() : instrucao;
      const lista = [...((anexos && await anexos()) || []), ...arquivos.map((f) => ({ blob: f, nome: f.name, mime: f.type }))];
      const r = await perguntarClaude({ instrucao: texto, anexos: lista, web, maxTokens, onEtapa: setEtapa });
      setEtapa('');
      const extra = await onResposta(r.texto, r);
      const modelo = (MODELOS_CLAUDE.find((m) => m.id === configClaude().modelo) || {}).nome?.replace(/\s*\(.*$/, '') || r.modelo;
      const lidoTxt = r.uso.lido ? ` ${Math.round(r.uso.lido / 1000)} mil tokens dos autos reaproveitados (economia de cerca de ${brl(r.economia)}).` : r.uso.gravado ? ' Autos guardados para reaproveitamento nos próximos envios deste caso.' : '';
      setMsg(`✓ Resposta do ${modelo} recebida – ${Math.round((r.uso.entrada + r.uso.gravado + r.uso.lido) / 1000)} mil tokens de entrada e ${Math.round(r.uso.saida / 1000)} mil de saída, cerca de ${brl(r.custo)}.${lidoTxt}${r.cortada ? ' A resposta atingiu o limite de tamanho e pode estar incompleta.' : ''}${r.avisos?.length ? ` Atenção: ${r.avisos.join(' ')}` : ''}${extra ? ` ${extra}` : ''}`);
      setArquivos([]);
    } catch (e) {
      setEtapa(''); setErro(e.message || String(e));
    } finally { setOcupado(false); }
  };
  return (
    <div class="claude-direto">
      {permitirArquivos && (
        <label class="botao-arquivo sec">{arquivos.length ? `${arquivos.length} arquivo(s) para enviar – trocar` : `＋ ${rotuloArquivos}`}
          <input type="file" multiple hidden accept="application/pdf,.pdf,image/*,.txt,.md,.json,.csv" onChange={(e) => { setArquivos([...e.currentTarget.files]); e.currentTarget.value = ''; }} />
        </label>
      )}
      <button type="button" class={sec ? 'sec' : 'primario'} disabled={ocupado} onClick={enviar}>{ocupado ? 'Enviando ao Claude…' : rotulo}</button>
      {etapa && <p class="dica">{etapa} (pode levar alguns minutos com autos grandes; não feche o app)</p>}
      {msg && <p class="ok-msg">{msg}</p>}
      {erro && <p class="erro-msg">{erro}</p>}
    </div>
  );
}
