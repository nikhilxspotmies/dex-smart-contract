// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MockOracle} from "../src/MockOracle.sol";

contract DeployMockOracle is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        
        vm.startBroadcast(deployerPrivateKey);

        MockOracle oracle = new MockOracle();
        console.log("MockOracle deployed at:", address(oracle));
        console.log("Owner:", oracle.owner());

        vm.stopBroadcast();
    }
}

