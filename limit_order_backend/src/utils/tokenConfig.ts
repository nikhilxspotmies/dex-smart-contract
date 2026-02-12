export interface Token {
    symbol: string;
    name: string;
    address: string;
    logo: string;
    decimals: number;
    balance?: string; // For UI mock purposes
}

// Updated with deployed contract addresses matching frontend
// Updated with deployed contract addresses matching frontend
export const TOKENS: Token[] = [
    {
        symbol: "USDC",
        name: "USD Coin",
        address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
        logo: "US",
        decimals: 18, // BSC-Pegged USDC has 18 decimals
        balance: "1000.0"
    },
    {
        symbol: "ETH",
        name: "Ethereum",
        address: "0xa2E3356610840701BDf5611a53974510Ae27E2e1",
        logo: "E",
        decimals: 18,
        balance: "1000.0"
    }
];
