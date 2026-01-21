# New Perp (Peer-to-Pool) Overview

This repo contains a minimal GMX V2–style isolated perpetual futures design. Each market is isolated (no contagion between pairs) and uses a two-step request/execute flow to avoid oracle front-running. Liquidity is pooled from LPs (USDC) into a per-market Vault.

## Contracts and Roles

- `MarketFactory`: deploys isolated `Vault` + `Market` per pair and wires the PositionManager.
- `Vault`: holds USDC liquidity, mints/burns LP shares, enforces solvency vs unrealized PnL, only the Market can pull/push funds.
- `Market`: core perp logic (OI caps, funding, PnL, fees, liquidation). Only the PositionManager executes.
- `Router`: user-facing request store for async increase/decrease; holds collateral + execution fee.
- `PositionManager`: keeper entry point; anyone can execute requests; performs slippage checks; pays execution fee to executor; calls `Market`.
- `OracleModule`: Chainlink wrapper with staleness + >0 checks; scales 8d to 1e18.
- `mocks`: `MockUSDC` (6d) and `MockOracle` (8d) for local testing.
- `test/Market.t.sol`: Foundry tests (full lifecycle, shorts, slippage, OI caps, fees, funding, liquidation, wipe-out, solvency).

## Deployment Order (per market)
1) Deploy `MockUSDC` / or point to real USDC.
2) Deploy `OracleModule`.
3) Deploy `Router` (quote = USDC).
4) Deploy `PositionManager` (router address).
5) Deploy `MarketFactory`.
6) Call `MarketFactory.createMarket(baseSymbol, usdc, oracleModule, chainlinkFeed, positionManager)`:
   - Deploys `Vault` and `Market`
   - Sets `Vault.market` and `Market.positionManager`.
7) Router: `setPositionManager(pm)`; (already done) PM talks to Router.
8) Frontend/keepers use returned `market` and `vault` addresses.

## Workflow (User / Keeper / LP)
1) **LP provide liquidity**: call `Vault.deposit(amount, to)` with USDC. LP receives pLP shares (18d basis). Withdraw uses solvency check vs `Market.unrealizedProfits()`.
2) **User open position (async)**:
   - Approve Router; call `createIncreaseRequest(market, sizeUsd, collateralUsdc, isLong, acceptablePrice, executionFee)`.
   - Router holds collateral + exec fee.
   - Keeper calls `PositionManager.executeIncrease(reqId)`: fetches price from oracle, slippage-checks, pulls collateral to Vault, forwards fee to executor, calls `Market.increasePosition`.
3) **User close/reduce (async)**:
   - `createDecreaseRequest(market, sizeUsd, isLong, acceptablePrice, executionFee)`.
   - Keeper `executeDecrease`: slippage-checks, calls `Market.decreasePosition`; vault pays user profit + remaining collateral minus fee.
4) **Liquidation**:
   - Anyone calls `PositionManager.liquidate(market, user)`; price read, maintenance margin (5%) enforced; position removed; collateral stays in vault.

## Math / Decimals
- Internal USD math: 1e18 WAD.
- USDC: 6 decimals. Convert by `/ 1e12` from 1e18 USD to USDC.
- Chainlink: 8 decimals => `* 1e10` to 1e18.
- Fees: 0.1% (FEE_BPS=10) on open/close.
- Funding: imbalance-based `FUNDING_RATE_FACTOR` accrues to cumulativeFundingLong/Short; applied on each interaction.

## Key Functions (by contract)

### Vault
- `deposit(amount, to)`: Transfer USDC in, mint pLP shares (18d basis). First deposit 1:1 scaled.
- `withdraw(shares, to)`: Burns pLP, computes share of assets. Reverts if `assets + unrealizedProfits > balance` (solvency).
- `pull(to, amount)`: Market-only payout for PnL/withdrawals.
- `push(amount)`: Market sends fees back.

### Market
- `increasePosition(user, sizeDelta, collateralDelta, isLong, price)`: PM-only. Charges fee from collateral, updates OI caps, avg entry prices, per-user position, funding snapshot.
- `decreasePosition(user, sizeDelta, isLong, price)`: PM-only. Computes PnL (price and funding), applies fee, returns remaining collateral+profit via Vault.
- `liquidate(user, price)`: PM-only. Checks maintenance margin (5%); if under, deletes position and keeps collateral in Vault.
- `unrealizedProfits()`: Aggregate approximation using side OI vs average entry to protect LP withdrawals.
- Admin: `setMaxOI`, `setPositionManager`.

### Router
- `createIncreaseRequest(...)`: Stores request, pulls `collateral + execFee` from user.
- `createDecreaseRequest(...)`: Stores request, pulls `execFee`.
- `consumeIncrease/consumeDecrease`: PM-only; moves funds to Vault and pays executor.
- `cancel`: User refund of stored amounts.

### PositionManager
- `executeIncrease(requestId)`: Price from oracle; slippage check; calls Market.increasePosition; pays executor.
- `executeDecrease(requestId)`: Similar; calls Market.decreasePosition.
- `liquidate(market, user)`: Anyone can call; uses oracle price; calls Market.liquidate.

### OracleModule
- `getPrice(feed)`: Reads Chainlink, reverts if stale (>1h) or non-positive; scales to 1e18.

### Mocks
- `MockUSDC`: 6d ERC20 with `mint`.
- `MockOracle`: Chainlink-like with `setAnswer(int256)` storing 8d price.

### Tests (Foundry)
- `testLifecycle`: LP deposit -> open long -> price up -> close -> profit.
- `testShortLifecycle`: Open short -> price down -> close -> profit.
- `testIncreaseSameSide`: Weighted avg entry when adding size on same side.
- `testFlipSideRevert`: Opposite-side open reverts (`side change`).
- Slippage reverts: long/short increase & decrease.
- `testOICapExceed`: Revert when exceeding OI cap.
- `testFeesCreditedToVault`: Fees deducted from user and retained in vault.
- `testFundingEffect`: Funding accumulates with OI imbalance.
- Liquidations: healthy (revert) vs unhealthy (success).
- `testFullWipeOut`: User loses all collateral on close.
- `testExecutionFeeFlow`: Executor receives execution fees.
- `testPositionGetters`: Position fields update through open/close.
- `testVaultSolvencyGuard`: LP withdraw respects unrealized profits.

## Frontend Notes
- Require user approvals to Router for USDC.
- To open: call increase request; show pending status until keeper executes.
- To close: call decrease request similarly.
- Display oracle price and acceptablePrice slippage bounds.
- LP UI: deposit/withdraw pLP; show vault TVL and estimated share value. Guard: withdraw can revert if vault must reserve for unrealized profits.

## Keeper Notes
- Open execution: call `executeIncrease` with requestId; receives executionFee.
- Close execution: call `executeDecrease`.
- Liquidation: call `liquidate` when position health < maintenance margin.


