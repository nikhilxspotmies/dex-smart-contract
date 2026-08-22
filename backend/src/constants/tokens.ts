/**
 * BSC-mainnet token whitelist used to value a wallet's on-chain portfolio (e.g. for
 * whale ROI/PnL stats). Mirrors the address list in
 * Amerox-dex/src/utils/tokenConfig.ts — kept in sync by hand, same duplication
 * pattern already accepted for ABIs between limit_order_backend and the frontend.
 */
export interface WhitelistToken {
    symbol: string;
    address: string;
    decimals: number;
}

export const TOKEN_WHITELIST: WhitelistToken[] = [
    { symbol: "BTCB", address: process.env.BTCB_ADDRESS || "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", decimals: 18 },
    { symbol: "ETH", address: process.env.ETH_ADDRESS || "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", decimals: 18 },
    { symbol: "USDT", address: process.env.USDT_ADDRESS || "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
    { symbol: "WBNB", address: process.env.WBNB_ADDRESS || "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", decimals: 18 },
    { symbol: "USDC", address: process.env.USDC_ADDRESS || "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
    { symbol: "XRP", address: process.env.XRP_ADDRESS || "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE", decimals: 18 },
    { symbol: "SOL", address: process.env.SOL_ADDRESS || "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF", decimals: 18 },
    { symbol: "TRX", address: process.env.TRX_ADDRESS || "0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e3", decimals: 6 },
    { symbol: "DOGE", address: process.env.DOGE_ADDRESS || "0xbA2aE424d960c26247Dd6c32edC70B295c744C43", decimals: 8 },
    { symbol: "CAKE", address: process.env.CAKE_ADDRESS || "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", decimals: 18 },
];

/** Quote token for USD pricing — treated as $1, matching the rest of the app. */
export const QUOTE_TOKEN = TOKEN_WHITELIST.find(t => t.symbol === "USDT")!;
