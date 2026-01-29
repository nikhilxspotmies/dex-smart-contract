// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Dex.sol";
import "../src/copy_trading/CopyTradingFactory.sol";
import "../src/copy_trading/CopyTradingVault.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock Token for testing
contract MockToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 1_000_000 * 10**18);
    }
}

contract DeployIntegration is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Tokens
        MockToken tokenA = new MockToken("Token A", "TKNA");
        MockToken tokenB = new MockToken("Token B", "TKNB");
        
        console.log("Token A deployed at:", address(tokenA));
        console.log("Token B deployed at:", address(tokenB));

        // 2. Deploy DEX System
        Factory dexFactory = new Factory();
        Router dexRouter = new Router(address(dexFactory));
        
        console.log("DEX Factory deployed at:", address(dexFactory));
        console.log("DEX Router deployed at:", address(dexRouter));

        // 3. Create Pair & Add Liquidity
        // Approve router
        tokenA.approve(address(dexRouter), type(uint256).max);
        tokenB.approve(address(dexRouter), type(uint256).max);

        dexRouter.addLiquidity(
            address(tokenA),
            address(tokenB),
            100_000 * 10**18, // 100k Token A
            100_000 * 10**18, // 100k Token B
            0,
            0,
            deployer,
            block.timestamp + 100
        );
        
        address pair = dexFactory.getPair(address(tokenA), address(tokenB));
        console.log("Pair (TKNA/TKNB) created at:", pair);

        // 4. Deploy Copy Trading System
        CopyTradingVault vaultImpl = new CopyTradingVault();
        CopyTradingFactory ctFactory = new CopyTradingFactory(
            address(vaultImpl),
            deployer, // Executor (Deployer for simple testing)
            address(dexRouter),
            deployer // Owner
        );
        
        console.log("CopyTrading Vault Impl deployed at:", address(vaultImpl));
        console.log("CopyTrading Factory deployed at:", address(ctFactory));

        vm.stopBroadcast();
    }
}
