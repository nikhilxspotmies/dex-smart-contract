// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/CopyTrading.sol";
import "../src/Dex.sol";
import "../src/MockERC20.sol";

contract CopyTradingTest is Test {
    Factory factory;
    Router router;
    MockERC20 tokenA;
    MockERC20 tokenB;
    CopyTrading copyTrading;
    
    address owner = address(this);
    address whale = address(0x10);
    address noob1 = address(0x11);
    address noob2 = address(0x12);
    address bot = address(0x99);

    function setUp() public {
        // 1. Deploy DEX Infrastructure
        factory = new Factory();
        router = new Router(address(factory));
        tokenA = new MockERC20("Token A", "TKA");
        tokenB = new MockERC20("Token B", "TKB");

        // 2. Deploy CopyTrading
        copyTrading = new CopyTrading(address(router), bot);

        // 3. Whitelist tokens and give infinite approvals
        copyTrading.addWhitelistedToken(address(tokenA));
        copyTrading.addWhitelistedToken(address(tokenB));

        // 4. Setup Liquidity in Router
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(
            address(tokenA), address(tokenB), 
            10000 ether, 10000 ether, 
            0, 0, owner, block.timestamp + 100
        );

        // 5. Fund Noobs
        tokenA.mint(noob1, 1000 ether);
        tokenA.mint(noob2, 1000 ether);
    }

    function testInfiniteApprovalSetting() public {
        // Verify that the CopyTrading contract has granted infinite approval to the router
        uint256 allowanceA = tokenA.allowance(address(copyTrading), address(router));
        uint256 allowanceB = tokenB.allowance(address(copyTrading), address(router));
        
        assertEq(allowanceA, type(uint256).max, "TokenA allowance should be infinite");
        assertEq(allowanceB, type(uint256).max, "TokenB allowance should be infinite");
    }

    function testSubscription() public {
        vm.startPrank(noob1);
        tokenA.approve(address(copyTrading), 100 ether);
        copyTrading.subscribe(whale, address(tokenA), 100 ether);
        
        uint256 balance = copyTrading.getBucketBalance(noob1, whale, address(tokenA));
        assertEq(balance, 100 ether);
        vm.stopPrank();
    }

    function testBatchCopyTrade() public {
        // Setup Subscriptions
        vm.startPrank(noob1);
        tokenA.approve(address(copyTrading), 100 ether);
        copyTrading.subscribe(whale, address(tokenA), 100 ether); // 100 TKA
        vm.stopPrank();

        vm.startPrank(noob2);
        tokenA.approve(address(copyTrading), 200 ether);
        copyTrading.subscribe(whale, address(tokenA), 200 ether); // 200 TKA
        vm.stopPrank();

        // 1. Prepare Bot Mirror Swap: Mirroring a 10% move from whale
        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);

        address[] memory noobs = new address[](2);
        noobs[0] = noob1;
        noobs[1] = noob2;

        vm.startPrank(bot);
        
        // Bot triggers trade for both noobs at once: swap 10% of their TKA bucket to TKB
        copyTrading.executeBatchCopyTrade(
            whale,
            noobs,
            path,
            1000, // 10%
            50    // 0.5% slippage
        );
        vm.stopPrank();

        // Check balances
        // Noob1: 100 - 10 = 90 TKA. Some TKB received.
        // Noob2: 200 - 20 = 180 TKA. Some TKB received (double of Noob1).
        
        assertEq(copyTrading.getBucketBalance(noob1, whale, address(tokenA)), 90 ether);
        assertEq(copyTrading.getBucketBalance(noob2, whale, address(tokenA)), 180 ether);
        
        uint256 noob1TKB = copyTrading.getBucketBalance(noob1, whale, address(tokenB));
        uint256 noob2TKB = copyTrading.getBucketBalance(noob2, whale, address(tokenB));
        
        assertTrue(noob1TKB > 0, "Noob1 should have TKB");
        // Verify proportionality (allow for 1 wei rounding)
        assertApproxEqAbs(noob2TKB, noob1TKB * 2, 1, "Proportional distribution failed");
    }

    function testWithdrawAll() public {
        // Setup Subscription and one trade
        vm.startPrank(noob1);
        tokenA.approve(address(copyTrading), 100 ether);
        copyTrading.subscribe(whale, address(tokenA), 100 ether);
        vm.stopPrank();

        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        address[] memory noobs = new address[](1);
        noobs[0] = noob1;

        vm.prank(bot);
        copyTrading.executeBatchCopyTrade(whale, noobs, path, 5000, 0); // Swap 50%

        uint256 balABefore = tokenA.balanceOf(noob1);
        uint256 balBBefore = tokenB.balanceOf(noob1);

        // Act: Withdraw All
        vm.startPrank(noob1);
        copyTrading.withdrawAll(whale);
        vm.stopPrank();

        // Verify: Noob should have both TKA and TKB back in their wallet
        uint256 balAAfter = tokenA.balanceOf(noob1);
        uint256 balBAfter = tokenB.balanceOf(noob1);
        
        assertEq(balAAfter - balABefore, 50 ether, "Should get 50 TKA back");
        assertTrue(balBAfter > balBBefore, "Should get TKB back");
        
        // Contract bucket should be empty
        assertEq(copyTrading.getBucketBalance(noob1, whale, address(tokenA)), 0);
        assertEq(copyTrading.getBucketBalance(noob1, whale, address(tokenB)), 0);
    }
}
