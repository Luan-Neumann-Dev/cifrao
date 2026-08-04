-- AlterTable
ALTER TABLE "ImportBatch" ADD COLUMN     "preview" JSONB;

-- AlterTable
ALTER TABLE "ImportRow" ADD COLUMN     "matchedForecastId" TEXT;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_matchedForecastId_fkey" FOREIGN KEY ("matchedForecastId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
