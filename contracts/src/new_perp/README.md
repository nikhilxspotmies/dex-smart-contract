# New Perp (Peer-to-Pool) Overview

This repo contains a minimal GMX V2–style isolated perpetual futures design. Each market is isolated (no contagion between pairs) and uses a two-step request/execute flow to avoid oracle front-running. Liquidity is pooled from LPs (USDC) into a per-market Vault.

## 🆕 Multiple Positions Support

**Key Feature**: Users can now have **multiple positions** per market:
- ✅ Multiple long positions
- ✅ Multiple short positions  
- ✅ Both long and short positions simultaneously
- Each position has a unique `positionId` for tracking and management
- Positions are independent - each has its own entry price, collateral, size, and funding snapshot

### Position ID System
- **positionId = 0**: Creates a new position (contract assigns next available ID)
- **positionId > 0**: References an existing position (must exist and be owned by user)
- Position IDs are unique across all users and markets
- Each user has an array of position IDs: `userPositionIds[user]`
- Position ownership tracked: `positionOwner[positionId] = user`

### Quick Reference: Function Signatures

**Router:**
```solidity
createIncreaseRequest(market, positionId, sizeDelta, collateralDelta, isLong, acceptablePrice, executionFee)
// positionId: 0 = new, >0 = existing

createDecreaseRequest(market, positionId, sizeDelta, isLong, acceptablePrice, executionFee)
// positionId: required, must be > 0
```

**Market:**
```solidity
increasePosition(user, positionId, sizeDelta, collateralDelta, isLong, price)
decreasePosition(user, positionId, sizeDelta, isLong, price)
liquidate(positionId, price)
getPosition(positionId) → Position
getUserPositionIds(user) → uint256[]
getUserPositionCount(user) → uint256
getUserPositions(user) → (uint256[], Position[])
```

**PositionManager:**
```solidity
executeIncrease(requestId)
executeDecrease(requestId)
liquidate(market, positionId)  // Changed from (market, user)
```

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
   - Approve Router; call `createIncreaseRequest(market, positionId, sizeUsd, collateralUsdc, isLong, acceptablePrice, executionFee)`.
   - **positionId = 0**: Creates a new position (returns new positionId in event)
   - **positionId > 0**: Adds to existing position (must match direction)
   - Router holds collateral + exec fee.
   - Keeper calls `PositionManager.executeIncrease(reqId)`: fetches price from oracle, slippage-checks, pulls collateral to Vault, forwards fee to executor, calls `Market.increasePosition`.
3) **User close/reduce (async)**:
   - `createDecreaseRequest(market, positionId, sizeUsd, isLong, acceptablePrice, executionFee)`.
   - **positionId is required** (must be > 0) - specifies which position to close/reduce
   - Keeper `executeDecrease`: slippage-checks, calls `Market.decreasePosition`; vault pays user profit + remaining collateral minus fee.
4) **Liquidation**:
   - Anyone calls `PositionManager.liquidate(market, positionId)`; price read, maintenance margin (5%) enforced; specific position removed; collateral stays in vault.

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
- `increasePosition(user, positionId, sizeDelta, collateralDelta, isLong, price)`: PM-only. 
  - **positionId = 0**: Creates new position, assigns new ID, adds to user's position list
  - **positionId > 0**: Adds to existing position (validates ownership and direction match)
  - Charges fee from collateral, updates OI caps, avg entry prices, weighted avg entry per position, funding snapshot
- `decreasePosition(user, positionId, sizeDelta, isLong, price)`: PM-only. 
  - **positionId required**: Specifies which position to reduce/close
  - Validates ownership and direction match
  - Computes PnL (price and funding), applies fee, returns remaining collateral+profit via Vault
  - Removes positionId from user's list when position size reaches 0
- `liquidate(positionId, price)`: PM-only. 
  - **positionId required**: Specifies which position to liquidate
  - Checks maintenance margin (5%); if under, deletes position and keeps collateral in Vault
  - Removes positionId from user's list
- `getPosition(positionId)`: Returns Position struct for a specific position ID
- `getUserPositionIds(user)`: Returns array of all position IDs for a user
- `getUserPositionCount(user)`: Returns count of positions for a user
- `getUserPositions(user)`: Returns arrays of (positionIds, positions) for all active positions
- `unrealizedProfits()`: Aggregate approximation using side OI vs average entry to protect LP withdrawals.
- Admin: `setMaxOI`, `setPositionManager`.

### Router
- `createIncreaseRequest(market, positionId, sizeDelta, collateralDelta, isLong, acceptablePrice, executionFee)`: 
  - Stores request, pulls `collateral + execFee` from user
  - **positionId = 0**: New position will be created
  - **positionId > 0**: Will add to existing position (must exist and match direction)
- `createDecreaseRequest(market, positionId, sizeDelta, isLong, acceptablePrice, executionFee)`: 
  - Stores request, pulls `execFee` from user
  - **positionId required** (must be > 0): Specifies which position to close/reduce
- `getRequest(requestId)`: Returns Request struct including positionId
- `consumeIncrease/consumeDecrease`: PM-only; moves funds to Vault and pays executor.
- `cancel(requestId)`: User refund of stored amounts (collateral + executionFee).

### PositionManager
- `executeIncrease(requestId)`: 
  - Reads positionId from request
  - Price from oracle; slippage check; calls `Market.increasePosition(user, positionId, ...)`; pays executor
- `executeDecrease(requestId)`: 
  - Reads positionId from request
  - Similar; calls `Market.decreasePosition(user, positionId, ...)`
- `liquidate(market, positionId)`: 
  - **positionId required**: Specifies which position to liquidate
  - Anyone can call; uses oracle price; calls `Market.liquidate(positionId, price)`

### OracleModule
- `getPrice(feed)`: Reads Chainlink, reverts if stale (>1h) or non-positive; scales to 1e18.

### Mocks
- `MockUSDC`: 6d ERC20 with `mint`.
- `MockOracle`: Chainlink-like with `setAnswer(int256)` storing 8d price.

### Tests (Foundry)
- `testLifecycle`: LP deposit -> open long -> price up -> close -> profit.
- `testShortLifecycle`: Open short -> price down -> close -> profit.
- `testIncreaseSameSide`: Weighted avg entry when adding size on same side.
- `testMultiplePositions`: Users can have multiple long and short positions simultaneously.
- `testPositionIdSystem`: Position IDs are unique and tracked correctly per user.
- Slippage reverts: long/short increase & decrease.
- `testOICapExceed`: Revert when exceeding OI cap.
- `testFeesCreditedToVault`: Fees deducted from user and retained in vault.
- `testFundingEffect`: Funding accumulates with OI imbalance.
- Liquidations: healthy (revert) vs unhealthy (success) per position.
- `testFullWipeOut`: User loses all collateral on close.
- `testExecutionFeeFlow`: Executor receives execution fees.
- `testPositionGetters`: Position fields update through open/close, multiple positions tracked.
- `testVaultSolvencyGuard`: LP withdraw respects unrealized profits.

## Frontend Integration Guide

### Prerequisites
- Require user approvals to Router for USDC (approve Router to spend USDC)
- Get contract addresses from deployment logs or environment variables

### Opening Positions

#### Create New Position
```javascript
// positionId = 0 creates a new position
const tx = await router.createIncreaseRequest(
  marketAddress,
  0,  // positionId = 0 means new position
  ethers.parseUnits("10000", 18),  // sizeDelta in USD (1e18)
  ethers.parseUnits("1000", 6),    // collateralDelta in USDC (6 decimals)
  true,  // isLong (true = long, false = short)
  ethers.parseUnits("3500", 18),   // acceptablePrice (max for long, min for short)
  ethers.parseUnits("1", 6)        // executionFee in USDC (6 decimals)
);

// Listen for PositionIncreased event to get the new positionId
const receipt = await tx.wait();
const event = receipt.logs.find(log => {
  const parsed = market.interface.parseLog(log);
  return parsed && parsed.name === 'PositionIncreased';
});
const positionId = event.args.positionId; // Save this for future operations
```

#### Add to Existing Position
```javascript
// positionId > 0 adds to existing position
await router.createIncreaseRequest(
  marketAddress,
  existingPositionId,  // Must exist and match direction
  sizeDelta,
  collateralDelta,
  isLong,  // Must match existing position direction
  acceptablePrice,
  executionFee
);
```

### Closing/Reducing Positions

```javascript
// positionId is REQUIRED (must be > 0)
await router.createDecreaseRequest(
  marketAddress,
  positionId,  // Required: which position to close
  ethers.parseUnits("5000", 18),  // sizeDelta to close (partial or full)
  true,  // isLong (must match position direction)
  ethers.parseUnits("3600", 18),  // acceptablePrice (min for long, max for short)
  ethers.parseUnits("1", 6)       // executionFee
);
```

### Reading Position Data

#### Get All User Positions
```javascript
// Get all position IDs for a user
const positionIds = await market.getUserPositionIds(userAddress);

// Get all active positions with details
const [ids, positions] = await market.getUserPositions(userAddress);

// Iterate through positions
for (let i = 0; i < ids.length; i++) {
  const pos = positions[i];
  console.log({
    positionId: ids[i].toString(),
    size: ethers.formatUnits(pos.size, 18),  // USD
    collateral: ethers.formatUnits(pos.collateral, 6),  // USDC
    entryPrice: ethers.formatUnits(pos.entryPrice, 18),
    isLong: pos.isLong,
    fundingEntry: pos.fundingEntry.toString()
  });
}
```

#### Get Single Position
```javascript
const position = await market.getPosition(positionId);
// Returns: { size, collateral, entryPrice, fundingEntry, isLong }
```

#### Get Position Count
```javascript
const count = await market.getUserPositionCount(userAddress);
```

### Calculating PnL (Frontend)

```javascript
async function calculatePositionPnL(market, positionId, currentPrice) {
  const position = await market.getPosition(positionId);
  if (position.size === 0n) return null;

  const entryPrice = parseFloat(ethers.formatUnits(position.entryPrice, 18));
  const size = parseFloat(ethers.formatUnits(position.size, 18));
  const isLong = position.isLong;

  // Price PnL
  let pricePnL;
  if (isLong) {
    pricePnL = size * (currentPrice - entryPrice) / entryPrice;
  } else {
    pricePnL = size * (entryPrice - currentPrice) / entryPrice;
  }

  // Note: For accurate PnL, also calculate funding PnL using cumulativeFunding rates
  // This requires reading cumulativeFundingLong/Short from Market contract

  return {
    pricePnL,
    collateral: parseFloat(ethers.formatUnits(position.collateral, 6)),
    size: size,
    entryPrice: entryPrice,
    currentPrice: currentPrice,
    isLong: isLong
  };
}
```

### Important Frontend Considerations

#### 1. Position ID Management
- **Always store positionId** after creating a new position (from PositionIncreased event)
- Use positionId for all subsequent operations (increase, decrease, close)
- Track positionIds per user per market in your frontend state

#### 2. Decimals Handling
- **Prices and sizes**: 18 decimals (1e18)
- **USDC amounts**: 6 decimals (1e6)
- **Conversion**: `ethers.parseUnits(value, decimals)` and `ethers.formatUnits(value, decimals)`

#### 3. Slippage Protection
- **Long positions**: `acceptablePrice` should be >= current price (max entry price)
- **Short positions**: `acceptablePrice` should be <= current price (min entry price)
- **Decrease long**: `acceptablePrice` should be <= current price (min exit price)
- **Decrease short**: `acceptablePrice` should be >= current price (max exit price)

#### 4. Request Status Tracking
```javascript
// Check if request exists
const request = await router.getRequest(requestId);
if (request.exists) {
  // Request is pending
} else {
  // Request was executed or cancelled
}
```

#### 5. Error Handling
Common errors to handle:
- `"pos id required"`: positionId must be > 0 for decrease requests
- `"not owner"`: User doesn't own the position
- `"side mismatch"`: Trying to add to position with different direction
- `"pos not found"`: Position doesn't exist
- `"slip long/short"`: Price slippage exceeded acceptable price
- `"oi long/short cap"`: Open interest limit reached
- `"collat<fee"`: Collateral insufficient to cover fees

#### 6. UI/UX Recommendations
- Display all user positions in a list/table
- Show positionId, size, collateral, entry price, current price, PnL, leverage
- Allow users to select which position to close/modify
- Show liquidation price for each position
- Display funding costs/rates
- Show pending requests and their status
- Allow canceling pending requests

#### 7. Event Listening
```javascript
// Listen for position updates
market.on("PositionIncreased", (user, positionId, isLong, size, collateral, price) => {
  // Update UI with new position
});

market.on("PositionDecreased", (user, positionId, isLong, size, collateral, price, pnl) => {
  // Update UI, remove position if size is 0
});

market.on("Liquidated", (user, positionId, isLong, size, collateral, price, pnl) => {
  // Remove liquidated position from UI
});

// Listen for request creation
router.on("RequestCreated", (id, user, market, isIncrease) => {
  // Show pending request in UI
});
```

### LP UI
- Deposit/withdraw pLP; show vault TVL and estimated share value
- **Guard**: withdraw can revert if vault must reserve for unrealized profits
- Display vault balance, total LP supply, and user's LP balance

## Keeper Notes

### Executing Requests
- **Open execution**: call `executeIncrease(requestId)`; receives executionFee
  - Reads positionId from request (0 = new, >0 = existing)
  - Validates slippage against acceptablePrice
  - Calls Market.increasePosition with positionId
- **Close execution**: call `executeDecrease(requestId)`
  - Reads positionId from request (required, must be > 0)
  - Validates slippage
  - Calls Market.decreasePosition with positionId

### Liquidation
- **Liquidation**: call `liquidate(market, positionId)` when position health < maintenance margin
  - **positionId required**: Must specify which position to liquidate
  - Anyone can call; uses oracle price
  - Checks maintenance margin (5%) per position
  - Liquidates only the specified position (users can have other healthy positions)

### Finding Liquidatable Positions
```javascript
// Get all user positions
const positionIds = await market.getUserPositionIds(userAddress);
const currentPrice = await market.getOraclePrice();

// Check each position for liquidation
for (const positionId of positionIds) {
  const position = await market.getPosition(positionId);
  if (position.size === 0n) continue;
  
  // Calculate PnL and check maintenance margin
  // If under 5% maintenance margin, call liquidate(market, positionId)
}
```


== Logs ==

=== Force deploying fresh MockUSDC on Anvil (will mint tokens) ===

=== Step 1: Deploying MockUSDC ===
  MockUSDC deployed at: 0x59b670e9fA9D0A427751Af201D676719a970857b
  Minted 1,000,000 USDC to deployer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  Deployer USDC balance: 1000000 USDC

=== Step 2: Deploying OracleModule ===
  OracleModule deployed at: 0x322813Fd9A801c5507c9de605d63CEA4f2CE6c44

=== Step 3: Deploying MockOracle ===
  MockOracle deployed at: 0xa85233C63b9Ee964Add6F2cffe00Fd84eb32338f
  Initial price set to: 20000000000000 USD (8 decimals)

=== Step 4: Deploying Router ===
  Router deployed at: 0x4A679253410272dd5232B3Ff7cF5dbB88f295319

=== Step 5: Deploying PositionManager ===
  PositionManager deployed at: 0x7a2088a1bFc9d81c55368AE168C2C02570cB814F

=== Step 6: Setting PositionManager in Router ===
  PositionManager set in Router

=== Step 7: Deploying MarketFactory ===
  MarketFactory deployed at: 0xc5a5C42992dECbae36851359345FE25997F5C42d

=== Step 8: Creating Market ===
  Market created at: 0x1A7A3e29c3c4b3C858f2DeD8bE6ed51A07589ecF
  Vault created at: 0xf0D7de80A1C242fA3C738b083C422d65c6c7ABF1

=== Deployment Summary ===
  USDC: 0x59b670e9fA9D0A427751Af201D676719a970857b
  OracleModule: 0x322813Fd9A801c5507c9de605d63CEA4f2CE6c44
  PriceFeed: 0xa85233C63b9Ee964Add6F2cffe00Fd84eb32338f
  Router: 0x4A679253410272dd5232B3Ff7cF5dbB88f295319
  PositionManager: 0x7a2088a1bFc9d81c55368AE168C2C02570cB814F
  MarketFactory: 0xc5a5C42992dECbae36851359345FE25997F5C42d
  Market: 0x1A7A3e29c3c4b3C858f2DeD8bE6ed51A07589ecF
  Vault: 0xf0D7de80A1C242fA3C738b083C422d65c6c7ABF1
  Base Symbol: ETH
  Deployer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

=== Environment Variables for Frontend ===
  VITE_PERP_ROUTER_ADDRESS= 0x4A679253410272dd5232B3Ff7cF5dbB88f295319
  VITE_PERP_MARKET_ADDRESS= 0x1A7A3e29c3c4b3C858f2DeD8bE6ed51A07589ecF
  VITE_PERP_VAULT_ADDRESS= 0xf0D7de80A1C242fA3C738b083C422d65c6c7ABF1
  VITE_PERP_POSITION_MANAGER_ADDRESS= 0x7a2088a1bFc9d81c55368AE168C2C02570cB814F
  VITE_USDC_ADDRESS= 0x59b670e9fA9D0A427751Af201D676719a970857b

=== Environment Variables for Backend ===
  PERP_ROUTER_ADDRESS= 0x4A679253410272dd5232B3Ff7cF5dbB88f295319
  PERP_MARKET_ADDRESS= 0x1A7A3e29c3c4b3C858f2DeD8bE6ed51A07589ecF
  PERP_VAULT_ADDRESS= 0xf0D7de80A1C242fA3C738b083C422d65c6c7ABF1
  PERP_POSITION_MANAGER_ADDRESS= 0x7a2088a1bFc9d81c55368AE168C2C02570cB814F
  USDC_ADDRESS= 0x59b670e9fA9D0A427751Af201D676719a970857b
  ORACLE_MODULE_ADDRESS= 0x322813Fd9A801c5507c9de605d63CEA4f2CE6c44
  PRICE_FEED_ADDRESS= 0xa85233C63b9Ee964Add6F2cffe00Fd84eb32338f

=== Next Steps ===
  1. Update your .env files with the addresses above
  2. If using MockOracle, you can update prices by calling:
     MockOracle( 0xa85233C63b9Ee964Add6F2cffe00Fd84eb32338f ).setAnswer(newPriceIn8Decimals)
  3. Users can now create increase/decrease requests via Router
     - Use positionId = 0 for new positions
     - Use positionId > 0 to add to existing positions
     - Always specify positionId when closing positions
  4. Keepers can execute requests via PositionManager
  5. Frontend should track positionIds per user and display all positions
  6. Liquidation now requires positionId - check each position individually

## Migration Notes (if upgrading from old version)

If you have existing deployments with the old single-position-per-user system:
- Old positions are stored as `positions[userAddress]`
- You may need a migration script to convert existing positions to the new positionId system
- New deployments will use positionId system from the start
- Consider deploying fresh contracts for new markets to avoid migration complexity