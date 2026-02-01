export const MARKET_ABI = [
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
            { "indexed": true, "internalType": "uint256", "name": "positionId", "type": "uint256" },
            { "indexed": false, "internalType": "bool", "name": "isLong", "type": "bool" },
            { "indexed": false, "internalType": "uint256", "name": "size", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "collateral", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "price", "type": "uint256" }
        ],
        "name": "PositionIncreased",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
            { "indexed": true, "internalType": "uint256", "name": "positionId", "type": "uint256" },
            { "indexed": false, "internalType": "bool", "name": "isLong", "type": "bool" },
            { "indexed": false, "internalType": "uint256", "name": "size", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "collateral", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "price", "type": "uint256" },
            { "indexed": false, "internalType": "int256", "name": "pnl", "type": "int256" }
        ],
        "name": "PositionDecreased",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
            { "indexed": true, "internalType": "uint256", "name": "positionId", "type": "uint256" },
            { "indexed": false, "internalType": "bool", "name": "isLong", "type": "bool" },
            { "indexed": false, "internalType": "uint256", "name": "size", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "collateral", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "price", "type": "uint256" },
            { "indexed": false, "internalType": "int256", "name": "pnl", "type": "int256" }
        ],
        "name": "Liquidated",
        "type": "event"
    }
];
