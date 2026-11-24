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
  - **PPP – técnica e intensidade:** a técnica do campo 15 segue o Manual de Aposentadoria Especial do INSS (2018): presunção com o código do decreto até 05/03/1997; anexo da NR-15 (11, 12, 13 ou 13-A) ou cód. 3.0.1 depois; LINACH Grupo 1 só a partir de 08/10/2014; e, para os químicos quantitativos a partir de 01/01/2004, a metodologia das NHO da FUNDACENTRO (NHO 02 e 07; poeiras e fibras, NHO 03, 04 e 08). Agente sem medição sai com intensidade "Não quantificada". O PPP do contribuinte individual não tem corte no eSocial.
  - **Enquadramento pelas regras de cada período:** um item único nas pendências propõe o resultado de cada agente químico (e da eletricidade): até 05/03/1997, consta dos Decretos 53.831/64 ou 83.080/79 → caracteriza por presunção; a partir de 06/03/1997, só o que consta do Anexo IV – quantitativo sem medição não caracteriza (vai ao PPP como "não quantificada"), qualitativo caracteriza; Grupo 1 da LINACH com CAS caracteriza a partir de 08/10/2014 (resultado próprio, com linha separada no PPP). "Aplicar a todos" grava os resultados; a fundamentação condicional pode ser reescrita pelas regras. Notas entre colchetes no texto viram pendência com "substituir" ou "apagar".
  - **Óleo mineral × derivado de petróleo:** óleos minerais (lubrificantes, hidráulicos, de corte, vaselina, petrolato, parafina) vão ao cód. 1.0.7, b (utilização de óleos minerais), qualitativo; combustíveis e solventes de petróleo, ao cód. 1.0.17, a conferir (atividades exemplificativas, art. 287, § 4º, da IN 128/2022); base sintética ou vegetal não é óleo mineral. O IP 346 da FDS (< 3 % = altamente refinado) vai ao agente, à fundamentação e ao quadro de características. **Agentes a partir das FDS:** um item nas pendências cria os agentes pelos componentes da seção 3 (agrupados pelo código do decreto ou pelo CAS no banco), já com o resultado pelas regras, e completa os existentes.
  - **Risco à integridade física fora do Anexo IV** (eletricidade após 05/03/1997, inflamáveis, explosivos): no agente, "Caracterizada tecnicamente" com o critério da NR-16/NR-10. O LTCAT enquadra a condição (art. 57 da Lei 8.213/1991) em item próprio do item 5 e na síntese (coluna "Integridade física"), com nota da EC 103/2019 a partir de 13/11/2019; a jurisprudência fica no item próprio. O PPP cita a condição nas observações, sem linha no campo 15 e sem mudar o código GFIP.
  - **Claude direto pelo app (API)**: em Configurações → Claude (API), a chave da conta de API da Anthropic (fica só no aparelho), o modelo (Claude Opus 5.5 por padrão; Sonnet 5.5 ou Fable 5.2 como alternativas) e o esforço. Com a chave, todas as telas que pediam para copiar a instrução e colar no claude.ai ganham o botão "Enviar direto ao Claude": extração dos autos, respostas dos quesitos, redação dos documentos (gera o Word no timbrado), quesitos suplementares, anotações da diligência, identificação das fotos, FDS e químicos (com pesquisa na internet), laudos antigos e máquinas. Os arquivos vão dentro da própria pergunta (a Files API não aceita chamadas do navegador) e não ficam guardados na conta. O limite de uma pergunta é de 1 milhão de tokens, e cada página de PDF inteiro custa texto + imagem (~2 a 3 mil tokens): por isso o PDF vai inteiro só até ~100 páginas no total; acima disso vai o texto página a página (~500 tokens por página) e as páginas digitalizadas (CTPS, documentos em imagem) vão como imagem reduzida, até 40 por envio. Se ainda assim não couber, o app diz o tamanho e pede um PDF só com as peças necessárias. Cada envio mostra tokens e custo estimado.
  - **4 etapas por caso** (desde a 2.65): **1. Autos** (dados do caso recolhidos, PDF do processo e extração pelo Claude, vínculos, agentes e quesitos), **2. Campo** (importação das anotações da diligência pelo Claude no topo, diligência, postos, medições, revisão da coleta e fotos), **3. Laudo** (só o laudo/parecer do tipo de trabalho: pendências agrupadas e recolhíveis, "Responder os quesitos com o Claude" com a contagem dos sem resposta, "Redigir com o Claude" e "Gerar Word") e **4. Petições** (uma petição de cada vez, escolhida na lista; quesitos suplementares e esclarecimentos; outros documentos do caso; cópia de segurança). Endereços antigos (cadastro, quesitos, fotos, documentos) levam à etapa e à seção novas. Com a chave de API configurada, o caminho de copiar e colar no claude.ai fica recolhido em "Alternativa sem a chave de API".
  - **Etapa 1 compacta** (2.67): o PDF e a extração vêm primeiro; "Dados do caso" fica recolhido, com uma linha de resumo (diligência, prazo do laudo, honorários e o que falta). Dentro dele, aparecem só os campos que se aplicam ao tipo de trabalho (juízo deprecante só em precatória; perito do juízo e laudo analisado só na assistência; contratante só no extrajudicial e na assistência), os campos vazios ficam em "＋ campos vazios", e os itens do despacho usados nas petições ficam num grupo recolhido com a contagem do que já foi preenchido. A extração passa a trazer a classe, o juízo deprecante, os prazos (laudo, manifestação, esclarecimentos) e os itens do despacho (honorários, forma de pagamento, depósito, aceite, alvará, data da perícia, ofício, prazo do laudo). Listas vazias (agentes, FDS, EPIs) ocupam uma linha; a lista de documentos mostra os 5 primeiros; FDS pelo Claude e planejamento da diligência ficam recolhidos; paradigmas só aparecem em caso de motorista/operador.
  - **Etapa 2 compacta** (2.68): no topo, a importação das anotações com o Claude (recolhida em uma linha). A diligência mostra o essencial (data, início e término, local e endereço lado a lado, presentes, comunicação às partes, equipamentos); GPS, condições do dia e áudio ficam recolhidos. Postos com os campos vazios em "＋ campos vazios"; "Medições sem posto" só aparece quando há medição (ou por um botão). As fotos ficam numa seção só (antes apareciam duas vezes), com a contagem das sem legenda, as 12 primeiras e "ver todas"; "Legendar e identificar com o Claude" aplica direto ao caso; a importação de fotos de laudo fica recolhida. Relatórios dos medidores e anexos do documento num grupo recolhido no fim.
  - **Etapa 3 em passos** (2.69): ① Conferir as pendências (contagem no título; ✓ quando não há), ② Responder os quesitos (quantos sem resposta; some quando o caso não tem quesitos), ③ Redigir e gerar (um cartão por documento do tipo de trabalho, com os anexos, "Redigir com o Claude", "Gerar Word" e o registro do último Word gerado – data, arquivo e se foi redigido pelo Claude), ④ Conferir o documento (o que ainda sai em amarelo). Pendências e quesitos aparecem uma vez só, mesmo com dois documentos (ex.: LTCAT + parecer). Gerar o laudo passa a fase do caso para "Laudo / parecer em elaboração". O copiar e colar fica numa só "Alternativa sem a chave de API".
  - **Regras dos alertas dos relatórios** (2.71.2): alertam só data da medição diferente da vistoria, jornada do relatório diferente do tempo de condução adotado no caso e série diferente do equipamento cadastrado. Não alertam: horários da diligência × medições (a diligência inclui a entrevista), minutos entre o cabeçalho e o início da medição, certificado ausente no relatório (vale o cadastrado em Equipamentos), calibração com até 24 meses e falta de aferição inicial/final.
  - **Discrepâncias relatório × vistoria** (2.71.1): ao ler os relatórios, o Claude compara com a vistoria (data, horários, jornada/tempo de condução, veículo, série do equipamento) e lista as discrepâncias num alerta que fica no passo "Relatórios dos medidores" até você marcar "Corrigido". As pendências do laudo também conferem sempre a data de cada medição com as datas das vistorias e a jornada configurada no relatório com o tempo de condução dos vínculos do posto.
  - **Relatórios dos medidores no escritório** (2.71): os relatórios (DoseMax, AxPro, iTemp) e a leitura das medições pelo Claude passam a ser o 1º passo da etapa 3. Laudo (saíram do Campo). O laudo usa os resultados prontos do relatório – NEN (novo campo da medição de ruído), AREN e VDVR – sem recalcular; a leitura exige o VDVR (também com os nomes alternativos do aparelho) e uma nova leitura atualiza a mesma medição (mesmo relatório ou mesmo agente e horário), em vez de duplicar. Os botões de anexo da revisão da coleta e da importação das anotações ficam só para fotos e documentos.
  - **Troca de veículo sem similar medido** (2.70.4): no vínculo (Veículo do requerente → "Trocou de veículo no vínculo…"), a data da troca e o veículo novo. O laudo corta o vínculo na data: até a véspera, usa as medições do posto; daí em diante, ruído e vibração "não avaliados – somente penosidade", sem pendência, com uma frase explicando a troca. Medições abertas e não preenchidas não entram nos documentos. No posto de motorista, um toque preenche fontes geradoras e via/periodicidade com o texto padrão; empresa/acompanhante, EPC e EPI vazios não saem nem viram pendência.
  - **Certificados e calibração** (2.70.3): em Configurações → Equipamentos, cada equipamento pode ter o PDF do certificado; ele sai como apêndice em todo laudo que usar o equipamento. Validade: o alerta de 12 meses (recomendação do fabricante) continua em Configurações; nos documentos, só acima de 24 meses (critério do signatário) aparece "verificar". As medições lidas pelo Claude ficam ligadas ao equipamento (pela série, pelo modelo ou pelo padrão do agente). Na redação pelo Claude: certificados nos apêndices (não pede para anexar), calibração válida até 24 meses, aferição pré/pós só citada quando registrada, e veículos ou fatos citados só em petições, sem confirmação na entrevista, ficam fora do laudo.
  - **Medições a partir dos relatórios dos medidores** (2.70.2): os relatórios anexados como apêndices só entram no fim do laudo; os números (Lavg, NEN, aren, VDVR) vêm das medições cadastradas nos postos. Em 2. Campo → Relatórios dos medidores, "Ler as medições destes relatórios com o Claude" cadastra cada medição no posto (sem duplicar). Com relatório anexado e nenhuma medição, o grupo abre sozinho com o aviso, e o laudo mostra a pendência com o atalho para o Campo.
  - **Nova extração respeita o que você excluiu** (2.70.1): vínculo, documento, EPI ou agente que foi para a lixeira não é recriado quando os autos são extraídos de novo (ex.: vínculo pedido na inicial e fora do despacho); a mensagem informa quantos foram ignorados. A instrução de extração passa a listar só os vínculos delimitados pelo despacho de perícia; os demais vão para os pontos de atenção.
  - **Etapa 4 enxuta** (2.70): atalhos com as petições da fase atual do caso (ex.: "A preparar" → honorários e agendamento; "Aguardando manifestação / esclarecimentos" → resposta aos suplementares e pagamento; "Concluído" → pagamento), já escolhendo a próxima ainda não gerada; o seletor marca "✓ gerada em dd/mm"; a resposta aos quesitos suplementares traz, no próprio cartão, a transcrição e minuta pelo Claude; "Já geradas neste caso" lista cada petição e documento com data e arquivo; cópia de segurança e modelos de outros tipos de trabalho ficam recolhidos.
  - **Outra petição – redigir com o Claude** (4. Petições → "Qual petição?"): para o que não tem modelo (resposta a despacho, manifestação, juntada, dilação, diligência complementar…). Descreva o pedido ou deixe em branco para o Claude atender à última determinação dirigida a você; anexe o despacho se ele não estiver nos autos guardados. O Word sai no padrão das petições: endereçamento, processo, corpo, "Nestes termos" e assinatura.
  - **Revisar a coleta com o Claude (aba Campo)**: ainda no local, o Claude confere o que foi registrado (cadastro, entrevista, postos, medições, fotos e as pendências do app) contra os autos e os quesitos e devolve: o que coletar agora, perguntas a fazer, requisitos das medições a conferir, inconsistências, quesitos sem elementos, fotos que faltam e a avaliação da coleta por vínculo/posto. A última revisão fica guardada no caso.
  - **Paradigmas na perícia judicial**: como perito do juízo, o app não sugere nem cobra paradigmas; eles só entram quando o juízo indica o uso de medições anteriores (opção em Paradigmas dos vínculos) ou com as medições dos laudos juntados aos autos. A perícia por similaridade (vistoria em empresa paradigma, com medição própria) não libera o banco. Extrajudicial e assistência técnica continuam com o banco.
  - **Medições dos laudos juntados aos autos (prova emprestada)**: em Paradigmas dos vínculos, o botão "Extrair as medições dos laudos dos autos" lê os laudos de outros peritos juntados ao processo e inclui as medições no banco ligadas ao número do processo, com o perito, o processo de origem e o local nos autos. Com a opção "Usar somente as medições dos laudos juntados aos autos", a sugestão de paradigmas do caso só usa essas medições, e o laudo diz que a quantificação vem exclusivamente delas, cita o perito de cada uma e não menciona o banco do signatário.
  - **Reaproveitamento dos autos (cache)**: ligado por padrão (1 hora; opções 5 minutos ou desligado). Os autos vão sempre no começo da pergunta, do mesmo jeito, com a marca de cache: dentro do prazo, cada nova etapa do mesmo caso paga só 10% da leitura dos autos (a primeira paga 2× com 1 hora ou 1,25× com 5 minutos). A mensagem de cada envio mostra os tokens reaproveitados e a economia. O botão de copiar continua como alternativa.
  - **Termo de declaração e autorização** ao final do LTCAT: declaração do segurado (veracidade das informações) e autorização da emitente para o levantamento (art. 277, IV, a, da IN 128/2022), com campos de assinatura; quando o segurado é o representante legal (sócio) ou o próprio emitente, uma assinatura só, com os dois papéis. O item 2.3 remete ao termo.
  - **Texto da entrevista**: sem minutagem ("entrevista 00:19:48"), "transcrição de" vira "entrevista de", "07/1997 a:" vira "07/1997 em diante:".
  - **Documentos da empresa** (PGR, LTCAT, PCMSO): no trabalho extrajudicial, sem escolha no caso, não são citados – saem dos parênteses, das listas de fontes, dos cabeçalhos e das frases que os mencionam.
  - **Quadro de enquadramento por época** com a fundamentação de cada agente dentro dele (coluna "Observações" para o que é próprio do agente; nota de quantitativo sem medição na célula); fichas das FDS uma por página.
  - **Sugestão automática de risco à integridade física**: eletricidade, explosivos e inflamáveis (pelo nome, pelo ponto de fulgor do banco de químicos ou pelas frases H220–H226 da FDS) depois de 05/03/1997 viram pendência de uma escolha ("habitual e permanente" × "eventual"); enquanto não respondida, o item 5 traz o aviso em amarelo.
  - **Síntese sem linhas repetidas**: subperíodos seguidos com o mesmo enquadramento ficam numa linha (a nota do quadro avisa quando a linha passa de 13/11/2019); com um vínculo só, a coluna traz só o período; vários agentes no mesmo código, um por linha; o parágrafo da conclusão não repete os códigos do quadro.
  - **Item 5 sem parágrafos iguais**: as frases padrão das regras saem agrupadas ("Até 05/03/1997, os agentes A, B e C constam do cód. …"); o que é próprio de cada agente continua em parágrafo próprio.
  - **Quadros**: períodos avaliados com local e documentos em texto abaixo do quadro; citações de FISPQ/FDS das células do quadro de características vão para a fonte; recomendações incluem agentes presentes sensibilizantes, cancerígenos e tóxicos à reprodução e os riscos à integridade física; PPP com técnica abreviada ("Dec.") e colunas mais largas; CA só com fichas de EPI.
  - **FDS incompleta** (sem as seções 2, 3 ou 8): pendência até completar ou marcar "ciente".
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
