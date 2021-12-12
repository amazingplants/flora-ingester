/*
  Warnings:

  - You are about to drop the column `created_by_wfo_ingest_id` on the `flora_names` table. All the data in the column will be lost.
  - You are about to drop the column `created_by_wfo_ingest_id` on the `flora_taxa` table. All the data in the column will be lost.
  - Added the required column `created_by_ingest_id` to the `flora_taxa` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "flora_names" DROP COLUMN "created_by_wfo_ingest_id",
ADD COLUMN     "created_by_ingest_id" UUID;

-- AlterTable
ALTER TABLE "flora_taxa" DROP COLUMN "created_by_wfo_ingest_id",
ADD COLUMN     "created_by_ingest_id" UUID NOT NULL;
