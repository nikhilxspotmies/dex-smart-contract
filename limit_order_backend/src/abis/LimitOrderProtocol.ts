export const LimitOrderProtocolABI = [
    {
        "type": "function",
        "name": "fillOrder",
        "inputs": [
            {
                "name": "order",
                "type": "tuple",
                "internalType": "struct LimitOrderProtocol.Order",
                "components": [
                    { "name": "makerAsset", "type": "address", "internalType": "address" },
                    { "name": "takerAsset", "type": "address", "internalType": "address" },
                    { "name": "maker", "type": "address", "internalType": "address" },
                    { "name": "makingAmount", "type": "uint256", "internalType": "uint256" },
                    { "name": "takingAmount", "type": "uint256", "internalType": "uint256" },
                    { "name": "salt", "type": "uint256", "internalType": "uint256" },
                    { "name": "deadline", "type": "uint256", "internalType": "uint256" }
                ]
            },
            { "name": "signature", "type": "bytes", "internalType": "bytes" },
            { "name": "fillAmount", "type": "uint256", "internalType": "uint256" }
        ],
        "outputs": [],
        "stateMutability": "external"
    }
] as const;
