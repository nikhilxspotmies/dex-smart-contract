// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MockERC20} from "../src/MockERC20.sol";

contract DeployTokens is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        
        vm.startBroadcast(deployerPrivateKey);

        MockERC20 tokenA = new MockERC20("Token A", "TKNA");
        console.log("Token A deployed at:", address(tokenA));

        MockERC20 tokenB = new MockERC20("Token B", "TKNB");
        console.log("Token B deployed at:", address(tokenB));

        vm.stopBroadcast();
    }
}
