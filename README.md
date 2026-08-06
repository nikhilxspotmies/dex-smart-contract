# Amerox — contracts & backend services

On-chain contracts and off-chain services for the Amerox decentralized exchange,
deployed on BSC mainnet (chain 56).

## Layout

| Path | What it is |
|---|---|
| `contracts/` | Foundry workspace — AMM, P2P escrow, limit orders, perpetuals, copy trading |
| `backend/` | Users/auth, listings, P2P trades, swaps, chat (Express + MongoDB) |
| `limit_order_backend/` | EIP-712 limit order storage + matching engine (Express + PostgreSQL) |
| `perptual_backend/` | Perpetual keeper — executes requests and liquidations |
| `copy_trading_engine/` | Off-chain executor mirroring whale trades into per-user vaults |
| `ws/` | Standalone socket.io server |

Each service is independent: run `npm install` and `npm run dev` from its own
directory. Configuration is per-service — every service reads a `.env` file from
its own working directory, and none of those files are in version control.

## Deployment

`contracts/CONTRACTS_PROD_DEPLOYMENT.md` is the production runbook: what to deploy,
in what order, the post-deploy hardening steps, and which `.env` var each deployed
address feeds.
