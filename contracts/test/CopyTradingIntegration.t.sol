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

// 6-decimal token (USDC-like) to exercise the H3 oracle decimal-scaling math.
contract IntegrationMockToken6 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 10_000_000 * 10**6);
    }
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

// Minimal Chainlink-style feed for H3 allowlist tests (8-dec answer, always fresh).
contract IntegrationMockFeed {
    int256 public answer;
    constructor(int256 _answer) { answer = _answer; }
    function setAnswer(int256 _answer) external { answer = _answer; }
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (0, answer, 0, block.timestamp, 0);
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

        // H3: allowlist both tokens with price feeds (pool is 1:1, so both priced at $1).
        IntegrationMockFeed feedA = new IntegrationMockFeed(1e8);
        IntegrationMockFeed feedB = new IntegrationMockFeed(1e8);
        ctFactory.setAllowedToken(address(tokenA), address(feedA));
        ctFactory.setAllowedToken(address(tokenB), address(feedB));

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

    // --- H3: allowlist + oracle-floor protection ---

    function testH3_RevertsNonAllowlistedToken() public {
        // A token with no registered feed must be rejected as a swap hop.
        IntegrationMockToken tokenC = new IntegrationMockToken("Token C", "TKNC");

        vm.startPrank(deployer);
        tokenA.transfer(address(userVault), 1000 * 10**18);
        vm.stopPrank();

        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenC); // not allowlisted

        CopyTradingVault.SwapData[] memory swaps = new CopyTradingVault.SwapData[](1);
        swaps[0] = CopyTradingVault.SwapData({
            tokenIn: address(tokenA),
            tokenOut: address(tokenC),
            amountIn: 100 * 10**18,
            minAmountOut: 0,
            data: abi.encode(path)
        });

        vm.prank(executor);
        vm.expectRevert(bytes("token not allowed"));
        userVault.rebalance(swaps);
    }

    function testH3_RevertsBelowOracleMinOut() public {
        // Simulate a malicious executor setting minAmountOut = 0 while the oracle price says
        // tokenA is worth far more than the 1:1 pool returns. The oracle floor must catch it.
        vm.startPrank(deployer);
        tokenA.transfer(address(userVault), 1000 * 10**18);
        // Re-price tokenA at $100 (pool is still ~1:1), so the oracle expects ~100x output.
        ctFactory.setAllowedToken(address(tokenA), address(new IntegrationMockFeed(100e8)));
        vm.stopPrank();

        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);

        CopyTradingVault.SwapData[] memory swaps = new CopyTradingVault.SwapData[](1);
        swaps[0] = CopyTradingVault.SwapData({
            tokenIn: address(tokenA),
            tokenOut: address(tokenB),
            amountIn: 100 * 10**18,
            minAmountOut: 0, // malicious: no executor-side floor
            data: abi.encode(path)
        });

        vm.prank(executor);
        vm.expectRevert(bytes("below oracle min out"));
        userVault.rebalance(swaps);
    }

    function testH3_AsymmetricDecimalsOracleMath() public {
        // Validate the oracle min-out math when tokenIn (18-dec) and tokenOut (6-dec) differ —
        // the BSC/Ethereum-USDC-relevant path that the 18-dec-only tests never exercised.
        vm.startPrank(deployer);
        IntegrationMockToken token18 = new IntegrationMockToken("Eighteen", "T18");
        IntegrationMockToken6 token6 = new IntegrationMockToken6("Six", "T6");

        // Pool priced so 1 T18 ($1) == 1 T6 ($1): 100k T18 vs 100k T6 (in their own decimals).
        token18.approve(address(dexRouter), type(uint256).max);
        token6.approve(address(dexRouter), type(uint256).max);
        dexRouter.addLiquidity(
            address(token18), address(token6),
            100_000 * 10**18, 100_000 * 10**6, 0, 0, deployer, block.timestamp + 100
        );

        // Both $1 feeds. Allowlist them.
        ctFactory.setAllowedToken(address(token18), address(new IntegrationMockFeed(1e8)));
        ctFactory.setAllowedToken(address(token6), address(new IntegrationMockFeed(1e8)));

        // Fund the vault with T18.
        token18.transfer(address(userVault), 5_000 * 10**18);
        vm.stopPrank();

        address[] memory path = new address[](2);
        path[0] = address(token18);
        path[1] = address(token6);

        CopyTradingVault.SwapData[] memory swaps = new CopyTradingVault.SwapData[](1);
        swaps[0] = CopyTradingVault.SwapData({
            tokenIn: address(token18),
            tokenOut: address(token6),
            amountIn: 1_000 * 10**18,   // swap $1000 of T18
            minAmountOut: 0,            // rely entirely on the oracle floor
            data: abi.encode(path)
        });

        // A fair swap (oracle expects ~1000e6 of T6, pool returns slightly less due to fee/slippage
        // but within the 3% default) must PASS — proving the decimal scaling is correct.
        vm.prank(executor);
        userVault.rebalance(swaps);

        uint256 received = token6.balanceOf(address(userVault));
        // Expected ~1000e6; assert it landed in the correct 6-decimal magnitude (not 1e18-scaled).
        assertGt(received, 970 * 10**6, "received >= oracle floor in 6-dec units");
        assertLt(received, 1_001 * 10**6, "received in correct 6-dec magnitude");
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
