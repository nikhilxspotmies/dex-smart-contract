// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {CopyTradingFactory} from "../src/copy_trading/CopyTradingFactory.sol";
import {CopyTradingVault} from "../src/copy_trading/CopyTradingVault.sol";

contract DeployCopyTradingManual is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying CopyTradingFactory with Deployer:", deployer);
        
        vm.startBroadcast(deployerPrivateKey);

        // PancakeSwap V2 Router (BSC Mainnet)
        address pancakeRouter = 0x10ED43C718714eb63d5aA57B78B54704E256024E;
        // Existing Vault Implementation (Re-using is fine to save gas, or deploy new one)
        // Let's deploy a new one to be clean and safe independent
        CopyTradingVault copyVaultImpl = new CopyTradingVault();
        console.log("New Vault Implementation:", address(copyVaultImpl));

        address executor = deployer; // The Engine Wallet
        address owner = deployer;    // The Admin/Owner (User)

        CopyTradingFactory copyFactory = new CopyTradingFactory(
            address(copyVaultImpl),
            executor,
            pancakeRouter,
            owner
        );
        console.log("New CopyTradingFactory:", address(copyFactory));

        vm.stopBroadcast();
    }
}
