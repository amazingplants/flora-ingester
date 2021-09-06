/*
  Warnings:

  - You are about to drop the column `processed` on the `wfo_raw_data` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "wfo_raw_data" DROP COLUMN "processed",
ADD COLUMN     "first_pass_processed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "second_pass_processed" BOOLEAN NOT NULL DEFAULT false;
