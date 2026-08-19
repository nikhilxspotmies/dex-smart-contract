// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Dex.sol";
import {MockWETH} from "../src/MockWETH.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract OrderingMockToken is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {
        _mint(msg.sender, 10_000_000 ether);
    }
}

/**
 * Regression cover for reserve ordering across the Router's liquidity entrypoints.
 *
 * A pair reports its reserves — and pays out its burn — in its OWN sorted
 * (token0, token1) order, which is fixed at creation by `Factory.createPair`. That
 * order has nothing to do with the order a caller happens to pass tokenA/tokenB in.
 * Reading one as though it were the other transposes the two legs whenever
 * `tokenA > tokenB`, so the ratio maths and the slippage bounds silently apply to the
 * wrong sides.
 *
 * Every test here deliberately calls with the HIGH-addressed token first, which is the
 * case that used to be wrong; passing them low-first exercised the aligned path and
 * looked fine, which is why this went unnoticed.
 */
contract DexReserveOrderingTest is Test {
    Factory factory;
    Router router;
    MockWETH weth;

    OrderingMockToken low; // numerically lower address == token0
    OrderingMockToken high; // numerically higher address == token1

    address alice = address(0xA11CE);
    uint256 constant DEADLINE = type(uint256).max;

    function setUp() public {
        factory = new Factory();
        weth = new MockWETH();
        router = new Router(address(factory), address(weth));

        // Deploy until the two differ, then bind by actual address order rather than
        // assuming deployment order decides it.
        OrderingMockToken t1 = new OrderingMockToken("One", "ONE");
        OrderingMockToken t2 = new OrderingMockToken("Two", "TWO");
        (low, high) = address(t1) < address(t2) ? (t1, t2) : (t2, t1);

        low.transfer(alice, 1_000_000 ether);
        high.transfer(alice, 1_000_000 ether);

        // Seed a deliberately ASYMMETRIC pool: 100 low <-> 1000 high (1:10).
        // A symmetric pool would hide a transposition entirely.
        vm.startPrank(alice);
        low.approve(address(router), type(uint256).max);
        high.approve(address(router), type(uint256).max);
        router.addLiquidity(
            address(low),
            address(high),
            100 ether,
            1000 ether,
            0,
            0,
            alice,
            DEADLINE
        );
        vm.stopPrank();
    }

    function test_PoolSeededAtExpectedRatio() public view {
        address pair = factory.getPair(address(low), address(high));
        (uint112 r0, uint112 r1) = Pair(pair).getReserves();
        assertEq(uint256(r0), 100 ether, "token0 reserve");
        assertEq(uint256(r1), 1000 ether, "token1 reserve");
    }

    /**
     * Adding with the high-addressed token as `tokenA` must follow the real 1:10 ratio.
     *
     * Against the transposed read this inverted: it would quote 1000 high against
     * reserves of (100, 1000) taken the wrong way round, overshoot `amountBDesired`,
     * fall to the else-branch and settle on 100 high / 1000 low — the ratio upside
     * down, handing the difference to the first arbitrageur.
     */
    function test_AddLiquidityRespectsRatioWhenTokenAIsHigher() public {
        vm.startPrank(alice);
        (uint256 amountA, uint256 amountB, ) = router.addLiquidity(
            address(high), // tokenA — the HIGHER address
            address(low), // tokenB
            1000 ether,
            1000 ether,
            0,
            0,
            alice,
            DEADLINE
        );
        vm.stopPrank();

        assertEq(amountA, 1000 ether, "high leg should consume the full 1000");
        assertEq(amountB, 100 ether, "low leg should be quoted at the 1:10 ratio");
    }

    /// The mirror call must agree — same deposit, arguments the other way round.
    function test_AddLiquidityAgreesInBothArgumentOrders() public {
        uint256 snap = vm.snapshotState();

        vm.startPrank(alice);
        (uint256 highFirstA, uint256 highFirstB, ) = router.addLiquidity(
            address(high),
            address(low),
            1000 ether,
            1000 ether,
            0,
            0,
            alice,
            DEADLINE
        );
        vm.stopPrank();

        vm.revertToState(snap);

        vm.startPrank(alice);
        (uint256 lowFirstA, uint256 lowFirstB, ) = router.addLiquidity(
            address(low),
            address(high),
            1000 ether,
            1000 ether,
            0,
            0,
            alice,
            DEADLINE
        );
        vm.stopPrank();

        // Same economic deposit, legs simply named the other way round.
        assertEq(highFirstA, lowFirstB, "high leg disagrees across arg orders");
        assertEq(highFirstB, lowFirstA, "low leg disagrees across arg orders");
    }

    /**
     * `amountAMin` must bind the token actually passed as `tokenA`.
     *
     * Transposed, the two bounds swapped places: a caller could set a min on their
     * high-addressed leg and have it silently enforced against the low one, so the
     * slippage guard protected the wrong side of the trade.
     */
    function test_RemoveLiquiditySlippageBindsTheCallersTokenA() public {
        address pair = factory.getPair(address(low), address(high));
        uint256 lp = Pair(pair).lpToken().balanceOf(alice);

        // Withdrawing everything returns ~100 low and ~1000 high. Demanding >100 of
        // the HIGH leg is satisfiable; the identical bound on the LOW leg is not.
        vm.startPrank(alice);
        Pair(pair).lpToken().approve(address(router), type(uint256).max);

        uint256 snap = vm.snapshotState();

        // tokenA = high, so amountAMin binds the high leg (~1000) — passes.
        (uint256 amountA, uint256 amountB) = router.removeLiquidity(
            address(high),
            address(low),
            lp,
            200 ether, // min on the high leg
            0,
            alice,
            DEADLINE
        );
        assertGt(amountA, 900 ether, "tokenA should be the ~1000 high leg");
        assertLt(amountB, 110 ether, "tokenB should be the ~100 low leg");

        vm.revertToState(snap);
        Pair(pair).lpToken().approve(address(router), type(uint256).max);

        // Same bound, legs swapped: now it binds the ~100 low leg — must revert.
        vm.expectRevert("Insufficient amounts");
        router.removeLiquidity(
            address(low),
            address(high),
            lp,
            200 ether, // min on the low leg — unreachable
            0,
            alice,
            DEADLINE
        );
        vm.stopPrank();
    }

    /// The native-coin path shares the same maths, so it inherits the same guarantee.
    /// Pinned separately because whether WBNB sorts high or low is an accident of its
    /// deployed address, and on BSC that address is fixed and not ours to choose.
    function test_AddLiquidityETHRespectsRatioRegardlessOfWethOrdering() public {
        vm.deal(alice, 100 ether);

        // Seed TOKEN/WBNB at 500 token <-> 5 BNB (1:100).
        vm.startPrank(alice);
        router.addLiquidityETH{value: 5 ether}(
            address(low),
            500 ether,
            0,
            0,
            alice,
            DEADLINE
        );

        // 100 token should draw exactly 1 BNB at that ratio.
        (uint256 amountToken, uint256 amountETH, ) = router.addLiquidityETH{
            value: 10 ether
        }(address(low), 100 ether, 0, 0, alice, DEADLINE);
        vm.stopPrank();

        assertEq(amountToken, 100 ether, "token leg");
        assertEq(amountETH, 1 ether, "native leg should follow the 1:100 ratio");
    }
}
