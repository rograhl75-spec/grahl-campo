import { useState } from 'preact/hooks';
import { CATALOGO } from '../docx/reports.js';
import { exportarBackup, baixarArquivo, carimbo } from '../backup.js';
import { OPCOES_REDACAO, exportarParaClaude } from '../aiimport.js';
import { gravarTudoAgora, salvar, TF, Sel } from './fields.jsx';
import { FORMAS_PAGAMENTO } from '../schema.js';
import { db } from '../db.js';
import { PERFIL_ID, contasDoPerfil, PERFIL_PADRAO } from '../docx/base.js';
import { useLive } from './hooks.js';

const SUGESTAO_REDACAO = (c) => (c.papel === 'Perito do Juízo' ? 'laudo'
  : /Assistente/i.test(c.papel || '') ? 'parecerAT'
    : c.tipoAtuacao === 'Extrajudicial' ? 'ltcat' : 'laudo');

const QUANDO = {
  '1. Início do caso': 'Logo após extrair os dados dos autos (etapa 2).',
  '2. Antes da diligência': 'Com a data da vistoria definida.',
  '3. Depois da diligência': 'Com o campo e as fotos registrados (etapas 4 e 5).',
  '4. Laudo / parecer': 'O Word traz a estrutura e os quadros prontos. Para o texto completo, use também "Redigir com o Claude", logo abaixo.',
  '5. Quesitos suplementares e esclarecimentos': 'Quando o Juízo manda responder quesitos suplementares ou esclarecer o laudo. Cadastre e responda os quesitos na etapa 3 (há o atalho com o Claude lá) e gere a resposta aqui.',
  '6. Recebimento dos honorários': 'Após a entrega do laudo e dos esclarecimentos.',
};

export function Documentos({ rec }) {
  const [ocupado, setOcupado] = useState('');
  const [msg, setMsg] = useState('');
  const [verTodos, setVerTodos] = useState(false);
  const c = rec.data;

  const perfil = useLive(async () => ({ ...PERFIL_PADRAO, ...((await db.records.get(PERFIL_ID)) || { data: {} }).data }), [], PERFIL_PADRAO);
  const contas = contasDoPerfil(perfil);
  const contaSel = c.contaBancaria || (contas[0] && contas[0].id) || '';

  const gerar = async (doc) => {
    gravarTudoAgora();
    setOcupado(doc.id); setMsg('');
    try {
      const r = await doc.fn(rec.id, { conta: contaSel });
      baixarArquivo(r.blob, r.nome);
      setMsg(`✓ ${r.nome} gerado. Ao abrir no Word, confirme "Sim" para atualizar o sumário e as listas. Trechos em amarelo são para você completar.${r.faltando ? ` Atenção: ${r.faltando} foto(s) ainda não baixadas neste aparelho ficaram de fora.` : ''}${r.falhasApendice ? ` Atenção: ${r.falhasApendice} relatório(s) de medição não puderam ser lidos (não baixados neste aparelho ou arquivo inválido).` : ''}`);
    } catch (e) {
      console.error(e);
      setMsg('Erro ao gerar: ' + e.message);
    } finally { setOcupado(''); }
  };
  const backupCaso = async () => {
    setOcupado('zip');
    try {
      const r = await exportarBackup({ caseId: rec.id });
      baixarArquivo(r.blob, `Caso_${(c.numero || c.autorNome || rec.id).replace(/[^\w.-]+/g, '_').slice(0, 60)}_${carimbo()}.zip`);
      setMsg(`✓ Cópia do caso exportada (${r.total} registros, ${r.fotos} fotos).`);
    } catch (e) { setMsg('Erro: ' + e.message); } finally { setOcupado(''); }
  };

  const recomendados = CATALOGO.filter((d) => d.rec(c));
  const outros = CATALOGO.filter((d) => !d.rec(c));
  const grupos = (lista) => [...new Set(lista.map((d) => d.grupo))].sort().map((g) => [g, lista.filter((d) => d.grupo === g)]);

  return (
    <div class="docs">
      <p class="dica largo">Os documentos estão na ordem em que costumam ser usados e saem em Word no seu papel timbrado, já preenchidos com os dados das etapas anteriores. O que depende da sua análise sai marcado em amarelo. Aparecem só os modelos que servem para este tipo de caso.</p>
      {grupos(recomendados).map(([g, lista]) => (
        <section class="grupo-docs">
          <h3>{g}</h3>
          {QUANDO[g] && <p class="passo-docs">{QUANDO[g]}</p>}
          <div class="grade-docs">
            {lista.map((d) => <CartaoDoc d={d} ocupado={ocupado} gerar={gerar} contas={contas} contaSel={contaSel} recId={rec.id} rec={rec} />)}
          </div>
        </section>
      ))}
      {outros.length > 0 && (
        <section class="grupo-docs">
          <button type="button" class="sec" onClick={() => setVerTodos(!verTodos)}>{verTodos ? 'Ocultar' : 'Mostrar'} outros modelos ({outros.length})</button>
          {verTodos && <div class="grade-docs">{outros.map((d) => <CartaoDoc d={d} ocupado={ocupado} gerar={gerar} contas={contas} contaSel={contaSel} recId={rec.id} rec={rec} />)}</div>}
        </section>
      )}
      <LevarParaClaude rec={rec} />
      <section class="grupo-docs">
        <h3>Cópia de segurança</h3>
        <div class="bloco doc">
          <p>ZIP com todos os dados e fotos originais deste caso, para guardar no Drive ou no PC.</p>
          <button type="button" disabled={!!ocupado} onClick={backupCaso}>{ocupado === 'zip' ? 'Gerando…' : 'Exportar caso (ZIP)'}</button>
        </div>
      </section>
      {msg && <p class="ok-msg aviso-fixo">{msg}</p>}
    </div>
  );
}

function CartaoDoc({ d, ocupado, gerar, contas = [], contaSel, recId, rec }) {
  return (
    <div class="bloco doc">
      <h4>{d.titulo}</h4>
      <p>{d.desc}</p>
      {d.usaConta && (contas.length ? (
        <label class="campo"><span class="rotulo">Conta para os honorários</span>
          <select value={contaSel} onChange={(e) => salvar(recId, 'contaBancaria', e.currentTarget.value)}>
            {contas.map((ct) => <option value={ct.id}>{ct.rotulo}</option>)}
          </select>
        </label>
      ) : <p class="alerta-txt">Cadastre as contas em Configurações → Meus dados.</p>)}
      {d.id === 'agenda' && rec && <DadosAgendamento rec={rec} />}
      {d.id === 'aceiteArb' && rec && <Sel rec={rec} k="honorariosForma" label="Forma de pagamento (conforme o despacho)" opcoes={FORMAS_PAGAMENTO} />}
      <button type="button" class="primario" disabled={!!ocupado} onClick={() => gerar(d)}>{ocupado === d.id ? 'Gerando…' : 'Gerar Word'}</button>
      {d.id === 'agenda' && rec && <LinkAgenda c={rec.data} />}
    </div>
  );
}

// Dados da vistoria para a petição de agendamento: empresa, CNPJ (com busca do endereço), endereço, data e horário
function DadosAgendamento({ rec }) {
  const c = rec.data;
  const [msg, setMsg] = useState('');
  const buscar = async () => {
    const cnpj = String(c.vistoriaCnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14) { setMsg('Informe o CNPJ completo (14 dígitos).'); return; }
    setMsg('Buscando…');
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!r.ok) throw new Error(r.status === 404 ? 'CNPJ não encontrado' : `erro ${r.status}`);
      const j = await r.json();
      const cep = String(j.cep || '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
      const end = [[j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' '), j.numero, j.complemento].filter((x) => x && String(x).trim()).join(', ');
      const linha2 = [j.bairro, `${j.municipio || ''}/${j.uf || ''}`, cep && `CEP ${cep}`].filter(Boolean).join(' – ');
      gravarTudoAgora();
      if (!String(c.vistoriaLocal || '').trim()) await salvar(rec.id, 'vistoriaLocal', j.razao_social || j.nome_fantasia || '');
      await salvar(rec.id, 'vistoriaEndereco', `${end}\n${linha2}`);
      setMsg(`✓ ${j.razao_social || ''}${j.descricao_situacao_cadastral ? ` – situação: ${j.descricao_situacao_cadastral}` : ''}. Confira o endereço.`);
    } catch (e) { setMsg(`Não foi possível buscar (${e.message}). Digite o endereço.`); }
  };
  // por similaridade a vistoria é na empresa paradigma, não na empregadora original
  const empresas = c.similaridade === 'Sim' ? [] : [...new Set([c.reuNome && !/INSS|Instituto Nacional/i.test(c.reuNome) ? c.reuNome : ''].filter(Boolean))];
  return (
    <div class="dados-agenda">
      <TF rec={rec} k="vistoriaLocal" label={c.similaridade === 'Sim' ? 'Empresa da vistoria (paradigma)' : 'Empresa da vistoria'} />
      {!String(c.vistoriaLocal || '').trim() && empresas.length > 0 && (
        <div class="chips">{empresas.map((e) => <button type="button" class="chip" onClick={() => salvar(rec.id, 'vistoriaLocal', e)}>{e}</button>)}</div>
      )}
      <div class="com-botao"><TF rec={rec} k="vistoriaCnpj" label="CNPJ (para buscar o endereço)" inputMode="numeric" />
        <button type="button" class="mini" onClick={buscar}>🔎 Buscar</button></div>
      <TF rec={rec} k="vistoriaEndereco" label="Endereço (rua, nº – bairro – cidade/UF – CEP)" area rows={2} />
      <div class="linha2">
        <TF rec={rec} k="dataDiligencia" label="Data da vistoria" type="date" />
        <TF rec={rec} k="horaDiligencia" label="Horário" type="time" />
      </div>
      {msg && <small class="dica">{msg}</small>}
    </div>
  );
}

// Evento no Google Agenda (abre a tela de criação já preenchida; você confere e salva)
function LinkAgenda({ c }) {
  if (!c.dataDiligencia || !c.horaDiligencia) return <small class="dica">Com data e horário preenchidos, aparece aqui o botão para criar o evento no Google Agenda.</small>;
  const ini = `${c.dataDiligencia.replace(/-/g, '')}T${c.horaDiligencia.replace(':', '')}00`;
  const [h, m] = c.horaDiligencia.split(':').map(Number);
  const fimH = String(Math.min(23, h + 3)).padStart(2, '0');
  const fim = `${c.dataDiligencia.replace(/-/g, '')}T${fimH}${String(m).padStart(2, '0')}00`;
  const local = [c.vistoriaLocal, String(c.vistoriaEndereco || '').replace(/\n/g, ' – ')].filter(Boolean).join(' – ');
  const det = [`Vistoria pericial – processo ${c.numero || ''}`, c.autorNome && `Autor: ${c.autorNome}`, c.reuNome && `Réu: ${c.reuNome}`,
    c.similaridade === 'Sim' && 'Perícia por similaridade', 'Levar: dosímetro, medidor de vibração, IBUTG, calibrador, trena, câmera.'].filter(Boolean).join('\n');
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Vistoria pericial – ${c.vistoriaLocal || c.autorNome || c.numero || ''}`)}&dates=${ini}/${fim}&ctz=America/Sao_Paulo&location=${encodeURIComponent(local)}&details=${encodeURIComponent(det)}`;
  return <a class="botao sec" href={url} target="_blank" rel="noopener">📅 Agendar no Google Agenda</a>;
}

function LevarParaClaude({ rec }) {
  const [tipo, setTipo] = useState(SUGESTAO_REDACAO(rec.data));
  const [msg, setMsg] = useState('');
  const copiar = async () => {
    gravarTudoAgora();
    const texto = await exportarParaClaude(rec.id, tipo);
    try {
      await navigator.clipboard.writeText(texto);
      setMsg(`✓ Caso copiado (${Math.round(texto.length / 1000)} mil caracteres). Cole no Claude, anexe os autos e, se quiser, o Word gerado acima e as fotos.`);
    } catch (e) {
      baixarArquivo(new Blob([texto], { type: 'text/markdown' }), `Caso_para_Claude_${carimbo()}.md`);
      setMsg('Não foi possível copiar; o texto foi baixado como arquivo .md para anexar no Claude.');
    }
  };
  return (
    <section class="grupo-docs">
      <h3>Redigir com o Claude (texto completo do laudo ou parecer)</h3>
      <div class="bloco destaque">
        <p>Copia tudo o que está no caso (síntese dos autos, campo, medições, paradigmas, quesitos com anotações e seus critérios técnicos) com a instrução de redação do documento escolhido. Cole no Claude e anexe o PDF do processo (etapa 2).</p>
        <label class="campo"><span class="rotulo">Documento a redigir</span>
          <select value={tipo} onChange={(e) => setTipo(e.currentTarget.value)}>
            {OPCOES_REDACAO.map(([k, r]) => <option value={k}>{r}</option>)}
          </select>
        </label>
        <button type="button" class="primario" onClick={copiar}>Copiar caso para o Claude</button>
        {msg && <p class="ok-msg">{msg}</p>}
      </div>
    </section>
  );
}
