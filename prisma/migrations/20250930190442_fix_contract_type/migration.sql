/*
  Warnings:

  - The values [BOSON_MINTING,PLAYER_FT_MINTING,AMM_CONTRACT] on the enum `ContractType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."ContractType_new" AS ENUM ('PRE_MATCH', 'POST_MATCH');
ALTER TABLE "public"."contract_snapshots" ALTER COLUMN "contractType" TYPE "public"."ContractType_new" USING ("contractType"::text::"public"."ContractType_new");
ALTER TYPE "public"."ContractType" RENAME TO "ContractType_old";
ALTER TYPE "public"."ContractType_new" RENAME TO "ContractType";
DROP TYPE "public"."ContractType_old";
COMMIT;
