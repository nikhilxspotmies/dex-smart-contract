// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {LimitOrderProtocol} from "../src/limit_order/LimitOrderProtocol.sol";

contract DeployLimitOrder is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        
        vm.startBroadcast(deployerPrivateKey);

        LimitOrderProtocol protocol = new LimitOrderProtocol();
        console.log("LimitOrderProtocol deployed at:", address(protocol));

        vm.stopBroadcast();
    }
}
