-- CreateEnum
CREATE TYPE "InvestmentClass" AS ENUM ('STOCKS', 'REITS', 'FIXED_INCOME', 'TREASURY', 'FUNDS', 'CRYPTO', 'INTERNATIONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "InvestmentSource" AS ENUM ('MANUAL', 'SYNCED');

-- CreateEnum
CREATE TYPE "InvestmentTransactionType" AS ENUM ('BUY', 'SELL');

-- CreateTable
CREATE TABLE "Investment" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT,
    "class" "InvestmentClass" NOT NULL,
    "quantity" BIGINT NOT NULL DEFAULT 0,
    "investedCents" BIGINT NOT NULL DEFAULT 0,
    "avgPriceCents" BIGINT NOT NULL DEFAULT 0,
    "currentPriceCents" BIGINT NOT NULL DEFAULT 0,
    "priceUpdatedAt" TIMESTAMP(3),
    "source" "InvestmentSource" NOT NULL DEFAULT 'MANUAL',
    "realizedGainCents" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentTransaction" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "type" "InvestmentTransactionType" NOT NULL,
    "quantity" BIGINT NOT NULL,
    "priceCents" BIGINT NOT NULL,
    "feesCents" BIGINT NOT NULL DEFAULT 0,
    "totalCents" BIGINT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT,
    "transactionId" TEXT,
    "avgPriceAfterCents" BIGINT NOT NULL DEFAULT 0,
    "realizedGainCents" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestmentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "priceCents" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationTarget" (
    "class" "InvestmentClass" NOT NULL,
    "targetPercent" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllocationTarget_pkey" PRIMARY KEY ("class")
);

-- CreateIndex
CREATE UNIQUE INDEX "Investment_ticker_key" ON "Investment"("ticker");

-- CreateIndex
CREATE INDEX "Investment_class_idx" ON "Investment"("class");

-- CreateIndex
CREATE INDEX "InvestmentTransaction_investmentId_date_idx" ON "InvestmentTransaction"("investmentId", "date");

-- CreateIndex
CREATE INDEX "PriceHistory_date_idx" ON "PriceHistory"("date");

-- CreateIndex
CREATE UNIQUE INDEX "PriceHistory_investmentId_date_key" ON "PriceHistory"("investmentId", "date");

-- AddForeignKey
ALTER TABLE "InvestmentTransaction" ADD CONSTRAINT "InvestmentTransaction_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentTransaction" ADD CONSTRAINT "InvestmentTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
