/*
  Warnings:

  - You are about to drop the column `name` on the `powo_raw_data` table. All the data in the column will be lost.
  - You are about to drop the column `scientificName` on the `wfo_raw_data` table. All the data in the column will be lost.
  - Added the required column `name_normalized` to the `powo_raw_data` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name_verbatim` to the `powo_raw_data` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name_normalized` to the `wfo_raw_data` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name_verbatim` to the `wfo_raw_data` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "powo_raw_data" DROP COLUMN "name",
ADD COLUMN     "name_normalized" TEXT NOT NULL,
ADD COLUMN     "name_verbatim" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "wfo_raw_data" DROP COLUMN "scientificName",
ADD COLUMN     "name_normalized" TEXT NOT NULL,
ADD COLUMN     "name_verbatim" TEXT NOT NULL;
