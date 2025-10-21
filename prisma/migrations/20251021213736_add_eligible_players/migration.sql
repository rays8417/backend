-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "eligiblePlayers" TEXT[] DEFAULT ARRAY[]::TEXT[];
