/*
  Warnings:

  - You are about to drop the column `userTeamId` on the `user_rewards` table. All the data in the column will be lost.
  - You are about to drop the `leaderboard_entries` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `match_snapshots` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `token_transactions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tournament_entries` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_holdings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_scores` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_snapshots` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_team_players` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_teams` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `address` to the `user_rewards` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."leaderboard_entries" DROP CONSTRAINT "leaderboard_entries_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."leaderboard_entries" DROP CONSTRAINT "leaderboard_entries_userTeamId_fkey";

-- DropForeignKey
ALTER TABLE "public"."match_snapshots" DROP CONSTRAINT "match_snapshots_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."token_transactions" DROP CONSTRAINT "token_transactions_playerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."token_transactions" DROP CONSTRAINT "token_transactions_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."tournament_entries" DROP CONSTRAINT "tournament_entries_playerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."tournament_entries" DROP CONSTRAINT "tournament_entries_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."tournament_entries" DROP CONSTRAINT "tournament_entries_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_holdings" DROP CONSTRAINT "user_holdings_playerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_holdings" DROP CONSTRAINT "user_holdings_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_rewards" DROP CONSTRAINT "user_rewards_userTeamId_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_scores" DROP CONSTRAINT "user_scores_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_scores" DROP CONSTRAINT "user_scores_userTeamId_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_snapshots" DROP CONSTRAINT "user_snapshots_playerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_snapshots" DROP CONSTRAINT "user_snapshots_snapshotId_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_snapshots" DROP CONSTRAINT "user_snapshots_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_team_players" DROP CONSTRAINT "user_team_players_playerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_team_players" DROP CONSTRAINT "user_team_players_userTeamId_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_teams" DROP CONSTRAINT "user_teams_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_teams" DROP CONSTRAINT "user_teams_userId_fkey";

-- AlterTable
ALTER TABLE "public"."user_rewards" DROP COLUMN "userTeamId",
ADD COLUMN     "address" TEXT NOT NULL;

-- DropTable
DROP TABLE "public"."leaderboard_entries";

-- DropTable
DROP TABLE "public"."match_snapshots";

-- DropTable
DROP TABLE "public"."token_transactions";

-- DropTable
DROP TABLE "public"."tournament_entries";

-- DropTable
DROP TABLE "public"."user_holdings";

-- DropTable
DROP TABLE "public"."user_scores";

-- DropTable
DROP TABLE "public"."user_snapshots";

-- DropTable
DROP TABLE "public"."user_team_players";

-- DropTable
DROP TABLE "public"."user_teams";

-- DropTable
DROP TABLE "public"."users";

-- DropEnum
DROP TYPE "public"."SnapshotType";

-- DropEnum
DROP TYPE "public"."TokenTransactionType";
