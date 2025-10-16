-- CreateEnum
CREATE TYPE "public"."TournamentStatus" AS ENUM ('UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."PlayerRole" AS ENUM ('BATSMAN', 'BOWLER', 'ALL_ROUNDER', 'WICKET_KEEPER');

-- CreateEnum
CREATE TYPE "public"."RewardDistributionType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'TIER_BASED');

-- CreateEnum
CREATE TYPE "public"."RewardStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "displayName" TEXT,
    "avatar" TEXT,
    "totalEarnings" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalSpent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "joinDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActive" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tournaments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "matchDate" TIMESTAMP(3) NOT NULL,
    "team1" TEXT NOT NULL,
    "team2" TEXT NOT NULL,
    "venue" TEXT,
    "status" "public"."TournamentStatus" NOT NULL DEFAULT 'UPCOMING',
    "entryFee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "maxParticipants" INTEGER,
    "currentParticipants" INTEGER NOT NULL DEFAULT 0,
    "aptosEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."players" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "role" "public"."PlayerRole" NOT NULL,
    "creditValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "aptosPlayerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_teams" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "captainId" TEXT NOT NULL,
    "viceCaptainId" TEXT NOT NULL,
    "totalCredits" DECIMAL(65,30) NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_team_players" (
    "id" TEXT NOT NULL,
    "userTeamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_team_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."player_scores" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "ballsFaced" INTEGER NOT NULL DEFAULT 0,
    "wickets" INTEGER NOT NULL DEFAULT 0,
    "oversBowled" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "runsConceded" INTEGER NOT NULL DEFAULT 0,
    "catches" INTEGER NOT NULL DEFAULT 0,
    "stumpings" INTEGER NOT NULL DEFAULT 0,
    "runOuts" INTEGER NOT NULL DEFAULT 0,
    "fantasyPoints" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_scores" (
    "id" TEXT NOT NULL,
    "userTeamId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "totalScore" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "captainMultiplier" DECIMAL(65,30) NOT NULL DEFAULT 1.5,
    "viceCaptainMultiplier" DECIMAL(65,30) NOT NULL DEFAULT 1.25,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."reward_pools" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "distributedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "distributionType" "public"."RewardDistributionType" NOT NULL DEFAULT 'PERCENTAGE',
    "distributionRules" JSONB NOT NULL,
    "aptosPoolId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_rewards" (
    "id" TEXT NOT NULL,
    "userTeamId" TEXT NOT NULL,
    "rewardPoolId" TEXT NOT NULL,
    "rank" INTEGER,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "percentage" DECIMAL(65,30),
    "status" "public"."RewardStatus" NOT NULL DEFAULT 'PENDING',
    "aptosTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."leaderboard_entries" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userTeamId" TEXT NOT NULL,
    "totalScore" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "rank" INTEGER NOT NULL,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaderboard_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_walletAddress_key" ON "public"."users"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "user_teams_userId_tournamentId_key" ON "public"."user_teams"("userId", "tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "user_team_players_userTeamId_playerId_key" ON "public"."user_team_players"("userTeamId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "player_scores_tournamentId_playerId_key" ON "public"."player_scores"("tournamentId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "user_scores_userTeamId_tournamentId_key" ON "public"."user_scores"("userTeamId", "tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_entries_tournamentId_userTeamId_key" ON "public"."leaderboard_entries"("tournamentId", "userTeamId");

-- AddForeignKey
ALTER TABLE "public"."user_teams" ADD CONSTRAINT "user_teams_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_teams" ADD CONSTRAINT "user_teams_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_team_players" ADD CONSTRAINT "user_team_players_userTeamId_fkey" FOREIGN KEY ("userTeamId") REFERENCES "public"."user_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_team_players" ADD CONSTRAINT "user_team_players_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."player_scores" ADD CONSTRAINT "player_scores_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."player_scores" ADD CONSTRAINT "player_scores_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_scores" ADD CONSTRAINT "user_scores_userTeamId_fkey" FOREIGN KEY ("userTeamId") REFERENCES "public"."user_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_scores" ADD CONSTRAINT "user_scores_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reward_pools" ADD CONSTRAINT "reward_pools_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_rewards" ADD CONSTRAINT "user_rewards_userTeamId_fkey" FOREIGN KEY ("userTeamId") REFERENCES "public"."user_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_rewards" ADD CONSTRAINT "user_rewards_rewardPoolId_fkey" FOREIGN KEY ("rewardPoolId") REFERENCES "public"."reward_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
