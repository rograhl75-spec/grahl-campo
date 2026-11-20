// Revisão do texto digitado no app antes de ir para os documentos (o que está gravado não muda):
//  - acentos das palavras comuns digitadas sem acento no celular ("bau" → "baú", "periodos" → "períodos");
//  - crase em horários ("05h00 as 20h00" → "05h00 às 20h00");
//  - linhas que são instruções ao app ("utilizar sempre 10 horas…", "adotar os textos…") não vão para o texto.

const PALAVRAS = `bau:baú baus:baús cacamba:caçamba cacambas:caçambas onibus:ônibus caminhao:caminhão caminhoes:caminhões
periodo:período periodos:períodos frigorifico:frigorífico frigorificos:frigoríficos frigorifica:frigorífica
nao:não tambem:também apos:após ate:até alem:além entao:então tres:três mes:mês meses:meses ja:já
maquina:máquina maquinas:máquinas transito:trânsito regiao:região regioes:regiões horario:horário horarios:horários
diario:diário diaria:diária diarias:diárias rodoviario:rodoviário rodoviaria:rodoviária combustivel:combustível combustiveis:combustíveis
graos:grãos racao:ração acucar:açúcar calcario:calcário ceramica:cerâmica eletrodomesticos:eletrodomésticos moveis:móveis
suinos:suínos bovinos:bovinos pecas:peças mudancas:mudanças residuos:resíduos agua:água area:área areas:áreas
mecanico:mecânico mecanica:mecânica eletrico:elétrico eletrica:elétrica hidraulico:hidráulico hidraulica:hidráulica pneumatico:pneumático
servico:serviço servicos:serviços medio:médio media:média veiculo:veículo veiculos:veículos cabine:cabine
sitio:sítio sitios:sítios fazenda:fazenda estrada:estrada estradas:estradas rodovia:rodovia vicinal:vicinal
perecivel:perecível pereciveis:perecíveis quimicos:químicos quimico:químico perigosa:perigosa inflamavel:inflamável inflamaveis:inflamáveis
saude:saúde critico:crítico critica:crítica unico:único unica:única basico:básico pratico:prático sanitario:sanitário sanitarios:sanitários
condicoes:condições pressao:pressão tensao:tensão extensao:extensão excessao:exceção vibracao:vibração ruido:ruído ruidos:ruídos
carroceria:carroceria bitrem:bitrem rodotrem:rodotrem graneleiro:graneleiro graneleira:graneleira bau-frigorifico:baú-frigorífico
caloré:Kaloré calore:Kaloré
goncalves:gonçalves sao:são joao:joão conceicao:conceição assuncao:assunção comercio:comércio industria:indústria logistica:logística
distribuidora:distribuidora panificadora:panificadora agricola:agrícola agropecuaria:agropecuária metalurgica:metalúrgica ceramica:cerâmica`;
const MAPA = new Map(PALAVRAS.split(/\s+/).filter(Boolean).map((p) => p.split(':')));

const casoDe = (orig, nova) => {
  if (orig === orig.toUpperCase() && orig.length > 1) return nova.toUpperCase();
  if (orig[0] === orig[0].toUpperCase()) return nova[0].toUpperCase() + nova.slice(1);
  return nova;
};

export function acentuar(texto) {
  let s = String(texto ?? '');
  if (!s.trim()) return s;
  s = s.replace(/[A-Za-zÀ-ÿ-]+/g, (w) => {
    const k = w.toLowerCase();
    if (MAPA.has(k)) { const n = MAPA.get(k); return /^[A-Z]/.test(n) ? n : casoDe(w, n); }
    // terminações sem til/cedilha: -cao → -ção, -coes → -ções (não há palavra em português sem acento assim)
    if (/^[a-z]{3,}cao$/i.test(w)) return casoDe(w, k.replace(/cao$/, 'ção'));
    if (/^[a-z]{3,}coes$/i.test(w)) return casoDe(w, k.replace(/coes$/, 'ções'));
    return w;
  });
  // crase antes de horário: "as 20h00", "das 05h as 20h"
  // só entre dois horários ("05h00 as 20h00") ou na forma "das 5 as 18"; "menos as 5 h de carga" fica como está
  s = s.replace(/(\d{1,2}(?:h\d{0,2}|:\d{2}))\s+as\s+(\d{1,2}\s*(?:h|:\d{2}|horas?\b))/g, '$1 às $2');
  s = s.replace(/\b(das?)\s+(\d{1,2}(?:\s*(?:h\d{0,2}|:\d{2}|horas?))?)\s+as\s+(\d)/gi, '$1 $2 às $3');
  // concordância comum em ditado: "além dos anterior" → "além dos anteriores"
  s = s.replace(/\b(dos|das) anterior\b/gi, (m, d) => `${d} anterior${d.toLowerCase() === 'das' ? 'es' : 'es'}`);
  return s;
}

// linha que começa com um verbo de comando dirigido ao app ou ao perito
const RE_INSTRUCAO = /^\s*(sempre\s+)?(utilizar|utilize|usar|use|adotar|adote|considerar|considere|aplicar|aplique|manter|mantenha|repetir|repita|copiar|copie|seguir|siga|colocar|coloque|incluir|inclua|desconsiderar|desconsidere|ignorar|ignore|ver o|vide o)\b/i;
export const ehInstrucao = (linha) => RE_INSTRUCAO.test(String(linha || ''));
// notas de trabalho que não vão para o documento ("Confirmar com o segurado.", "(conferir)")
const RE_NOTA = /\s*\(?\b(confirmar|conferir|verificar)\s+com\s+o\s+(segurado|autor|periciado|reclamante)\b[^.()]*[.)]?/gi;
export function semInstrucoes(texto) {
  const s = String(texto ?? '').replace(RE_NOTA, '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ');
  if (!s.includes('\n') && !ehInstrucao(s)) return s;
  return s.split('\n').filter((l) => !ehInstrucao(l)).join('\n').trim();
}

// campos que não passam pela revisão: nomes próprios, identificadores, números e as horas (lidas como regra)
const PROTEGIDOS = /nome|empresa|cnpj|cpf|numero|processo|email|telefone|url|arquivo|^id$|Id$|codigo|placa|cid$|juizo|vara|oab/i;
const HORAS = /H$|horas|jornadaDia|^T$/;
export function revisarCampo(chave, valor) {
  if (typeof valor !== 'string' || !valor.trim()) return valor;
  // razão social: só os acentos (SERVICOS → SERVIÇOS, GONCALVES → GONÇALVES); o resto fica como registrado
  if (/^(empresa|razaoSocial|contratante)$/i.test(chave)) return acentuar(valor);
  if (PROTEGIDOS.test(chave)) return valor;
  const t = HORAS.test(chave) ? valor : semInstrucoes(valor);
  return acentuar(t);
}
