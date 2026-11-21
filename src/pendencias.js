// ======================================================================
// Pendências antes de gerar o documento: o que hoje sairia em amarelo, em forma de perguntas
// respondidas na própria lista (a resposta grava no campo do caso ou do vínculo).
// 1) perguntas com campo: regra de horas fora da direção, tempo de condução, paradigmas,
//    sugestões do app (confirmar ou recusar) e conclusão da penosidade (adotar a proposta ou redigir);
// 2) o que ainda restar marcado no documento ([[...]]), agrupado, para conferir.
// ======================================================================
import JSZip from 'jszip';
import { carregar } from './docx/base.js';
import { vinculosMotorista, tempoConducao, jornadaDia, matrizIAC } from './docx/penosidade.js';
import { sugerirParaVinculo } from './paradigmas.js';
import { fmtHoras, horasDia, horasForaTexto } from './calc.js';
import { contextoLegal, ehParecerTecnico, EMITENTE_PPP, CATEGORIAS_SEGURADO, RESULTADO_AGENTE } from './schema.js';
import { categoriaDoVinculo } from './enquadramento.js';
import { agentesDoArt68 } from './docx/agentesQuadros.js';
import { profissaoDoCaso } from './data/profissoes.js';

const br = (iso) => String(iso || '').replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$3/$2/$1');
const nomeVinculo = (r, i) => `V${i + 1} – ${String(r.data.empresa || 'vínculo').split(/\s*\(|,/)[0].trim().slice(0, 45)} (${br(r.data.inicio) || '?'} a ${r.data.fim ? br(r.data.fim) : 'atual'})`;

export async function pendenciasDoCaso(caseId) {
  const dados = await carregar(caseId);
  const { c } = dados;
  // só os vínculos de motorista/operador têm condução, paradigma e penosidade
  const vincs = vinculosMotorista(dados);
  const itens = [];
  const idx = new Map(dados.periodos.map((r, i) => [r.id, i]));

  // regra do caso: horas fora da direção (carga, descarga, paradas)
  const semTdigitado = vincs.filter((r) => !isFinite(horasDia(r.data.conducaoH)));
  if (semTdigitado.length || String(c.foraDirecaoH || '').trim()) {
    itens.push({
      id: 'foraDirecaoH', grupo: 'Regra do caso', rec: caseId, campo: 'foraDirecaoH', tipo: 'numero', valor: c.foraDirecaoH || '',
      titulo: 'Horas por dia fora da direção (carga, descarga e paradas)',
      explicacao: semTdigitado.length ? `Vale para os ${semTdigitado.length} vínculo(s) sem tempo de condução digitado: condução = jornada da entrevista − estas horas. Ex.: 5.`
        : 'Todos os vínculos já têm o tempo de condução; a regra vale para os que vierem sem ele. Abaixo, a condução que vai para o documento.',
      respondido: isFinite(horasForaTexto(c.foraDirecaoH || '')),
      // o tempo que vai para o documento em cada vínculo, e de onde veio
      previa: vincs.map((r) => {
        const J = jornadaDia(r, dados);
        const tc = tempoConducao(r, dados);
        const de = !isFinite(tc.T) ? 'sem tempo de condução' : tc.regra ? `condução ${fmtHoras(tc.T)} (${isFinite(J) ? `jornada ${fmtHoras(J)} − regra` : 'condução padrão'})` : `condução ${fmtHoras(tc.T)} (digitada no vínculo)`;
        return `${nomeVinculo(r, idx.get(r.id))}: ${de}`;
      }),
    });
  }

  // condução padrão para os vínculos sem jornada na entrevista (a regra acima não alcança)
  const semJornada = vincs.filter((r) => !isFinite(tempoConducao(r, dados).T) && !isFinite(jornadaDia(r, dados)));
  if (semJornada.length) {
    itens.push({
      id: 'conducaoPadraoH', grupo: 'Regra do caso', respondido: false, rec: caseId, campo: 'conducaoPadraoH', tipo: 'numero', valor: c.conducaoPadraoH || '',
      titulo: 'Condução padrão (h/dia) para os vínculos sem jornada na entrevista',
      explicacao: `${semJornada.length} vínculo(s) sem jornada identificada: ${semJornada.map((r) => nomeVinculo(r, idx.get(r.id))).join('; ')}.`,
    });
  }

  const conclusoes = [];
  for (const r of vincs) {
    const i = idx.get(r.id);
    const grupo = nomeVinculo(r, i);
    const tc = tempoConducao(r, dados);
    if (!isFinite(tc.T) && !semJornada.includes(r)) {
      itens.push({ id: `T-${r.id}`, grupo, rec: r.id, campo: 'conducaoH', tipo: 'numero', valor: r.data.conducaoH || '',
        titulo: 'Tempo diário de condução (h)', explicacao: isFinite(tc.J) ? `Jornada identificada: ${fmtHoras(tc.J)}. Informe as horas de direção ou preencha a regra do caso acima.` : 'A jornada deste vínculo não foi identificada na entrevista: informe as horas de direção por dia.' });
    }
    const pos1995 = !r.data.fim || r.data.fim > '1995-04-28';
    if (pos1995 && (!r.data.paradigmaRuido || !r.data.paradigmaVibracao)) {
      let s = null;
      try { s = await sugerirParaVinculo(r); } catch { s = null; }
      for (const [campo, rot, cand] of [['paradigmaRuido', 'ruído', s?.ruido], ['paradigmaVibracao', 'vibração', s?.vibracao]]) {
        if (r.data[campo]) continue;
        const opcoes = (s?.ranking?.[campo === 'paradigmaRuido' ? 'ruido' : 'vibracao'] || []).slice(0, 3)
          .map((x) => ({ valor: x.p.data.codigo, rotulo: `${x.p.data.codigo} – ${x.p.data.marca || ''} ${x.p.data.modelo || ''} ${x.p.data.ano || ''} (${x.pontos} pts: ${x.motivos.slice(0, 3).join(', ')})`.replace(/\s+/g, ' ') }));
        itens.push({ id: `${campo}-${r.id}`, grupo, rec: r.id, campo, tipo: 'escolha', valor: '', opcoes,
          titulo: `Paradigma de ${rot}`, explicacao: cand ? `Sugestão do banco: ${cand.p.data.codigo}.` : 'O banco não tem paradigma parecido: pesquise nos seus laudos (ficha de pesquisa no vínculo) ou deixe para depois.' });
      }
    }
    const m = matrizIAC(r, dados);
    if (m.pressaoSug) {
      itens.push({ id: `pressao-${r.id}`, grupo, rec: r.id, campo: 'pressao', tipo: 'confirmar', sugestao: m.pressaoSugTexto, recusa: { campo: 'sugPressao', valor: 'recusada' },
        titulo: 'Prazos e metas de entrega (sugestão do app pela jornada)', explicacao: 'Confirme se a entrevista sustenta o fator; se não, recuse e ele sai do parecer.' });
    }
    if (m.pausasSug) {
      itens.push({ id: `pausas-${r.id}`, grupo, rec: r.id, campo: 'pausas', tipo: 'confirmar', sugestao: m.pausasSugTexto, recusa: { campo: 'sugPausas', valor: 'recusada' },
        titulo: 'Direção contínua e pausas (sugestão do app pela jornada)', explicacao: 'Confirme ou recuse.' });
    }
    // conclusão: escolha Sim / Não (texto padrão igual em todos os vínculos); também quando o texto gravado é
    // uma proposta antiga do app adotada como estava
    const propostaAntiga = /^(Pela convergência cumulativa dos fatores de desgaste apurados \(|Os fatores apurados \()/.test(String(r.data.penosidadeConclusao || ''));
    if (!String(r.data.penosidadeResultado || '').trim() && (m.sugerida || propostaAntiga)) {
      conclusoes.push(r);
      itens.push({ id: `conc-${r.id}`, grupo, rec: r.id, campo: 'penosidadeResultado', tipo: 'simnao', limpar: 'penosidadeConclusao',
        titulo: 'Conclusão da penosidade',
        explicacao: `A contagem de fatores indica ${m.indicacao ? 'SIM' : 'NÃO'} (${m.nAdv} de 4 critérios com fatores de desgaste: veículo, trajetos, cargas, jornadas). Escolha o texto padrão; para um texto próprio, use o campo do vínculo.` });
    }
  }
  // diligência: dados que saem no registro e no laudo
  const perito = /Perito do Juízo/i.test(c.papel || '');
  if (perito && c.vistoriaData && !String(c.vistoriaIntimacao || '').trim()) {
    itens.push({ id: 'intimacao', grupo: 'Diligência', rec: caseId, campo: 'vistoriaIntimacao', tipo: 'texto', valor: '',
      titulo: 'Comunicação da data às partes e aos assistentes (art. 474 do CPC)', explicacao: 'Ex.: intimação do evento 52, de 10/10/2026.' });
  }
  if (c.vistoriaData && !String(c.vistoriaPresentes || '').trim()) {
    itens.push({ id: 'presentes', grupo: 'Diligência', rec: caseId, campo: 'vistoriaPresentes', tipo: 'texto', valor: '',
      titulo: 'Pessoas presentes na vistoria', explicacao: 'Uma por linha: nome – função – quem representa.' });
  }
  // LTCAT + PPP: quem emite, categoria do segurado por vínculo e resultado dos agentes avaliados
  const ltcat = c.tipoAtuacao === 'Extrajudicial' && contextoLegal(c).prev && !ehParecerTecnico(c);
  if (ltcat && dados.periodos.length) {
    const g = 'LTCAT + PPP';
    if (!String(c.pppEmitente || '').trim()) {
      itens.push({ id: 'pppEmitente', grupo: g, rec: caseId, campo: 'pppEmitente', tipo: 'escolha', valor: '', opcoes: EMITENTE_PPP.map((x) => ({ valor: x, rotulo: x })),
        titulo: 'Quem emite o PPP', explicacao: 'Cooperativa: o PPP sai só com os vínculos de cooperado. Próprio segurado: contribuinte individual sem empresa.' });
    }
    const txt = (id, rec, campo, titulo, explicacao) => itens.push({ id, grupo: g, rec, campo, tipo: 'texto', valor: '', titulo, explicacao });
    // vínculo contido em outro (ex.: vínculos sequenciais já unidos num só pela importação): sai duplicado no laudo
    dados.periodos.forEach((r, i) => {
      const dentro = dados.periodos.findIndex((o, j) => j !== i && o.data.inicio && r.data.inicio && o.data.inicio <= r.data.inicio
        && (!o.data.fim || (r.data.fim && r.data.fim <= o.data.fim)) && !(o.data.inicio === r.data.inicio && o.data.fim === r.data.fim && j > i));
      if (dentro < 0) return;
      itens.push({ id: `sobrepoe-${r.id}`, grupo: g, tipo: 'aviso', rec: r.id, respondido: false, excluir: `Excluir ${nomeVinculo(r, i).split(' (')[0]}`,
        titulo: `${nomeVinculo(r, i)} está dentro do período de ${nomeVinculo(dados.periodos[dentro], dentro)}`,
        explicacao: 'Se for o mesmo trabalho (vínculos sequenciais unidos num só), exclua este vínculo; senão, ele sai duplicado no laudo e no PPP.' });
    });
    if (!String(c.art || '').trim()) txt('art', caseId, 'art', 'Nº da ART', 'Sai na capa, no item 1.4 e na assinatura do LTCAT.');
    if (!String(c.pppNit || '').trim()) txt('pppNit', caseId, 'pppNit', 'NIT do segurado', 'Campo 6 do PPP.');
    if (!String(c.pppSexo || '').trim()) {
      itens.push({ id: 'pppSexo', grupo: g, rec: caseId, campo: 'pppSexo', tipo: 'escolha', valor: '', opcoes: [{ valor: 'Masculino', rotulo: 'Masculino' }, { valor: 'Feminino', rotulo: 'Feminino' }],
        titulo: 'Sexo do segurado', explicacao: 'Campo 8 do PPP.' });
    }
    dados.periodos.forEach((r, i) => {
      if (!String(r.data.cbo || '').trim()) txt(`cbo-${r.id}`, r.id, 'cbo', `CBO – ${nomeVinculo(r, i)}`, 'Campo 13 do PPP (ex.: 2232-08 – cirurgião-dentista clínico geral).');
    });
    dados.periodos.forEach((r, i) => {
      if (String(r.data.categoriaSegurado || '').trim()) return;
      itens.push({ id: `cat-${r.id}`, grupo: g, rec: r.id, campo: 'categoriaSegurado', tipo: 'escolha', valor: '', opcoes: CATEGORIAS_SEGURADO.map((x) => ({ valor: x, rotulo: x })),
        titulo: `Categoria do segurado – ${nomeVinculo(r, i)}`, explicacao: categoriaDoVinculo(r) ? `Pelo texto do vínculo, o app adota "${categoriaDoVinculo(r)}".` : 'Sem a categoria, o item 3.2 do LTCAT fica para completar.' });
    });
    // elementos da avaliação qualitativa (art. 68, § 2º, do Decreto 3.048/1999): só dos agentes do quadro (os que
    // caracterizam ou estão a confirmar); a explicação diz o que escrever, com um exemplo
    const EXPL = {
      circunstancias: 'Em que atividade e situação o segurado fica exposto ao agente durante a jornada. Ex.: "Atendimento clínico de todos os pacientes, com procedimentos invasivos e alta rotação."',
      fonte: 'De onde o agente vem e como se libera no ambiente. Ex.: "Sangue, saliva e aerossóis da alta rotação; instrumental perfurocortante contaminado."',
      vias: 'Como o agente chega ao trabalhador (pele, mucosas, inalação, via percutânea). Ex.: "Contato com a pele e as mucosas; inalação de aerossóis."',
      frequencia: 'Quantas vezes e por quanto tempo, e se é habitual e permanente. Ex.: "Habitual e permanente, em todos os atendimentos da jornada."',
    };
    // agente repetido (o mesmo agente com outro detalhe no nome): sai duas vezes no laudo e no PPP
    const chaveAg = (n) => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s*\(.*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
    dados.agentes.forEach((a, i) => {
      const k = chaveAg(a.data.nome);
      const outro = dados.agentes.find((b, j) => j !== i && (() => { const kb = chaveAg(b.data.nome); return kb === k ? j < i : (k.length >= 6 && kb.startsWith(k) && kb !== k); })());
      if (!outro) return;
      itens.push({ id: `agdup-${a.id}`, grupo: g, tipo: 'aviso', rec: a.id, respondido: false, excluir: `Excluir "${a.data.nome}"`,
        titulo: `Agente repetido: "${a.data.nome}" e "${outro.data.nome}"`,
        explicacao: 'O mesmo agente cadastrado duas vezes sai duas vezes no laudo e no PPP. Exclua o que ficou desatualizado (este, com o nome mais curto, costuma ser o antigo).' });
    });
    const semDescricao = agentesDoArt68(dados.agentes).filter((a) => ['circunstancias', 'fonte', 'vias', 'frequencia'].some((k) => !String(a.data[k] || '').trim()));
    if (semDescricao.length && profissaoDoCaso(c, dados.periodos)) {
      itens.push({ id: 'art68-banco', grupo: g, tipo: 'aviso', rec: caseId, respondido: false, link: `#/caso/${encodeURIComponent(caseId)}/preparacao`, rotuloLink: 'Ir para o banco de profissões',
        titulo: `${semDescricao.length} agente(s) sem a descrição do art. 68 – o banco de profissões completa`,
        explicacao: 'Na etapa 2. Autos, toque em "Carregar agentes e profissiografia": ele completa os campos vazios dos agentes que já estão no caso (circunstâncias, fontes, vias, frequência, efeitos, CAS e códigos), sem mudar o que você já escreveu. O que sobrar aparece aqui.' });
    } else {
      for (const a of semDescricao) {
        for (const [campo, rot] of [['circunstancias', 'circunstâncias da exposição'], ['fonte', 'fontes e possibilidades de liberação'], ['vias', 'meios de contato e vias de absorção'], ['frequencia', 'intensidade, frequência e duração']]) {
          if (String(a.data[campo] || '').trim()) continue;
          txt(`${campo}-${a.id}`, a.id, campo, `${a.data.nome} – ${rot}`, EXPL[campo]);
        }
      }
    }
    for (const a of dados.agentes) {
      // EPC e EPI eficazes: só com fichas de EPI no caso (sem elas, o PPP sai com "Não" – art. 291 da IN 128/2022)
      if (dados.epis.length && [a.data.resAte97, a.data.resDesde97].some((x) => x === 'Caracteriza' || x === 'Não caracteriza')) {
        for (const [campo, rot] of [['epcEficaz', 'EPC eficaz'], ['epiEficaz', 'EPI eficaz']]) {
          if (String(a.data[campo] || '').trim()) continue;
          itens.push({ id: `${campo}-${a.id}`, grupo: g, rec: a.id, campo, tipo: 'escolha', valor: '', opcoes: ['Sim', 'Não', 'Não se aplica'].map((x) => ({ valor: x, rotulo: x })),
            titulo: `${a.data.nome} – ${rot}`, explicacao: 'Campo 15 do PPP: "Sim" só se as fichas comprovarem CA, troca, treinamento e higienização (art. 291 da IN 128/2022).' });
        }
      }
      if (a.data.tipo === 'Químico' && !String(a.data.efeitos || '').trim() && !profissaoDoCaso(c, dados.periodos)) {
        txt(`efeitos-${a.id}`, a.id, 'efeitos', `${a.data.nome} – efeitos à saúde`, 'Vai para o quadro de características dos químicos. Ex.: "Corrosivo: queimaduras de pele, olhos e mucosas; irritação das vias respiratórias."');
      }
    }
    const temAte97 = dados.periodos.some((r) => (r.data.inicio || '9999') <= '1997-03-05');
    for (const a of dados.agentes) {
      for (const [campo, rot, vale] of [['resAte97', 'até 05/03/1997', temAte97], ['resDesde97', 'a partir de 06/03/1997', true]]) {
        const val = String(a.data[campo] || '').trim();
        if (!vale || (val && val !== 'A confirmar')) continue;
        itens.push({ id: `${campo}-${a.id}`, grupo: g, rec: a.id, campo, tipo: 'escolha', valor: '', opcoes: RESULTADO_AGENTE.filter((x) => x !== 'A confirmar').map((x) => ({ valor: x, rotulo: x })),
          titulo: `${a.data.nome} – resultado ${rot}`, explicacao: val ? 'Marcado "a confirmar": confirme com o segurado e escolha o resultado.' : 'Sem o resultado, o agente fica pendente na síntese e fora do PPP.' });
      }
    }
  }
  // quesitos sem resposta: responder aqui mesmo (o texto do quesito aparece acima do campo)
  const ordemOrigem = (o) => ['Juízo', 'Autor / Reclamante', 'Réu / Reclamada', 'INSS', 'Complementares'].indexOf(o);
  for (const q of [...dados.quesitos].sort((a, b) => ordemOrigem(a.data.origem) - ordemOrigem(b.data.origem) || (Number(a.data.numero) || 0) - (Number(b.data.numero) || 0))) {
    if (String(q.data.resposta || '').trim()) continue;
    itens.push({ id: `q-${q.id}`, grupo: 'Quesitos sem resposta', rec: q.id, campo: 'resposta', tipo: 'texto', valor: '',
      titulo: `${q.data.origem || 'Quesito'}${q.data.numero ? ` – ${q.data.numero}` : ''}`, explicacao: String(q.data.texto || '').slice(0, 600) });
  }

  // a mesma conclusão para todos os vínculos de uma vez
  if (conclusoes.length > 1) {
    itens.splice(itens.findIndex((it) => it.grupo !== 'Regra do caso') === -1 ? itens.length : itens.findIndex((it) => it.grupo !== 'Regra do caso'), 0, {
      id: 'conc-todos', grupo: 'Regra do caso', tipo: 'simnao', campo: 'penosidadeResultado', limpar: 'penosidadeConclusao', alvos: conclusoes.map((r) => r.id),
      titulo: `Conclusão da penosidade – aplicar a todos os ${conclusoes.length} vínculos`, explicacao: 'Usa o mesmo texto padrão em todos; depois, se algum vínculo for diferente, mude só ele.',
    });
  }
  // relatórios de medição dos paradigmas usados: sem arquivo ligado, o apêndice do paradigma não sai
  const { paradigmasUsados } = await import('./docx/base.js');
  const { db } = await import('./db.js');
  const { rotuloParadigma } = await import('./paradigmas.js');
  for (const p of paradigmasUsados(dados)) {
    const id = p.data.relatoriosAnexoId || p.data.anexoId;
    const reg = id ? await db.records.get(id) : null;
    const base = { id: `rel-${p.id}`, grupo: 'Relatórios de medição dos paradigmas', tipo: 'aviso', rec: p.id };
    if (!id || !reg || reg.deleted) {
      itens.push({ ...base, respondido: false, link: '#/paradigmas/importar',
        titulo: `${rotuloParadigma(p)}: sem laudo de origem nem relatórios ligados`,
        explicacao: 'O apêndice com os relatórios deste paradigma não vai sair. Ligue o arquivo em Paradigmas → Importar / exportar → Anexar laudos de origem em lote (nome com o código, ex.: "M28 - …pdf") ou dentro do próprio paradigma.' });
    } else if (!(await db.blobs.get(id))) {
      itens.push({ ...base, respondido: false, link: '#/paradigmas/veiculos',
        titulo: `${rotuloParadigma(p)}: arquivo dos relatórios ainda não está neste aparelho`,
        explicacao: `O arquivo "${reg.data.nome || 'laudo'}" foi ligado em outro aparelho. Com a nuvem conectada, o app o baixa ao gerar; se o outro aparelho ainda não terminou de enviar, o apêndice não sai. Abra o paradigma e toque em "Abrir" para conferir.` });
    }
  }
  return itens;
}

// Marcações que ainda sairiam no documento ([[...]]), agrupadas pelo texto, com quantas vezes aparecem
export async function marcacoesNoDocumento(gerar) {
  const r = await gerar();
  const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  const des = (t) => t.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const textoDe = (frag) => des([...frag.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]).join(''));
  const cont = new Map();
  let onde = '';
  // percorre os parágrafos: título (estilo Título) ou legenda "Quadro N – …" / "Figura N – …" marca o lugar
  for (const m of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const p = m[0];
    const t = textoDe(p).trim();
    if (/w:pStyle w:val="Ttulo[123]"/.test(p) || /^(Quadro|Figura)\s*(SEQ[^–]*)?\d*\s*–/.test(t.replace(/SEQ \w+ \\\* ARABIC /, ''))) onde = t.replace(/SEQ \w+ \\\* ARABIC /, '').slice(0, 90);
    for (const run of p.matchAll(/<w:r>((?:(?!<\/w:r>).)*?<w:highlight[^>]*>(?:(?!<\/w:r>).)*?)<\/w:r>/gs)) {
      const texto = textoDe(run[1]).trim();
      if (!texto) continue;
      const k = texto;
      const e = cont.get(k) || { texto, n: 0, onde: new Set() };
      e.n += 1; if (onde) e.onde.add(onde);
      cont.set(k, e);
    }
  }
  return [...cont.values()].map((e) => ({ texto: e.texto, n: e.n, onde: [...e.onde].slice(0, 3).join('; ') })).sort((a, b) => b.n - a.n);
}
