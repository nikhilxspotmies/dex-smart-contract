// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {Factory, Router} from "../src/Dex.sol";
import {MockWETH} from "../src/MockWETH.sol";

contract DeployDex is Script {
    function run() external {
        // Use the provided private key or default to Anvil's first account
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));

        // Wrapped native coin backing the Router's native-BNB entrypoints. This MUST be
        // the canonical wrapper for the target chain — a wrong address silently strands
        // every swapExactETHForTokens caller's funds in a pool nobody else trades:
        //   BSC mainnet (56): 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
        //   BSC testnet (97): 0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd
        // Left unset (local/Anvil), a throwaway MockWETH is deployed instead.
        //
        // Named WBNB here because that is what it actually is on BSC. The Router's
        // on-chain getter stays WETH() — see the note on that field in Dex.sol.
        // WETH_ADDRESS is still accepted so older invocations keep working.
        address weth = vm.envOr("WBNB_ADDRESS", address(0));
        if (weth == address(0)) {
            weth = vm.envOr("WETH_ADDRESS", address(0));
        }

        // Existing Factory to reuse. Pairs and all their liquidity live in the FACTORY,
        // not the Router — so when redeploying the Router alone (as for the native-BNB
        // entrypoints), set this to the Factory already in use or every existing pool
        // becomes unreachable and its liquidity is stranded.
        //   BSC mainnet (56): 0xa94Fb3865399fF5391215F224ABF6096E7d4daB1
        // Left unset, a fresh Factory is deployed — correct only for a first deploy.
        address existingFactory = vm.envOr("FACTORY_ADDRESS", address(0));

        vm.startBroadcast(deployerPrivateKey);

        if (weth == address(0)) {
            weth = address(new MockWETH());
            console.log("WBNB_ADDRESS unset - deployed MockWETH at:", weth);
        } else {
            console.log("Using existing wrapped native (WBNB) at:", weth);
        }

        // 1. Factory — reuse the live one, or deploy fresh on a first deploy.
        address factoryAddr;
        if (existingFactory == address(0)) {
            factoryAddr = address(new Factory());
            console.log("FACTORY_ADDRESS unset - deployed NEW Factory at:", factoryAddr);
            console.log("  NOTE: a new Factory starts with zero pairs.");
        } else {
            factoryAddr = existingFactory;
            console.log("Reusing existing Factory at:", factoryAddr);
            console.log("  Existing pairs:", Factory(factoryAddr).allPairsLength());
        }

        // 2. Deploy Router with Factory + wrapped-native address
        Router router = new Router(factoryAddr, weth);
        console.log("Router deployed at:", address(router));

        vm.stopBroadcast();
    }
}
