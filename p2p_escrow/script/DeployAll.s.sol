// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {Factory, Router} from "../src/Dex.sol";
import {P2PTokenEscrows} from "../src/P2PTokenEscrow.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock ERC20 Token for testing
contract MockToken is ERC20 {
    constructor(string memory name, string memory symbol, uint256 initialSupply) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply);
    }
}

contract DeployAll is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying contracts with deployer:", deployer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy Mock Tokens
        MockToken mockUSDC = new MockToken("Mock USDC", "USDC", 1_000_000 * 10**18);
        console.log("MockUSDC deployed at:", address(mockUSDC));
        
        MockToken mockBTC = new MockToken("Mock BTC", "BTC", 1_000 * 10**18);
        console.log("MockBTC deployed at:", address(mockBTC));
        
        MockToken mockETH = new MockToken("Mock ETH", "ETH", 10_000 * 10**18);
        console.log("MockETH deployed at:", address(mockETH));
        
        // Deploy DEX Factory
        Factory factory = new Factory();
        console.log("DEX Factory deployed at:", address(factory));
        
        // Deploy DEX Router
        Router router = new Router(address(factory));
        console.log("DEX Router deployed at:", address(router));
        
        // Deploy P2P Escrow
        P2PTokenEscrows p2p = new P2PTokenEscrows();
        console.log("P2P Escrow deployed at:", address(p2p));
        
        // Whitelist tokens in P2P contract
        p2p.setTokenWhitelist(address(mockUSDC), true);
        p2p.setTokenWhitelist(address(mockBTC), true);
        p2p.setTokenWhitelist(address(mockETH), true);
        console.log("Tokens whitelisted in P2P contract");
        
        vm.stopBroadcast();
        
        console.log("");
        console.log("=== Deployment Summary ===");
        console.log("VITE_MOCK_USDC_ADDRESS=", address(mockUSDC));
        console.log("VITE_MOCK_BTC_ADDRESS=", address(mockBTC));
        console.log("VITE_MOCK_ETH_ADDRESS=", address(mockETH));
        console.log("VITE_DEX_FACTORY_ADDRESS=", address(factory));
        console.log("VITE_DEX_ROUTER_ADDRESS=", address(router));
        console.log("VITE_P2P_CONTRACT=", address(p2p));
    }
}
