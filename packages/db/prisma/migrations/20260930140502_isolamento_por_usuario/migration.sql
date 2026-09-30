-- Isolamento por usuário (multi-tenancy).
--
-- Escrita à mão de propósito: o `prisma migrate dev` não consegue gerar isto
-- porque adicionar coluna NOT NULL em tabela populada é impossível sem backfill.
-- A ordem aqui é: coluna nullable → backfill → NOT NULL → índices → FK.
--
-- Categoria é o caso especial: `Category.userId` é NULLABLE e `NULL` significa
-- "categoria universal, compartilhada por todos". As 48 do seed continuam
-- universais; qualquer categoria fora dessa lista é tratada como criada pelo
-- usuário e passa a pertencer a ele.

-- ─── 1. Índices e uniques antigos (eram globais) ──────────────────────────────

DROP INDEX "Budget_categoryId_month_key";
DROP INDEX "Budget_month_idx";
DROP INDEX "CategoryRule_active_idx";
DROP INDEX "CategoryRule_pattern_categoryId_key";
DROP INDEX "ImportBatch_status_idx";
DROP INDEX "Investment_class_idx";
DROP INDEX "Investment_ticker_key";
DROP INDEX "RecurringRule_active_idx";
DROP INDEX "RestoreJob_createdAt_idx";
DROP INDEX "Tag_name_key";
DROP INDEX "Transaction_accountId_date_idx";
DROP INDEX "Transaction_categoryId_date_idx";
DROP INDEX "Transaction_date_idx";
DROP INDEX "Transaction_recurringRuleId_date_idx";
DROP INDEX "Transaction_status_date_idx";

-- ─── 2. Coluna userId, ainda NULLABLE (o backfill vem depois) ────────────────

ALTER TABLE "Account" ADD COLUMN "userId" TEXT;
ALTER TABLE "Budget" ADD COLUMN "userId" TEXT;
ALTER TABLE "Category" ADD COLUMN "userId" TEXT;
ALTER TABLE "CategoryRule" ADD COLUMN "userId" TEXT;
ALTER TABLE "CreditCard" ADD COLUMN "userId" TEXT;
ALTER TABLE "Goal" ADD COLUMN "userId" TEXT;
ALTER TABLE "ImportBatch" ADD COLUMN "userId" TEXT;
ALTER TABLE "Investment" ADD COLUMN "userId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "userId" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "userId" TEXT;
ALTER TABLE "RecurringRule" ADD COLUMN "userId" TEXT;
ALTER TABLE "RestoreJob" ADD COLUMN "userId" TEXT;
ALTER TABLE "Tag" ADD COLUMN "userId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "userId" TEXT;

-- AllocationTarget tinha a própria classe como PK — uma linha por classe no
-- banco inteiro. A PK composta só entra depois do backfill.
ALTER TABLE "AllocationTarget" DROP CONSTRAINT "AllocationTarget_pkey";
ALTER TABLE "AllocationTarget" ADD COLUMN "userId" TEXT;

-- ─── 3. Backfill: o dado existente passa a ser do único usuário ──────────────

DO $$
DECLARE
  owner_id TEXT;
  n_users  INT;
  n_domain BIGINT;
BEGIN
  SELECT count(*) INTO n_users FROM "User";

  SELECT (SELECT count(*) FROM "Account")
       + (SELECT count(*) FROM "Transaction")
       + (SELECT count(*) FROM "CreditCard")
       + (SELECT count(*) FROM "Invoice")
       + (SELECT count(*) FROM "Purchase")
       + (SELECT count(*) FROM "Tag")
       + (SELECT count(*) FROM "RecurringRule")
       + (SELECT count(*) FROM "ImportBatch")
       + (SELECT count(*) FROM "CategoryRule")
       + (SELECT count(*) FROM "Budget")
       + (SELECT count(*) FROM "Investment")
       + (SELECT count(*) FROM "AllocationTarget")
       + (SELECT count(*) FROM "Goal")
       + (SELECT count(*) FROM "RestoreJob")
    INTO n_domain;

  -- Banco limpo (instalação nova): não há nada a atribuir.
  IF n_domain = 0 THEN
    RAISE NOTICE 'Sem dado de domínio — backfill dispensado.';
    RETURN;
  END IF;

  -- Com dado na mesa, só sabemos a quem pertence se houver exatamente 1 usuário.
  -- Abortar é melhor que chutar dono de lançamento financeiro.
  IF n_users <> 1 THEN
    RAISE EXCEPTION
      'Isolamento por usuário: há % registros de domínio e % usuários. O backfill só sabe atribuir com exatamente 1 usuário — atribua o dono à mão antes de migrar.',
      n_domain, n_users;
  END IF;

  SELECT id INTO owner_id FROM "User";

  UPDATE "Account"          SET "userId" = owner_id WHERE "userId" IS NULL;
  UPDATE "Transaction"      SET "userId" = owner_id WHERE "userId" IS NULL;
  UPDATE "CreditCard"       SET "userId" = owner_id WHERE "userId" IS NULL;
  UPDATE "Invoice"          SET "userId" = owner_id WHERE "userId" IS NULL;
  UPDATE "Purchase"         SET "userId" = owner_id WHERE "userId" IS NULL;
  UPDATE "Tag"              SET "userId" = owner_id WHERE "userId" IS NULL;
  UPDATE "RecurringRule"    SET "userId" = owner_id WHERE "userId" IS NULL;
  UPDATE "ImportBatch"      SET "userId" = owner_id WHERE "userId" IS NULL;
  UPDATE "CategoryRule"     SET "userId" = owner_id WHERE "userId" IS NULL;
  UPDATE "Budget"           SET "userId" = owner_id WHERE "userId" IS NULL;
  UPDATE "Investment"       SET "userId" = owner_id WHERE "userId" IS NULL;
  UPDATE "AllocationTarget" SET "userId" = owner_id WHERE "userId" IS NULL;
  UPDATE "Goal"             SET "userId" = owner_id WHERE "userId" IS NULL;
  UPDATE "RestoreJob"       SET "userId" = owner_id WHERE "userId" IS NULL;

  -- Categoria: o seed fica universal (userId NULL, compartilhado por todos).
  -- O que não está na lista do seed foi criado pelo usuário e vira dele.
  UPDATE "Category" SET "userId" = owner_id
   WHERE "userId" IS NULL
     AND name <> ALL (ARRAY[
       'Moradia', 'Aluguel', 'Condomínio', 'Energia', 'Água', 'Internet', 'Gás',
       'Alimentação', 'Supermercado', 'Restaurante', 'Delivery', 'Padaria',
       'Transporte', 'Combustível', 'App de transporte', 'Transporte público', 'Estacionamento',
       'Saúde', 'Farmácia', 'Consultas', 'Plano de saúde',
       'Educação', 'Cursos', 'Livros',
       'Lazer', 'Cinema', 'Bar', 'Shows',
       'Assinaturas', 'Streaming', 'Software',
       'Compras', 'Vestuário', 'Eletrônicos', 'Casa',
       'Serviços', 'Telefonia', 'Manutenção',
       'Impostos e Taxas', 'IPTU', 'Tarifas bancárias',
       'Pets', 'Viagem',
       'Salário', 'Freelance', 'Rendimentos', 'Reembolsos',
       'Ajuste'
     ]);
END $$;

-- ─── 4. Agora sim, NOT NULL ──────────────────────────────────────────────────
-- (Category fica de fora: NULL ali é o valor que significa "universal".)

ALTER TABLE "Account"          ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Budget"           ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "CategoryRule"     ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "CreditCard"       ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Goal"             ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "ImportBatch"      ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Investment"       ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Invoice"          ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Purchase"         ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "RecurringRule"    ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "RestoreJob"       ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Tag"              ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Transaction"      ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "AllocationTarget" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "AllocationTarget" ADD CONSTRAINT "AllocationTarget_pkey" PRIMARY KEY ("userId", "class");

-- ─── 5. Índices novos, liderados por userId ──────────────────────────────────

CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE INDEX "Account_userId_archived_idx" ON "Account"("userId", "archived");
CREATE INDEX "Budget_userId_month_idx" ON "Budget"("userId", "month");
CREATE UNIQUE INDEX "Budget_userId_categoryId_month_key" ON "Budget"("userId", "categoryId", "month");
CREATE INDEX "Category_userId_idx" ON "Category"("userId");
CREATE INDEX "CategoryRule_userId_active_idx" ON "CategoryRule"("userId", "active");
CREATE UNIQUE INDEX "CategoryRule_userId_pattern_categoryId_key" ON "CategoryRule"("userId", "pattern", "categoryId");
CREATE INDEX "CreditCard_userId_idx" ON "CreditCard"("userId");
CREATE INDEX "Goal_userId_idx" ON "Goal"("userId");
CREATE INDEX "ImportBatch_userId_status_idx" ON "ImportBatch"("userId", "status");
CREATE INDEX "Investment_userId_class_idx" ON "Investment"("userId", "class");
CREATE UNIQUE INDEX "Investment_userId_ticker_key" ON "Investment"("userId", "ticker");
CREATE INDEX "Invoice_userId_dueDate_idx" ON "Invoice"("userId", "dueDate");
CREATE INDEX "Purchase_userId_idx" ON "Purchase"("userId");
CREATE INDEX "RecurringRule_userId_active_idx" ON "RecurringRule"("userId", "active");
CREATE INDEX "RestoreJob_userId_createdAt_idx" ON "RestoreJob"("userId", "createdAt");
CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag"("userId", "name");
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");
CREATE INDEX "Transaction_userId_accountId_date_idx" ON "Transaction"("userId", "accountId", "date");
CREATE INDEX "Transaction_userId_categoryId_date_idx" ON "Transaction"("userId", "categoryId", "date");
CREATE INDEX "Transaction_userId_recurringRuleId_date_idx" ON "Transaction"("userId", "recurringRuleId", "date");
CREATE INDEX "Transaction_userId_status_date_idx" ON "Transaction"("userId", "status", "date");

-- ─── 6. Chaves estrangeiras (Cascade: excluir a conta apaga o que é dela) ────

ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryRule" ADD CONSTRAINT "CategoryRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AllocationTarget" ADD CONSTRAINT "AllocationTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestoreJob" ADD CONSTRAINT "RestoreJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
