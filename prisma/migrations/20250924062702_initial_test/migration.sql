/*
  Warnings:

  - You are about to drop the column `creditValue` on the `players` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "public"."TokenTransactionType" AS ENUM ('BUY', 'SELL', 'MINT', 'BURN');

-- CreateEnum
CREATE TYPE "public"."ContractType" AS ENUM ('BOSON_MINTING', 'PLAYER_FT_MINTING', 'AMM_CONTRACT');

-- AlterTable
ALTER TABLE "public"."players" DROP COLUMN "creditValue",
ADD COLUMN     "aptosTokenAddress" TEXT,
ADD COLUMN     "tokenPrice" DECIMAL(65,30) NOT NULL DEFAULT 1.0,
ADD COLUMN     "tokenSupply" BIGINT NOT NULL DEFAULT 20000000;

-- CreateTable
CREATE TABLE "public"."user_holdings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "tokenAmount" BIGINT NOT NULL DEFAULT 0,
    "avgBuyPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalInvested" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tournament_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "tokenAmount" BIGINT NOT NULL,
    "entryPrice" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."token_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "transactionType" "public"."TokenTransactionType" NOT NULL,
    "tokenAmount" BIGINT NOT NULL,
    "aptAmount" DECIMAL(65,30) NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "aptosTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."contract_snapshots" (
    "id" TEXT NOT NULL,
    "contractType" "public"."ContractType" NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_holdings_userId_playerId_key" ON "public"."user_holdings"("userId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_entries_userId_tournamentId_playerId_key" ON "public"."tournament_entries"("userId", "tournamentId", "playerId");

-- AddForeignKey
ALTER TABLE "public"."user_holdings" ADD CONSTRAINT "user_holdings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_holdings" ADD CONSTRAINT "user_holdings_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_entries" ADD CONSTRAINT "tournament_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_entries" ADD CONSTRAINT "tournament_entries_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_entries" ADD CONSTRAINT "tournament_entries_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."token_transactions" ADD CONSTRAINT "token_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."token_transactions" ADD CONSTRAINT "token_transactions_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
