// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/copy_trading/CopyTradingFactory.sol";
import "../src/copy_trading/CopyTradingVault.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// --- Mock Contracts ---

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockSwapRouter {
    // Mock swap function matching IDexRouter signature
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts) {
        require(path.length >= 2, "Invalid path");
        require(block.timestamp <= deadline, "Expired");
        
        address tokenIn = path[0];
        address tokenOut = path[path.length - 1];

        // Simulate taking tokens from the Vault (msg.sender)
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        
        // Simulate sending tokens back to the Vault (to)
        // For simplicity, 1:1 exchange rate in mock
        uint256 amountOut = amountIn; 
        
        // Slippage check in Router (Vault also checks this, but Router usually does too)
        require(amountOut >= amountOutMin, "Router: Insufficient output");

        MockERC20(tokenOut).mint(to, amountOut);
        
        // Return dummy amounts array
        amounts = new uint[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountOut;
        
        return amounts;
    }
}

// --- Main Test Suite ---

contract CopyTradingTest is Test {
    CopyTradingFactory factory;
    CopyTradingVault implementation;
    CopyTradingVault userVault;
    
    MockERC20 weth;
    MockERC20 usdc;
    MockSwapRouter router;
    
    address owner = address(0x123);
    address executor = address(0x456);
    address user = address(0x789);
    address whale = address(0xABC);
    address attacker = address(0xBAD);

    function setUp() public {
        vm.startPrank(owner);

        // 1. Deploy Mocks
        weth = new MockERC20("Wrapped Ether", "WETH");
        usdc = new MockERC20("USDC Coin", "USDC");
        router = new MockSwapRouter();

        // 2. Deploy Implementation
        implementation = new CopyTradingVault();

        // 3. Deploy Factory
        factory = new CopyTradingFactory(
            address(implementation),
            executor,
            address(router),
            owner
        );

        vm.stopPrank();

        // 4. Setup User
        vm.startPrank(user);
        // Create Vault for User
        address vaultAddr = factory.createVault();
        userVault = CopyTradingVault(payable(vaultAddr));
        vm.stopPrank();
    }

    // --- Factory Tests ---

    function testFactoryDeployment() public view {
        assertEq(factory.implementation(), address(implementation));
        assertEq(factory.executor(), executor);
        assertEq(factory.swapRouter(), address(router));
    }

    function testUserVaultCreation() public view {
        assertEq(factory.getVault(user), address(userVault));
        assertEq(userVault.owner(), user);
        assertEq(userVault.executor(), executor);
    }

    function testCannotCreateTwoVaults() public {
        vm.startPrank(user);
        vm.expectRevert("User already has a vault");
        factory.createVault();
        vm.stopPrank();
    }

    // --- Vault Deposit / Withdraw Tests ---

    function testDeposit() public {
        vm.startPrank(user);
        
        // Mint WETH to user
        weth.mint(user, 10 ether);
        weth.approve(address(userVault), 10 ether);

        // Deposit
        CopyTradingVault.SwapData[] memory emptySwaps;
        userVault.depositAndSwap(address(weth), 10 ether, emptySwaps);

        // Check Balances
        assertEq(weth.balanceOf(address(userVault)), 10 ether);
        assertEq(weth.balanceOf(user), 0);
        
        vm.stopPrank();
    }

    function testWithdraw() public {
        // 1. Setup Balance
        weth.mint(address(userVault), 10 ether);

        // 2. User Withdraws
        vm.startPrank(user);
        userVault.withdraw(address(weth), 5 ether);
        
        assertEq(weth.balanceOf(address(userVault)), 5 ether);
        assertEq(weth.balanceOf(user), 5 ether);
        vm.stopPrank();
    }

    function testWithdrawAccessControl() public {
        weth.mint(address(userVault), 10 ether);

        vm.startPrank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        userVault.withdraw(address(weth), 10 ether);
        vm.stopPrank();
    }

    function testWithdrawInsufficientBalance() public {
        weth.mint(address(userVault), 1 ether);

        vm.startPrank(user);
        vm.expectRevert("Insufficient balance");
        userVault.withdraw(address(weth), 5 ether);
        vm.stopPrank();
    }

    function testWithdrawAll() public {
        weth.mint(address(userVault), 10 ether);

        vm.startPrank(user);
        userVault.withdrawAll(address(weth));
        
        assertEq(weth.balanceOf(address(userVault)), 0);
        assertEq(weth.balanceOf(user), 10 ether);
        vm.stopPrank();
    }

    function testWithdrawBatch() public {
        weth.mint(address(userVault), 10 ether);
        usdc.mint(address(userVault), 500 * 10**18);

        vm.startPrank(user);
        
        address[] memory tokens = new address[](2);
        tokens[0] = address(weth);
        tokens[1] = address(usdc);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 5 ether; // Withdraw half
        amounts[1] = 500 * 10**18; // Withdraw all

        userVault.withdrawBatch(tokens, amounts);
        
        // Assertions
        assertEq(weth.balanceOf(address(userVault)), 5 ether);
        assertEq(weth.balanceOf(user), 5 ether);
        
        assertEq(usdc.balanceOf(address(userVault)), 0);
        assertEq(usdc.balanceOf(user), 500 * 10**18);
        
        vm.stopPrank();
    }

    function testWithdrawBatchLengthMismatch() public {
         vm.startPrank(user);
        
        address[] memory tokens = new address[](1);
        tokens[0] = address(weth);

        uint256[] memory amounts = new uint256[](2);
        
        vm.expectRevert("Length mismatch");
        userVault.withdrawBatch(tokens, amounts); // Should fail
        
        vm.stopPrank();
    }

    function testSetTargetWhale() public {
         vm.startPrank(user);
         userVault.setTargetWhale(whale);
         assertEq(userVault.targetWhale(), whale);
         vm.stopPrank();
    }

    function testSetTargetWhaleAccessControl() public {
        vm.startPrank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        userVault.setTargetWhale(whale);
        vm.stopPrank();
    }

    // --- Executor / Rebalance Tests ---

    function testRebalance() public {
        // 1. Fund Vault
        weth.mint(address(userVault), 10 ether);
        
        // 2. Prepare Swap Data
        // NEW: Encode 'path' as data, NOT a function selector
        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(usdc);
        bytes memory swapCallData = abi.encode(path);

        CopyTradingVault.SwapData[] memory swaps = new CopyTradingVault.SwapData[](1);
        swaps[0] = CopyTradingVault.SwapData({
            tokenIn: address(weth),
            tokenOut: address(usdc),
            amountIn: 1 ether,
            minAmountOut: 1 ether, // 1:1 in mock
            data: swapCallData
        });

        // 3. Executor calls rebalance
        vm.startPrank(executor);
        userVault.rebalance(swaps);
        vm.stopPrank();

        // 4. Verification
        // Vault sent 1 WETH, got 1 USDC
        assertEq(weth.balanceOf(address(userVault)), 9 ether);
        assertEq(usdc.balanceOf(address(userVault)), 1 ether);
    }

    function testRebalanceAccessControl() public {
        CopyTradingVault.SwapData[] memory swaps = new CopyTradingVault.SwapData[](0);

        vm.startPrank(attacker);
        vm.expectRevert("Caller is not the executor");
        userVault.rebalance(swaps);
        vm.stopPrank();
    }

    function testSlippageProtection() public {
         // 1. Fund Vault
        weth.mint(address(userVault), 10 ether);
        
        // 2. Prepare Swap Data with HIGH minAmountOut (impossible to meet)
        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(usdc);
        
        CopyTradingVault.SwapData[] memory swaps = new CopyTradingVault.SwapData[](1);
        swaps[0] = CopyTradingVault.SwapData({
            tokenIn: address(weth),
            tokenOut: address(usdc),
            amountIn: 1 ether,
            minAmountOut: 100 ether, // Impossible! Mock gives 1:1
            data: abi.encode(path)
        });

        vm.startPrank(executor);
        vm.expectRevert("Router: Insufficient output");
        userVault.rebalance(swaps);
        vm.stopPrank();
    }
}
