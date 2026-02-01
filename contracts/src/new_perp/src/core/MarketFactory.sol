// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Market.sol";
import "./Vault.sol";

/// @notice Deploys isolated markets and vaults for each pair.
contract MarketFactory {
    address[] public allMarkets;
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
        
        // 1. Deploy Market with Factory as initial owner so it can configure it
        market = address(new Market(baseSymbol, quote, vault, oracle, priceFeed, address(this)));
        
        Vault(vault).setMarket(market);
        
        // 2. Set position manager for the market (Factory is owner, so this works)
        if (positionManager != address(0)) {
            Market(market).setPositionManager(positionManager);
        }
        
        // 3. Transfer ownership to the caller (msg.sender)
        Market(market).transferOwnership(msg.sender);
        
        allMarkets.push(market);
        emit MarketCreated(market, vault, baseSymbol, quote);
    }

    function getMarkets() external view returns (address[] memory) {
        return allMarkets;
    }
}

