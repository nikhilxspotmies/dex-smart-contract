export interface Token {
    symbol: string;
    name: string;
    address: string;
    logo: string;
    decimals: number;
    balance?: string; // For UI mock purposes
}

// Must stay in sync with Amerox-dex/src/utils/tokenConfig.ts — the matching engine
// resolves an order's asset addresses back to symbols to build the price key
// ("ETH-USDC"), which the frontend then reads back by symbol. A token missing here
// gets stored under a raw-address key and its chart shows no data.
//
// Addresses come from env (see .env.production); the fallbacks are the Binance-Pegged
// BEP-20 tokens on BSC mainnet, all 18 decimals.
//
// Built lazily: ESM evaluates imports before the importing module's dotenv.config()
// call, so reading process.env at module scope here would always miss the .env file.
let cached: Token[] | null = null;

export const getTokens = (): Token[] => {
    if (cached) return cached;

    cached = [
        {
            symbol: "USDC",
            name: "USDC (Binance-Pegged)",
            address: process.env.TOKEN_USDC_ADDRESS || "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
            logo: "US",
            decimals: 18,
            balance: "1000.0"
        },
        {
            symbol: "ETH",
            // NOT 0xa2E3356610840701BDf5611a53974510Ae27E2e1 — that is wBETH, a different asset.
            name: "Ethereum (Binance-Pegged)",
            address: process.env.TOKEN_ETH_ADDRESS || "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
            logo: "E",
            decimals: 18,
            balance: "1000.0"
        },
        {
            symbol: "USDT",
            name: "Tether USD (Binance-Pegged)",
            address: process.env.TOKEN_USDT_ADDRESS || "0x55d398326f99059fF775485246999027B3197955",
            logo: "T",
            decimals: 18,
            balance: "1000.0"
        },
        {
            symbol: "SOL",
            name: "Wrapped SOL (Binance-Pegged)",
            address: process.env.TOKEN_SOL_ADDRESS || "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF",
            logo: "S",
            decimals: 18,
            balance: "1000.0"
        }
    ];

    return cached;
};

/** Resolve a token by on-chain address (case-insensitive). */
export const findToken = (address: string): Token | undefined =>
    getTokens().find(t => t.address.toLowerCase() === address.toLowerCase());
