-- CreateTable
CREATE TABLE "powo_raw_data" (
    "id" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "family" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rank" TEXT NOT NULL,
    "accepted_id" TEXT NOT NULL,
    "images" JSONB NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "powo_raw_data_accepted_id_idx" ON "powo_raw_data"("accepted_id");
