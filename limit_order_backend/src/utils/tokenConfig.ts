export interface Token {
    symbol: string;
    name: string;
    address: string;
    logo: string;
    decimals: number;
    balance?: string; // For UI mock purposes
}

// Updated with deployed contract addresses matching frontend
export const TOKENS: Token[] = [
    {
        symbol: "USDC",
        name: "USD Coin",
        address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        logo: "US",
        decimals: 6,
        balance: "1000.0"
    },
    {
        symbol: "BTC",
        name: "Bitcoin",
        address: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
        logo: "B",
        decimals: 18,
        balance: "1000.0"
    },
    {
        symbol: "ETH",
        name: "Ethereum",
        address: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
        logo: "E",
        decimals: 18,
        balance: "1000.0"
    }
];
