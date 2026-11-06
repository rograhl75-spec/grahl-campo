import { db, updateFields } from './db.js';

// Separa CPF / CNPJ / partes adicionais que vieram juntos no campo de nome
// (casos importados do app antigo). Mostra a sugestão antes de aplicar.
const CPF = /(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/;
const CNPJ = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/;
const limpa = (s) => String(s || '').replace(/[\s,;:–-]+$/g, '').replace(/\b(CPF|CNPJ)\s*[:nº.]*\s*$/i, '').replace(/[\s,;:–-]+$/g, '').trim();

export function sugerirLimpeza(d) {
  const mud = {};
  const extras = [];
  const autor = String(d.autorNome || '');
  const ma = autor.match(CPF);
  if (ma && /cpf/i.test(autor)) {
    const nome = limpa(autor.slice(0, ma.index));
    const resto = autor.slice(ma.index + ma[0].length).replace(/^[\s,;:–-]+/, '').trim();
    if (nome) {
      mud.autorNome = nome;
      if (!d.autorCpf) mud.autorCpf = ma[1];
      extras.push(`Texto original do autor: ${autor}`);
    }
  }
  const reu = String(d.reuNome || '');
  const mr = reu.match(CNPJ);
  if (mr) {
    const nome = limpa(reu.slice(0, mr.index));
    const resto = reu.slice(mr.index + mr[0].length).replace(/^[\s,;:–-]+/, '').trim();
    if (nome && nome.length > 3) {
      mud.reuNome = nome;
      if (!d.reuCnpj) mud.reuCnpj = mr[1];
      if (resto) extras.push(`Réus / partes adicionais: ${resto.replace(/^e\s+/i, '')}`);
      extras.push(`Texto original do réu: ${reu}`);
    }
  }
  if (!Object.keys(mud).length) return null;
  if (extras.length) mud.observacoes = [d.observacoes, ...extras].filter(Boolean).join('\n');
  return mud;
}

export async function listarSugestoes() {
  const casos = (await db.records.where('kind').equals('caso').toArray()).filter((c) => !c.deleted);
  return casos.map((c) => ({ id: c.id, antes: c.data, mud: sugerirLimpeza(c.data) })).filter((x) => x.mud);
}

export async function aplicarSugestoes(lista) {
  for (const s of lista) await updateFields(s.id, s.mud);
  return lista.length;
}
