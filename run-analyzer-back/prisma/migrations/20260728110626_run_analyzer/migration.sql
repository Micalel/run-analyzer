-- CreateEnum
CREATE TYPE "EncounterContext" AS ENUM ('WILD', 'TRAINER', 'STATIC', 'TRADE');

-- AlterTable
ALTER TABLE "Encounter" ADD COLUMN     "context" "EncounterContext";
