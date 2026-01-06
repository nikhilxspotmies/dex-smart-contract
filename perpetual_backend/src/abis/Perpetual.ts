export const PerpetualABI = [
    {
        "type": "constructor",
        "inputs": [
            { "name": "_usdc", "type": "address", "internalType": "address" },
            { "name": "_operator", "type": "address", "internalType": "address" },
            { "name": "_oracle", "type": "address", "internalType": "address" },
            { "name": "_indexToken", "type": "address", "internalType": "address" }
        ],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "deposit",
        "inputs": [{ "name": "amount", "type": "uint256", "internalType": "uint256" }],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "withdraw",
        "inputs": [{ "name": "amount", "type": "uint256", "internalType": "uint256" }],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "trade",
        "inputs": [
            { "name": "user", "type": "address", "internalType": "address" },
            { "name": "sizeDelta", "type": "int256", "internalType": "int256" },
            { "name": "price", "type": "uint256", "internalType": "uint256" }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "getAccountSummary",
        "inputs": [{ "name": "user", "type": "address", "internalType": "address" }],
        "outputs": [{
            "name": "summary",
            "type": "tuple",
            "internalType": "struct Perpetual.AccountSummary",
            "components": [
                { "name": "marginBalance", "type": "int256", "internalType": "int256" },
                { "name": "size", "type": "int256", "internalType": "int256" },
                { "name": "entryPrice", "type": "uint256", "internalType": "uint256" },
                { "name": "unrealizedPnl", "type": "int256", "internalType": "int256" },
                { "name": "marginRatio", "type": "int256", "internalType": "int256" },
                { "name": "leverage", "type": "uint256", "internalType": "uint256" }
            ]
        }],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "accounts",
        "inputs": [{ "name": "", "type": "address", "internalType": "address" }],
        "outputs": [{
            "name": "marginBalance",
            "type": "int256",
            "internalType": "int256"
        }, {
            "name": "position",
            "type": "tuple",
            "internalType": "struct Perpetual.Position",
            "components": [
                { "name": "size", "type": "int256", "internalType": "int256" },
                { "name": "entryPrice", "type": "uint256", "internalType": "uint256" },
                { "name": "lastFundingIndex", "type": "int256", "internalType": "int256" }
            ]
        }],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getMarkPrice",
        "inputs": [],
        "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getMarginRatio",
        "inputs": [{ "name": "user", "type": "address", "internalType": "address" }],
        "outputs": [{ "name": "", "type": "int256", "internalType": "int256" }],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getAccountLeverage",
        "inputs": [{ "name": "user", "type": "address", "internalType": "address" }],
        "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "updateIndex",
        "inputs": [{ "name": "rate", "type": "int256", "internalType": "int256" }],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "fundingIndex",
        "inputs": [],
        "outputs": [{ "name": "", "type": "int256", "internalType": "int256" }],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "fundingRate",
        "inputs": [],
        "outputs": [{ "name": "", "type": "int256", "internalType": "int256" }],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "initialMarginRatio",
        "inputs": [],
        "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "maintenanceMarginRatio",
        "inputs": [],
        "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
        "stateMutability": "view"
    },
    {
        "type": "event",
        "name": "Trade",
        "inputs": [
            { "name": "user", "type": "address", "indexed": true, "internalType": "address" },
            { "name": "sizeDelta", "type": "int256", "indexed": false, "internalType": "int256" },
            { "name": "price", "type": "uint256", "indexed": false, "internalType": "uint256" },
            { "name": "realizedPnl", "type": "int256", "indexed": false, "internalType": "int256" }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "Deposit",
        "inputs": [
            { "name": "user", "type": "address", "indexed": true, "internalType": "address" },
            { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "Withdraw",
        "inputs": [
            { "name": "user", "type": "address", "indexed": true, "internalType": "address" },
            { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "FundingPayment",
        "inputs": [
            { "name": "user", "type": "address", "indexed": true, "internalType": "address" },
            { "name": "fundingAmount", "type": "int256", "indexed": false, "internalType": "int256" }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "Liquidation",
        "inputs": [
            { "name": "user", "type": "address", "indexed": true, "internalType": "address" },
            { "name": "liquidator", "type": "address", "indexed": true, "internalType": "address" },
            { "name": "sizeLiquidated", "type": "int256", "indexed": false, "internalType": "int256" },
            { "name": "price", "type": "uint256", "indexed": false, "internalType": "uint256" }
        ],
        "anonymous": false
    }
] as const;

