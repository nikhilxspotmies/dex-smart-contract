# Perpetual Futures Deployment Guide

## Deployment Order

1. **MockOracle** (no dependencies)
2. **Perpetual** (needs: MockOracle, USDC address, IndexToken address, Operator address)
3. **Set Price** (set initial price for index token in oracle)

## Prerequisites

1. You need an existing mock token address to use as USDC
2. Set up your `.env` file or export environment variables

## Environment Variables

Create a `.env` file in the `contracts` directory:

```env
# Private key for deployment (default: Anvil account #0)
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Your existing mock token address (to use as USDC)
USDC_ADDRESS=0x...

# Operator address (backend operator wallet - the address from OPERATOR_PRIVATE_KEY)
OPERATOR_ADDRESS=0x...

# For DeployPerpetualAll.s.sol
# Option 1: Use existing index token
INDEX_TOKEN_ADDRESS=0x...

# Option 2: Deploy new index token (set to true)
DEPLOY_INDEX_TOKEN=false

# Initial price for index token (default: $2000 = 2000 * 1e18)
INITIAL_PRICE=2000000000000000000000
```

## Deployment Options

### Option 1: Deploy All at Once (Recommended)

This deploys MockOracle, optionally deploys IndexToken, sets the price, and deploys Perpetual:

```bash
cd dex-smart-contract/contracts

# Set your mock token address (existing USDC mock)
export USDC_ADDRESS=0x...

# Set operator address (backend operator)
export OPERATOR_ADDRESS=0x...

# Option A: Use existing index token
export INDEX_TOKEN_ADDRESS=0x...
export DEPLOY_INDEX_TOKEN=false

# Option B: Deploy new index token
export DEPLOY_INDEX_TOKEN=true

# Deploy everything
forge script script/DeployPerpetualAll.s.sol:DeployPerpetualAll --rpc-url http://localhost:8545 --broadcast -vvv
```

### Option 2: Deploy Separately

**Step 1: Deploy MockOracle**

```bash
forge script script/DeployMockOracle.s.sol:DeployMockOracle --rpc-url http://localhost:8545 --broadcast
```

Copy the `MockOracle` address from output.

**Step 2: Set Oracle Price (if using existing index token)**

```bash
export ORACLE_ADDRESS=0x...  # From step 1
export INDEX_TOKEN_ADDRESS=0x...  # Your index token address
export INITIAL_PRICE=2000000000000000000000  # $2000

forge script script/SetOraclePrice.s.sol:SetOraclePrice --rpc-url http://localhost:8545 --broadcast
```

**Step 3: Deploy Perpetual**

```bash
export USDC_ADDRESS=0x...  # Your existing mock token
export ORACLE_ADDRESS=0x...  # From step 1
export INDEX_TOKEN_ADDRESS=0x...  # Your index token
export OPERATOR_ADDRESS=0x...  # Backend operator address

forge script script/DeployPerpetual.s.sol:DeployPerpetual --rpc-url http://localhost:8545 --broadcast
```

## Important Notes

1. **USDC Address**: Use your existing mock token address - no need to deploy USDC
2. **Operator Address**: This should be the backend operator wallet (address derived from `OPERATOR_PRIVATE_KEY` in backend `.env`)
3. **Oracle Price**: You set the price for the **INDEX_TOKEN** (e.g., ETH), not USDC. USDC is always $1.
4. **Price Format**: Prices are in 1e18 format. $2000 = `2000000000000000000000` (2000 * 1e18)

## After Deployment

Update your backend `.env`:
```env
PERPETUAL_CONTRACT_ADDRESS=0x...
MOCK_ORACLE_ADDRESS=0x...
INDEX_TOKEN_ADDRESS=0x...
USDC_ADDRESS=0x...
```

Update your frontend `.env`:
```env
VITE_PERPETUAL_CONTRACT_ADDRESS=0x...
VITE_USDC_ADDRESS=0x...
VITE_INDEX_TOKEN_ADDRESS=0x...
VITE_PERPETUAL_BACKEND_URL=http://localhost:3002
```

## Example: Using Existing Tokens

If you already have tokens deployed:

```bash
# Set all addresses
export USDC_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3  # Your mock token
export INDEX_TOKEN_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512  # Another token as ETH
export OPERATOR_ADDRESS=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC  # Backend operator

# Deploy all (it will use existing INDEX_TOKEN_ADDRESS)
export DEPLOY_INDEX_TOKEN=false
forge script script/DeployPerpetualAll.s.sol:DeployPerpetualAll --rpc-url http://localhost:8545 --broadcast
```

This will:
1. Deploy MockOracle
2. Set price for INDEX_TOKEN in oracle
3. Deploy Perpetual with all addresses

