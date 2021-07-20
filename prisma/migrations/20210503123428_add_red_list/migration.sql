-- CreateEnum
CREATE TYPE "red_list_category" AS ENUM ('DD', 'LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX');

-- CreateTable
CREATE TABLE "red_list_data" (
    "id" UUID NOT NULL DEFAULT app.gen_random_uuid(),
    "scientific_name" TEXT NOT NULL,
    "flora_taxon_id" UUID,
    "category" "red_list_category" NOT NULL,
    "year_assessed" INTEGER NOT NULL,
    "red_list_version" TEXT NOT NULL,
    "current" BOOLEAN NOT NULL DEFAULT false,
    "ingested_at" TIMESTAMPTZ(6) NOT NULL,
    "ingest_id" UUID NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "red_list_data_category_idx" ON "red_list_data"("category");

-- CreateIndex
CREATE INDEX "red_list_data_current_idx" ON "red_list_data"("current");

-- CreateIndex
CREATE INDEX "red_list_data_flora_taxon_id_idx" ON "red_list_data"("flora_taxon_id");

-- CreateIndex
CREATE INDEX "red_list_data_year_assessed_idx" ON "red_list_data"("year_assessed");
