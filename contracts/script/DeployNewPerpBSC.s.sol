// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {OracleModule} from "../src/new_perp/src/oracle/OracleModule.sol";
import {Router} from "../src/new_perp/src/router/Router.sol";
import {PositionManager} from "../src/new_perp/src/router/PositionManager.sol";
import {MarketFactory} from "../src/new_perp/src/core/MarketFactory.sol";
import {Market} from "../src/new_perp/src/core/Market.sol";
import {Vault} from "../src/new_perp/src/core/Vault.sol";
import {DexPriceAdapter} from "../src/new_perp/src/oracle/DexPriceAdapter.sol";

/**
 * @notice Script to deploy New Perp contracts on BSC
 */
contract DeployNewPerpBSC is Script {
    // DEX Addresses provided by user
    address constant DEX_FACTORY = 0xecb64015331902795323b56A04710e2d6cC3A21d;
    address constant DEX_ROUTER = 0x104835d5Df633E685DA07d853B78D3d9369649BF;

    function run() external {
        // Use vm.startBroadcast() without arguments to use the signer provided via --private-key or --ledger etc.
        vm.startBroadcast();
        
        address deployer = msg.sender;
        
        // BSC Mainnet USDC: 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d
        address usdcAddress = vm.envOr("USDC_ADDRESS", address(0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d));
        
        string memory baseSymbol = vm.envOr("BASE_SYMBOL", string("ETH"));
        
        // Base token address (needed for DexPriceAdapter path)
        address baseToken;
        if (keccak256(bytes(baseSymbol)) == keccak256(bytes("ETH"))) {
            baseToken = vm.envOr("BASE_TOKEN_ADDRESS", address(0xa2E3356610840701BDf5611a53974510Ae27E2e1));
        } else if (keccak256(bytes(baseSymbol)) == keccak256(bytes("BTC"))) {
            baseToken = vm.envOr("BASE_TOKEN_ADDRESS", address(0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c));
        } else {
            baseToken = vm.envOr("BASE_TOKEN_ADDRESS", address(0));
            require(baseToken != address(0), "BASE_TOKEN_ADDRESS must be set for non-ETH/BTC symbols");
        }
        
        console.log("Deploying New Perp on BSC...");
        console.log("Deployer:", deployer);
        console.log("Quote Token (USDC):", usdcAddress);
        console.log("Base Token (%s): %s", baseSymbol, baseToken);
        console.log("DEX Router:", DEX_ROUTER);

        // 1. Oracle Module
        OracleModule oracleModule = new OracleModule();
        console.log("OracleModule:", address(oracleModule));

        // 2. Deploy DexPriceAdapter
        address[] memory path = new address[](2);
        path[0] = baseToken;
        path[1] = usdcAddress;
        
        DexPriceAdapter dexAdapter = new DexPriceAdapter(DEX_ROUTER, path, 8);
        console.log("DexPriceAdapter:", address(dexAdapter));

        // 3. Router
        Router router = new Router(usdcAddress);
        console.log("Router:", address(router));

        // 4. Position Manager
        PositionManager positionManager = new PositionManager(address(router));
        console.log("PositionManager:", address(positionManager));

        // 5. Link Router and Position Manager
        router.setPositionManager(address(positionManager));
        console.log("Linked Router and Position Manager");

        // 6. Market Factory
        MarketFactory factory = new MarketFactory();
        console.log("MarketFactory:", address(factory));

        // 7. Create Market using DexAdapter as Oracle
        // The factory will now correctly set the positionManager and owner
        (address market, address vault) = factory.createMarket(
            baseSymbol,
            usdcAddress,
            address(oracleModule),
            address(dexAdapter),
            address(positionManager)
        );
        console.log("Market (%s): %s", baseSymbol, market);
        console.log("Vault:", vault);

        vm.stopBroadcast();

        console.log("\n--- BSC Deployment Complete ---");
        console.log("Save these addresses for your .env:");
        console.log("VITE_PERP_ROUTER_ADDRESS=", address(router));
        console.log("VITE_PERP_MARKET_ADDRESS=", market);
        console.log("VITE_PERP_VAULT_ADDRESS=", vault);
        console.log("VITE_PERP_POSITION_MANAGER_ADDRESS=", address(positionManager));
        console.log("VITE_USDC_ADDRESS=", usdcAddress);
    }
}
