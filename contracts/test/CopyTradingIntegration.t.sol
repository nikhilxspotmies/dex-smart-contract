// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Dex.sol";
import "../src/copy_trading/CopyTradingFactory.sol";
import "../src/copy_trading/CopyTradingVault.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract IntegrationMockToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 10_000_000 * 10**18);
    }
}

contract CopyTradingIntegrationTest is Test {
    Factory dexFactory;
    Router dexRouter;
    
    CopyTradingFactory ctFactory;
    CopyTradingVault vaultImpl;
    CopyTradingVault userVault;
    
    IntegrationMockToken tokenA;
    IntegrationMockToken tokenB;
    
    address deployer = address(0x1);
    address user = address(0x2);
    address executor = address(0x3);

    function setUp() public {
        vm.startPrank(deployer);

        // 1. Deploy Tokens
        tokenA = new IntegrationMockToken("Token A", "TKNA");
        tokenB = new IntegrationMockToken("Token B", "TKNB");

        // 2. Deploy DEX System
        dexFactory = new Factory();
        dexRouter = new Router(address(dexFactory));

        // 3. Add Liquidity (Initial Pool)
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

        // 4. Deploy Copy Trading System
        vaultImpl = new CopyTradingVault();
        ctFactory = new CopyTradingFactory(
            address(vaultImpl),
            executor,
            address(dexRouter),
            deployer
        );

        vm.stopPrank();

        // 5. Setup User Vault
        vm.startPrank(user);
        address vaultAddr = ctFactory.createVault();
        userVault = CopyTradingVault(payable(vaultAddr));
        vm.stopPrank();
    }

    function testFullCopyTradingFlow() public {
        // --- Step 1: User Deposits ---
        vm.startPrank(deployer);
        tokenA.transfer(user, 1000 * 10**18); // Fund user
        vm.stopPrank();

        vm.startPrank(user);
        tokenA.approve(address(userVault), 1000 * 10**18);
        
        CopyTradingVault.SwapData[] memory emptySwaps;
        userVault.depositAndSwap(address(tokenA), 1000 * 10**18, emptySwaps);
        
        // Verify Deposit
        assertEq(tokenA.balanceOf(address(userVault)), 1000 * 10**18);
        vm.stopPrank();

        // --- Step 2: Executor Triggers Rebalance (Swap A -> B) ---
        vm.startPrank(executor);
        
        // Construct Path and Data
        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        
        bytes memory swapData = abi.encode(path);
        
        // Calculate Expected Output
        uint256 amountIn = 100 * 10**18;
        uint256[] memory amounts = dexRouter.getAmountsOut(amountIn, path);
        uint256 minAmountOut = amounts[1] * 99 / 100; // 1% Slippage

        // Create Rebalance Payload
        CopyTradingVault.SwapData[] memory swaps = new CopyTradingVault.SwapData[](1);
        swaps[0] = CopyTradingVault.SwapData({
            tokenIn: address(tokenA),
            tokenOut: address(tokenB),
            amountIn: amountIn,
            minAmountOut: minAmountOut,
            data: swapData
        });

        // Execute Rebalance
        userVault.rebalance(swaps);
        
        vm.stopPrank();

        // --- Step 3: Verify Balances ---
        // Vault should have less Token A
        assertEq(tokenA.balanceOf(address(userVault)), 900 * 10**18);
        
        // Vault should have Token B
        uint256 expectedTokenB = amounts[1];
        assertEq(tokenB.balanceOf(address(userVault)), expectedTokenB);
        
        console.log("Vault Final Token A:", tokenA.balanceOf(address(userVault)));
        console.log("Vault Final Token B:", tokenB.balanceOf(address(userVault)));
    }

    function testRebalanceSlippageRevert() public {
        // Fund Vault
        vm.startPrank(deployer);
        tokenA.transfer(address(userVault), 1000 * 10**18);
        vm.stopPrank();

        vm.startPrank(executor);
        
        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        
        // Impossible expectation
        uint256 amountIn = 100 * 10**18;
        uint256 minAmountOut = 1_000_000 * 10**18; 

        CopyTradingVault.SwapData[] memory swaps = new CopyTradingVault.SwapData[](1);
        swaps[0] = CopyTradingVault.SwapData({
            tokenIn: address(tokenA),
            tokenOut: address(tokenB),
            amountIn: amountIn,
            minAmountOut: minAmountOut,
            data: abi.encode(path)
        });

        vm.expectRevert(); // Router will likely revert first with "Insufficient output amount"
        userVault.rebalance(swaps);
        
        vm.stopPrank();
    }

    function testBatchWithdrawalIntegration() public {
        // 1. Fund Vault with both tokens
        vm.startPrank(deployer);
        tokenA.transfer(address(userVault), 100 * 10**18);
        tokenB.transfer(address(userVault), 200 * 10**18);
        vm.stopPrank();

        // 2. User Withdraws Both
        vm.startPrank(user);
        
        address[] memory tokens = new address[](2);
        tokens[0] = address(tokenA);
        tokens[1] = address(tokenB);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100 * 10**18;
        amounts[1] = 200 * 10**18;

        // Record User Balances Before
        uint256 preBalA = tokenA.balanceOf(user);
        uint256 preBalB = tokenB.balanceOf(user);

        userVault.withdrawBatch(tokens, amounts);

        // 3. Verify
        assertEq(tokenA.balanceOf(address(userVault)), 0);
        assertEq(tokenB.balanceOf(address(userVault)), 0);
        
        assertEq(tokenA.balanceOf(user), preBalA + 100 * 10**18);
        assertEq(tokenB.balanceOf(user), preBalB + 200 * 10**18);

        vm.stopPrank();
    }
}
