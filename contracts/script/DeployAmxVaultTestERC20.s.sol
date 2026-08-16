// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {AmxVaultTestERC20} from "../src/AmxVaultTestERC20.sol";
import {MockERC20} from "../src/MockERC20.sol";

/// @notice Deploys the testnet-only AmxVaultTestERC20, backed by a freely-mintable MockERC20
/// "test AMX" token. Run against any EVM testnet (BSC testnet, Sepolia, local Anvil) — does not
/// require a live Amero X testnet chain. Never point this at anything meant to hold real value.
///
/// Required env vars:
///   PRIVATE_KEY                 - deployer key, pays gas (defaults to the well-known Anvil dev key)
///   ADMIN_ADDRESS                - holds DEFAULT_ADMIN_ROLE
///   PAUSER_ADDRESS                - holds PAUSER_ROLE
///   EXECUTOR_ADDRESS              - holds EXECUTOR_ROLE (the relayer's key)
///   TREASURY_RECOVERY_ADDRESS     - emergencyRecoverAll() destination
/// Optional env vars:
///   TEST_TOKEN_ADDRESS (default: none -> deploys a fresh MockERC20 "Test AMX" / "tAMX")
///   MAX_RELEASE_PER_TX (18-decimal units, default 10,000 tAMX)
///   MAX_RELEASE_PER_DAY (18-decimal units, default 100,000 tAMX)
///   INITIAL_TOPUP (18-decimal units, default 0) - test tokens minted + topped up into the vault
contract DeployAmxVaultTestERC20 is Script {
    function setUp() public {}

    function run() public {
        uint256 deployerPrivateKey =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));

        address admin = vm.envAddress("ADMIN_ADDRESS");
        address pauser = vm.envAddress("PAUSER_ADDRESS");
        address executor = vm.envAddress("EXECUTOR_ADDRESS");
        address recoveryAddress = vm.envAddress("TREASURY_RECOVERY_ADDRESS");
        address existingTestToken = vm.envOr("TEST_TOKEN_ADDRESS", address(0));

        uint256 maxReleasePerTx = vm.envOr("MAX_RELEASE_PER_TX", uint256(10_000 ether));
        uint256 maxReleasePerDay = vm.envOr("MAX_RELEASE_PER_DAY", uint256(100_000 ether));
        uint256 initialTopUp = vm.envOr("INITIAL_TOPUP", uint256(0));

        vm.startBroadcast(deployerPrivateKey);

        MockERC20 testToken;
        if (existingTestToken == address(0)) {
            testToken = new MockERC20("Test AMX", "tAMX");
            console.log("MockERC20 (Test AMX) deployed at:", address(testToken));
        } else {
            testToken = MockERC20(existingTestToken);
            console.log("Reusing existing test token at:", existingTestToken);
        }

        AmxVaultTestERC20 vault = new AmxVaultTestERC20(
            admin, pauser, executor, maxReleasePerTx, maxReleasePerDay, recoveryAddress, address(testToken)
        );
        console.log("AmxVaultTestERC20 deployed at:", address(vault));

        if (initialTopUp > 0) {
            testToken.mint(msg.sender, initialTopUp);
            testToken.approve(address(vault), initialTopUp);
            vault.topUp(initialTopUp);
            console.log("AmxVaultTestERC20 topped up with:", initialTopUp);
        }

        vm.stopBroadcast();
    }
}
