// contracts/script/SeedVault.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {Vault} from "../src/new_perp/src/core/Vault.sol";
import {MockUSDC} from "../src/new_perp/src/mocks/MockUSDC.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @notice Seed Vault with initial LP liquidity
 * 
 * Usage:
 * forge script script/SeedVault.s.sol:SeedVault --rpc-url $RPC_URL --broadcast
 * 
 * Environment Variables:
 * - VAULT_ADDRESS: Vault contract address
 * - USDC_ADDRESS: USDC token address
 * - SEED_AMOUNT: Amount to seed in USDC (default: 100000 = 100k USDC)
 * - PRIVATE_KEY: Deployer private key (optional, uses Anvil default if not set)
 */
contract SeedVault is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerPrivateKey);
        
        address vaultAddress = vm.envAddress("VAULT_ADDRESS");
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        uint256 seedAmount = vm.envOr("SEED_AMOUNT", uint256(100000 * 1e6)); // Default: 100k USDC (6 decimals)
        
        vm.startBroadcast(deployerPrivateKey);
        
        Vault vault = Vault(vaultAddress);
        IERC20 usdc = IERC20(usdcAddress);
        
        console.log("\n=== Seeding Vault with Initial LP Liquidity ===");
        console.log("Vault Address:", vaultAddress);
        console.log("USDC Address:", usdcAddress);
        console.log("Deployer:", deployer);
        console.log("Seed Amount:", seedAmount / 1e6, "USDC");
        
        // Check deployer's USDC balance
        uint256 deployerBalance = usdc.balanceOf(deployer);
        console.log("Deployer USDC Balance:", deployerBalance / 1e6, "USDC");
        
        require(deployerBalance >= seedAmount, "Insufficient USDC balance");
        
        // Approve Vault to spend USDC
        console.log("\n=== Approving USDC ===");
        usdc.approve(vaultAddress, seedAmount);
        console.log("Approved", seedAmount / 1e6, "USDC");
        
        // Deposit to Vault (this mints pLP shares)
        console.log("\n=== Depositing to Vault ===");
        vault.deposit(seedAmount, deployer);
        console.log("Deposited", seedAmount / 1e6, "USDC to Vault");
        
        // Check Vault balance
        uint256 vaultBalance = vault.totalAssets();
        uint256 lpShares = vault.balanceOf(deployer);
        console.log("\n=== Vault Status ===");
        console.log("Vault Total Assets:", vaultBalance / 1e6, "USDC");
        console.log("LP Shares Minted:", lpShares / 1e12, "pLP (18 decimals)");
        console.log("LP Share Value:", (vaultBalance * 1e18) / vault.totalSupply(), "USDC per pLP");
        
        console.log("\n=== Seeding Complete ===");
        console.log("Vault is now ready for traders!");
        console.log("Traders can now open positions and profits will be paid from this liquidity.");
        
        vm.stopBroadcast();
    }
}