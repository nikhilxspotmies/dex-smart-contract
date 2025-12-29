// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {P2PTokenEscrows} from "../src/P2PTokenEscrow.sol";

contract DeployP2PTokenEscrow is Script {
    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        P2PTokenEscrows escrow = new P2PTokenEscrows();
        console.log("P2PTokenEscrows deployed at:", address(escrow));

        vm.stopBroadcast();
    }
}
