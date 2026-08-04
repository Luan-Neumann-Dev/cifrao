-- CreateEnum
CREATE TYPE "ImportFormat" AS ENUM ('OFX', 'QIF', 'CSV');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'PARSING', 'NEEDS_MAPPING', 'REVIEW', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('PENDING', 'DUPLICATE', 'IGNORED', 'IMPORTED');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "externalId" TEXT;

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "format" "ImportFormat" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "rawContent" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "accountId" TEXT,
    "detectedAccountLabel" TEXT,
    "columnMapping" JSONB,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "description" TEXT NOT NULL,
    "originalDescription" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "externalId" TEXT,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "categoryId" TEXT,
    "suggestedCategoryId" TEXT,
    "matchedRuleId" TEXT,
    "duplicateOfId" TEXT,
    "duplicateScore" DOUBLE PRECISION,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryRule" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "minCents" BIGINT,
    "maxCents" BIGINT,
    "categoryId" TEXT NOT NULL,
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportBatch_status_idx" ON "ImportBatch"("status");

-- CreateIndex
CREATE INDEX "ImportRow_batchId_status_idx" ON "ImportRow"("batchId", "status");

-- CreateIndex
CREATE INDEX "ImportRow_batchId_lineNumber_idx" ON "ImportRow"("batchId", "lineNumber");

-- CreateIndex
CREATE INDEX "CategoryRule_active_idx" ON "CategoryRule"("active");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryRule_pattern_categoryId_key" ON "CategoryRule"("pattern", "categoryId");

-- CreateIndex
CREATE INDEX "Transaction_externalId_idx" ON "Transaction"("externalId");

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryRule" ADD CONSTRAINT "CategoryRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
