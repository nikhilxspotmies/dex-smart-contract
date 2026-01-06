# Perpetual Backend

Backend service for perpetual futures trading. Handles order matching, oracle price management, funding rate calculations, and position tracking.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in the values:
```bash
cp .env.example .env
```

3. Set environment variables:
- `PERPETUAL_CONTRACT_ADDRESS` - Deployed Perpetual contract address
- `MOCK_ORACLE_ADDRESS` - MockOracle contract address
- `USDC_ADDRESS` - USDC token address
- `INDEX_TOKEN_ADDRESS` - Index token address (e.g., ETH)
- `OPERATOR_PRIVATE_KEY` - Private key for operator account (used to execute trades)
- `RPC_URL` - Blockchain RPC URL

4. Build contract ABIs:
   - Copy `Perpetual.json` ABI from compiled contracts to `src/abis/Perpetual.json`
   - Copy `MockOracle.json` ABI from compiled contracts to `src/abis/MockOracle.json`

5. Update `src/utils/contract.ts` to import the ABIs

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

### Public Endpoints

- `POST /orders` - Submit a new order
- `GET /positions/:address` - Get user positions
- `GET /mark-price` - Get current mark price
- `GET /funding-rate` - Get current funding rate
- `POST /deposit` - Deposit collateral (handled on frontend)
- `POST /withdraw` - Withdraw collateral (handled on frontend)
- `POST /close-position` - Close an open position

### Admin Endpoints

- `POST /admin/set-price` - Update oracle price (requires authentication)
- `POST /admin/update-funding` - Update funding rate (requires authentication)

## Architecture

- **Services**: Business logic (matching, oracle, funding, positions)
- **Controllers**: HTTP request handlers
- **Routes**: API endpoint definitions
- **Utils**: Contract interaction and calculations
- **Models**: Type definitions

