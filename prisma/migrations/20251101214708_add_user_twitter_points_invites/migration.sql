/*
  Warnings:

  - A unique constraint covering the columns `[twitterUsername]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PointType" AS ENUM ('VP', 'XP');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "invitedBy" TEXT,
ADD COLUMN     "twitterUsername" TEXT;

-- CreateTable
CREATE TABLE "points" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PointType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "playerModuleName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "points_userId_type_playerModuleName_key" ON "points"("userId", "type", "playerModuleName");

-- CreateIndex
CREATE UNIQUE INDEX "users_twitterUsername_key" ON "users"("twitterUsername");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points" ADD CONSTRAINT "points_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
