// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../oracle/OracleModule.sol";

/// @notice Minimal Chainlink-like mock oracle with 8 decimals answers.
contract MockOracle is IAggregatorV3 {
    int256 private _answer; // 8 decimals
    uint256 private _updatedAt;
    uint80 private _roundId;

    constructor(int256 initialAnswer) {
        _setAnswer(initialAnswer);
    }

    function setAnswer(int256 newAnswer) external {
        _setAnswer(newAnswer);
    }

    function _setAnswer(int256 newAnswer) internal {
        _answer = newAnswer;
        _updatedAt = block.timestamp;
        _roundId++;
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }
}

