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

const br = (iso) => String(iso || '').replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$3/$2/$1');
const nomeVinculo = (r, i) => `V${i + 1} – ${String(r.data.empresa || 'vínculo').split(/\s*\(|,/)[0].trim().slice(0, 45)} (${br(r.data.inicio) || '?'} a ${r.data.fim ? br(r.data.fim) : 'atual'})`;

export async function pendenciasDoCaso(caseId) {
  const dados = await carregar(caseId);
  const { c } = dados;
  const vincs = vinculosMotorista(dados).length ? vinculosMotorista(dados) : dados.periodos;
  const itens = [];
  const idx = new Map(dados.periodos.map((r, i) => [r.id, i]));

  // regra do caso: horas fora da direção (carga, descarga, paradas)
  const semTdigitado = vincs.filter((r) => !isFinite(horasDia(r.data.conducaoH)));
  if (semTdigitado.length || String(c.foraDirecaoH || '').trim()) {
    itens.push({
      id: 'foraDirecaoH', grupo: 'Regra do caso', rec: caseId, campo: 'foraDirecaoH', tipo: 'numero', valor: c.foraDirecaoH || '',
      titulo: 'Horas por dia fora da direção (carga, descarga e paradas)',
      explicacao: `Vale para os ${semTdigitado.length} vínculo(s) sem tempo de condução digitado: condução = jornada da entrevista − estas horas. Ex.: 5.`,
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
      id: 'conducaoPadraoH', grupo: 'Regra do caso', rec: caseId, campo: 'conducaoPadraoH', tipo: 'numero', valor: c.conducaoPadraoH || '',
      titulo: 'Condução padrão (h/dia) para os vínculos sem jornada na entrevista',
      explicacao: `${semJornada.length} vínculo(s) sem jornada identificada: ${semJornada.map((r) => nomeVinculo(r, idx.get(r.id))).join('; ')}.`,
    });
  }

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
    if (m.sugerida) {
      itens.push({ id: `conc-${r.id}`, grupo, rec: r.id, campo: 'penosidadeConclusao', tipo: 'texto', valor: '', sugestao: m.proposta,
        titulo: 'Conclusão técnica da penosidade', explicacao: 'Proposta do app pela contagem de fatores: adote como está, edite ou escreva a sua.' });
    }
  }
  return itens;
}

// Marcações que ainda sairiam no documento ([[...]]), agrupadas pelo texto, com quantas vezes aparecem
export async function marcacoesNoDocumento(gerar) {
  const r = await gerar();
  const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  // o texto marcado sai em runs com <w:highlight>
  const runs = [...xml.matchAll(/<w:r>((?:(?!<\/w:r>).)*?<w:highlight[^>]*>(?:(?!<\/w:r>).)*?)<\/w:r>/gs)]
    .map((m) => [...m[1].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]).join(''))
    .map((t) => t.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim())
    .filter(Boolean);
  const cont = new Map();
  for (const t of runs) cont.set(t, (cont.get(t) || 0) + 1);
  return [...cont.entries()].map(([texto, n]) => ({ texto, n })).sort((a, b) => b.n - a.n);
}
