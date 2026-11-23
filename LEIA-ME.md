# GRAHL Campo – app de perícias (versão 2)

App para preparar e registrar em campo perícias judiciais e extrajudiciais, como perito do juízo ou assistente técnico. Substitui o app antigo em Streamlit.

## Como os dados ficam protegidos

O app antigo perdia informação porque nada ficava guardado no tablet: tudo dependia da conexão com o servidor e de tocar em "Salvar". Neste app:

1. **Tudo é gravado no próprio aparelho enquanto você digita.** Não existe botão "Salvar". Cada tecla é copiada na hora para um registro de segurança. Se o Android fechar o navegador, o texto é recuperado na próxima abertura.
2. **O app funciona sem internet.** Ele é instalado no tablet e abre mesmo sem sinal dentro da empresa.
3. **A nuvem (Firebase) é uma cópia, sincronizada sozinha quando há internet.** A sincronização é feita campo a campo: editar o "local" no tablet e a "síntese" no PC não apaga nenhum dos dois.
4. **Nada é apagado de verdade.** O que você exclui vai para a Lixeira (Configurações) e pode ser restaurado.
5. **Os textos longos guardam versões anteriores.** O botão "⟲ versões" ao lado do campo mostra as versões e permite restaurar.
6. **O backup em ZIP é completo.** Em Configurações → Backup você gera um arquivo com dados, histórico, fotos originais e anexos (PDFs dos autos e de laudos antigos). Os anexos acima de 39 MB não vão para a nuvem: o backup é a única cópia deles fora do aparelho. Guarde no Drive ou no PC.

O indicador no topo da tela mostra sempre o estado: *Salvo neste aparelho*, *Sem internet · N alterações guardadas*, *Enviando…* ou *Sincronizado às hh:mm*.

## Organização

- **Casos:** lista com busca e filtro por fase, ordenada pela próxima data (diligência, laudo, manifestação).
- **Resumo:** tipo (judicial ou extrajudicial), sua atuação, justiça (Trabalho, Federal, Estadual de competência delegada, Fazenda Pública, Cível, JEF), matéria, objeto, fase, processo, partes e prazos.
- **Preparação:** síntese dos autos, contratos e períodos, documentos técnicos, ficha de EPIs, roteiro da vistoria e equipamentos a levar. Tem também o painel **Pré-relatório com IA** (veja abaixo).
  - **Produtos químicos – fichas das FDS:** um registro por produto (nome comercial, fabricante, revisão e origem da FDS, seções 2, 3, 8 e 9). "Ficha da FDS pelo Claude" lê a FDS anexada ou pesquisa a do fabricante, com o endereço e a data da consulta. Em todos os documentos com químicos (pré-relatório, LTCAT, laudos previdenciário e trabalhista, pareceres), cada produto sai numa ficha própria, além dos quadros obrigatórios de cada tipo de laudo. FDS pesquisada sai com o aviso de que a versão pode diferir da usada no período.
  - **LTCAT + PPP – conferências antes de gerar:** a lista de pendências aponta o que o laudo afirmaria e o próprio texto contradiz (agente do Anexo 11 ou 12 "caracteriza" sem medição; fundamentação com "a confirmar" e resultado definitivo; exposição "eventual" com "caracteriza"; vínculo com atividades por fases e agente que caracteriza o vínculo inteiro; documento da empresa citado quando ele é só referência), com a correção num toque ou "Está correto – manter". O CBO vem com sugestões da tabela CBO 2002 (cargo, função, setor e atividades); agentes físicos recebem o meio de exposição sem pergunta. No caso: modalidade da avaliação (presencial, remota ou documental), documentos da empresa (citar ou só referência), autoria das fotos e início do eSocial SST. No agente: período de exposição dentro do vínculo. O texto que vai ao laudo sai sem minutagem, "transcrição", "~" e notas de trabalho (que vão para o campo "Notas" do vínculo).
  - **PPP – técnica e intensidade:** a técnica do campo 15 segue o Manual de Aposentadoria Especial do INSS (2018): presunção com o código do decreto até 05/03/1997; anexo da NR-15 (11, 12, 13 ou 13-A) ou cód. 3.0.1 depois; LINACH Grupo 1 só a partir de 08/10/2014; e, para os químicos a partir de 01/01/2004, a metodologia das NHO da FUNDACENTRO (NHO 02 e 07; poeiras e fibras, NHO 03, 04 e 08). Agente sem medição sai com intensidade "Não quantificada". O PPP do contribuinte individual não tem corte no eSocial.
- **Quesitos:** transcrição literal, com espaço para anotações em campo.
  - **Depois do laudo – quesitos suplementares e esclarecimentos:** laudo apresentado (mov. e data), decisão que determinou a resposta, prazo, retificações de erro material e ratificação. Os quesitos suplementares ficam numa lista própria e não entram no laudo nem no pré-relatório. O botão **Copiar instrução** leva ao Claude os seus registros de campo (horário, presentes, local, GPS, medições) como fonte primária; o Claude transcreve os quesitos da petição e minuta as respostas num JSON que o app aplica sem duplicar. O caso passa para a fase "Respondendo quesitos suplementares" e o prazo aparece na lista de casos.
- **Campo:** diligência (data e hora com um toque, GPS, presentes, condições do dia), postos e atividades, medições e fotos por posto.
  - **Ruído:** calcula o NEN com q=5 (NEN = Lavg + 16,61·log(TE/480)), confere o Lavg pela dose e mostra o desvio de calibração.
  - **Calor:** calcula o IBUTG, com e sem carga solar.
  - **Vibração:** registra VCI e VMB.
  - **Químicos e outros:** registro livre.
- **Fotos:** tiradas pela câmera ou escolhidas da galeria. Ficam no tablet no mesmo instante e depois sobem para a nuvem. Têm legenda, posto, ordem, data/hora e GPS.
  - **Legenda pelo nome do arquivo:** foto com nome descritivo ("Área 1 - 05a, bancada de testes de bombas.jpeg") já entra com a legenda; nomes automáticos de câmera (IMG_…, DSC…, PXL_…, WhatsApp Image…) são ignorados. Para fotos já importadas, o botão "Preencher legendas vazias pelo nome do arquivo".
  - **Identificação pelo Claude:** em "Legendas e identificação das fotos", envie as fotos numeradas (compartilhamento do Android direto para o Claude, ou ZIP) ou as folhas de contato (12 fotos por folha, com o número), copie a instrução e cole a resposta. O Claude devolve a legenda e o que está legível em cada foto – plaqueta (marca, modelo, série, ano), rótulo de produto, CA de EPI, display de equipamento – e a ficha da FDS dos produtos dos rótulos. Tudo entra "a conferir"; leitura de display serve só para conferir com o relatório do equipamento.
- **Documentos (Word no seu timbrado, fonte Abadi, espaçamento 1,5):** aparecem só os modelos do seu papel no caso, agrupados pela fase. Cada cartão tem "Gerar Word" e "Redigir com o Claude".
  - **Todos:** pré-relatório (para o assistente, com a estratégia da assistência; para o perito, com as verificações de impedimento e prazo) e relatório fotográfico avulso.
  - **Perito do Juízo:**
    - **Honorários:** um cartão com três situações: proposta (art. 465, § 2º), majoração do valor fixado ou aceite do valor arbitrado.
    - Agendamento da vistoria e registro da diligência.
    - Laudo de insalubridade e periculosidade (inclusive adicional de servidor), com confronto do Anexo 11 e quadro conclusivo por agente.
    - Laudo previdenciário e laudo de acidente do trabalho.
    - Resposta aos quesitos suplementares e pagamento dos honorários.
    - **Outras petições:** prorrogação do prazo do laudo (art. 476), diligência frustrada ou documentos não apresentados, escusa (art. 157).
  - **Assistente técnico:**
    - Indicação com quesitos e relatório de acompanhamento da diligência para o cliente.
    - Parecer sobre o laudo conforme a sua posição: concorda, impugna em parte ou impugna. No previdenciário, a análise é por período.
    - Petições de quesitos suplementares (art. 469), pedido de esclarecimentos (art. 477, § 2º) e manifestação sobre os esclarecimentos.
    - Parecer preventivo, quando assiste o réu.
  - **Extrajudicial:** o documento sai do objeto marcado e de quem contratou:
    - LTCAT e parecer previdenciário (aposentadoria especial, LTCAT, PPP);
    - laudo de insalubridade e periculosidade, sem endereçamento ao Juízo e com ART (insalubridade, periculosidade);
    - laudo de acidente do trabalho (acidente);
    - parecer preventivo, quando a empresa contratou;
    - **parecer técnico de condições de trabalho e penosidade (motorista):** em "Minha atuação", escolha "Parecer técnico extrajudicial (segurado / advogado)" ou marque o objeto "Penosidade (motorista)". Preencha a finalidade e a ART (1. Cadastro) e, em cada vínculo (2. Autos), o veículo, a entrevista do motorista (grupo do veículo, carroceria, carga, carga/descarga, abastecimento, acidente e assalto) e os fatores de penosidade. O documento traz identificação, metodologia por similaridade, critérios de penosidade, marco legal por período, um quadro por vínculo com a fonte da prova vinda do banco de paradigmas, matriz sintética, conclusão (com a regra da EC 103/2019 após 13/11/2019) e encerramento com a ART. A instrução do Claude (2. Autos) lê a entrevista, a CTPS e o CNIS e preenche os vínculos.
      - **Roteiro de entrevista do motorista:** documento para levar à entrevista, já com os vínculos cadastrados e as perguntas de cada um; preenchido, volta pelo Claude para os vínculos ("mesmas atividades do vínculo N" copia as respostas).
      - **Paradigmas:** em 2. Autos, "Sugerir paradigmas para todos os vínculos" pesquisa o banco (similares, família indicada pelo grupo do veículo e tipo) e vincula os sugeridos de uma vez. Vínculo sem paradigma no banco recebe uma ficha de pesquisa (veículo, grupo, família, cabine, carga, horas de condução) para você procurar nos seus laudos e incluir em Paradigmas → Importar. No documento, o vínculo ainda sem paradigma usa o melhor candidato do banco, marcado em amarelo para conferir; sem candidato, sai a ficha de pesquisa.
      - **Aba Campo:** no parecer de motorista, o campo é a entrevista – a aba abre com "Entrevista do segurado – vínculos": um cartão por vínculo com o resumo, o que falta perguntar e a edição da entrevista, mais a sugestão de paradigmas para todos os vínculos.
      - **Escolha do paradigma por pontos:** o app identifica a família técnica provável do veículo pela marca, modelo e ano (ex.: MB 1313 e Chevrolet D-60 → F1; VW 8.150/10.160 e Agrale 9200 → F3; Ford Cargo 1717 → F4; Scania R 360 de 2005 → F6; Volvo NH → F7) ou pelo grupo da entrevista, e compara cada paradigma do banco: tabela de similares (100), mesma família (50; família diferente −30), modelo (20), marca (15), tipo rígido/cavalo/ônibus (10; diferente −20), época (até 10) e climatização (5). Só sugere com família ou similar (≥ 45 pontos) e mostra os motivos. A família digitada no vínculo prevalece.
      - **Exportar a base (Paradigmas → Importar):** gera o JSON só com veículos, similares e famílias, no mesmo formato da importação e com o nome do laudo de origem de cada paradigma, para revisão ou correção fora do app. Uma base corrigida volta pelo "Escolher arquivo JSON" sem passar por cima do que foi editado no app.
      - **Ano do paradigma:** sem o ano no laudo, informe a "Época de fabricação" (faixa do modelo) e a "Fonte do ano" (laudo, CRLV, foto ou faixa); a comparação usa o meio da faixa.
      - **Conferência do banco (Paradigmas → Veículos medidos):** mostra os paradigmas sem família, sem tipo, sem ano e sem valores, propõe a família provável dos que não têm e cadastra as famílias F1–F8 com a descrição.
      - **Copiar do vínculo…:** no vínculo, copia veículo, entrevista e penosidade de outro vínculo com as mesmas atividades (só os campos vazios).
  - **Também:**
    - termo de presença para a vistoria;
    - proposta de serviços e parecer trabalhista de viabilidade (extrajudicial);
    - síntese da conclusão no início dos laudos e quadro do art. 473 no encerramento;
    - recomendações pelo nível de ação no LTCAT e no laudo extrajudicial;
    - dados para o PPP em papel no anexo do LTCAT;
    - roteiro por anexo da NR-16;
    - esclarecimentos sobre o parecer do assistente técnico na resposta aos suplementares.
  - **Exportação do caso em ZIP.**
- **Paradigmas → Agentes químicos:** fichas com propriedades físico-químicas, toxicologia (NIOSH), limites do Anexo 11 da NR-15, classificação pelos Anexos 11, 12, 13 e 13-A (filtro por anexo), códigos dos decretos previdenciários, LINACH e IARC. A base (146 agentes) vem de fontes abertas, inclui os agentes dos Decretos 53.831/64, 83.080/79, 2.172/97 e 3.048/99 e entra como "A conferir". Para refazer a base: `python3 -I tools/gerar_base_quimicos.py` e depois `python3 -I tools/ampliar_base_quimicos.py` (fontes em `tools/dados/`). Valores da ACGIH: digite do seu livreto. Inclusão de novos agentes pelo Claude, a partir de FISPQs. Calculadora: ppm ↔ mg/m³, valor máximo (LT × fator de desvio), Brief & Scala e misturas. Na medição de agente químico (aba Campo), escolha o agente do banco: o app confronta a média com o limite e o valor máximo e indica os do Grupo 1 da LINACH.
- **Paradigmas → Máquinas – ruído e vibração:** banco de tratores (sem cabine, cabine original, cabine adaptada, fruteiros), microtratores, colhedoras, pulverizadores, máquinas florestais e de construção, empilhadeiras e ferramentas portáteis (motosserra, roçadeira, derriçadora). Cada registro guarda a categoria, a origem do dado (medição própria, laudo de terceiro, literatura técnica, declaração do fabricante), a operação e o implemento, a rotação, a velocidade e a referência bibliográfica. O resumo por categoria mostra n, faixa e mediana de Lavg, Leq, aren, VDVR e VMB, com cor pelo nível de ação e pelo limite (NR-9, Anexo I; NR-15, Anexos 1 e 8). Para alimentar o banco a partir de artigos, manuais e laudos, use **Importar → Copiar instrução de máquinas**. O app não traz valores prontos: os números entram só com a fonte conferida.
- **Configurações:** nuvem, backup, importação do app antigo, equipamentos e certificados (DoseMax V2, iTemp e AxPro já cadastrados; falta preencher o CalPro), lixeira e armazenamento.

### Pré-relatório com IA

1. Em Preparação → Pré-relatório com IA, toque em **Copiar instrução**.
2. No Claude, cole a instrução e anexe os PDFs dos autos.
3. Copie a resposta (um bloco JSON) e cole no app. A resposta já traz a ficha da FDS de cada produto químico identificado (pesquisada pelo Claude quando a FDS não foi anexada) e a legenda e a identificação das fotos anexadas.
4. Confira a prévia e aplique. Campos já preenchidos não são alterados, a menos que você marque "substituir". Quesitos, EPIs, períodos e documentos são acrescentados sem duplicar.
5. Em Documentos, gere o pré-relatório.

---

## Publicação (uma única vez)

### 1. GitHub

1. Crie um repositório novo (ex.: `grahl-campo`) e envie estes arquivos. Mantenha o app antigo funcionando até conferir a migração.
2. No repositório, abra **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. A cada envio para a branch `main`, o GitHub testa, monta e publica o app em `https://SEU_USUARIO.github.io/grahl-campo/`.

### 2. Firebase (o mesmo projeto do app antigo)

1. **Authentication:**
   - Ative o provedor **Google** (Sign-in method).
   - Em **Settings → Authorized domains**, adicione `SEU_USUARIO.github.io`.
2. **Registre o app da Web:** em Configurações do projeto → Geral → Seus apps → **Adicionar app (Web)**. Copie o bloco `firebaseConfig`.
3. **Firestore → Regras:** cole o conteúdo de `firebase/firestore.rules`, trocando `SEU_EMAIL_AQUI` pelo seu e-mail do Google (para mais de uma conta: `["a@gmail.com", "b@gmail.com"]`). Publique. Só as contas da lista leem e gravam; qualquer outra conta Google é recusada, e os registros só são aceitos no formato que o app grava.
4. **Storage → Regras:** cole `firebase/storage.rules`, com a mesma lista de e-mails. Publique. Fotos: só JPEG até 15 MB; anexos: PDF, imagens, texto e Word até 40 MB. Nada pode ser apagado da nuvem pelo app (a exclusão é pela lixeira).
5. **CORS do Storage (permite baixar as fotos em outro aparelho e no Word):**
   1. Abra o Cloud Shell no console do Google Cloud.
   2. Crie o arquivo `cors.json` com o conteúdo de `firebase/cors.json`, trocando `SEU_USUARIO`.
   3. Rode `gsutil cors set cors.json gs://NOME_DO_BUCKET`.

O app antigo usa credencial de administrador e não é afetado por essas regras.

### 3. No tablet (Chrome, Android)

1. Abra o endereço do GitHub Pages e use o menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial"). Instalado, o Chrome protege os dados contra limpeza automática.
2. Em Configurações → Nuvem, cole o `firebaseConfig`, salve e toque em **Entrar com Google**.
3. Repita no PC, se quiser editar pelo computador.

### 4. Trazer os casos do app antigo

Em Configurações → App antigo:

- **Opção 1 – Importar do Firebase:** usa as regras de leitura do passo 2.
- **Opção 2 – Importar ZIP:** gere o ZIP com `python tools/exportar_app_antigo.py .streamlit/secrets.toml` (por exemplo, no Codespaces do repositório antigo). Esse ZIP também é um backup do app antigo.

Como funciona a importação:

- Nada é alterado no app antigo.
- Ela pode ser repetida: o que você já editou no app novo nunca é sobrescrito.
- Cada caso importado traz a aba **App antigo**, com a cópia integral dos dados originais, para conferência.

---

## Para quem mantém o código

```
npm install
npm run dev      # desenvolvimento
npm test         # testes (mesclagem, sincronização entre 2 aparelhos, cálculos, migração)
npm run build    # gera dist/
```

| Arquivo | Conteúdo |
|---|---|
| `src/db.js`, `src/merge.js` | Banco local (IndexedDB) e mesclagem por campo |
| `src/wal.js` | Registro de segurança da digitação |
| `src/sync.js` | Sincronização com Firestore e Storage |
| `src/migrate.js` | Importação do app antigo |
| `src/backup.js` | Backup e restauração em ZIP |
| `src/docx/` | Documentos Word sobre os modelos em `public/modelos/` |
| `src/schema.js` | Listas de opções e campos (para acrescentar opções, edite aqui) |
| `src/ui/` | Telas |

Os dados ficam no Firestore em `usuarios/{uid}/registros/{id}` e as fotos no Storage em `usuarios/{uid}/fotos/{id}.jpg`.
