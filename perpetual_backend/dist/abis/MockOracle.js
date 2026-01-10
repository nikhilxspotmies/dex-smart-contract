export const MockOracleABI = [
    {
        "type": "function",
        "name": "getPrice",
        "inputs": [{ "name": "token", "type": "address", "internalType": "address" }],
        "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "setPrice",
        "inputs": [
            { "name": "token", "type": "address", "internalType": "address" },
            { "name": "price", "type": "uint256", "internalType": "uint256" }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "prices",
        "inputs": [{ "name": "", "type": "address", "internalType": "address" }],
        "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
        "stateMutability": "view"
    },
    {
        "type": "event",
        "name": "PriceSet",
        "inputs": [
            { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
            { "name": "price", "type": "uint256", "indexed": false, "internalType": "uint256" }
        ],
        "anonymous": false
    }
];
