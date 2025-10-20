/*
  Warnings:

  - You are about to drop the column `playerId` on the `player_scores` table. All the data in the column will be lost.
  - You are about to drop the column `aptosPoolId` on the `reward_pools` table. All the data in the column will be lost.
  - You are about to drop the column `aptosEventId` on the `tournaments` table. All the data in the column will be lost.
  - You are about to drop the column `entryFee` on the `tournaments` table. All the data in the column will be lost.
  - You are about to drop the column `maxParticipants` on the `tournaments` table. All the data in the column will be lost.
  - You are about to drop the column `aptosTransactionId` on the `user_rewards` table. All the data in the column will be lost.
  - You are about to drop the column `rank` on the `user_rewards` table. All the data in the column will be lost.
  - You are about to drop the `contract_snapshots` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `players` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[tournamentId]` on the table `reward_pools` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."SnapshotType" AS ENUM ('PRE_MATCH', 'POST_MATCH');

-- DropForeignKey
ALTER TABLE "public"."player_scores" DROP CONSTRAINT "player_scores_playerId_fkey";

-- DropIndex
DROP INDEX "public"."player_scores_tournamentId_playerId_key";

-- AlterTable
ALTER TABLE "public"."player_scores" DROP COLUMN "playerId";

-- AlterTable
ALTER TABLE "public"."reward_pools" DROP COLUMN "aptosPoolId";

-- AlterTable
ALTER TABLE "public"."tournaments" DROP COLUMN "aptosEventId",
DROP COLUMN "entryFee",
DROP COLUMN "maxParticipants";

-- AlterTable
ALTER TABLE "public"."user_rewards" DROP COLUMN "aptosTransactionId",
DROP COLUMN "rank",
ADD COLUMN     "transactionId" TEXT;

-- DropTable
DROP TABLE "public"."contract_snapshots";

-- DropTable
DROP TABLE "public"."players";

-- DropEnum
DROP TYPE "public"."ContractType";

-- DropEnum
DROP TYPE "public"."PlayerRole";

-- CreateTable
CREATE TABLE "public"."snapshots" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "snapshotType" "public"."SnapshotType" NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "snapshots_tournamentId_snapshotType_idx" ON "public"."snapshots"("tournamentId", "snapshotType");

-- CreateIndex
CREATE UNIQUE INDEX "snapshots_tournamentId_snapshotType_key" ON "public"."snapshots"("tournamentId", "snapshotType");

-- CreateIndex
CREATE UNIQUE INDEX "reward_pools_tournamentId_key" ON "public"."reward_pools"("tournamentId");

-- AddForeignKey
ALTER TABLE "public"."snapshots" ADD CONSTRAINT "snapshots_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
