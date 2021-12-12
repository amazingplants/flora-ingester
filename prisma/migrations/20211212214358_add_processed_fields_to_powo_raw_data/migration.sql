-- AlterTable
ALTER TABLE "powo_raw_data" ADD COLUMN     "first_pass_processed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "second_pass_processed" BOOLEAN NOT NULL DEFAULT false;
