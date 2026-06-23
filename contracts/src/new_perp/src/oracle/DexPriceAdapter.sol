// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRouter {
    function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts);
}

interface IMinimalERC20 {
    function decimals() external view returns (uint8);
}

/// @notice Adapter to use DEX Router price as Oracle Source.
/// @dev Implements Chainlink AggregatorV3Interface (subset needed for OracleModule).
///
/// ⚠️ SECURITY (C5): DO NOT use this as the price oracle for perpetual markets. It reads a
/// live AMM spot price via `getAmountsOut`, which is manipulable within a single transaction
/// (flash-loan: skew reserves -> open/close/liquidate at the distorted price -> unwind). It also
/// stamps `updatedAt = block.timestamp`, defeating OracleModule's staleness check. Perp markets
/// must be wired to a real Chainlink feed (see DeployNewPerpBSC). Kept only for non-security-
/// critical/display use and tests.
contract DexPriceAdapter {
    address public dexRouter;
    address[] public path; // [BaseToken, QuoteToken] (e.g., BTC -> USDC)
    uint8 public decimals;

    // Scaling config
    uint256 public baseUnit;
    bool public isMultiplication;
    uint256 public scaleFactor;

    constructor(address _router, address[] memory _path, uint8 _decimals) {
        require(_path.length >= 2, "Invalid path");
        dexRouter = _router;
        path = _path;
        decimals = _decimals;

        // 1. Get Base Token Decimals dynamically
        uint8 baseDecimals = IMinimalERC20(_path[0]).decimals();
        baseUnit = 10**baseDecimals;

        // 2. Get Quote Token Decimals dynamically
        uint8 quoteDecimals = IMinimalERC20(_path[_path.length - 1]).decimals();

        // 3. Calculate scaling logic to target `_decimals` (usually 8)
        // If Quote is 6 decimals (USDC Eth) and Target is 8: Need to MULTIPLY by 10^2
        // If Quote is 18 decimals (USDC Bsc, USDT Bsc) and Target is 8: Need to DIVIDE by 10^10
        if (quoteDecimals < _decimals) {
            isMultiplication = true;
            scaleFactor = 10**(_decimals - quoteDecimals);
        } else {
            isMultiplication = false;
            scaleFactor = 10**(quoteDecimals - _decimals);
        }
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
        // Use baseUnit (1.0 of Base Token)
        try IRouter(dexRouter).getAmountsOut(baseUnit, path) returns (uint[] memory amounts) {
             uint256 rawPrice = amounts[amounts.length - 1];
             uint256 price;

             if (isMultiplication) {
                 price = rawPrice * scaleFactor;
             } else {
                 price = rawPrice / scaleFactor;
             }
             
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
