# Amerox contracts

Foundry workspace for the Amerox DEX. Solidity 0.8.20, `via_ir = true`,
optimizer at 200 runs.

## What's here

| Path | Purpose |
|---|---|
| `src/Dex.sol` | AMM — factory, router, pairs |
| `src/P2PTokenEscrow.sol` | P2P escrow trading; tokens must be whitelisted by the owner |
| `src/limit_order/` | EIP-712 signed limit orders, matched off-chain |
| `src/new_perp/` | GMX-V2-style isolated peer-to-pool perpetuals (see its own README) |
| `src/copy_trading/` | Copy-trading vault factory + per-user vault clones |

`src/CopyTrading.sol`, `src/Counter.sol`, and the `Mock*` contracts are legacy or
test-only — they are not part of a production deploy.

## Usage

```shell
forge build
forge test
```

## Deployment

- `CONTRACTS_PROD_DEPLOYMENT.md` — production runbook (BSC mainnet); start here.
- `README_BSC_DEPLOY.md` — details of the BSC deploy script.

Deployed addresses are recorded under `broadcast/<script>/<chainId>/`.
