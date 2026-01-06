# Perpetual Futures Deployment Checklist

## Before Deployment

### ✅ Prerequisites Checklist

- [ ] Have an existing mock token address (to use as USDC)
- [ ] Know your backend operator wallet address (from `OPERATOR_PRIVATE_KEY` in backend `.env`)
- [ ] Decide: Use existing index token OR deploy new one
- [ ] Have local node running (Anvil/Hardhat) OR RPC URL ready

### ✅ Required Information

1. **USDC Address**: `0x...` (your existing mock token)
2. **Operator Address**: `0x...` (backend operator wallet)
3. **Index Token**:
   - Option A: Existing token address `0x...`
   - Option B: Deploy new token (set `DEPLOY_INDEX_TOKEN=true`)

## Quick Deployment Steps

### Step 1: Copy Example Environment File

```bash
cd dex-smart-contract/contracts
cp .env.example .env
```

### Step 2: Edit .env File

Open `.env` and fill in:

```env
# REQUIRED
USDC_ADDRESS=0x...  # Your mock token address

# REQUIRED if using existing index token
INDEX_TOKEN_ADDRESS=0x...  # Or set DEPLOY_INDEX_TOKEN=true

# REQUIRED (or leave empty to use deployer)
OPERATOR_ADDRESS=0x...  # Backend operator address

# OPTIONAL (has defaults)
PRIVATE_KEY=0x...  # Default: Anvil account #0
INITIAL_PRICE=2000000000000000000000  # Default: $2000
DEPLOY_INDEX_TOKEN=false  # Default: false (use existing)
```

### Step 3: Deploy

```bash
forge script script/DeployPerpetualAll.s.sol:DeployPerpetualAll \
  --rpc-url http://localhost:8545 \
  --broadcast \
  -vvv
```

### Step 4: Save Deployment Addresses

Copy the addresses from console output and update:

1. **Backend `.env`**:
   ```env
   PERPETUAL_CONTRACT_ADDRESS=0x...
   MOCK_ORACLE_ADDRESS=0x...
   INDEX_TOKEN_ADDRESS=0x...
   USDC_ADDRESS=0x...
   OPERATOR_PRIVATE_KEY=0x...
   ```

2. **Frontend `.env`**:
   ```env
   VITE_PERPETUAL_CONTRACT_ADDRESS=0x...
   VITE_USDC_ADDRESS=0x...
   VITE_INDEX_TOKEN_ADDRESS=0x...
   VITE_PERPETUAL_BACKEND_URL=http://localhost:3002
   ```

## Environment Variables Reference

### For DeployPerpetualAll.s.sol

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `USDC_ADDRESS` | ✅ **YES** | - | Your existing mock token address |
| `INDEX_TOKEN_ADDRESS` | ✅ If `DEPLOY_INDEX_TOKEN=false` | - | Existing index token address |
| `OPERATOR_ADDRESS` | ⚠️ Recommended | Deployer address | Backend operator wallet |
| `PRIVATE_KEY` | ❌ No | Anvil #0 | Deployment private key |
| `INITIAL_PRICE` | ❌ No | `2000000000000000000000` | Initial price in 1e18 ($2000) |
| `DEPLOY_INDEX_TOKEN` | ❌ No | `false` | Deploy new index token? |

### For SetOraclePrice.s.sol (update price)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ORACLE_ADDRESS` | ✅ **YES** | - | MockOracle contract address |
| `INDEX_TOKEN_ADDRESS` | ✅ **YES** | - | Index token address |
| `INITIAL_PRICE` | ❌ No | `2000000000000000000000` | New price in 1e18 |
| `PRIVATE_KEY` | ❌ No | Anvil #0 | Private key (must be oracle owner) |

## Common Issues

### ❌ "USDC_ADDRESS must be set"
**Fix**: Add `USDC_ADDRESS=0x...` to your `.env` file

### ❌ "INDEX_TOKEN_ADDRESS not set"
**Fix**: Either:
- Set `INDEX_TOKEN_ADDRESS=0x...` in `.env`, OR
- Set `DEPLOY_INDEX_TOKEN=true` to deploy a new one

### ❌ "Only owner can call"
**Fix**: When updating oracle price, make sure `PRIVATE_KEY` in `.env` is the oracle owner (deployer address)

## Price Update Example

To change price from $2000 to $2500:

```bash
# Edit .env
ORACLE_ADDRESS=0x...  # Your deployed MockOracle
INDEX_TOKEN_ADDRESS=0x...  # Your index token
INITIAL_PRICE=2500000000000000000000  # $2500

# Run script
forge script script/SetOraclePrice.s.sol:SetOraclePrice \
  --rpc-url http://localhost:8545 \
  --broadcast
```

## What Gets Deployed

When you run `DeployPerpetualAll.s.sol`:

1. ✅ **MockOracle** - Price oracle (no dependencies)
2. ✅ **MockIndexToken** - Only if `DEPLOY_INDEX_TOKEN=true`
3. ✅ **Price Set** - Initial price set in oracle for index token
4. ✅ **Perpetual** - Main perpetual contract (requires all above)

**Total contracts**: 2-3 contracts deployed

