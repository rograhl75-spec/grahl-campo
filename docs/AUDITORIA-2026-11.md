# Auditoria técnica – novembro de 2026 (v2.24.0)

## Corrigido nesta versão

### Legislação e conclusão previdenciária
- **Tratorista (Súmula 70 da TNU):** até 28/04/1995 é enquadrado por categoria, equiparado a motorista de caminhão (cód. 2.4.4 / 2.4.2). Antes, o app não reconhecia essa hipótese.
- **Enquadramento por categoria:** passa a ser descrito como presunção legal. O texto não diz mais "exposição habitual e permanente" a agentes nocivos.
- **Cobrador de ônibus:** é enquadrado só pelo cód. 2.4.4 do Dec. 53.831/64, porque o Dec. 83.080/79 não traz o cobrador.
- **Ruído e EPI (STF, Tema 555):** quando o ruído supera o limite e há EPI registrado, a conclusão registra que o protetor auricular não descaracteriza a especialidade. O registro só sai quando a jurisprudência está habilitada.
- **Citações incluídas no item de jurisprudência:** TNU Tema 174 (NHO-01/NR-15, vedada a medição pontual) e Súmula 70 da TNU.
- **Comparação com o limite:** a regra de arredondamento passou a ser uma só, de 1 casa (a resolução do dosímetro), e vale para a conclusão, o confronto e a memória dos paradigmas. Antes, o mesmo laudo podia dizer "SIM" num quadro e "NÃO" em outro.
- **Dose de ruído (trabalhista):** a dose é projetada para a jornada (D × TE / T amostrado). Antes, a dose do tempo amostrado era comparada diretamente com 100%.
- **Vibração de paradigma:** o aren do laudo de origem não é mais normalizado duas vezes.

### Documentos gerados
- Vínculo sem posto vinculado não usa mais a medição de outro posto: aparece a pendência `[[vincular posto]]`.
- O período imprescrito calculado a partir de 29/02 não gera mais a data inexistente 29/02 de ano não bissexto.
- Data de entrega do EPI no formato DD/MM/AAAA.
- Fim de vínculo "atual" calculado no fuso do aparelho. Antes, depois das 21 h saía o dia seguinte.
- Numeração dos quesitos não se repete mais ("1) 1)", "a. a)"). Também não sai mais o título "Quesitos do INSS" duplicado.
- Pré-relatório: a numeração não pula mais de 8.2 para 8.4.
- Correções de redação: "as atividades do autor conduzia…" e "mais de 0 anos". Plurais corretos em "no período / nos períodos".
- Visual:
  - Quadros:
    - cabeçalho azul-marinho com texto branco;
    - linhas alternadas;
    - filetes horizontais e moldura azul;
    - "Fonte" à esquerda (padrão ABNT/IBGE).
  - Títulos primários com filete azul.
  - Figuras com linha de "Fonte".
  - Número de página no rodapé.
  - Estilos Normal e Título 1–3 do Word ajustados para Abadi azul, de modo que o texto digitado depois sai igual ao gerado.

### Lógica do app
- Números no formato brasileiro com milhar ("1.234,5") e tempos em minutos ("480", "45min").
- Tabela de similares: números de modelo como "Axor 2035" não são mais descartados como se fossem ano.
- Importação pelo Claude:
  - agentes reconhecidos por sinônimos (antes, VMB virava VCI);
  - origem dos quesitos (Reclamante, Reclamada, Requerido…) reconhecida por sinônimos;
  - datas convertidas para o formato do app;
  - a fase do caso nunca regride.
- Mesclagem entre aparelhos com desempate determinístico no empate de relógio, para que todos os aparelhos fiquem iguais.
- Casos:
  - prazos vencidos (até 15 dias) aparecem em vermelho na agenda e no cartão;
  - a lista fica ordenada pela próxima data.
- Paradigmas da mesma família ordenados pela data real da medição.
- Equipamentos: aviso de calibração vencida (12 meses ou a data de "Próxima calibração").
- Interface:
  - sem rolagem horizontal no celular;
  - abas fixas abaixo do cabeçalho mesmo quando ele quebra em várias linhas;
  - foco visível para teclado;
  - estado da sincronização anunciado a leitores de tela.

## Banco de ruído e vibração de máquinas (novo)
- Fica em Paradigmas → **Máquinas – ruído e vibração**:
  - 26 categorias (agrícolas, florestais e portáteis, construção, movimentação de carga);
  - origem do dado e condição de operação de cada registro;
  - resumo por categoria (n, faixa e mediana);
  - níveis de ação e limites.
- Famílias técnicas A1–A5, C1–C2 e P1, que se somam às F1–F8.
- Instrução própria para o Claude extrair valores de artigos, manuais de fabricante e laudos, com a referência ABNT.
- **Nenhum valor numérico foi incluído sem fonte conferida.** A busca encontrou estudos brasileiros sobre trator sem cabine (até cerca de 98 dB(A)) e com cabine, e o Portale Agenti Fisici (INAIL), que tem banco de vibração por modelo. Os sites dos periódicos estão bloqueados na rede desta sessão, então os valores não foram conferidos no original nem cadastrados.

## Resolvido na v2.25.0
1. **Firebase:** as regras aceitam só as contas da lista de e-mails, com e-mail verificado. No Firestore, os registros precisam estar no formato que o app grava, a exclusão física é negada e o resto do banco fica fechado. No Storage, fotos só em JPEG até 15 MB e anexos (PDF, imagem, texto, Word) até 40 MB.
2. **Backup ZIP:** passa a levar os anexos, na pasta `anexos/` com `indice.json`. Os anexos que estão só na nuvem são baixados antes de gerar o ZIP, e o LEIA-ME avisa quando o backup é a única cópia de um anexo grande. A restauração devolve o PDF sem tratá-lo como foto, e os grandes continuam só no aparelho.
3. **Códigos de paradigma:** os paradigmas incluídos a partir de laudos passam a ter id aleatório. Se dois aparelhos gerarem o mesmo código, o mais antigo o mantém e o outro é renumerado: fica com "codigoAnterior", situação "Revisar" e um aviso em Paradigmas que lista os vínculos e similares que citam o código. A renumeração roda após a sincronização e ao abrir Paradigmas.

## Resolvido na v2.26.0
1. **Registro de digitação:** o texto recuperado após o navegador fechar é gravado com o horário em que foi digitado. Assim, uma edição mais nova feita em outro aparelho prevalece na sincronização.
2. **Penosidade:** "pressão de prazos" e "condução prolongada" deduzidas da jornada saem como `[[sugestão do app – confirmar]]`, com a fonte indicando a dedução. A conclusão calculada pela contagem de fatores sai como proposta a confirmar; se o perito redigir a conclusão no vínculo, vale a dele. Sem jurisprudência habilitada, o título passa a ser "perícia individualizada".
3. **Jurisprudência e referências:**
   - Tema 317 da TNU: PEDILEF 5000648-28.2020.4.02.5002/ES, novo julgamento em 18/09/2025, aplicável a partir de 19/11/2003.
   - Tema 323 da TNU: PEDILEF 0510577-41.2020.4.05.8200/PB, embargos rejeitados em 11/03/2026.
   - Tema 1307 do STJ: REsp 2.164.724/RS, julgado em 07/05/2026 e publicado em 20/05/2026. Uma fonte secundária indica publicação em 03/06/2026; conferir no site do STJ.
   - Incluídos os Temas 534 (eletricidade) e 1031 (vigilante) do STJ; entram quando o caso trata de eletricidade ou vigilância.
   - Novas referências no laudo previdenciário: Leis 9.032/1995 e 9.732/1998, EC 103/2019, NR-15 e NR-9 (Portaria SEPRT 6.735/2020).
   - A NHO 08 só entra quando há particulado (poeira, sílica, fumos metálicos…).
4. **Ruído com q = 3 (NHO-01):**
   - novo campo "Fator de duplicação" na medição, com q = 5 como padrão;
   - NEN e nível pela dose calculados com k = 10 quando q = 3;
   - antes de 19/11/2003, a medição com q = 3 não é usada e fica marcada para nova leitura com q = 5; no trabalhista (NR-15), também pede q = 5;
   - o quadro trabalhista mostra a dose projetada para a jornada.
5. **Capa e listas:**
   - a primeira página (capa) sai sem número, mantendo o timbrado;
   - o LTCAT com fotos ganha a Lista de Figuras antes da Lista de Quadros (NBR 14724).

## Observações
- As regras do Firebase não foram testadas em emulador nesta sessão. Publique e confira o login no tablet e no PC.
- Confira no original a tese e as datas da jurisprudência antes de usá-las em peça: as conferências desta sessão foram feitas em fontes secundárias.
