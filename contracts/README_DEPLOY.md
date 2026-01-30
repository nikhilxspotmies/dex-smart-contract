# Unified Deployment Guide

This project includes a unified deployment script `script/DeployAll.s.sol` that sets up the entire DEX ecosystem in one go.

## What Gets Deployed?

1.  **Tokens**: `MockUSDC`, `MockBTC` (Token A), `MockETH` (Token B).
2.  **AMM DEX**:
    *   `Factory` & `Router`.
    *   **Liquidity**: Automatically creates `BTC/USDC` and `ETH/USDC` pairs and adds initial liquidity.
3.  **P2P Exchange**:
    *   `P2PTokenEscrows`.
    *   **Whitelisting**: Automatically whitelists `USDC`, `BTC`, and `ETH` for P2P trading.
4.  **Limit Orders**: `LimitOrderProtocol`.
5.  **Perpetuals**:
    *   `OracleModule`, `MockOracle` (ETH Price = $3000).
    *   `PerpRouter`, `PositionManager`, `MarketFactory`.
    *   **Market**: Creates `ETH-PERP` market.
    *   **Liquidity**: Seeds the Vault with **1M USDC**.
6.  **Copy Trading**:
    *   `CopyTradingVault` (Implementation).
    *   `CopyTradingFactory`.

## How to Run

### 1. Start Anvil (Local Blockchain)
Open a terminal and run:
```bash
anvil
```

### 2. Run the Deployment Script
Open a **new terminal** in the `contracts` folder and run:

```bash
forge script script/DeployAll.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

*(The private key above is the default Anvil Account #0 key)*

### 3. Update Environment Variables
The script will output a section called `### CONTRACT ADDRESSES ###`.
Copy these values into your frontend (`Amerox-dex/.env`) and backend (`backend/.env`, `copy_trading_engine/.env`) files.

---

## Maintenance Commands (`cast`)

### Mint More Tokens
If you need more tokens for testing (e.g., for a specific address):

**Mint 1000 MockUSDC (6 decimals):**
```bash
cast send $VITE_MOCK_USDC_ADDRESS "mint(address,uint256)" <YOUR_WALLET_ADDRESS> 1000000000 --private-key <PRIVATE_KEY> --rpc-url http://127.0.0.1:8545
```

**Mint 1 MockBTC (18 decimals):**
```bash
cast send $VITE_MOCK_BTC_ADDRESS "mint(address,uint256)" <YOUR_WALLET_ADDRESS> 1000000000000000000 --private-key <PRIVATE_KEY> --rpc-url http://127.0.0.1:8545
```

### Update Oracle Price
To change the ETH price in the Perpetual Market (e.g., to $3500):

```bash
# Price is 8 decimals ($3500 * 10^8 = 350000000000)
cast send $VITE_PERP_ORACLE_ETH_ADDRESS "setAnswer(int256)" 350000000000 --private-key <PRIVATE_KEY> --rpc-url http://127.0.0.1:8545
```


forge script script/DeployAll.s.sol --tc DeployAll --rpc-url http://127.0.0.1:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

  --- 1. Deploying Tokens ---
  MockUSDC deployed at: 0x5FbDB2315678afecb367f032d93F642f64180aa3
  MockBTC deployed at: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
  MockETH deployed at: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9

--- 2. Deploying AMM DEX ---
  AMM Factory deployed at: 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
  AMM Router deployed at: 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
  BTC/USDC Pair created at: 0x8638B5F245FE449549D0462697d1a8c12f647517
  ETH/USDC Pair created at: 0x52097f62593cCCEe5f4A397644Ef6c3a9C516E56

--- 3. Deploying P2P System ---
  P2PTokenEscrows deployed at: 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e
  Whitelisted USDC, BTC, ETH on P2P

--- 4. Deploying Limit Order Protocol ---
  LimitOrderProtocol deployed at: 0x0B306BF915C4d645ff596e518fAf3F9669b97016

--- 5. Deploying Perpetuals System ---
  Perp OracleModule deployed at: 0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1
  MockOracle (ETH) deployed at: 0x9A9f2CCfdE556A7E9Ff0848998Aa4a0CFD8863AE
  Perp Router deployed at: 0x68B1D87F95878fE05B998F19b66F4baba5De1aed
  PositionManager deployed at: 0x3Aa5ebB10DC797CAC828524e59A333d0A371443c
  Perp MarketFactory deployed at: 0x59b670e9fA9D0A427751Af201D676719a970857b
  ETH-PERP Market created at: 0x18998c7E38ede4dF09cEec08E5372Bf8fe5719ea
  ETH-PERP Vault created at: 0xCe85503De9399D4dECa3c0b2bb3e9e7CFCBf9C6B
  Seeded Perp Vault with 1M USDC

--- 6. Deploying Copy Trading System ---
  CopyTrading Vault Impl deployed at: 0x7a2088a1bFc9d81c55368AE168C2C02570cB814F
  CopyTrading Factory deployed at: 0x09635F643e140090A9A8Dcd712eD6285858ceBef


=================================================================
                     DEPLOYMENT COMPLETE
  =================================================================

  ### CONTRACT ADDRESSES (Copy to .env) ###

  VITE_MOCK_USDC_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
  VITE_MOCK_BTC_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
  VITE_MOCK_ETH_ADDRESS=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9

  VITE_DEX_FACTORY_ADDRESS=0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
  VITE_DEX_ROUTER_ADDRESS=0x5FC8d32690cc91D4c39d9d3abcBD16989F875707

  VITE_P2P_ESCROW_ADDRESS=0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e

  VITE_LIMIT_ORDER_PROTOCOL_ADDRESS=0x0B306BF915C4d645ff596e518fAf3F9669b97016

  VITE_PERP_ROUTER_ADDRESS=0x68B1D87F95878fE05B998F19b66F4baba5De1aed
  VITE_PERP_POSITION_MANAGER_ADDRESS=0x3Aa5ebB10DC797CAC828524e59A333d0A371443c
  VITE_PERP_MARKET_FACTORY_ADDRESS=0x59b670e9fA9D0A427751Af201D676719a970857b
  VITE_PERP_MARKET_ETH_ADDRESS=0x18998c7E38ede4dF09cEec08E5372Bf8fe5719ea
  VITE_PERP_VAULT_ETH_ADDRESS=0xCe85503De9399D4dECa3c0b2bb3e9e7CFCBf9C6B
  VITE_PERP_ORACLE_ETH_ADDRESS=0x9A9f2CCfdE556A7E9Ff0848998Aa4a0CFD8863AE

  VITE_COPY_TRADING_FACTORY_ADDRESS=0x09635F643e140090A9A8Dcd712eD6285858ceBef
  VITE_COPY_TRADING_VAULT_IMPL_ADDRESS=0x7a2088a1bFc9d81c55368AE168C2C02570cB814F

  ### BACKEND ENV ###
  USDC_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
  WETH_ADDRESS=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
  FACTORY_ADDRESS=0x09635F643e140090A9A8Dcd712eD6285858ceBef
  ROUTER_ADDRESS=0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
  RPC_URL=http://127.0.0.1:8545


cast send 0x5FbDB2315678afecb367f032d93F642f64180aa3 "mint(address,uint256)" 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 3000000000 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --rpc-url http://127.0.0.1:8545

cast send 0x9A9f2CCfdE556A7E9Ff0848998Aa4a0CFD8863AE "setAnswer(int256)" 300000000000 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --rpc-url http://127.0.0.1:8545