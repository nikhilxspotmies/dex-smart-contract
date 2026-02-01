-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'FILLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Order" (
    "orderHash" TEXT NOT NULL,
    "makerAsset" TEXT NOT NULL,
    "takerAsset" TEXT NOT NULL,
    "maker" TEXT NOT NULL,
    "makingAmount" TEXT NOT NULL,
    "takingAmount" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "deadline" INTEGER NOT NULL,
    "signature" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("orderHash")
);
