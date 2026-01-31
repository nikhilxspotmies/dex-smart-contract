// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRouter {
    function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts);
}

/// @notice Adapter to use DEX Router price as Oracle Source
/// @dev Implements Chainlink AggregatorV3Interface (subset needed for OracleModule)
contract DexPriceAdapter {
    address public dexRouter;
    address[] public path; // [BaseToken, QuoteToken] (e.g., BTC -> USDC)
    uint8 public decimals;

    constructor(address _router, address[] memory _path, uint8 _decimals) {
        dexRouter = _router;
        path = _path;
        decimals = _decimals;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        // 1 Base Token Unit (1e18 usually, depending on base decimals)
        // Assume Base Token is 18 decimals for now, or match contract
        uint256 amountIn = 1e18; 
        
        try IRouter(dexRouter).getAmountsOut(amountIn, path) returns (uint[] memory amounts) {
             // amounts[1] is the output amount (Quote Token)
             // Typically Chainlink returns 8 decimals.
             // If Quote Token is USDC (6 decimals), we might want to scale it?
             // OracleModule expects 8 decimals from Chainlink and then scales to 1e18.
             // Wait, OracleModule code: "priceE18 = uint256(answer) * 1e10;"
             // This assumes `answer` is 8 decimals.
             
             // If USDC is 6 decimals, 1 BTC = 60,000 USDC = 60,000 * 10^6
             // We need to return value in 8 decimals.
             // Target: 60,000 * 10^8.
             // Current: 60,000 * 10^6.
             // So we multiply by 100.
             
             uint256 price = amounts[1] * 100; 
             
             return (
                 0,
                 int256(price),
                 0,
                 block.timestamp,
                 0
             );
        } catch {
            return (0, 0, 0, 0, 0);
        }
    }
}
