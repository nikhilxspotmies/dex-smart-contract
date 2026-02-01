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
*   **Purpose:** Standardizes price feeds (Chainlink/DEX adapters) for the Market.

### Step 4.2: Deploy Dex Price Adapters (One per Market)
*   **Contract:** `src/new_perp/src/oracle/DexPriceAdapter.sol` -> `DexPriceAdapter`
*   **Constructor:** `(address _dexRouter, address[] memory _path, uint8 _decimals)`
    *   `_dexRouter`: Address of AMM Router (Step 1.2).
    *   `_path`: Array of [Token, QuoteToken] (e.g., `[ETH_Address, USDC_Address]`).
    *   `_decimals`: Decimals of the price (usually 8).

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
    4.  `oracleAddress` (address): DexPriceAdapter (Step 4.2)
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
5.  [ ] **Oracle Module**
6.  [ ] **Dex Price Adapters** (needs AMM Router)
7.  [ ] **Perp Router** (needs USDC)
8.  [ ] **Position Manager** (needs Perp Router)
9.  [ ] **Link Perp Router <-> Position Manager**
10. [ ] **Perp Market Factory**
11. [ ] **Create Markets** (needs tokens, Oracle Mod, Adapter, PM)
12. [ ] **Copy Trading Vault Impl**
13. [ ] **Copy Trading Factory** (needs Vault Impl, Executor, AMM Router)
