// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/new_perp/src/mocks/MockUSDC.sol";

/**
 * @notice Mint USDC to deployer address for testing
 * 
 * Environment Variables:
 * - PRIVATE_KEY: Deployer private key (defaults to Anvil account)
 * - USDC_ADDRESS: MockUSDC contract address (required)
 * - AMOUNT: Amount to mint in USDC (default: 1000000 = 1M USDC)
 */
contract MintUSDC is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerPrivateKey);
        
        address usdcAddress = vm.envOr("USDC_ADDRESS", address(0));
        require(usdcAddress != address(0), "USDC_ADDRESS must be set");
        
        uint256 amount = vm.envOr("AMOUNT", uint256(1000000 * 1e6)); // Default: 1M USDC (6 decimals)
        
        vm.startBroadcast(deployerPrivateKey);
        
        MockUSDC usdc = MockUSDC(usdcAddress);
        
        console.log("\n=== Minting USDC ===");
        console.log("USDC contract:", usdcAddress);
        console.log("Recipient:", deployer);
        console.log("Amount:", amount / 1e6, "USDC");
        
        uint256 balanceBefore = usdc.balanceOf(deployer);
        console.log("Balance before:", balanceBefore / 1e6, "USDC");
        
        usdc.mint(deployer, amount);
        
        uint256 balanceAfter = usdc.balanceOf(deployer);
        console.log("Balance after:", balanceAfter / 1e6, "USDC");
        console.log("Minted:", (balanceAfter - balanceBefore) / 1e6, "USDC");
        
        vm.stopBroadcast();
    }
}



