-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "filledMakingAmount" TEXT NOT NULL DEFAULT '0';

-- CreateTable
CREATE TABLE "LastTradedPrice" (
    "key" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LastTradedPrice_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "volume" TEXT NOT NULL DEFAULT '0',
    "timestamp" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceHistory_key_timestamp_idx" ON "PriceHistory"("key", "timestamp");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_maker_idx" ON "Order"("maker");

-- CreateIndex
CREATE INDEX "Order_makerAsset_takerAsset_status_idx" ON "Order"("makerAsset", "takerAsset", "status");
