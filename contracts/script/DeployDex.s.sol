// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {Factory, Router} from "../src/Dex.sol";

contract DeployDex is Script {
    function run() external {
        // Use the provided private key or default to Anvil's first account
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Factory
        Factory factory = new Factory();
        console.log("Factory deployed at:", address(factory));

        // 2. Deploy Router with Factory address
        Router router = new Router(address(factory));
        console.log("Router deployed at:", address(router));

        vm.stopBroadcast();
    }
}
