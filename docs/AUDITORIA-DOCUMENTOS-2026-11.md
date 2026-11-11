# Auditoria dos documentos gerados e proposta do banco de agentes químicos – novembro de 2026 (v2.27.0)

Esta auditoria não procura só erros. Ela confere se os documentos cobrem todos os tipos de trabalho (perícia judicial e extrajudicial, perito do juízo, assistente técnico do autor ou do réu, laudo para contratante), se há modelos repetidos e o que pode melhorar no conteúdo. No fim está a proposta do banco de agentes químicos.

A seção 0 resume o que já foi implementado na v2.28.0. As seções 1 a 6 são o relatório original da auditoria.

---

## 0. Implementado na v2.28.0

Decisões tomadas por você:
- Você não atua mais como perito na Justiça do Trabalho, só como assistente técnico.
- O extrajudicial inclui insalubridade, periculosidade e acidente do trabalho.
- As petições foram agrupadas em cartões com opções.
- O eSocial fica de fora, porque o trabalho é corrigir os períodos anteriores.
- O banco químico usa fontes abertas até a compra do livreto da ACGIH.

| Item | O que mudou |
|---|---|
| R1 | Cartão único **Honorários** com três situações (proposta, majoração, aceite do valor arbitrado). |
| R2 | Botão **"Redigir com o Claude"** em cada cartão. A lista separada saiu; ficou só "Responder os quesitos com o Claude". |
| R3 | **Extrajudicial pelo objeto e por quem contratou** (novo campo "Quem contratou" e nº da ART no Resumo). Objeto previdenciário → LTCAT e, se não foi a empresa, parecer previdenciário. Insalubridade ou periculosidade → laudo extrajudicial. Acidente → laudo de acidente. Casos antigos sem objeto continuam como LTCAT. O assistente técnico não recebe mais o parecer previdenciário. |
| R4 | A origem "Complementares" aparece como **"Esclarecimentos ao perito (após o laudo)"**. O valor gravado não mudou, então nada precisa ser convertido. |
| R5 | Cartão renomeado para "Relatório fotográfico avulso". |
| P1 | **Laudo de acidente do trabalho** (judicial e extrajudicial), com novo bloco "Acidente do trabalho" no Resumo, que também é importado dos autos pelo Claude. As NRs aplicáveis são detectadas pela máquina e pela atividade. Tem árvore de causas e ressalva do nexo médico. A Vara Cível e a matéria Acidentária não recebem mais o laudo da CLT. |
| P2, P3, P4 | Cartão **"Prorrogação, diligência frustrada ou escusa"** (arts. 476, 380/473 § 3º/474 e 157). |
| A1, A3, item 10 | **Parecer de AT** conforme a posição (concorda / impugna em parte / impugna). No previdenciário: síntese e análise por período e quadro de critérios. Quadro de pontos divergentes. |
| A2 | **Relatório de acompanhamento da diligência** para o cliente: verificação dos procedimentos do perito, pontos favoráveis, pontos de atenção e próximos prazos. |
| A4, A5 | Cartão **"Petições do assistente técnico"**: quesitos suplementares, pedido de esclarecimentos e manifestação sobre os esclarecimentos. |
| E1 | **Laudo de insalubridade e periculosidade extrajudicial**: capa com contratante e ART, sem endereçamento ao Juízo, com recomendações. |
| E4, E6 | Parecer preventivo também quando a empresa contrata o extrajudicial; nº da ART no caso. |
| 4, 6 | **Quadro conclusivo por agente** no laudo trabalhista e no extrajudicial. **Confronto automático com o Anexo 11** (média, valor teto, valor máximo = LT × FD, absorção pela pele, grau). |
| 7 | **LINACH Grupo 1** registrada no laudo previdenciário (Dec. 3.048/1999, art. 68, § 4º). |
| 11 | Justiça do Trabalho: a proposta de honorários não pede mais conta para depósito (CLT, art. 790-B, § 3º). |
| 13, 14 | Pré-relatório com a estratégia da assistência (AT) ou as verificações do perito, e com os dados do acidente. |

**Correção de conteúdo encontrada na conferência do texto oficial do Anexo 11 da NR-15:** o app dizia que, para jornada acima de 48 h, o limite se corrige por Brief & Scala. O item 10.1 do Anexo 11 apenas remete ao art. 60 da CLT; a norma não prevê fator de correção. A instrução do Claude e o laudo foram corrigidos, e a calculadora apresenta Brief & Scala como critério técnico, não normativo.

Banco de agentes químicos: está na seção 5 e em Paradigmas → Agentes químicos.

## Implementado na v2.29.0 (itens que ficaram para depois)

| Item | O que mudou |
|---|---|
| 1 | **Quadro dos requisitos do art. 473 do CPC** no encerramento do laudo trabalhista, do previdenciário e do laudo de acidente judicial, indicando o item que atende a cada inciso. |
| 2 | **Síntese da conclusão logo após a identificação**: por agente no laudo trabalhista e no extrajudicial; por período no previdenciário. |
| 3 | **Comunicação às partes e aos assistentes (art. 474)** no quadro da diligência, com o novo campo "Comunicação da data às partes" no Campo. No laudo do perito sem esse dado, aparece a pendência para preencher. |
| 8 | **Códigos do agente químico por decreto** e grupo da LINACH em quadro no laudo previdenciário. Os códigos vêm do campo "Códigos nos decretos previdenciários" de cada ficha do banco. |
| 9 | **Recomendações geradas a partir do nível de ação da NR-9**, no LTCAT e no laudo extrajudicial: ruído com dose de 50%, VCI com aren de 0,5 m/s² ou VDVR de 9,1 m/s^1,75, VMB com aren de 2,5 m/s², químicos com metade do limite. As medidas seguem a ordem da NR-1. |
| 12 | **Conferido:** a Res. CJF 305/2014 não foi revogada. Vale com a redação da Res. CJF 937, de 22/01/2025 (que trocou o Anexo Único), e os tribunais a aplicam em 2026. O app já cita essa redação. A Res. CJF 956/2025 (conferida em 11/11/2026) trata só das perícias de vícios de construção do Minha Casa, Minha Vida – Faixa 1: ela manda usar a Res. 305/2014 como parâmetro (art. 17, Tabela II; até três vezes o máximo para vistoria de empreendimento, observado o art. 28) e não altera os honorários das perícias de insalubridade, periculosidade ou tempo especial. A divergência sobre o dispositivo exato do teto de três vezes (art. 28, § 1º, ou parágrafo único) continua; conferir no texto consolidado no site do CJF. |
| 15 | **Termo de presença** para imprimir antes da vistoria: já traz os nomes cadastrados e tem linhas para assinatura. |
| E2 | **Dados para o PPP em papel** (períodos anteriores ao eSocial) no Anexo A do LTCAT: por período, tipo, fator de risco, intensidade (NEN, IBUTG, aren, concentração), técnica (NR-15, NHO-01, 06, 09 ou 10, ou o método do químico), EPC e EPI. EPI marcado "não se aplica" antes de 03/12/1998. |
| E3 | **Parecer trabalhista de viabilidade** para o trabalhador ou o advogado, com quadro de viabilidade por pedido, provas a produzir e limitações. |
| E5 | **Proposta de serviços** extrajudicial: objeto conforme o caso, etapas, documentos a fornecer, prazo, valor por extenso, pagamento, deslocamento, ART, validade de 30 dias e aceite. |
| P5 | **Esclarecimentos sobre o parecer do assistente técnico** (art. 477, § 2º, II) na resposta aos quesitos suplementares, em quadro "alegação / esclarecimento". Os pontos entram na etapa 3, um por linha, no formato "alegação :: esclarecimento". |
| P6 | **Roteiro da periculosidade por anexo da NR-16** (explosivos, inflamáveis, segurança, energia elétrica, motocicleta, radiações ionizantes). Os anexos são escolhidos pelo texto do caso; se nada for identificado, todos são listados para você excluir os que não se aplicam. |

---

## 1. Por que a tela mostra "4 fases e mais 10 modelos"

A aba Documentos tem 16 modelos de Word. Ela mostra, agrupados por fase, só os que servem para o papel do caso. Os demais ficam em **"Mostrar outros modelos (N)"**. Logo abaixo vem o quadro **"Redigir com o Claude"**, que lista mais 8 documentos com os mesmos nomes dos modelos Word. Essa segunda lista é o que dá a impressão de repetição.

Simulação feita com as regras atuais do app (`src/docx/reports.js`):

| Situação do caso | Fases exibidas | Recomendados | Em "outros modelos" | Recomendados |
|---|---|---|---|---|
| Perito – Justiça do Trabalho | 6 | 10 | 6 | pré-relatório, proposta de honorários, majoração, aceite dos arbitrados, agendamento, suplementares, pagamento, registro, fotos, laudo trabalhista |
| Perito – Justiça Federal, previdenciário | 6 | 9 | 7 | igual, sem proposta de honorários, com laudo previdenciário |
| Perito – Estadual, competência delegada | 6 | 10 | 6 | igual ao anterior, com proposta de honorários |
| Perito – Fazenda Pública (servidor) | 6 | 10 | 6 | igual ao da Justiça do Trabalho |
| **Perito – Vara Cível (acidente)** | 6 | 10 | 6 | **recebe o laudo de insalubridade da CLT, que não serve para acidente** |
| Assistente do autor – Trabalho | 3 | 5 | 11 | pré-relatório, indicação, registro, fotos, parecer de AT |
| Assistente do réu – Trabalho | 3 | 6 | 10 | os mesmos, mais parecer preventivo |
| Assistente do autor – previdenciário | 3 | 6 | 10 | os mesmos, mais parecer previdenciário |
| Extrajudicial (contratante) | 3 | 5 | 11 | pré-relatório, registro, fotos, **LTCAT e parecer previdenciário** |

Conclusão: os "outros modelos" não são cópias. São os modelos de outros papéis (por exemplo, as petições do perito quando você atua como assistente). Há, porém, as sobreposições reais da seção 2 e as lacunas da seção 3.

---

## 2. Repetições e sobreposições

| # | O que se repete | Proposta |
|---|---|---|
| R1 | **Três petições de honorários no início do caso**, todas com "aceite": *Aceite e proposta* (art. 465, § 2º), *Majoração* e *Aceite dos arbitrados*. Para o perito da Justiça do Trabalho e da competência delegada, as três aparecem juntas. | Um único cartão **"Honorários"** com a pergunta "Qual a situação?": (a) apresentar proposta, (b) pedir majoração do valor fixado, (c) aceitar o valor arbitrado. O app escolhe o texto. Na Justiça Federal e no JEF, a opção (a) não aparece. |
| R2 | **Lista "Redigir com o Claude"** repete os nomes dos modelos Word. | Tirar a lista separada e pôr em cada cartão dois botões: "Gerar Word" e "Redigir com o Claude". A instrução "Respostas a todos os quesitos" passa para a aba Quesitos, onde a resposta é aplicada. |
| R3 | **Parecer previdenciário aparece junto com o LTCAT** no extrajudicial e **junto com o parecer de AT** no judicial previdenciário. Laudo previdenciário, LTCAT e parecer previdenciário usam a mesma base (fundamentação por período, profissiografia, avaliação, conclusão por período). | Manter os três, porque a natureza jurídica é diferente (prova do Juízo, documento da empresa, parecer para o segurado). Ajustar quando cada um é sugerido: no extrajudicial, perguntar **quem contratou** (empresa → LTCAT; segurado ou advogado → parecer). No judicial, o assistente recebe o parecer de AT; o parecer previdenciário só aparece antes do ajuizamento. |
| R4 | **"Quesitos complementares"** (usados no parecer de AT como pedido de esclarecimento) e **"quesitos suplementares"** (usados na resposta do perito) são termos parecidos para coisas diferentes. | Usar os termos do CPC: *quesitos suplementares* (art. 469, durante a diligência) e *pedido de esclarecimentos* (art. 477, §§ 1º e 2º, depois do laudo). Renomear a origem "Complementares" para "Esclarecimentos (após o laudo)". Os dados já cadastrados são convertidos. |
| R5 | **Relatório fotográfico avulso** e **Anexo I do laudo** trazem as mesmas fotos. | Manter os dois: o avulso serve ao assistente e à manifestação. Só renomear o cartão para "Relatório fotográfico avulso (o laudo já traz as fotos no Anexo I)". |

---

## 3. Lacunas por tipo de trabalho

Prioridade: **A** = trabalho frequente sem modelo ou com modelo errado; **M** = economiza tempo; **B** = conveniência.

### 3.1 Perito do Juízo

| # | Documento que falta | Base | Prioridade |
|---|---|---|---|
| P1 | **Laudo de acidente do trabalho / responsabilidade civil**: hoje a Vara Cível e a matéria "Acidentária" recebem o laudo de insalubridade da CLT. Estrutura proposta: dinâmica do acidente, máquina ou local, normas aplicáveis (NR-12, NR-35, NR-10, NR-18…), análise de causas (árvore de causas ou método equivalente), medidas de prevenção existentes e exigíveis, nexo técnico, conclusão e quesitos. | CPC, art. 473; NR-1 (GRO); NRs setoriais | A |
| P2 | **Pedido de prorrogação do prazo do laudo** (empresa não entregou documentos, diligência remarcada). | CPC, art. 476 | A |
| P3 | **Comunicação de diligência frustrada / pedido de intimação para apresentar documentos** (empresa fechada, ausência, recusa de acesso). | CPC, arts. 380 e 473, § 3º | A |
| P4 | **Escusa ou declaração de impedimento/suspeição**. | CPC, arts. 148, 157 e 467 | M |
| P5 | **Esclarecimentos sobre o parecer do assistente técnico**: hoje entram como texto livre em "Esclarecimentos complementares". Proposta: item próprio, ponto a ponto, com "Alegação do AT / Esclarecimento do perito". | CPC, art. 477, § 2º, II | M |
| P6 | **Laudo de periculosidade com roteiro por anexo da NR-16**: inflamáveis (área de risco, quantidades armazenadas, abastecimento), explosivos, energia elétrica (SEP), segurança patrimonial, motocicleta e radiação ionizante. Hoje é um único "[[Redigir]]". | NR-16; TST, Súmula 364 | M |

### 3.2 Assistente técnico (autor ou réu)

| # | Documento que falta | Base | Prioridade |
|---|---|---|---|
| A1 | **Parecer de AT previdenciário**: o modelo atual só abre seção para "Insalubridade" e "Periculosidade". No previdenciário, cai num item genérico, sem confronto por período. Proposta: quadro "período / conclusão do perito / posição da assistência", com critérios de ruído por período (NEN, NHO-01, q, Temas 174 e 317 da TNU), EPI (art. 291 da IN 128/2022) e conclusão por período. | CPC, art. 477, § 1º | A |
| A2 | **Relatório de acompanhamento da diligência para o cliente** (advogado ou empresa): o que o perito fez e não fez, instrumentos e calibração, tempo de amostragem, postos avaliados, divergências e riscos. Hoje o "Registro da diligência" tem o mesmo texto para perito e assistente. | – | A |
| A3 | **Requerimentos do parecer de AT conforme a posição**: hoje o texto fixo pede "que o laudo não seja acolhido", mesmo quando a assistência concorda. Proposta: campo "Posição: concorda / impugna em parte / impugna", que muda a conclusão e os requerimentos. | – | A |
| A4 | **Petição avulsa de quesitos suplementares** (antes do laudo) e **petição de pedido de esclarecimentos** (depois do laudo), separadas do parecer. | CPC, arts. 469 e 477, § 2º | M |
| A5 | **Manifestação sobre os esclarecimentos do perito** (segunda rodada). | – | M |
| A6 | **Prazo do parecer na lista de casos**: 15 dias comuns após a intimação do laudo. | CPC, art. 477, § 1º | B |

### 3.3 Extrajudicial

Hoje todo caso extrajudicial é tratado como previdenciário (`contextoLegal` em `src/schema.js`). Por isso não é possível gerar um laudo de insalubridade para uma empresa.

| # | Documento que falta | Base | Prioridade |
|---|---|---|---|
| E1 | **Laudo de insalubridade e periculosidade para a empresa** (caracterização para pagamento do adicional). | CLT, art. 195; NR-15, item 15.4.1; NR-16 | A |
| E2 | **Dados para o PPP / eSocial S-2240**: o modelo se chama "LTCAT + PPP", mas não gera o PPP. Proposta: quadro por subperíodo com fator de risco, intensidade/concentração, técnica, EPC e EPI eficaz, CA e código GFIP. O formulário em papel sai só para os períodos anteriores ao eSocial (SST). | IN 128/2022; leiaute do eSocial | A |
| E3 | **Parecer trabalhista de viabilidade** para o advogado do reclamante, antes do ajuizamento (equivalente ao parecer previdenciário). | – | M |
| E4 | **Parecer preventivo para a empresa contratante**: hoje só aparece para o assistente do réu. | – | M |
| E5 | **Proposta de serviços / contrato** extrajudicial: escopo, prazo, valor, ART e o que a empresa deve fornecer. | – | M |
| E6 | **Campo "nº da ART"** no caso. Hoje o LTCAT deixa `[[nº da ART]]` em dois lugares. | Lei 6.496/1977 | B |

---

## 4. Melhorias de conteúdo nos modelos existentes

### 4.1 Em todos os laudos e pareceres
1. **Quadro dos requisitos do art. 473 do CPC** no encerramento (exposição do objeto, análise técnica, método, resposta conclusiva aos quesitos), indicando o item do laudo, como já é feito no LTCAT com o art. 276 da IN 128/2022.
2. **Síntese conclusiva logo após a identificação**: quadro curto "agente/período → conclusão". O juiz lê primeiro, e o laudo continua completo.
3. **Ciência das partes e dos assistentes** no item da diligência ("partes intimadas no mov. X – art. 474 do CPC; presentes: …"). Hoje a menção ao art. 474 só aparece na petição de agendamento.

### 4.2 Laudo trabalhista
4. **Quadro conclusivo automático por agente**, como o previdenciário já tem: agente, anexo, limite, valor, supera/não supera, grau (10, 20 ou 40%) ou periculosidade (30%), período. O texto continua sendo seu; o quadro sai pronto das medições.
5. **Neutralização pelo EPI em quadro**: CA e validade na data da entrega, NRRsf × nível medido, periodicidade de troca, treinamento, fiscalização do uso (NR-6; TST, Súmulas 80 e 289).
6. **Químicos**: confronto automático com o Anexo 11 (limite corrigido por Brief & Scala para jornada acima de 48 h, valor teto, absorção pela pele) e roteiro qualitativo do Anexo 13. Isso depende do banco da seção 5.

### 4.3 Laudo previdenciário e LTCAT
7. **Cancerígenos da LINACH (Grupo 1)**: avaliação qualitativa, em que a presença no ambiente basta e o EPI não descaracteriza (Decreto 3.048/1999, art. 68, § 4º). O app ainda não trata esse caso; ele também depende do banco químico.
8. **Códigos do agente por decreto** (53.831/64, 83.080/79, 2.172/97, 3.048/99) para químicos, como já é feito para ruído e categoria.
9. **LTCAT, item 7 (Recomendações)**: gerar o quadro a partir dos agentes acima do nível de ação, na ordem da NR-1 (eliminação, substituição, EPC, administrativas, EPI).

### 4.4 Parecer de assistente técnico
10. Ver A1 e A3. Incluir também o **quadro de pontos divergentes** ("Afirmação do laudo / item / análise da assistência / norma"), que é o formato mais fácil de o juiz conferir.

### 4.5 Petições do perito
11. **Justiça do Trabalho**: a proposta de honorários não deve pedir conta para depósito prévio, porque o adiantamento não pode ser exigido (CLT, art. 790-B, § 3º). A conta entra só no pedido de pagamento. Conferir também se a majoração na Justiça do Trabalho deve citar a resolução do CSJT sobre honorários periciais, e não a do CJF.
12. **Justiça Federal**: conferir se a Res. CJF 305/2014 (tabelas e art. 28) continua sendo a norma vigente ou se foi alterada. O app a cita na majoração e no aceite.

### 4.6 Pré-relatório
13. **Para o assistente técnico**: seção "Estratégia da assistência" (pontos favoráveis e desfavoráveis, documentos a juntar, quesitos a propor, riscos).
14. **Para o perito**: checagem de impedimento/suspeição e estimativa de horas, que alimenta a proposta de honorários.

### 4.7 Registro da diligência
15. **Termo de presença com linhas para assinatura**: imprimir e colher a assinatura dos presentes no local.

---

## 5. Banco de agentes químicos – proposta

### 5.1 O que ele faz no app
1. **Consulta**: ficha do agente com propriedades físico-químicas, toxicologia, limites e enquadramentos.
2. **Medição de agente químico (aba Campo)**: ao escolher o agente do banco, o app preenche o limite, a unidade, o grau e os indicadores de pele e teto. Ele também calcula:
   - a conversão ppm ↔ mg/m³ (pela massa molar);
   - o % do limite;
   - o limite corrigido por Brief & Scala para jornada estendida;
   - a soma C/LT para misturas de agentes com efeito aditivo.
3. **Laudos**:
   - trabalhista: confronto automático com o Anexo 11, roteiro do Anexo 13 e 13-A;
   - previdenciário: código do agente em cada decreto e regra da LINACH;
   - LTCAT: fator de risco para o PPP;
   - em todos: quadro de toxicologia do agente.
4. **Instrução para o Claude**: a ficha do agente segue junto com o caso, para a redação.

### 5.2 Campos de cada agente

| Grupo | Campos |
|---|---|
| Identificação | nome, sinônimos e nomes comerciais, nº CAS, fórmula, massa molar, família química, nº ONU |
| Físico-química | estado físico, ponto de fusão e de ebulição, pressão de vapor, densidade, densidade de vapor, solubilidade, ponto de fulgor, LIE/LSE, temperatura de autoignição, limiar de odor |
| Legislação brasileira | NR-15 Anexo 11 (LT em ppm e mg/m³, grau, absorção pela pele, valor teto); Anexo 12 (poeiras minerais); Anexos 13 e 13-A (atividade e grau); LINACH (grupo); Anexo IV do RPS e Decretos 53.831/64 e 83.080/79 (código); NR-7 (indicador biológico, momento da coleta, valor de referência); eSocial Tabela 24 (código do fator de risco); NR-20 / NR-16 (classe de inflamável) |
| Referências internacionais | ACGIH (TLV-TWA, STEL, C), NIOSH (REL, IDLH), OSHA (PEL), GHS (frases H) |
| Toxicologia | vias de absorção, órgãos-alvo, efeitos agudos e crônicos, sinais e sintomas, IARC, mutagenicidade e toxicidade à reprodução |
| Avaliação | método de amostragem e análise (NIOSH/OSHA), amostrador, vazão e volume |
| Proteção | respirador e filtro, material da luva |
| Controle | **fonte e data de conferência em cada grupo**; situação "Conferido" ou "A conferir" |

### 5.3 De onde vêm os dados

Segue a regra do banco de máquinas: **nenhum valor entra sem fonte conferida**.

| Fonte | Uso | Observação |
|---|---|---|
| NR-15 (Anexos 11, 12, 13 e 13-A), LINACH (Portaria Interministerial nº 9/2014), Anexo IV do RPS, Decretos 53.831/64 e 83.080/79, NR-7 (Quadro 1), eSocial Tabela 24 | Base legal (vem pronta no app) | Texto normativo público. Proposta: transcrever para um arquivo-base, com versão por data, como já é feito com a base de paradigmas, e você confere antes de liberar. |
| NIOSH Pocket Guide | Físico-química, REL, IDLH, vias, órgãos-alvo, métodos | Domínio público (governo dos EUA). |
| PubChem | Identificação e físico-química | Dados abertos; citar a fonte. |
| IARC (lista de classificações) | Carcinogenicidade | A classificação é informação factual; citar a monografia. |
| GESTIS (IFA) | Consulta | Ler os termos de uso antes de copiar em massa. |
| ACGIH (TLVs e BEIs) | Referência técnica | Protegido por direito autoral: o app não traz a tabela. Você digita do seu livreto, com a edição. |
| FISPQ/FDS do fabricante (NBR 14725) | Produto do caso | Importada pelo Claude a partir do PDF, ligada ao caso. |

### 5.4 Como encaixa no código
- Novo tipo de registro `quimico`, global (não preso a um caso), sincronizado como os paradigmas.
- Arquivo `src/quimicos.js`: catálogo, conversões, Brief & Scala, soma C/LT e confronto com o Anexo 11. Tudo com testes.
- Nova aba **"Agentes químicos"** ao lado de "Máquinas – ruído e vibração", com:
  - busca por nome, sinônimo ou CAS;
  - filtros por anexo da NR-15 e por LINACH;
  - ficha de consulta.
- Importação:
  - **"Copiar instrução de químicos"**: o Claude extrai a ficha de FISPQ, NIOSH ou artigo, com referência ABNT, e o app aplica sem duplicar (chave: CAS);
  - importação de CSV/JSON.
- Arquivo-base `public/bases/quimicos-legal.json` com a parte legal, carregado pelo mesmo mecanismo de versão da base de paradigmas.
- Na medição de agente químico, campo "Agente do banco", que preenche e calcula os valores da seção 5.1.

### 5.5 Etapas sugeridas
1. **Estrutura**: registros, tela de consulta, importação pelo Claude e CSV, cálculos e testes. O banco começa vazio.
2. **Base legal**: transcrição do Anexo 11, da LINACH, dos códigos dos decretos e da NR-7. Você confere numa lista impressa antes de liberar.
3. **Integração**: medição, laudo trabalhista, laudo previdenciário, LTCAT/PPP e instrução do Claude.
4. **Enriquecimento**: físico-química e toxicologia dos agentes que você mais usa (por exemplo: hidrocarbonetos aromáticos, solventes, sílica, fumos metálicos, agrotóxicos, álcalis), pelo NIOSH e pelas FISPQs.

---

## 6. Ordem de implementação sugerida

| Versão | Conteúdo |
|---|---|
| v2.28 | Reorganização da aba Documentos: R1 a R5; extrajudicial com "quem contratou"; Vara Cível e Acidentária sem o laudo da CLT; A3; itens 11 e 12 (petições do perito). |
| v2.29 | Novos modelos de prioridade A: P1, P2, P3, A1, A2, E1, E2. |
| v2.30 | Melhorias 1 a 5, 9, 10, 13 a 15; modelos de prioridade M. |
| v2.31 a v2.33 | Banco de agentes químicos, etapas 1 a 3 (seção 5.5), e melhorias 6 a 8, que dependem dele. |

### Decisões que dependem de você
1. Você faz perícias de **acidente do trabalho / responsabilidade civil** (P1)? Se sim, em quais varas e com quais quesitos típicos?
2. No extrajudicial, você faz **laudo de insalubridade/periculosidade para empresas** (E1) ou só LTCAT/parecer para o segurado?
3. Prefere o cartão único de **honorários** (R1) ou manter as três petições separadas?
4. Para o banco químico: quais são os **agentes mais frequentes** nos seus casos? Você tem o livreto da **ACGIH** (edição) para digitar os TLVs?

---

## 7. Auditoria das citações normativas e de jurisprudência (11/11/2026)

Cada citação do app foi conferida contra o texto oficial: gov.br (NRs e portarias), Senado, Câmara e normas.leg.br (leis e decretos), CJF, STF, STJ, TNU, TRF4 e TST. Não se preencheu nada de memória; o que não pôde ser aberto ficou como "não conferido".

### Erros corrigidos
| Ponto | Antes | Agora |
|---|---|---|
| Vigilante | STJ, Tema 1031 (especialidade admitida) | **STF, Tema 1209** (RE 1.368.225, julgado em 13/02/2026, acórdão publicado em 04/03/2026): a atividade de vigilante, com ou sem arma de fogo, não é especial. Há embargos pendentes, com proposta de modulação, e o Tema 1031 do STJ está superado. |
| LINACH (Dec. 3.048/1999, art. 68, § 4º) | "a presença no ambiente basta" | Essa era a redação do Dec. 8.123/2013 (até 30/06/2020). Desde o Dec. 10.410/2020 (01/07/2020), medidas de controle que eliminem a nocividade descaracterizam a exposição. O texto passou a separar os dois períodos. |

### Imprecisões corrigidas
- **CJF – majoração:** o teto de três vezes está no art. 28, § 1º, da Res. 305/2014 (incluído pela Res. 575/2019), com lista fechada de critérios (I a VII). A petição indica os incisos aplicáveis.
- **CJF – adiantamento:** na Justiça Federal com AJG, o adiantamento é de até 30% (art. 29, parágrafo único), mediante comprovação da necessidade. O padrão passou de 50% para 30%.
- **CPC:**
  - art. 476: prorrogação por uma vez, pela metade do prazo original (o app avisa quando o pedido excede);
  - art. 379, III, para a parte, e art. 380 para o terceiro;
  - art. 477, § 2º, para complementação e art. 480 para nova perícia;
  - art. 157, caput e § 1º, na escusa.
- **NR-16:**
  - anexos em algarismos romanos;
  - inclusão do Anexo VI (agentes das autoridades de trânsito, Portaria MTE 1.411/2025);
  - Anexo IV com a alínea "c" (baixa tensão quando descumprido o item 10.2.8 da NR-10);
  - Anexo V na redação da Portaria MTE 2.021/2025, vigente desde 03/04/2026 (a de 2014 foi anulada judicialmente).
- **NR-15:**
  - o ajuste do IBUTG pela vestimenta está no Quadro 4 do Anexo III da NR-9;
  - o Anexo 14 exige contato permanente para o grau máximo (o intermitente é construção jurisprudencial);
  - 14/08/2014 é a vigência da nova redação do Anexo 8.
- **NR-1:** a ordem de prioridade é a do item 1.4.1, "g", que não inclui "substituição".
- **Títulos:** NHO 10, NR-13 e NR-7 (Anexo I, Quadros 1 e 2).
- **Decretos previdenciários:**
  - cód. 1.1.5 do Dec. 53.831/64: perfuratrizes e marteletes pneumáticos "e outros"; os 120 golpes por minuto são característica da máquina, não nível medido;
  - cód. 1.1.4 do Dec. 83.080/79: perfuratrizes e marteletes;
  - cód. 2.0.2: perfuratrizes e marteletes, com a ISO 2631-1 como referência técnica para as demais atividades;
  - cód. 1.1.1 diferente em cada decreto (o do 83.080 é alimentação de caldeiras a carvão ou lenha);
  - cód. 2.4.4 / 2.4.2: redação de cada decreto;
  - cód. 2.0.4 nos dois decretos;
  - esgoto e lixo sem o cód. 1.3.2 antes de 1997;
  - martelete elétrico não previsto.
- **Jurisprudência:**
  - STJ, Temas 1090, 534 e 1307: tese oficial, datas, processos e embargos do 1307;
  - TRF4: IAC nº 5 (sobrestado) e IAC nº 12 (motorista de caminhão);
  - TNU, PEDILEF 0001323: todos os requisitos da similaridade;
  - TST, OJ 173: a observação sobre a Portaria 1.359 foi separada da tese;
  - os parâmetros da matriz de penosidade passam a ser apresentados como do perito, não como tese do IAC.
- **Novo:** art. 30-A da Res. CJF 305/2014 (prova emprestada) no laudo previdenciário por similaridade na Justiça Federal.

### Não conferido (fontes inacessíveis nesta sessão)
- **ISO 2631-1:** a cópia recebida é a prévia pública, sem o Anexo B. A zona de cautela passou a ser lida pela **Nota Técnica ASPEJUDI nº 001/2013** (Figura B.1 da ISO 2631-1:1997/Amd 1:2010): para 8 h, de 0,43 a 0,86 m/s². Por decisão do perito, a fronteira superior passou de 0,9 para **0,86 m/s²**, aplicada ao aren de todos os eixos (NHO-09), com a nota citada no laudo e nas referências. O VDV de 17 m/s^1,75 foi mantido e não foi conferido.
- **NBR 14725:2023:** conferida. Pelo item 5.3.2.2.2.5, pH ≤ 2 ou ≥ 11,5 classifica a substância ou mistura como corrosiva à pele (Categoria 1), salvo se a reserva ácida ou alcalina indicar o contrário. A citação do app foi detalhada.

### Conferido depois, com documentos enviados pelo usuário
- **IN PRES/INSS 128/2022 (texto original, DOU de 29/03/2022, fornecido pelo usuário):** os 28 trechos citados pelo app conferem quanto ao artigo citado; 6 foram ajustados:
  - art. 277, IV: autorização da empresa e acompanhante da empresa, quando o responsável técnico não for seu empregado;
  - art. 290: o EPC só é considerado com funcionamento assegurado ao longo do tempo, conforme especificação do fabricante e plano de manutenção registrados pela empresa;
  - art. 289, parágrafo único: as NHO são exigidas nas **avaliações** realizadas a partir de 01/01/2004;
  - art. 276, XI: assinatura do médico do trabalho ou do engenheiro de segurança do trabalho;
  - art. 277, parágrafo único, III a V: "equipamento ou setor similar";
  - art. 288, I e II: texto separado da ressalva do perito.
  Também foi incluído na instrução do Claude que o art. 296, I, trata o cód. 1.1.5 como critério quantitativo (120 golpes/min). Não foram verificadas alterações posteriores da IN, porque a cópia recebida não é consolidada.
- **ISO 2631-1, VDV:** a monografia de Lisi e Vasquez (USP, 2008) não traz valores de VDV para a zona de cautela; os 17 m/s^1,75 seguem não conferidos.
- **LINACH (Portaria Interministerial nº 9/2014, DOU de 08/10/2014):**
  - os 12 grupos da base conferem pelo CAS ou pelo nome;
  - foram acrescentadas observações nas fichas com as entradas relacionadas: óleos minerais não tratados ou pouco tratados (1), exaustão de motor diesel (1), pintor como ocupação (1), inseticidas não arsenicais na aplicação (2A), fumos de solda (2B), compostos de chumbo (2A) e de níquel (1);
  - a fonte da LINACH nas fichas passou a ser a portaria (antes, cópia do CONASS).
- **NBR 14724:2024, 4.2.1.9:** quadros são ilustrações, e recomenda-se lista própria para cada tipo. As listas de figuras e de quadros do LTCAT estão de acordo; só o comentário do código foi corrigido.
- **TNU, PEDILEF 0506002-13.2018.4.05.8312:** o PDF não foi encontrado no CJF.
- **Textos históricos:** a redação original de 1978 dos Anexos 3 e 8 da NR-15 e os anos das NHOs.
- **Jurisprudência:** as situações a acompanhar foram registradas no próprio texto (embargos do Tema 1209 no STF; RE pendente no Tema 1291).
