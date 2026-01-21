// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAggregatorV3 {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/// @notice Chainlink wrapper with staleness and non-zero checks.
contract OracleModule {
    error StalePrice();
    error InvalidPrice();

    uint256 public constant MAX_STALE = 1 hours;

    function getPrice(address feed) external view returns (uint256 priceE18) {
        (
            ,
            int256 answer,
            ,
            uint256 updatedAt,

        ) = IAggregatorV3(feed).latestRoundData();
        if (answer <= 0) revert InvalidPrice();
        if (block.timestamp - updatedAt > MAX_STALE) revert StalePrice();
        // Chainlink answers are 8 decimals; scale to 1e18
        priceE18 = uint256(answer) * 1e10;
    }
}

