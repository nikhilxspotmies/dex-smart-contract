# New Perp Contracts Deployment Guide

This guide explains how to deploy the new perpetual futures contracts.

## Prerequisites

1. Install Foundry:
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

2. Set up environment variables in `.env`:
```bash
PRIVATE_KEY=your_private_key_here
RPC_URL=https://your-rpc-url.com
```

## Deployment Options

### Option 1: Full Deployment (Recommended for First Time)

Deploys all contracts including mocks:

```bash
forge script script/DeployNewPerp.s.sol:DeployNewPerp \
  --rpc-url $RPC_URL \
  --broadcast \
  --verify \
  -vvvv
```

**Environment Variables:**
- `PRIVATE_KEY`: Deployer private key (required)
- `USDC_ADDRESS`: Existing USDC address (optional, will deploy MockUSDC if not set)
- `DEPLOY_MOCK_USDC`: Set to `true` to deploy MockUSDC even if USDC_ADDRESS is set
- `BASE_SYMBOL`: Base symbol for market (default: "ETH")
- `INITIAL_PRICE`: Initial price in 8 decimals (default: 2000e8 = $2000)
- `USE_REAL_ORACLE`: Set to `true` to use real Chainlink feed
- `CHAINLINK_FEED_ADDRESS`: Real Chainlink feed address (if USE_REAL_ORACLE=true)

**Example:**
```bash
PRIVATE_KEY=0x... \
BASE_SYMBOL=ETH \
INITIAL_PRICE=200000000000 \
forge script script/DeployNewPerp.s.sol:DeployNewPerp \
  --rpc-url $RPC_URL \
  --broadcast \
  --verify
```

### Option 2: Deploy New Market (After Factory is Deployed)

If you already have a MarketFactory deployed and want to create a new market:

```bash
forge script script/DeployNewPerpMarket.s.sol:DeployNewPerpMarket \
  --rpc-url $RPC_URL \
  --broadcast \
  --verify \
  -vvvv
```

**Environment Variables:**
- `PRIVATE_KEY`: Deployer private key (required)
- `MARKET_FACTORY_ADDRESS`: Address of existing MarketFactory
- `ORACLE_MODULE_ADDRESS`: Address of existing OracleModule
- `USDC_ADDRESS`: USDC token address
- `PRICE_FEED_ADDRESS`: Chainlink feed or MockOracle address
- `POSITION_MANAGER_ADDRESS`: PositionManager address
- `BASE_SYMBOL`: Base symbol (e.g., "BTC", "ETH", "SOL")

**Example:**
```bash
PRIVATE_KEY=0x... \
MARKET_FACTORY_ADDRESS=0x... \
ORACLE_MODULE_ADDRESS=0x... \
USDC_ADDRESS=0x... \
PRICE_FEED_ADDRESS=0x... \
POSITION_MANAGER_ADDRESS=0x... \
BASE_SYMBOL=BTC \
forge script script/DeployNewPerpMarket.s.sol:DeployNewPerpMarket \
  --rpc-url $RPC_URL \
  --broadcast
```

### Option 3: Update MockOracle Price (For Testing)

Update the price in MockOracle for testing:

```bash
forge script script/SetMockOraclePrice.s.sol:SetMockOraclePrice \
  --rpc-url $RPC_URL \
  --broadcast \
  -vvvv
```

**Environment Variables:**
- `PRIVATE_KEY`: Deployer private key (required)
- `MOCK_ORACLE_ADDRESS`: Address of MockOracle contract
- `PRICE`: New price in 8 decimals (e.g., 2500e8 for $2500)

**Example:**
```bash
PRIVATE_KEY=0x... \
MOCK_ORACLE_ADDRESS=0x... \
PRICE=250000000000 \
forge script script/SetMockOraclePrice.s.sol:SetMockOraclePrice \
  --rpc-url $RPC_URL \
  --broadcast
```

## Deployment Order

The full deployment script follows this order:

1. **MockUSDC** (or use existing USDC)
   - Deploys MockUSDC if not provided
   - Mints 1M USDC to deployer for testing

2. **OracleModule**
   - Wrapper for Chainlink price feeds
   - Handles staleness checks and scaling

3. **MockOracle** (or use real Chainlink feed)
   - For testing: deploys MockOracle with initial price
   - For production: uses provided Chainlink feed address

4. **Router**
   - Stores user requests for async execution
   - Takes USDC as quote token

5. **PositionManager**
   - Executes requests from Router
   - Calls Market contract functions

6. **MarketFactory**
   - Factory for creating new markets

7. **Create Market**
   - Calls `factory.createMarket()` to deploy Market + Vault
   - Sets up all connections

8. **Configure Router**
   - Sets PositionManager in Router

## Contract Addresses

After deployment, the script will output all contract addresses. Save these to your `.env` files:

### Frontend (.env)
```bash
VITE_PERP_ROUTER_ADDRESS=0x...
VITE_PERP_MARKET_ADDRESS=0x...
VITE_PERP_VAULT_ADDRESS=0x...
VITE_PERP_POSITION_MANAGER_ADDRESS=0x...
VITE_USDC_ADDRESS=0x...
```

### Backend (.env)
```bash
PERP_ROUTER_ADDRESS=0x...
PERP_MARKET_ADDRESS=0x...
PERP_VAULT_ADDRESS=0x...
PERP_POSITION_MANAGER_ADDRESS=0x...
USDC_ADDRESS=0x...
ORACLE_MODULE_ADDRESS=0x...
PRICE_FEED_ADDRESS=0x...
```

## Testing Deployment

For local testing with Anvil:

```bash
# Start Anvil
anvil

# In another terminal, deploy
forge script script/DeployNewPerp.s.sol:DeployNewPerp \
  --rpc-url http://localhost:8545 \
  --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

## Verification

After deployment, verify contracts on block explorer:

```bash
forge verify-contract \
  --chain-id <chain_id> \
  --num-of-optimizations 200 \
  --watch \
  --constructor-args $(cast abi-encode "constructor(address)" <USDC_ADDRESS>) \
  <CONTRACT_ADDRESS> \
  src/new_perp/src/router/Router.sol:Router
```

## Troubleshooting

1. **"USDC_ADDRESS must be set"**: Either set `USDC_ADDRESS` in `.env` or set `DEPLOY_MOCK_USDC=true`

2. **"CHAINLINK_FEED_ADDRESS must be set"**: When `USE_REAL_ORACLE=true`, you must provide a Chainlink feed address

3. **Transaction reverts**: Check that you have enough ETH for gas and that all addresses are valid

4. **Price not updating**: For MockOracle, use `SetMockOraclePrice.s.sol` script to update prices

## Next Steps

1. Update frontend and backend `.env` files with contract addresses
2. Test creating increase/decrease requests via Router
3. Test executing requests via PositionManager
4. For production, replace MockOracle with real Chainlink feeds
5. Set up keepers to monitor and execute requests



