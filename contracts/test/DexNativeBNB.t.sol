// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Dex.sol";
import {MockWETH} from "../src/MockWETH.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract NativeMockToken is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {
        _mint(msg.sender, 1_000_000 ether);
    }
}

/// Refuses native coin, to exercise the Router's ETH-transfer failure path.
contract RejectsETH {
    receive() external payable {
        revert("no thanks");
    }
}

contract DexNativeBNBTest is Test {
    Factory factory;
    Router router;
    MockWETH weth;
    NativeMockToken token;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 constant DEADLINE = type(uint256).max;

    function setUp() public {
        factory = new Factory();
        weth = new MockWETH();
        router = new Router(address(factory), address(weth));
        token = new NativeMockToken("Token", "TKN");

        token.transfer(alice, 100_000 ether);
        token.transfer(bob, 100_000 ether);
        vm.deal(alice, 1_000 ether);
        vm.deal(bob, 1_000 ether);

        // Seed a TOKEN/WBNB pool: 1000 TKN <-> 10 BNB.
        vm.startPrank(alice);
        token.approve(address(router), type(uint256).max);
        router.addLiquidityETH{value: 10 ether}(
            address(token),
            1000 ether,
            0,
            0,
            alice,
            DEADLINE
        );
        vm.stopPrank();
    }

    // --- constructor / receive -------------------------------------------------

    function test_ConstructorRejectsZeroAddresses() public {
        vm.expectRevert("Zero factory");
        new Router(address(0), address(weth));

        vm.expectRevert("Zero WETH");
        new Router(address(factory), address(0));
    }

    function test_WethIsExposed() public view {
        assertEq(router.WETH(), address(weth));
    }

    /// A stray native transfer would be unrecoverable, so it must bounce.
    function test_RejectsDirectNativeTransfer() public {
        vm.prank(alice);
        (bool ok, ) = address(router).call{value: 1 ether}("");
        assertFalse(ok, "router accepted a stray native transfer");
    }

    // --- addLiquidityETH -------------------------------------------------------

    function test_AddLiquidityETHSeedsPool() public view {
        address pair = factory.getPair(address(token), address(weth));
        assertTrue(pair != address(0), "pair not created");

        // Pool holds exactly what was deposited.
        assertEq(token.balanceOf(pair), 1000 ether);
        assertEq(weth.balanceOf(pair), 10 ether);

        // LP was minted to the depositor.
        assertGt(Pair(pair).lpToken().balanceOf(alice), 0);
    }

    /// Excess native coin beyond the optimal ratio must come back, not be kept.
    function test_AddLiquidityETHRefundsExcess() public {
        uint256 before = bob.balance;

        vm.startPrank(bob);
        token.approve(address(router), type(uint256).max);
        // Pool sits at 100 TKN per BNB, so 100 TKN only needs 1 BNB — send 5.
        (, uint256 amountETH, ) = router.addLiquidityETH{value: 5 ether}(
            address(token),
            100 ether,
            0,
            0,
            bob,
            DEADLINE
        );
        vm.stopPrank();

        assertEq(amountETH, 1 ether, "should have consumed exactly 1 BNB");
        assertEq(bob.balance, before - 1 ether, "excess BNB was not refunded");
        assertEq(address(router).balance, 0, "router retained native dust");
    }

    // --- swapExactETHForTokens -------------------------------------------------

    function test_SwapExactETHForTokens() public {
        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(token);

        uint256 tokensBefore = token.balanceOf(bob);
        uint256 bnbBefore = bob.balance;

        vm.prank(bob);
        uint256[] memory amounts = router.swapExactETHForTokens{value: 1 ether}(
            0,
            path,
            bob,
            DEADLINE
        );

        assertEq(bob.balance, bnbBefore - 1 ether, "wrong BNB spent");
        assertEq(
            token.balanceOf(bob) - tokensBefore,
            amounts[1],
            "received amount disagrees with quote"
        );
        assertGt(amounts[1], 0);
        assertEq(address(router).balance, 0, "router retained native coin");
        assertEq(weth.balanceOf(address(router)), 0, "router retained WBNB");
    }

    function test_SwapExactETHForTokensRejectsNonWethPath() public {
        address[] memory path = new address[](2);
        path[0] = address(token); // not WBNB
        path[1] = address(weth);

        vm.prank(bob);
        vm.expectRevert("Path must start with WETH");
        router.swapExactETHForTokens{value: 1 ether}(0, path, bob, DEADLINE);
    }

    function test_SwapExactETHForTokensRejectsZeroValue() public {
        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(token);

        vm.prank(bob);
        vm.expectRevert("Insufficient input amount");
        router.swapExactETHForTokens{value: 0}(0, path, bob, DEADLINE);
    }

    function test_SwapExactETHForTokensHonoursSlippage() public {
        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(token);

        vm.prank(bob);
        vm.expectRevert("Insufficient output amount");
        router.swapExactETHForTokens{value: 1 ether}(
            1000 ether, // unreachable
            path,
            bob,
            DEADLINE
        );
    }

    // --- swapExactTokensForETH -------------------------------------------------

    function test_SwapExactTokensForETH() public {
        address[] memory path = new address[](2);
        path[0] = address(token);
        path[1] = address(weth);

        uint256 bnbBefore = bob.balance;

        vm.startPrank(bob);
        token.approve(address(router), type(uint256).max);
        uint256[] memory amounts = router.swapExactTokensForETH(
            100 ether,
            0,
            path,
            bob,
            DEADLINE
        );
        vm.stopPrank();

        // Payout must arrive as native BNB, not WBNB.
        assertEq(bob.balance - bnbBefore, amounts[1], "native payout mismatch");
        assertEq(weth.balanceOf(bob), 0, "recipient was paid in WBNB");
        assertGt(amounts[1], 0);
        assertEq(address(router).balance, 0, "router retained native coin");
        assertEq(weth.balanceOf(address(router)), 0, "router retained WBNB");
    }

    function test_SwapExactTokensForETHRejectsNonWethPath() public {
        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(token); // does not end at WBNB

        vm.startPrank(bob);
        token.approve(address(router), type(uint256).max);
        vm.expectRevert("Path must end with WETH");
        router.swapExactTokensForETH(100 ether, 0, path, bob, DEADLINE);
        vm.stopPrank();
    }

    /// A recipient that rejects native coin must revert the whole swap, not strand
    /// the wrapper in the Router.
    function test_SwapExactTokensForETHRevertsIfRecipientRejects() public {
        RejectsETH sink = new RejectsETH();

        address[] memory path = new address[](2);
        path[0] = address(token);
        path[1] = address(weth);

        vm.startPrank(bob);
        token.approve(address(router), type(uint256).max);
        vm.expectRevert("ETH transfer failed");
        router.swapExactTokensForETH(100 ether, 0, path, address(sink), DEADLINE);
        vm.stopPrank();
    }

    // --- removeLiquidityETH ----------------------------------------------------

    function test_RemoveLiquidityETH() public {
        address pair = factory.getPair(address(token), address(weth));
        uint256 lp = Pair(pair).lpToken().balanceOf(alice);

        uint256 bnbBefore = alice.balance;
        uint256 tokensBefore = token.balanceOf(alice);

        vm.startPrank(alice);
        Pair(pair).lpToken().approve(address(router), type(uint256).max);
        (uint256 amountToken, uint256 amountETH) = router.removeLiquidityETH(
            address(token),
            lp,
            0,
            0,
            alice,
            DEADLINE
        );
        vm.stopPrank();

        assertGt(amountToken, 0);
        assertGt(amountETH, 0);
        assertEq(
            token.balanceOf(alice) - tokensBefore,
            amountToken,
            "token leg mismatch"
        );
        // Second leg must arrive unwrapped.
        assertEq(alice.balance - bnbBefore, amountETH, "native leg mismatch");
        assertEq(weth.balanceOf(alice), 0, "was paid in WBNB");
        assertEq(address(router).balance, 0, "router retained native coin");
    }

    function test_RemoveLiquidityETHHonoursSlippage() public {
        address pair = factory.getPair(address(token), address(weth));
        uint256 lp = Pair(pair).lpToken().balanceOf(alice);

        vm.startPrank(alice);
        Pair(pair).lpToken().approve(address(router), type(uint256).max);
        vm.expectRevert("Insufficient ETH amount");
        router.removeLiquidityETH(
            address(token),
            lp,
            0,
            1000 ether, // unreachable
            alice,
            DEADLINE
        );
        vm.stopPrank();
    }

    // --- round trip ------------------------------------------------------------

    /// BNB -> token -> BNB should return close to the starting amount, short only the
    /// two 0.3% fees. Proves wrap and unwrap compose without leaking value.
    function test_RoundTripLosesOnlyFees() public {
        address[] memory buy = new address[](2);
        buy[0] = address(weth);
        buy[1] = address(token);

        address[] memory sell = new address[](2);
        sell[0] = address(token);
        sell[1] = address(weth);

        uint256 startBnb = bob.balance;

        vm.startPrank(bob);
        token.approve(address(router), type(uint256).max);
        uint256[] memory bought = router.swapExactETHForTokens{value: 1 ether}(
            0,
            buy,
            bob,
            DEADLINE
        );
        router.swapExactTokensForETH(bought[1], 0, sell, bob, DEADLINE);
        vm.stopPrank();

        uint256 spent = startBnb - bob.balance;
        // Two hops at 0.3% each, plus slippage on a 10 BNB pool: well under 10%.
        assertLt(spent, 0.1 ether, "round trip lost more than fees explain");
        assertGt(spent, 0, "round trip was free, fees not applied");
    }
}
