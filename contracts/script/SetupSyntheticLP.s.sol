// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {Perpetual} from "../src/perpetual/Perpetual.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/**
 * @notice Setup Synthetic LP (Liquidity Provider) for the perpetual contract
 * 
 * This script:
 * 1. Generates or uses existing System LP wallet address
 * 2. Mints/funds USDC to System LP wallet
 * 3. Approves Perpetual contract to spend USDC from System LP
 * 4. Deposits USDC from System LP into Perpetual contract
 * 
 * Usage:
 *   forge script script/SetupSyntheticLP.s.sol:SetupSyntheticLP --rpc-url http://localhost:8545 --broadcast
 * 
 * Environment Variables:
 *   SYSTEM_LP_PRIVATE_KEY - Private key for System LP wallet (will generate one if not set)
 *   PERPETUAL_CONTRACT_ADDRESS - Address of deployed Perpetual contract
 *   USDC_ADDRESS - Address of USDC (mock token)
 *   SYSTEM_LP_DEPOSIT_AMOUNT - Amount of USDC to deposit in human-readable format (default: 100000)
 */
contract SetupSyntheticLP is Script {
    function run() external {
        // Get System LP private key from env or generate a new one
        uint256 systemLpPrivateKey = vm.envOr("SYSTEM_LP_PRIVATE_KEY", uint256(0));
        
        if (systemLpPrivateKey == 0) {
            // Generate a deterministic private key for System LP
            // WARNING: For production, use a secure random generator!
            systemLpPrivateKey = uint256(keccak256(abi.encodePacked("SYSTEM_LP_WALLET", block.timestamp, block.prevrandao)));
            console.log("\n=== Generated New System LP Wallet ===");
        } else {
            console.log("\n=== Using Existing System LP Wallet ===");
        }
        
        address systemLpAddress = vm.addr(systemLpPrivateKey);
        console.log("System LP Address:", systemLpAddress);
        console.log("\nIMPORTANT: Save the private key securely!");
        console.log("   The private key will be shown in the transaction logs.");
        console.log("   Add to your backend .env as:");
        console.log("   SYSTEM_LP_ADDRESS=", vm.toString(systemLpAddress));
        
        // Get contract addresses from env
        address perpetualAddress = vm.envOr("PERPETUAL_CONTRACT_ADDRESS", address(0));
        require(perpetualAddress != address(0), "PERPETUAL_CONTRACT_ADDRESS must be set in .env");
        
        address usdcAddress = vm.envOr("USDC_ADDRESS", address(0));
        require(usdcAddress != address(0), "USDC_ADDRESS must be set in .env");
        
        // Amount to deposit (default: 100,000 USDC in human-readable format)
        uint256 depositAmountHuman = vm.envOr("SYSTEM_LP_DEPOSIT_AMOUNT", uint256(100_000));
        
        console.log("\n=== Configuration ===");
        console.log("Perpetual Contract:", perpetualAddress);
        console.log("USDC Token:", usdcAddress);
        console.log("Deposit Amount:", depositAmountHuman, "USDC (human-readable)");
        
        // Get deployer private key for funding
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Get contract instances
        IERC20Metadata usdc = IERC20Metadata(usdcAddress);
        
        // Step 1: Check token decimals and fund System LP wallet
        console.log("\n=== Step 1: Funding System LP Wallet ===");
        uint8 tokenDecimals = 18; // Default assumption
        try usdc.decimals() returns (uint8 decimals) {
            tokenDecimals = decimals;
            console.log("Token decimals:", tokenDecimals);
        } catch {
            console.log("Could not read token decimals, assuming 18 decimals");
        }
        
        // Calculate deposit amount in token's native decimals
        uint256 depositAmountInTokenDecimals = depositAmountHuman * 10 ** tokenDecimals;
        
        uint256 currentBalance = usdc.balanceOf(systemLpAddress);
        console.log("Current System LP USDC balance:", currentBalance / (10 ** tokenDecimals), "USDC");
        
        if (currentBalance < depositAmountInTokenDecimals) {
            uint256 deployerBalance = usdc.balanceOf(deployer);
            uint256 needed = depositAmountInTokenDecimals - currentBalance;
            
            if (deployerBalance >= needed) {
                console.log("Transferring", needed / (10 ** tokenDecimals), "USDC from deployer to System LP...");
                require(usdc.transfer(systemLpAddress, needed), "Transfer failed");
                console.log("Transferred", needed / (10 ** tokenDecimals), "USDC to System LP");
            } else {
                console.log("Warning: Deployer doesn't have enough USDC.");
                console.log("   Deployer balance:", deployerBalance / (10 ** tokenDecimals), "USDC");
                console.log("   Needed:", needed / (10 ** tokenDecimals), "USDC");
                console.log("   Please manually fund the System LP wallet or mint more tokens.");
                vm.stopBroadcast();
                return;
            }
        } else {
            console.log("System LP already has enough USDC");
        }
        
        vm.stopBroadcast();
        
        // Step 2: Approve and deposit (as System LP)
        vm.startBroadcast(systemLpPrivateKey);
        
        Perpetual perpetual = Perpetual(payable(perpetualAddress));
        
        // Step 2: Approve Perpetual contract to spend USDC
        console.log("\n=== Step 2: Approving Perpetual Contract ===");
        uint256 currentAllowance = usdc.allowance(systemLpAddress, perpetualAddress);
        uint256 approvalAmount = type(uint256).max; // Approve max for convenience
        
        if (currentAllowance < depositAmountInTokenDecimals) {
            require(usdc.approve(perpetualAddress, approvalAmount), "Approve failed");
            console.log("Approved Perpetual contract to spend USDC");
        } else {
            console.log("Already approved");
        }
        
        // Step 3: Deposit USDC into Perpetual contract
        console.log("\n=== Step 3: Depositing USDC into Perpetual Contract ===");
        uint256 contractBalanceBefore = usdc.balanceOf(perpetualAddress);
        
        // Perpetual.deposit() expects amount in 6 decimals (USDC standard)
        // The contract internally multiplies by 1e12 to convert to 18 decimals
        // So if token is 18 decimals, we need to divide by 1e12
        // If token is 6 decimals, we pass as-is
        
        uint256 depositAmountForContract;
        if (tokenDecimals == 18) {
            // Token is 18 decimals, contract expects 6, so divide by 1e12
            depositAmountForContract = depositAmountInTokenDecimals / 1e12;
            console.log("Token uses 18 decimals, converting for deposit...");
        } else if (tokenDecimals == 6) {
            // Token is 6 decimals, contract expects 6, so pass as-is
            depositAmountForContract = depositAmountInTokenDecimals;
            console.log("Token uses 6 decimals, using as-is...");
        } else {
            // Unknown decimals, try to convert assuming 18
            depositAmountForContract = depositAmountInTokenDecimals / 1e12;
            console.log("Token uses", tokenDecimals, "decimals, attempting conversion...");
        }
        
        console.log("Depositing", depositAmountForContract, "units (in contract's expected format)");
        perpetual.deposit(depositAmountForContract);
        
        uint256 contractBalanceAfter = usdc.balanceOf(perpetualAddress);
        console.log("Contract USDC balance before:", contractBalanceBefore / (10 ** tokenDecimals));
        console.log("Contract USDC balance after:", contractBalanceAfter / (10 ** tokenDecimals));
        console.log("Deposited", depositAmountHuman, "USDC into Perpetual contract");
        
        vm.stopBroadcast();
        
        console.log("\n=== Setup Complete ===");
        console.log("System LP Address:", vm.toString(systemLpAddress));
        console.log("System LP has deposited:", depositAmountHuman, "USDC");
        console.log("\n=== Next Steps ===");
        console.log("1. Add to your backend .env:");
        console.log("   USE_SYNTHETIC_LP=true");
        console.log("   SYSTEM_LP_ADDRESS=", vm.toString(systemLpAddress));
        console.log("\n2. Restart your backend server");
        console.log("\n3. The System LP will now act as counterparty for unmatched orders");
        console.log("\nNote: Save the System LP private key securely!");
        console.log("   You can find it in the transaction logs or set SYSTEM_LP_PRIVATE_KEY in .env");
    }
}

