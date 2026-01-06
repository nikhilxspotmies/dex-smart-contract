// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MockOracle} from "../src/MockOracle.sol";

contract SetOraclePrice is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        
        // Get addresses from environment variables
        address oracle = vm.envOr("ORACLE_ADDRESS", address(0));
        address indexToken = vm.envOr("INDEX_TOKEN_ADDRESS", address(0));
        
        // Get price from env or use default (2000 * 1e18 = $2000)
        uint256 price = vm.envOr("INITIAL_PRICE", uint256(2000 * 1e18));

        require(oracle != address(0), "ORACLE_ADDRESS not set in .env");
        require(indexToken != address(0), "INDEX_TOKEN_ADDRESS not set in .env");

        vm.startBroadcast(deployerPrivateKey);

        MockOracle oracleContract = MockOracle(oracle);
        oracleContract.setPrice(indexToken, price);

        console.log("\n=== Oracle Price Set ===");
        console.log("Oracle:", oracle);
        console.log("Index Token:", indexToken);
        console.log("Price set:", price);
        console.log("Price (formatted):", price / 1e18, "USD");

        // Verify price
        uint256 currentPrice = oracleContract.getPrice(indexToken);
        console.log("Current price from oracle:", currentPrice);

        vm.stopBroadcast();
    }
}

