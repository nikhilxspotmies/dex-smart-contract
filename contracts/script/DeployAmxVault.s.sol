// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {AmxVault} from "../src/AmxVault.sol";

/// @notice Deploys the production AmxVault (native AMX). Run against the Amero X chain (3535)
/// with a deployer key that holds AMX to pay gas — e.g. one of the genesis-funded treasury
/// addresses.
///
/// Required env vars:
///   PRIVATE_KEY                 - deployer key, pays gas (defaults to the well-known Anvil dev key)
///   ADMIN_ADDRESS                - holds DEFAULT_ADMIN_ROLE
///   PAUSER_ADDRESS                - holds PAUSER_ROLE
///   EXECUTOR_ADDRESS              - holds EXECUTOR_ROLE (the relayer's key)
///   TREASURY_RECOVERY_ADDRESS     - emergencyRecoverAll() destination
/// Optional env vars:
///   MAX_RELEASE_PER_TX (wei, default 10,000 AMX)
///   MAX_RELEASE_PER_DAY (wei, default 100,000 AMX)
///   INITIAL_TOPUP (wei, default 0) - native AMX sent to the vault right after deployment
contract DeployAmxVault is Script {
    function setUp() public {}

    function run() public {
        uint256 deployerPrivateKey =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));

        address admin = vm.envAddress("ADMIN_ADDRESS");
        address pauser = vm.envAddress("PAUSER_ADDRESS");
        address executor = vm.envAddress("EXECUTOR_ADDRESS");
        address recoveryAddress = vm.envAddress("TREASURY_RECOVERY_ADDRESS");

        uint256 maxReleasePerTx = vm.envOr("MAX_RELEASE_PER_TX", uint256(10_000 ether));
        uint256 maxReleasePerDay = vm.envOr("MAX_RELEASE_PER_DAY", uint256(100_000 ether));
        uint256 initialTopUp = vm.envOr("INITIAL_TOPUP", uint256(0));

        vm.startBroadcast(deployerPrivateKey);

        AmxVault vault = new AmxVault(admin, pauser, executor, maxReleasePerTx, maxReleasePerDay, recoveryAddress);
        console.log("AmxVault deployed at:", address(vault));

        if (initialTopUp > 0) {
            (bool ok,) = address(vault).call{value: initialTopUp}("");
            require(ok, "initial top-up failed");
            console.log("AmxVault topped up with:", initialTopUp);
        }

        vm.stopBroadcast();
    }
}
