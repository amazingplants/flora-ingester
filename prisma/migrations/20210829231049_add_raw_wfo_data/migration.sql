-- CreateTable
CREATE TABLE "wfo_raw_data" (
    "taxonID" TEXT NOT NULL,
    "scientificNameID" TEXT NOT NULL,
    "scientificName" TEXT NOT NULL,
    "taxonRank" TEXT NOT NULL,
    "parentNameUsageID" TEXT NOT NULL,
    "scientificNameAuthorship" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "genus" TEXT NOT NULL,
    "specificEpithet" TEXT NOT NULL,
    "infraspecificEpithet" TEXT NOT NULL,
    "verbatimTaxonRank" TEXT NOT NULL,
    "nomenclaturalStatus" TEXT NOT NULL,
    "namePublishedIn" TEXT NOT NULL,
    "taxonomicStatus" TEXT NOT NULL,
    "acceptedNameUsageID" TEXT NOT NULL,
    "nameAccordingToID" TEXT NOT NULL,
    "created" TEXT NOT NULL,
    "modified" TEXT NOT NULL,
    "references" TEXT NOT NULL,
    "ingest_id" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL,

    PRIMARY KEY ("taxonID")
);

-- CreateIndex
CREATE INDEX "wfo_raw_data_taxonID_idx" ON "wfo_raw_data"("taxonID");
