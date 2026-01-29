# Copy Trading Engine & Contracts Structure

This project implements a decentralized copy-trading system where users can automatically replicate the specific token allocations of a "Target Whale".

## 1. Architecture: Factory + Clones
We use a **One-Vault-Per-User** model for security and isolation.
- **Factory**: The central hub that deploys new vaults.
- **Vault**: A personal smart contract for each user that holds their funds and executes trades.

## 2. Smart Contracts
Located in: `dex-smart-contract/contracts/src/copy_trading`

### `CopyTradingFactory.sol`
- **Purpose**: Deploys individual vaults for users using the minimal proxy pattern (Clones) to save gas.
- **Key Function**: `createVault()` - Deploys a new vault and assigns ownership to the caller.
- **Registry**: Keeps track of all deployed vaults via `userVaults` mapping and `VaultCreated` events.

### `CopyTradingVault.sol`
- **Purpose**: Securely holds user funds and logic for rebalancing.
- **Ownership**: Owned by the User (can withdraw anytime).
- **Permissions**: Allows a specific **Executor** (our backend bot) to trigger swaps, but *only* if they follow valid paths.
- **Key Function**: `rebalance(swaps)` - Executes swaps on the DEX Router to align with the target whale.

## 3. Backend Engine
Located in: `dex-smart-contract/copy_trading_engine`

The backend is a Node.js/TypeScript service that runs a continuous loop (cron job) to monitor and adjust portfolios.

### Core Components used in `src/index.ts`:

#### A. Vault Manager (`managers/VaultManager.ts`)
- Listens to the Factory contract.
- Detects every time a user creates a new vault.
- Maintains a list of active vaults to monitor.

#### B. Portfolio Analyzer (`logic/Portfolio.ts`)
- **Valuation**: Fetches real-time USD prices for tokens using the DEX Router.
- **Comparison**: 
    1. Calculates the **Whale's** portfolio ratios (e.g., "Whale holds 60% Token A").
    2. Calculates the **User's** portfolio ratios.
    3. Finds **Deviations**: If the user's allocation differs by more than **5%**, it flags a rebalance is needed.

#### C. Trade Executor (`logic/Executor.ts`)
- **Pathfinding**: Determines the best path to swap "Overweight" tokens into "Underweight" tokens.
- **Slippage Protection**: Calculates minimum output to prevent front-running attacks.
- **Execution**: Sends a transaction to the User's Vault to perform the actual swap on-chain.

## 4. How It Works (The Loop)
1. **User** deploys a Vault via the Factory and deposits funds.
2. **User** sets a `targetWhale` address on their Vault.
3. **Backend Engine** picks up the new Vault.
4. **Every 30 seconds**:
   - Engine checks: *Is User's portfolio different from Whale's?*
   - If **YES**: Engine sends a `rebalance` transaction to the Vault.
   - **Vault** executes the swap on the DEX.
   - User's portfolio matches the Whale again.
