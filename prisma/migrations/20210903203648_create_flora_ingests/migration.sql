-- CreateEnum
CREATE TYPE "ingest_type" AS ENUM ('wfo', 'powo');

-- CreateTable
CREATE TABLE "flora_ingests" (
    "id" UUID NOT NULL DEFAULT app.gen_random_uuid(),
    "type" "ingest_type" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    PRIMARY KEY ("id")
);
