// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MockOracle} from "../src/MockOracle.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {Perpetual} from "../src/perpetual/Perpetual.sol";

/**
 * @notice Deploy all perpetual contracts in sequence
 * This script:
 * 1. Deploys MockOracle
 * 2. Deploys MockIndexToken (e.g., ETH) - optional, you can use existing token
 * 3. Sets initial price in oracle for index token
 * 4. Deploys Perpetual contract
 * 
 * Note: Uses existing USDC_ADDRESS from env (your mock token)
 */
contract DeployPerpetualAll is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        
        // Get USDC address from env (your existing mock token)
        address usdc = vm.envOr("USDC_ADDRESS", address(0));
        require(usdc != address(0), "USDC_ADDRESS must be set in .env (use your existing mock token address)");

        // Operator address (backend operator wallet)
        // Default: use deployer as operator for testing
        address operator = vm.envOr("OPERATOR_ADDRESS", vm.addr(deployerPrivateKey));

        // Initial price for index token (default: $2000)
        uint256 initialPrice = vm.envOr("INITIAL_PRICE", uint256(2000 * 1e18));

        // Check if we should deploy index token or use existing
        bool deployIndexToken = vm.envOr("DEPLOY_INDEX_TOKEN", false);
        address indexToken;

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy MockOracle
        console.log("\n=== Step 1: Deploying MockOracle ===");
        MockOracle oracle = new MockOracle();
        console.log("MockOracle deployed at:", address(oracle));
        console.log("Owner:", oracle.owner());

        // 2. Deploy or use existing index token
        if (deployIndexToken) {
            console.log("\n=== Step 2: Deploying MockIndexToken ===");
            MockERC20 indexTokenContract = new MockERC20("Ethereum", "ETH");
            indexToken = address(indexTokenContract);
            console.log("MockIndexToken deployed at:", indexToken);
        } else {
            indexToken = vm.envOr("INDEX_TOKEN_ADDRESS", address(0));
            require(indexToken != address(0), "INDEX_TOKEN_ADDRESS not set. Either set it in .env or set DEPLOY_INDEX_TOKEN=true");
            console.log("\n=== Step 2: Using existing IndexToken ===");
            console.log("IndexToken address:", indexToken);
        }

        // 3. Set initial price in oracle for index token
        console.log("\n=== Step 3: Setting initial price in oracle ===");
        oracle.setPrice(indexToken, initialPrice);
        console.log("Price set for token:", indexToken);
        console.log("Price:", initialPrice / 1e18, "USD");
        
        // Verify price
        uint256 currentPrice = oracle.getPrice(indexToken);
        console.log("Verified price from oracle:", currentPrice);

        // 4. Deploy Perpetual
        console.log("\n=== Step 4: Deploying Perpetual ===");
        Perpetual perpetual = new Perpetual(
            usdc,
            operator,
            address(oracle),
            indexToken
        );
        console.log("Perpetual deployed at:", address(perpetual));

        // Summary
        console.log("\n=== Deployment Summary ===");
        console.log("MockOracle:", address(oracle));
        console.log("USDC (mock token):", usdc);
        console.log("IndexToken:", indexToken);
        console.log("Perpetual:", address(perpetual));
        console.log("Operator:", operator);
        console.log("Initial Price:", initialPrice / 1e18, "USD");

        console.log("\n=== Next Steps ===");
        console.log("1. Update your backend .env with:");
        console.log("   PERPETUAL_CONTRACT_ADDRESS=", address(perpetual));
        console.log("   MOCK_ORACLE_ADDRESS=", address(oracle));
        console.log("   INDEX_TOKEN_ADDRESS=", indexToken);
        console.log("   USDC_ADDRESS=", usdc);
        console.log("\n2. Update your frontend .env with:");
        console.log("   VITE_PERPETUAL_CONTRACT_ADDRESS=", address(perpetual));
        console.log("   VITE_USDC_ADDRESS=", usdc);
        console.log("   VITE_INDEX_TOKEN_ADDRESS=", indexToken);

        vm.stopBroadcast();
    }
}

