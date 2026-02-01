// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MarketFactory} from "../src/new_perp/src/core/MarketFactory.sol";
import {OracleModule} from "../src/new_perp/src/oracle/OracleModule.sol";

/**
 * @notice Deploy a new market for an existing MarketFactory
 * 
 * Use this script when you already have deployed:
 * - MarketFactory
 * - OracleModule
 * - Router
 * - PositionManager
 * 
 * And want to create a new market (e.g., BTC/USDC, ETH/USDC)
 * 
 * Environment Variables:
 * - PRIVATE_KEY: Deployer private key
 * - MARKET_FACTORY_ADDRESS: Address of existing MarketFactory
 * - ORACLE_MODULE_ADDRESS: Address of existing OracleModule
 * - USDC_ADDRESS: USDC token address
 * - PRICE_FEED_ADDRESS: Chainlink feed address (or MockOracle address)
 * - POSITION_MANAGER_ADDRESS: PositionManager address
 * - BASE_SYMBOL: Base symbol (e.g., "BTC", "ETH", "SOL")
 */
contract DeployNewPerpMarket is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        
        // Get addresses from environment
        address factoryAddress = vm.envOr("MARKET_FACTORY_ADDRESS", address(0));
        address oracleModuleAddress = vm.envOr("ORACLE_MODULE_ADDRESS", address(0));
        address usdcAddress = vm.envOr("USDC_ADDRESS", address(0));
        address priceFeedAddress = vm.envOr("PRICE_FEED_ADDRESS", address(0));
        address positionManagerAddress = vm.envOr("POSITION_MANAGER_ADDRESS", address(0));
        string memory baseSymbol = vm.envOr("BASE_SYMBOL", string("ETH"));
        
        require(factoryAddress != address(0), "MARKET_FACTORY_ADDRESS must be set");
        require(oracleModuleAddress != address(0), "ORACLE_MODULE_ADDRESS must be set");
        require(usdcAddress != address(0), "USDC_ADDRESS must be set");
        require(priceFeedAddress != address(0), "PRICE_FEED_ADDRESS must be set");
        require(positionManagerAddress != address(0), "POSITION_MANAGER_ADDRESS must be set");
        
        vm.startBroadcast(deployerPrivateKey);
        
        MarketFactory factory = MarketFactory(factoryAddress);
        OracleModule oracleModule = OracleModule(oracleModuleAddress);
        
        console.log("\n=== Creating New Market ===");
        console.log("MarketFactory:", factoryAddress);
        console.log("OracleModule:", oracleModuleAddress);
        console.log("USDC:", usdcAddress);
        console.log("PriceFeed:", priceFeedAddress);
        console.log("PositionManager:", positionManagerAddress);
        console.log("Base Symbol:", baseSymbol);
        
        (address market, address vault) = factory.createMarket(
            baseSymbol,
            usdcAddress,
            oracleModuleAddress,
            priceFeedAddress,
            positionManagerAddress
        );
        
        console.log("\n=== Market Created ===");
        console.log("Market:", market);
        console.log("Vault:", vault);
        
        console.log("\n=== Environment Variables ===");
        console.log("VITE_PERP_MARKET_ADDRESS=", market);
        console.log("VITE_PERP_VAULT_ADDRESS=", vault);
        
        vm.stopBroadcast();
    }
}



