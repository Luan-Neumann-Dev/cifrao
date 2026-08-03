-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "reimbursesTransactionId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_reimbursesTransactionId_idx" ON "Transaction"("reimbursesTransactionId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reimbursesTransactionId_fkey" FOREIGN KEY ("reimbursesTransactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
