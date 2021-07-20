-- CreateEnum
CREATE TYPE "flora_name_status" AS ENUM ('accepted', 'synonym', 'unknown');

-- CreateTable
CREATE TABLE "flora_taxa" (
    "id" UUID NOT NULL DEFAULT app.gen_random_uuid(),
    "created_by_wfo_ingest_id" UUID NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flora_taxa_names" (
    "flora_taxon_id" UUID NOT NULL,
    "flora_name_id" UUID NOT NULL,
    "status" "flora_name_status" NOT NULL,
    "id" UUID NOT NULL DEFAULT app.gen_random_uuid(),
    "ingest_id" UUID NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flora_names" (
    "id" UUID NOT NULL DEFAULT app.gen_random_uuid(),
    "scientific_name" TEXT NOT NULL,
    "name_according_to" TEXT,
    "name_published_in" TEXT,
    "name_published_in_year" INTEGER,
    "family" TEXT,
    "genus" TEXT,
    "subgenus" TEXT,
    "specific_epithet" TEXT,
    "infraspecific_epithet" TEXT,
    "name_authorship" TEXT,
    "taxon_remarks" TEXT,
    "taxon_rank" TEXT NOT NULL,
    "aggregate" TEXT,
    "microspecies" TEXT,
    "subspecies" TEXT,
    "variety" TEXT,
    "subvariety" TEXT,
    "form" TEXT,
    "subform" INTEGER,
    "group" TEXT,
    "cultivar" TEXT,
    "base_id" UUID,
    "wfo_name_reference" TEXT,
    "created_by_wfo_ingest_id" UUID,
    "wfo_data" JSONB,

    PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flora_taxa_id_idx" ON "flora_taxa"("id");

-- CreateIndex
CREATE UNIQUE INDEX "flora_taxa_names_flora_taxon_id_flora_name_id_idx" ON "flora_taxa_names"("flora_taxon_id", "flora_name_id", "ingest_id");

-- CreateIndex
CREATE INDEX "flora_taxa_names_status_idx" ON "flora_taxa_names"("status");

-- CreateIndex
CREATE INDEX "flora_names_family_idx" ON "flora_names"("family");

-- CreateIndex
CREATE INDEX "flora_names_genus_idx" ON "flora_names"("genus");

-- CreateIndex
CREATE INDEX "flora_names_scientific_name_idx" ON "flora_names"("scientific_name");

-- CreateIndex
CREATE INDEX "flora_names_wfo_data_idx" ON "flora_names"("wfo_data");

-- CreateIndex
CREATE INDEX "flora_names_wfo_name_reference_idx" ON "flora_names"("wfo_name_reference");

-- AddForeignKey
ALTER TABLE "flora_taxa_names" ADD FOREIGN KEY ("flora_taxon_id") REFERENCES "flora_taxa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flora_taxa_names" ADD FOREIGN KEY ("flora_name_id") REFERENCES "flora_names"("id") ON DELETE CASCADE ON UPDATE CASCADE;
