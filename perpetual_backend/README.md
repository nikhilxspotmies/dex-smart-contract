# Perpetual Backend

Backend service for perpetual futures trading. Handles order matching, oracle price management, funding rate calculations, and position tracking across **multiple markets**.

## Features

- **Multi-Market Support**: Handle multiple perpetual contracts (e.g., ETH-PERP, BTC-PERP)
- **Market Registry**: Centralized configuration for all markets
- **Backward Compatible**: Still works with single-market setups
- **Per-Market Isolation**: Orders, positions, and funding rates tracked per market

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure markets in `.env`:

### Option 1: Multi-Market Configuration (Recommended)

```env
# For each market, use MARKET_<SYMBOL>_* format
MARKET_ETH_PERP_INDEX_TOKEN=0x...
MARKET_ETH_PERP_CONTRACT=0x...
MARKET_ETH_PERP_NAME=Ethereum Perpetual

MARKET_BTC_PERP_INDEX_TOKEN=0x...
MARKET_BTC_PERP_CONTRACT=0x...
MARKET_BTC_PERP_NAME=Bitcoin Perpetual

# Set default market (optional)
DEFAULT_MARKET=ETH-PERP

# Shared configuration
MOCK_ORACLE_ADDRESS=0x...
OPERATOR_PRIVATE_KEY=0x...
RPC_URL=http://localhost:8545
```

### Option 2: Legacy Single-Market (Backward Compatible)

```env
PERPETUAL_CONTRACT_ADDRESS=0x...
MOCK_ORACLE_ADDRESS=0x...
USDC_ADDRESS=0x...
INDEX_TOKEN_ADDRESS=0x...
OPERATOR_PRIVATE_KEY=0x...
RPC_URL=http://localhost:8545
```

3. Build contract ABIs:
   - Copy `Perpetual.json` ABI from compiled contracts to `src/abis/Perpetual.ts`
   - Copy `MockOracle.json` ABI from compiled contracts to `src/abis/MockOracle.ts`

## Running

Development:
```bash
npm run dev
```

Production:
```bash
npm run build
npm start
```

The server will run on port 3002 by default.

## API Endpoints

### Market Discovery

- **`GET /markets`** - Get all available markets
  ```json
  {
    "markets": [
      {
        "symbol": "ETH-PERP",
        "indexToken": "0x...",
        "perpetualAddress": "0x...",
        "name": "Ethereum Perpetual"
      }
    ]
  }
  ```

### Public Endpoints

- **`POST /orders`** - Submit a new order
  ```json
  {
    "user": "0x...",
    "market": "ETH-PERP",  // Optional, uses default if omitted
    "side": "long",
    "type": "market",
    "size": "1.0",
    "leverage": 5
  }
  ```

- **`GET /positions/:address/:market?`** - Get user position
  - `:market` is optional (uses default if omitted)
  - Example: `/positions/0x.../ETH-PERP`

- **`GET /mark-price/:market?`** - Get current mark price
  - `:market` is optional
  - Example: `/mark-price/ETH-PERP`

- **`GET /funding-rate/:market?`** - Get current funding rate
  - `:market` is optional
  - Example: `/funding-rate/ETH-PERP`

- **`POST /close-position`** - Close an open position
  ```json
  {
    "user": "0x...",
    "market": "ETH-PERP"  // Optional, will use position's market
  }
  ```

### Admin Endpoints

- **`POST /admin/set-price`** - Update oracle price
  ```json
  {
    "market": "ETH-PERP",  // Optional, uses default
    "price": "2000.50"
  }
  ```

- **`POST /admin/update-funding`** - Update funding rate
  ```json
  {
    "market": "ETH-PERP",  // Optional, uses default
    "rate": "0.0001"  // Optional, will calculate if omitted
  }
  ```

## Architecture

### Market Registry

The backend uses a market registry (`src/utils/markets.ts`) to manage multiple perpetual contracts:

- **Market Symbol**: Unique identifier (e.g., "ETH-PERP")
- **Index Token**: The underlying token address
- **Perpetual Contract**: The deployed Perpetual contract address

### Services

- **PerpetualService**: Order matching and trade execution (per-market)
- **PositionService**: Position tracking (per-market)
- **OracleService**: Price management (supports multiple tokens)
- **FundingService**: Funding rate calculations (per-market)

### Data Structures

- **Orders**: Stored per market (`Map<market, Map<orderId, Order>>`)
- **Positions**: Cached per user-market (`Map<"user-market", Position>`)
- **Funding Rates**: Tracked per market (`Map<market, rate>`)

## Adding a New Market

1. Deploy a new Perpetual contract for your token
2. Add to `.env`:
   ```env
   MARKET_NEW_TOKEN_PERP_INDEX_TOKEN=0x...
   MARKET_NEW_TOKEN_PERP_CONTRACT=0x...
   MARKET_NEW_TOKEN_PERP_NAME=New Token Perpetual
   ```
3. Restart the backend - the market will be automatically loaded

## Backward Compatibility

The backend maintains backward compatibility with the old single-market setup:
- If no markets are configured, it will use `PERPETUAL_CONTRACT_ADDRESS` and `INDEX_TOKEN_ADDRESS`
- API endpoints without `market` parameter will use the default market
- Old clients will continue to work

## Type Definitions

- **Models**: Type definitions in `src/models/`
- **OrderRequest**: Now includes optional `market` field
- **Position**: Includes `market` field for multi-market support

