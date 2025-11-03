-- CreateEnum
CREATE TYPE "SwapDirection" AS ENUM ('FROM_BOSON_TO_PLAYER', 'FROM_PLAYER_TO_BOSON');

-- DropIndex
DROP INDEX "public"."points_userId_type_playerModuleName_key";

-- CreateTable
CREATE TABLE "SwapTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenA" TEXT NOT NULL,
    "tokenB" TEXT NOT NULL,
    "tokenAmountA" INTEGER NOT NULL,
    "tokenAmountB" INTEGER NOT NULL,
    "swapDirection" "SwapDirection" NOT NULL,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SwapTransaction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SwapTransaction" ADD CONSTRAINT "SwapTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
