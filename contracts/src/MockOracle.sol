// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockOracle
 * @notice Simple oracle for controlling token prices in a test environment.
 * @dev Prices are scaled to 18 decimals.
 */
contract MockOracle is Ownable {
    
    // Token Address => Price (1e18)
    mapping(address => uint256) public prices;

    event PriceSet(address indexed token, uint256 price);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Set the price for a specific token.
     * @param token The token address.
     * @param price The new price (18 decimals).
     */
    function setPrice(address token, uint256 price) external onlyOwner {
        prices[token] = price;
        emit PriceSet(token, price);
    }

    /**
     * @notice Get the price of a token.
     * @param token The token address.
     * @return The price in 18 decimals.
     */
    function getPrice(address token) external view returns (uint256) {
        return prices[token];
    }
}
