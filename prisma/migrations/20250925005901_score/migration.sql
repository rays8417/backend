/*
  Warnings:

  - A unique constraint covering the columns `[tournamentId,moduleName]` on the table `player_scores` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."SnapshotType" AS ENUM ('PRE_MATCH', 'POST_MATCH');

-- AlterTable
ALTER TABLE "public"."player_scores" ADD COLUMN     "moduleName" TEXT,
ALTER COLUMN "playerId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "public"."match_snapshots" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "snapshotType" "public"."SnapshotType" NOT NULL,
    "blockNumber" BIGINT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_snapshots" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "tokenAmount" BIGINT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_snapshots_snapshotId_userId_playerId_key" ON "public"."user_snapshots"("snapshotId", "userId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "player_scores_tournamentId_moduleName_key" ON "public"."player_scores"("tournamentId", "moduleName");

-- AddForeignKey
ALTER TABLE "public"."leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_userTeamId_fkey" FOREIGN KEY ("userTeamId") REFERENCES "public"."user_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."match_snapshots" ADD CONSTRAINT "match_snapshots_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_snapshots" ADD CONSTRAINT "user_snapshots_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "public"."match_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_snapshots" ADD CONSTRAINT "user_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_snapshots" ADD CONSTRAINT "user_snapshots_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
