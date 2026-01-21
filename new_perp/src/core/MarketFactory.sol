// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Market.sol";
import "./Vault.sol";

/// @notice Deploys isolated markets and vaults for each pair.
contract MarketFactory {
    address public owner;

    event MarketCreated(address indexed market, address indexed vault, string base, address quote);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    /// @param baseSymbol string identifier, e.g., "ETH"
    /// @param quote stable token address (USDC)
    /// @param oracle oracle module
    /// @param priceFeed chainlink feed for base/quote
    function createMarket(
        string memory baseSymbol,
        address quote,
        address oracle,
        address priceFeed,
        address positionManager
    ) external onlyOwner returns (address market, address vault) {
        vault = address(new Vault(quote));
        market = address(new Market(baseSymbol, quote, vault, oracle, priceFeed, msg.sender));
        Vault(vault).setMarket(market);
        Market(market).setPositionManager(positionManager);
        emit MarketCreated(market, vault, baseSymbol, quote);
    }
}

