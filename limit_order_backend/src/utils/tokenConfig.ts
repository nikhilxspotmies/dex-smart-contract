export interface Token {
    symbol: string;
    name: string;
    address: string;
    logo: string;
    decimals: number;
    balance?: string; // For UI mock purposes
}

// These addresses should be updated with your deployed contract addresses
export const TOKENS: Token[] = [
    {
        symbol: "TKA",
        name: "Mock Token A",
        address: "0x0165878A594ca255338adfa4d48449f69242Eb8F", // Replace with actual address
        logo: "A",
        decimals: 18,
        balance: "1000.0"
    },
    {
        symbol: "TKB",
        name: "Mock Token B",
        address: "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853", // Replace with actual address
        logo: "B",
        decimals: 18,
        balance: "1000.0"
    },
    // Keeping existing UI mocks for reference, but give them null/zero addresses if they aren't real contracts yet
    {
        symbol: "ETH",
        name: "Ethereum",
        address: "0x0000000000000000000000000000000000000000",
        logo: "E",
        decimals: 18,
        balance: "10.5"
    },
    {
        symbol: "USDT",
        name: "Tether USD",
        address: "0x0000000000000000000000000000000000000000",
        logo: "T",
        decimals: 6,
        balance: "25,000"
    },
];
