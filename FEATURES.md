# Cifrão — Inventário de funcionalidades

Levantamento feito **lendo o código** (controllers, schemas Zod, `schema.prisma`,
telas e testes) em 30/09/2026, no commit `b3b66a4`. Não é cópia do `PROGRESS.md`:
onde o código e o registro divergem, vale o código, e isso está marcado.

Legenda:

- ✅ **pronto** — existe, tem caminho de UI e teste automatizado
- 🟡 **parcial** — existe, mas com furo conhecido, sem UI, ou sem cobrir todo o requisito
- ❌ **não existe** — requisito do `CLAUDE.md` que não foi implementado

Estado geral: **10 fases (0–9) fechadas**, 327 testes passando (shared 203, api
110, web 14), `lint`/`typecheck`/`build` verdes. O que falta é o que está listado
como 🟡 e ❌ mais abaixo.

---

## 1. Autenticação e acesso

- ✅ Login com e-mail e senha (Better Auth rodando no Next)
- ✅ **2FA TOTP** (ativar com QR code, verificar no login) + **códigos de recuperação**
- ✅ **Registro fechado depois do 1º usuário** (reabre com `REGISTRATION_OPEN=true`); 2ª tentativa devolve 403
- ✅ JWT em cookie httpOnly, validado pelo Nest via JWKS (`jose`), sem hop de rede por request
- ✅ Troca de senha pela tela de configurações
- ✅ Sessões ativas: listar com rótulo de dispositivo, encerrar uma ou todas as outras
- 🟡 **Recuperar senha por e-mail: as telas existem, o e-mail não sai.** Não há provedor de envio no stack — em dev o link cai no log do servidor. Na prática, hoje a recuperação é a troca de senha estando logado.

## 2. Contas bancárias

- ✅ CRUD de contas (`CHECKING`, `SAVINGS`, `WALLET`, `INVESTMENT`) com cor e instituição
- ✅ Saldo mantido (`balanceCents`), atualizado na mesma transação de cada mutação — leitura O(1)
- ✅ Evolução de saldo dos últimos 6 meses
- ✅ **Ajuste de saldo** (regra 5.8): informa o saldo real do banco, o sistema cria um lançamento `ADJUSTMENT` da diferença, sem apagar histórico
- 🟡 Excluir conta com lançamentos é bloqueado (o caminho é arquivar) — decisão, não bug

## 3. Categorias e tags

- ✅ Categorias hierárquicas (`parentId`), com ícone, cor e `kind` (EXPENSE/INCOME/BOTH)
- ✅ Seed de 48 categorias brasileiras + "Ajuste", idempotente
- ✅ CRUD pela tela de configurações, com **contagem de uso** por categoria
- ✅ **Mesclar categorias**: migra tudo, **soma os limites de orçamento** do mesmo mês, unifica regra repetida, recusa ciclo na árvore
- 🟡 Tags: criar, listar, excluir e aplicar em lançamento — **não há renomear** (sem `PATCH /tags/:id`)

## 4. Lançamentos (o núcleo)

- ✅ Despesa, receita, **transferência** e ajuste
- ✅ **Transferência não entra em receita nem despesa** em nenhum relatório, gráfico ou orçamento (regra 5.7) — garantido por teste puro, teste de serviço e smoke na API real
- ✅ Filtros: período, tipo, conta, cartão, categoria, tag, status e busca por texto, com paginação
- ✅ Seleção múltipla com 4 ações em lote: categorizar, mudar status, adicionar tag, excluir
- ✅ Exclusão com **"desfazer"** por toast (remoção otimista, confirma no servidor quando o toast fecha)
- ✅ Saldo sempre atualizado dentro de `$transaction` (create/update/delete/bulk)
- ✅ `FORECAST` não move saldo
- 🟡 Editar um lançamento **não troca tipo nem contas** — o caminho é excluir e recriar
- 🟡 **Divisão de lançamento entre categorias: não existe.** O model `TransactionSplit` está no banco e é preservado no backup, mas **não tem endpoint, schema Zod nem UI** — é schema morto hoje. Estava na Seção 6 do `CLAUDE.md`.
- ❌ **Anexo de comprovante.** O model `Attachment` da Seção 6 **não existe no schema** — não é só o storage que falta. Depende da decisão sobre R2.

## 5. Cartões de crédito e faturas

- ✅ CRUD de cartão (limite, dia de fechamento, dia de vencimento, conta padrão de pagamento, bandeira, últimos 4)
- ✅ **Fatura é entidade própria** (`Invoice`), com fechamento, vencimento e status (OPEN/CLOSED/PAID/PARTIAL)
- ✅ **Roteamento da compra para a fatura certa** (regra 5.3), com corte **inclusivo** no dia do fechamento; a UI mostra "entra na fatura de …" antes de salvar
- ✅ **Parcelamento** (regra 5.4): 1 `Purchase` pai + N `Transaction` filhas, uma por fatura, numeradas — 6x cai em 6 faturas distintas e consecutivas (provado por smoke)
- ✅ **"Disponível de verdade"** (regra 5.5): limite − fatura aberta − faturas fechadas não quitadas − parcelas futuras, com os três números exibidos separados e explicados
- ✅ **Pagamento de fatura é transferência, não despesa** (regra 5.6), total ou parcial (PARTIAL rola o resto)
- ✅ Gráfico de comprometimento em parcelas nos próximos 12 meses (agregado no banco)
- 🟡 **Editar a compra pai não propaga para as parcelas futuras** (trecho final de 5.4). Editar/excluir parcela individual funciona pelo endpoint genérico.
- 🟡 `OPEN`/`CLOSED` é **derivado por data**, não persistido — não há cron de fechamento formal de fatura
- 🟡 Excluir um pagamento de fatura pelo endpoint genérico credita a conta de volta mas **não reverte `paidCents`** da fatura. Pagamento deve ser gerido pela tela da fatura; falta "estorno de pagamento".
- 🟡 Reembolso de compra no cartão credita a **conta**, não a fatura — o gasto reembolsável segue consumindo limite

## 6. Dashboard

- ✅ Endpoint único `GET /dashboard?month=` com ~9 queries paralelas, tudo `groupBy` no banco
- ✅ Saldo disponível hoje e **"disponível de verdade até o fim do mês"** (desconta previstos e todo o comprometido de cartão), com o detalhamento aberto
- ✅ Timeline "o que vem por aí" (próximos vencimentos e recebimentos)
- ✅ Gastos por categoria em donut, com **filtro por clique** levando para `/lancamentos` já filtrado
- ✅ Faturas abertas, totais do mês, orçamento resumido, últimos lançamentos, patrimônio
- ✅ Card de insight do mês (maior estouro vs. média dos 3 meses anteriores)
- ✅ **Performance**: p50 de 17–23 ms sobre ~5.000 lançamentos (alvo era < 1s)

## 7. Recorrências

- ✅ `RecurringRule` com WEEKLY / MONTHLY / QUARTERLY / YEARLY
- ✅ Geração de previstos (`FORECAST`) com **horizonte rolante de 12 meses**, idempotente: nunca recria data já efetivada
- ✅ **Cron diário às 03:00 (São Paulo)** regerando os previstos
- ✅ Pausar/reativar regra, prévia das 3 próximas datas, confirmar previsto (vira `CLEARED` e move o saldo)
- ✅ Excluir regra preserva histórico (remove só previstos futuros, desliga o vínculo)
- 🟡 **Recorrência só cobre conta** (EXPENSE/INCOME/TRANSFER). **Assinatura lançada no cartão não é suportada** — exigiria decidir se previsto entra no total da fatura e no disponível de verdade.
- 🟡 Regra não altera previstos **passados**; editar tipo/contas da regra é excluir e recriar
- 🟡 O cron roda em **toda instância** da API (sem lock). Com uma instância só, correto.

## 8. Orçamento

- ✅ Limite mensal por categoria, com gasto, restante e **média diária permitida no que resta do mês**
- ✅ **Sugerir limites** pela média dos últimos 3 meses, com aplicação em lote
- ✅ Navegação por mês, barras de progresso
- ✅ Transferência e ajuste ficam fora do orçamento; **reembolso abate o gasto da categoria**

## 9. Metas

- ✅ `Goal` vinculada a conta/investimento **que já existe** — não move dinheiro, não cria saldo paralelo (regra 5.9), provado por teste que falha se houver qualquer escrita
- ✅ Progresso lido do saldo vinculado
- ✅ **ETA no ritmo atual** (variação média mensal dos 3 meses anteriores; sem histórico, cai no aporte declarado; sem os dois, não inventa prazo)
- ✅ Aviso na tela de que a meta não movimenta dinheiro

## 10. Calendário de contas

- ✅ Saldo projetado dia a dia, em área Recharts
- ✅ Ponto mais baixo do período e alerta de saldo negativo
- ✅ Eventos por dia; **fatura descontada no vencimento** como evento de fatura, nunca como despesa
- ✅ Vencimento já passado e não pago vira alerta, não projeção

## 11. Reembolsáveis ("A receber")

- ✅ Marcar lançamento como reembolsável; painel de pendentes (regra 5.13)
- ✅ **Estorno vinculado**: "Recebi" cria um `INCOME` ligado ao gasto, que **credita a conta escolhida** e herda a categoria
- ✅ **Parcial**: enquanto os estornos não cobrem o valor, o gasto continua pendente com barra de progresso
- ✅ **Estorno nunca é receita** no relatório, e abate o gasto **no mês e na categoria do gasto original**
- ✅ Desfazer devolve o dinheiro; excluir gasto reembolsado leva os estornos junto revertendo o saldo

## 12. Importação de extrato

- ✅ **OFX** (conta e cartão), **CSV** e **QIF**, com bibliotecas (`ofx-js`, `papaparse`, `qif-ts`) — nenhum parser escrito à mão
- ✅ Detecção de formato **pelo conteúdo** e detecção da conta pelo arquivo; charset `windows-1252` tratado (acento preservado)
- ✅ Mapeamento de colunas para CSV com **prévia de 5 linhas**
- ✅ **Staging em `ImportBatch`/`ImportRow` — nada é gravado antes da confirmação** (provado: zero lançamentos e saldo intacto durante a revisão)
- ✅ **Detecção de duplicata**: FITID quando existe (exata), senão mesma conta + data ±3 dias + valor + descrição similar por trigramas (limiar 0,6, comparação por palavra inteira)
- ✅ **`CategoryRule`**: motor de regras, "aplicar a todos os N e criar regra", tela de gerenciamento com testador de descrição
- ✅ **Match com previsto** (regra 5.11): linha que casa com um `FORECAST` **efetiva o previsto** em vez de criar duplicado
- ✅ Tudo em **job do pg-boss** (no próprio Postgres), com progresso visível na UI
- 🟡 **O arquivo fica no Postgres** (`ImportBatch.rawContent`, base64), não no R2. Limite de 12 MB (`API_BODY_LIMIT`).
- 🟡 **Desfazer uma importação confirmada não existe** — hoje é excluir os lançamentos na tela de Lançamentos
- 🟡 Trocar a conta do lote refaz o staging e **descarta a categorização manual** já feita nele
- 🟡 QIF com decimal brasileiro depende de como o `qif-ts` lê o número (OFX e CSV foram testados com vírgula e passam)

## 13. Relatórios

- ✅ Entradas × saídas × saldo acumulado por período
- ✅ Tabela por categoria com **drill-down por clique**, %, contagem, média e variação vs. período anterior
- ✅ Maiores variações, 20 maiores lançamentos, 10 estabelecimentos mais frequentes (agrupados no Postgres por descrição normalizada)
- ✅ Evolução de patrimônio líquido (contas + carteira a preço de mercado − faturas abertas), reconstruída **mês a mês** pelo `PriceHistory`
- ✅ Presets de período e filtro por conta
- ✅ **Exportação CSV** em 4 recortes, com `;` e BOM (Excel pt-BR abre direto) e valor em centavos **e** em BRL para conferir a soma
- ✅ **Os números batem com a soma dos lançamentos filtrados** — o smoke compara cada número com uma soma independente vinda do endpoint de lançamentos, não com valor escrito à mão
- 🟡 **PDF é a impressão do navegador** (`window.print()` sobre folha `@media print`), sem biblioteca. Vale conferir as quebras de página no seu navegador.
- 🟡 A tabela por categoria cobre **só despesas** — receita por categoria não foi pedida e ficou fora
- 🟡 `/reports` filtra por conta, mas **não por categoria ou tag** (o drill-down cobre levando para Lançamentos)

## 14. Investimentos

- ✅ CRUD de posições (Ações, FIIs, Renda Fixa, Tesouro, Fundos, Cripto, Internacional, Outros)
- ✅ **Aportes e resgates**: aportar **debita a conta** como `TRANSFER` — o mesmo real não existe na conta e na carteira ao mesmo tempo
- ✅ **Preço médio ponderado**, derivado do custo investido (não acumula erro de arredondamento — teste com 50 aportes provando)
- ✅ **Venda não altera o preço médio** (regra brasileira): reduz quantidade, realiza lucro, baixa custo proporcional
- ✅ Rentabilidade absoluta e percentual; alocação por classe com **alvo, desvio e "faltam R$ X"**
- ✅ Atualização **manual** de cotação, gravando ponto no `PriceHistory`; evolução de 12 meses
- ✅ Desfazer operação devolve o dinheiro e recalcula a posição do zero
- ✅ Quantidade em inteiro na escala 1e-8 (cripto tem fração sem float)
- 🟡 **Sem API de cotação** (o `CLAUDE.md` pede manual nesta fase)
- 🟡 A tela **não tem editar/arquivar posição** — o endpoint existe, a UI não
- 🟡 Ativo que custa menos de R$ 0,01 por unidade não é representável (preço unitário é inteiro em centavos)

## 15. Configurações

- ✅ Perfil (nome, e-mail, estado do 2FA, troca de senha)
- ✅ **Aparência**: tema claro/escuro/sistema + **cor de acento**, com o servidor como fonte da verdade (tema do celular vale no computador) e script inline antes da primeira pintura (não pisca branco)
- ✅ Preferências de aviso (fatura vencendo, orçamento estourado, meta atingida, previsto a confirmar, com quantos dias de antecedência)
- ✅ **Sino de avisos** no topo, derivado sob demanda dos dados existentes — nada é gravado
- ✅ Gestão de categorias e sessões ativas (itens 3 e 1 acima)
- 🟡 Avisos são **preferência + aviso dentro do app**: não há e-mail nem push

## 16. Backup e zona de risco

- ✅ **Exportar tudo em JSON** (17 tabelas, ordem com pai antes de filho) e **CSV** em 10 seções
- ✅ **Restaurar backup** por upload, em job do pg-boss, dentro de **uma transação só** (ou o banco fica igual ao arquivo, ou nada muda), em lotes de 500, com progresso
- ✅ **O backup não leva credencial** — nada de senha, 2FA, sessão ou JWKS; perfil e preferências viajam e são reaplicados
- ✅ Tipos das colunas vindos do **DMMF do Prisma**, não de lista escrita à mão; valor que não é inteiro em centavos é recusado em vez de virar float
- ✅ **Zona de risco em dois níveis**, cada um exigindo uma frase diferente digitada: "apagar lançamentos" (mantém conta, cartão, categoria e configuração, zera saldo) e "excluir conta" (apaga o domínio inteiro)
- ✅ Aceite provado com o banco arrasado no meio: **tudo volta idêntico** — saldo, 25 lançamentos de todos os tipos, fatura, disponível de verdade, carteira, orçamento, meta, os 12 previstos, o parcelamento em 6 faturas, o estorno vinculado, tema e preferência
- ❌ **Job semanal de dump para o R2** (Seção 9 do `CLAUDE.md`). Ficou de fora por decisão sua de fechar a fase **sem storage nenhum**. Hoje o backup é manual (tela ou `pg_dump`).

## 17. PWA e deploy

- ✅ `manifest.webmanifest` com ícones, atalhos e cores do tema; ícones gerados por script (PIL), sem dependência
- ✅ Service worker escrito à mão (60 linhas, sem `next-pwa`) + página `/offline`
- ✅ **O service worker não cacheia `/api/*`** — saldo vindo de resposta velha seria pior que tela offline
- ✅ Fontes Inter e Manrope por `next/font`, com `tabular-nums` em número grande
- ✅ `Dockerfile` por app, `docker-compose.prod.yml` (3 containers em rede interna, só o web publica porta), `.env.prod.example`, README com o passo a passo do Coolify
- ✅ **Deploy provado**: os 3 containers sobem `healthy`, a API aplica as 11 migrações no start, o proxy alcança o Nest pela rede interna, cadastro grava e chamada autenticada volta 200
- ✅ Mobile-first, telas conferidas em 390px

---

## O que falta, em uma lista só

**Requisito do `CLAUDE.md` que não foi feito:**

1. ❌ **Anexo de comprovante** — model `Attachment` não existe no schema (Seção 6)
2. ❌ **Job semanal de dump para o R2** (Seção 9)
3. 🟡 **Divisão de lançamento entre categorias** — `TransactionSplit` existe no banco, sem API nem UI (Seção 6)
4. 🟡 **Editar compra pai propagando para parcelas futuras** (final da regra 5.4)
5. 🟡 **E-mail de recuperação de senha** — telas prontas, sem provedor de envio

**Furos conhecidos que valeria fechar:**

6. Estorno de pagamento de fatura (excluir pagamento não reverte `paidCents`)
7. Desfazer uma importação confirmada
8. Recorrência em cartão (assinatura)
9. Renomear tag
10. Editar/arquivar posição de investimento pela UI
11. Fechamento formal de fatura (hoje `OPEN`/`CLOSED` é derivado por data)
12. Reembolso de compra no cartão volta para a conta, não para a fatura

**Bloqueado por decisão sua, não por código:**

- Storage (R2 ou disco) — trava os itens 1 e 2
- Provedor de e-mail — trava o item 5
- API de cotação de ativo

---

## Ambiente local (preparado em 30/09/2026)

- `pnpm install` ✅ · `pnpm build` (4/4) ✅ · `pnpm test` (327) ✅
- `.env` criados a partir dos `.example`, com **`BETTER_AUTH_SECRET` novo gerado** por `openssl rand -base64 32`
- Postgres em container na porta **55432**, `healthy`, **com as 11 migrações já aplicadas** e dados de antes: 1 usuário, 40 contas, 69 categorias, 1.205 lançamentos, 4 investimentos, 0 cartões. **Nada foi apagado e o seed não foi rodado.**
- `pnpm dev` no ar: web em `http://localhost:3000`, API em `http://localhost:3001`, fila pg-boss com os 3 workers ativos (`import.process`, `import.confirm`, `backup-restore`)
- ⚠️ O `package.json` raiz declara `engines.node: ">=22"` e esta máquina roda **Node 20.20.2**. O pnpm só avisa e tudo funciona — mas é bom saber que o workaround de ESM em `apps/api/src/common/esm.ts` existe justamente por causa do Node 20. Alinhar o `engines` (ou subir para o Node 22) é decisão sua.
