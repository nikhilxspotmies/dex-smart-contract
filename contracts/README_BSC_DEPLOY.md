# BSC Deployment Guide

This guide explains how to deploy the Amerox DEX and Perpetual system to the Binance Smart Chain (BSC) Mainnet or Testnet.

## Prerequisites

1.  **Tokens**: On BSC Mainnet, you will use **real tokens** (USDC, BTCB, ETH). On Testnet, you might still need to deploy Mock tokens if you don't have access to faucets.
2.  **Gas**: You need **BNB** for gas fees.

---

## 1. Core DEX (AMM) Deployment

The AMM (Automated Market Maker) is the foundation. It handles swapping and liquidity.

### Step 1.1: Deploy Factory
*   **Contract:** `src/Dex.sol` -> `Factory`
*   **Constructor:** `None`
*   **Purpose:** registry for all liquidity pairs.

### Step 1.2: Deploy Router
*   **Contract:** `src/Dex.sol` -> `Router`
*   **Constructor:** `(address _factory)`
    *   `_factory`: Address of the Factory deployed in Step 1.1.
*   **Purpose:** The main entry point for users to `swap` and `addLiquidity`.

---

## 2. P2P System

### Step 2.1: Deploy P2P Escrow
*   **Contract:** `src/P2PTokenEscrow.sol` -> `P2PTokenEscrows`
*   **Constructor:** `None`
*   **Post-Deployment:**
    *   Call `setTokenWhitelist(tokenAddress, true)` for every token you want to support (USDC, ETH, BTC).

---

## 3. Limit Order Protocol

### Step 3.1: Deploy Limit Order Protocol
*   **Contract:** `src/limit_order/LimitOrderProtocol.sol` -> `LimitOrderProtocol`
*   **Constructor:** `None`

---

## 4. Perpetual Futures System

This system is complex and has a specific order of dependencies.

### Step 4.1: Deploy Oracle Module
*   **Contract:** `src/new_perp/src/oracle/OracleModule.sol` -> `OracleModule`
*   **Constructor:** `None`
*   **Purpose:** Standardizes price feeds (Chainlink) for the Market.
*   **After deploy (C5/M2):** for each market's feed call
    `oracleModule.setFeedMaxStale(feed, heartbeatSeconds)` (match the Chainlink feed's heartbeat),
    and optionally `oracleModule.setFeedBounds(feed, minE18, maxE18)`.

### Step 4.2: Use the Chainlink price feed (NOT a DEX adapter)
> ⚠️ **C5:** Do **NOT** use `DexPriceAdapter` for perp markets. A DEX spot price is flash-loan
> manipulable within a single transaction, and the adapter stamps `updatedAt = block.timestamp`
> so the staleness check can never catch a manipulated price. Wire markets to a real **Chainlink
> `<BASE>/USD` aggregator** instead.

*   **No contract to deploy** — use the on-chain Chainlink aggregator address directly.
*   **BSC mainnet feeds (8-dec, USD):**
    *   ETH/USD: `0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e`
    *   BTC/USD: `0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf`
    *   BNB/USD: `0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE`
*   The `DeployNewPerpBSC.s.sol` script wires these automatically (override via `PRICE_FEED_ADDRESS`).

### Step 4.3: Deploy Perpetual Router
*   **Contract:** `src/new_perp/src/router/Router.sol` -> `Router`
*   **Constructor:** `(address _quoteToken)`
    *   `_quoteToken`: Address of the stablecoin (e.g., USDC).

### Step 4.4: Deploy Position Manager
*   **Contract:** `src/new_perp/src/router/PositionManager.sol` -> `PositionManager`
*   **Constructor:** `(address _router)`
    *   `_router`: Address of Perpetual Router (Step 4.3).

### Step 4.5: Link Router to Position Manager
*   **Action:** Call `perpRouter.setPositionManager(positionManagerAddress)`

### Step 4.6: Deploy Market Factory
*   **Contract:** `src/new_perp/src/core/MarketFactory.sol` -> `MarketFactory`
*   **Constructor:** `None`

### Step 4.7: Create Markets (ETH-PERP, BTC-PERP)
*   **Action:** Call `perpMarketFactory.createMarket(...)`
*   **Arguments:**
    1.  `symbol` (string): "ETH"
    2.  `quoteToken` (address): USDC Address
    3.  `oracleModule` (address): Oracle Module (Step 4.1)
    4.  `priceFeed` (address): Chainlink `<BASE>/USD` aggregator (Step 4.2)
    5.  `positionManager` (address): Position Manager (Step 4.4)
*   **Returns:** `(marketAddress, vaultAddress)`

### Step 4.8: Set Position Manager in Market
*   **Action:** Call `Market(marketAddress).setPositionManager(positionManagerAddress)` for each market.

---

## 5. Copy Trading System

### Step 5.1: Deploy Vault Implementation
*   **Contract:** `src/copy_trading/CopyTradingVault.sol` -> `CopyTradingVault`
*   **Constructor:** `None`

### Step 5.2: Deploy Factory
*   **Contract:** `src/copy_trading/CopyTradingFactory.sol` -> `CopyTradingFactory`
*   **Arguments:**
    1.  `_implementation`: Address of Vault Impl (Step 5.1).
    2.  `_executor`: Address of the backend bot/admin (that will trigger swaps).
    3.  `_router`: Address of AMM Router (Step 1.2).
    4.  `_owner`: Your admin address.

---

## Summary Checklist

1.  [ ] **AMM Factory**
2.  [ ] **AMM Router** (needs Factory)
3.  [ ] **P2P Escrow**
4.  [ ] **Limit Order Protocol**
5.  [ ] **Oracle Module** (then `setFeedMaxStale` per Chainlink feed — C5/M2)
6.  [ ] **Chainlink price feeds** (use on-chain addresses; NO DexPriceAdapter for perps — C5)
7.  [ ] **Perp Router** (needs USDC)
8.  [ ] **Position Manager** (needs Perp Router)
9.  [ ] **Link Perp Router <-> Position Manager**
10. [ ] **Perp Market Factory**
11. [ ] **Create Markets** (needs tokens, Oracle Mod, Chainlink feed, PM)
12. [ ] **Copy Trading Vault Impl**
13. [ ] **Copy Trading Factory** (needs Vault Impl, Executor, AMM Router)
