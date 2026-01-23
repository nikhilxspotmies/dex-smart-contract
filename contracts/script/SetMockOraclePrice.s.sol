// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MockOracle} from "../src/new_perp/src/mocks/MockOracle.sol";

/**
 * @notice Set price in MockOracle for testing
 * 
 * Environment Variables:
 * - PRIVATE_KEY: Deployer private key
 * - MOCK_ORACLE_ADDRESS: Address of MockOracle contract
 * - PRICE: New price in 8 decimals (e.g., 2000e8 for $2000)
 */
contract SetMockOraclePrice is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        
        address mockOracleAddress = vm.envOr("MOCK_ORACLE_ADDRESS", address(0));
        int256 newPrice = int256(vm.envOr("PRICE", uint256(2000 * 1e8)));
        
        require(mockOracleAddress != address(0), "MOCK_ORACLE_ADDRESS must be set");
        
        vm.startBroadcast(deployerPrivateKey);
        
        MockOracle mockOracle = MockOracle(mockOracleAddress);
        
        console.log("\n=== Setting MockOracle Price ===");
        console.log("MockOracle:", mockOracleAddress);
        console.log("New Price (8 decimals):", uint256(newPrice));
        console.log("New Price (USD):", uint256(newPrice) / 1e8);
        
        mockOracle.setAnswer(newPrice);
        
        // Verify
        (,,, uint256 updatedAt,) = mockOracle.latestRoundData();
        console.log("\n=== Price Updated ===");
        console.log("Updated at timestamp:", updatedAt);
        
        vm.stopBroadcast();
    }
}



