-- CreateEnum
CREATE TYPE "PackType" AS ENUM ('BASE', 'PRIME', 'ULTRA');

-- CreateTable
CREATE TABLE "player_packs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packType" "PackType" NOT NULL,
    "isOpened" BOOLEAN NOT NULL DEFAULT false,
    "players" JSONB NOT NULL,
    "totalValue" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_packs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "player_packs" ADD CONSTRAINT "player_packs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
