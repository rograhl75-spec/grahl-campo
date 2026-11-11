# GRAHL Campo – app de perícias (versão 2)

App para preparar e registrar em campo perícias judiciais e extrajudiciais, como perito do juízo ou assistente técnico. Substitui o app antigo em Streamlit.

## Como os dados ficam protegidos

O app antigo perdia informação porque nada ficava guardado no tablet: tudo dependia da conexão com o servidor e de tocar em "Salvar". Neste app:

1. **Tudo é gravado no próprio aparelho enquanto você digita.** Não existe botão "Salvar". Cada tecla é copiada na hora para um registro de segurança. Se o Android fechar o navegador, o texto é recuperado na próxima abertura.
2. **O app funciona sem internet.** Ele é instalado no tablet e abre mesmo sem sinal dentro da empresa.
3. **A nuvem (Firebase) é uma cópia, sincronizada sozinha quando há internet.** A sincronização é feita campo a campo: editar o "local" no tablet e a "síntese" no PC não apaga nenhum dos dois.
4. **Nada é apagado de verdade.** O que você exclui vai para a Lixeira (Configurações) e pode ser restaurado.
5. **Os textos longos guardam versões anteriores.** O botão "⟲ versões" ao lado do campo mostra as versões e permite restaurar.
6. **O backup em ZIP é completo.** Em Configurações → Backup você gera um arquivo com dados, histórico e fotos originais. Guarde no Drive ou no PC.

O indicador no topo da tela mostra sempre o estado: *Salvo neste aparelho*, *Sem internet · N alterações guardadas*, *Enviando…* ou *Sincronizado às hh:mm*.

## Organização

- **Casos:** lista com busca e filtro por fase, ordenada pela próxima data (diligência, laudo, manifestação).
- **Resumo:** tipo (judicial ou extrajudicial), sua atuação, justiça (Trabalho, Federal, Estadual de competência delegada, Fazenda Pública, Cível, JEF), matéria, objeto, fase, processo, partes e prazos.
- **Preparação:** síntese dos autos, contratos e períodos, documentos técnicos, ficha de EPIs, roteiro da vistoria e equipamentos a levar. Tem também o painel **Pré-relatório com IA** (veja abaixo).
- **Quesitos:** transcrição literal, com espaço para anotações em campo.
  - **Depois do laudo – quesitos suplementares e esclarecimentos:** laudo apresentado (mov. e data), decisão que determinou a resposta, prazo, retificações de erro material e ratificação. Os quesitos suplementares ficam numa lista própria e não entram no laudo nem no pré-relatório. O botão **Copiar instrução** leva ao Claude os seus registros de campo (horário, presentes, local, GPS, medições) como fonte primária; o Claude transcreve os quesitos da petição e minuta as respostas num JSON que o app aplica sem duplicar. O caso passa para a fase "Respondendo quesitos suplementares" e o prazo aparece na lista de casos.
- **Campo:** diligência (data e hora com um toque, GPS, presentes, condições do dia), postos e atividades, medições e fotos por posto.
  - **Ruído:** calcula o NEN com q=5 (NEN = Lavg + 16,61·log(TE/480)), confere o Lavg pela dose e mostra o desvio de calibração.
  - **Calor:** calcula o IBUTG, com e sem carga solar.
  - **Vibração:** registra VCI e VMB.
  - **Químicos e outros:** registro livre.
- **Fotos:** tiradas pela câmera ou escolhidas da galeria. Ficam no tablet no mesmo instante e depois sobem para a nuvem. Têm legenda, posto, ordem, data/hora e GPS.
- **Documentos (Word no seu timbrado, fonte Abadi, espaçamento 1,5):**
  - **Pré-relatório:** capa, sumário e cada título principal em página nova.
  - **Registro da diligência.**
  - **Relatório fotográfico.**
  - **Aceite dos honorários arbitrados (majorados):** depois da decisão que arbitra os honorários, aceita o valor e os termos (adiantamento e saldo), indica a conta para o alvará após o depósito e se compromete a informar a data da perícia após o levantamento, com a antecedência do despacho. Os itens do despacho ficam em 1. Cadastro → Honorários e itens do despacho. Há também a fase "Aguardando depósito dos honorários".
  - **Resposta aos quesitos suplementares:** depois do laudo (art. 477, § 2º, I, do CPC), com a decisão que mandou responder, a referência ao laudo (mov. e data), cada quesito suplementar transcrito por parte com a resposta, retificação de erro material ("onde se lê / leia-se") e ratificação das conclusões.
  - **Exportação do caso em ZIP.**
- **Paradigmas → Máquinas – ruído e vibração:** banco de tratores (sem cabine, cabine original, cabine adaptada, fruteiros), microtratores, colhedoras, pulverizadores, máquinas florestais e de construção, empilhadeiras e ferramentas portáteis (motosserra, roçadeira, derriçadora). Cada registro guarda a categoria, a origem do dado (medição própria, laudo de terceiro, literatura técnica, declaração do fabricante), a operação e o implemento, a rotação, a velocidade e a referência bibliográfica. O resumo por categoria mostra n, faixa e mediana de Lavg, Leq, aren, VDVR e VMB, com cor pelo nível de ação e pelo limite (NR-9, Anexo I; NR-15, Anexos 1 e 8). Para alimentar o banco a partir de artigos, manuais e laudos, use **Importar → Copiar instrução de máquinas**. O app não traz valores prontos: os números entram só com a fonte conferida.
- **Configurações:** nuvem, backup, importação do app antigo, equipamentos e certificados (DoseMax V2, iTemp e AxPro já cadastrados; falta preencher o CalPro), lixeira e armazenamento.

### Pré-relatório com IA

1. Em Preparação → Pré-relatório com IA, toque em **Copiar instrução**.
2. No Claude, cole a instrução e anexe os PDFs dos autos.
3. Copie a resposta (um bloco JSON) e cole no app.
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
3. **Firestore → Regras:** cole o conteúdo de `firebase/firestore.rules`, trocando `SEU_EMAIL_AQUI` pelo seu e-mail do Google. Publique.
4. **Storage → Regras:** cole `firebase/storage.rules`, com a mesma troca. Publique.
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
