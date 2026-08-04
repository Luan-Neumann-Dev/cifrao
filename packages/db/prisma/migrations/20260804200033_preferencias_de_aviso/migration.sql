-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyBudgetExceeded" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyDaysBefore" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "notifyForecastDue" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyGoalReached" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyInvoiceDue" BOOLEAN NOT NULL DEFAULT true;
