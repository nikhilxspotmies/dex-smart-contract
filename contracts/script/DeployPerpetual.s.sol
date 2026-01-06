// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {Perpetual} from "../src/perpetual/Perpetual.sol";
import {MockOracle} from "../src/MockOracle.sol";

contract DeployPerpetual is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        
        // Get addresses from environment variables
        address usdc = vm.envOr("USDC_ADDRESS", address(0));
        address oracle = vm.envOr("ORACLE_ADDRESS", address(0));
        address indexToken = vm.envOr("INDEX_TOKEN_ADDRESS", address(0));
        address operator = vm.envOr("OPERATOR_ADDRESS", address(0));

        require(usdc != address(0), "USDC_ADDRESS not set in .env");
        require(oracle != address(0), "ORACLE_ADDRESS not set in .env");
        require(indexToken != address(0), "INDEX_TOKEN_ADDRESS not set in .env");
        
        // If operator not set, use deployer address (for testing)
        if (operator == address(0)) {
            operator = vm.addr(deployerPrivateKey);
            console.log("WARNING: OPERATOR_ADDRESS not set, using deployer address as operator");
        }

        vm.startBroadcast(deployerPrivateKey);

        Perpetual perpetual = new Perpetual(
            usdc,
            operator,
            oracle,
            indexToken
        );

        console.log("\n=== Perpetual Deployment ===");
        console.log("Perpetual deployed at:", address(perpetual));
        console.log("USDC:", usdc);
        console.log("Operator:", operator);
        console.log("Oracle:", oracle);
        console.log("Index Token:", indexToken);

        vm.stopBroadcast();
    }
}

