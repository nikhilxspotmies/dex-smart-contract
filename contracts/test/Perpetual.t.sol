// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/perpetual/Perpetual.sol";
import "../src/MockERC20.sol";
import "../src/MockOracle.sol";

contract PerpetualTest is Test {
    Perpetual perp;
    MockERC20 usdc;
    MockERC20 indexToken; // e.g., ETH
    MockOracle oracle;
    address operator = address(1);
    address alice = address(2);
    address bob = address(3);

    function setUp() public {
        usdc = new MockERC20("USDC", "USDC");
        indexToken = new MockERC20("ETH", "ETH");
        oracle = new MockOracle();
        
        // Deploy Perpetual with all required parameters
        perp = new Perpetual(address(usdc), operator, address(oracle), address(indexToken));

        usdc.mint(alice, 10000 * 1e6);
        usdc.mint(bob, 10000 * 1e6);

        vm.startPrank(alice);
        usdc.approve(address(perp), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(perp), type(uint256).max);
        vm.stopPrank();
        
        // Set initial price for index token (as oracle owner)
        vm.prank(oracle.owner());
        oracle.setPrice(address(indexToken), 2000 * 1e18); // ETH $2000
    }

    function testDeposit() public {
        vm.prank(alice);
        perp.deposit(1000 * 1e6); // 1000 USDC

        (int256 margin, ) = perp.accounts(alice);
        assertEq(margin, 1000 * 1e18); // Scaled
    }

    function testTradeOpenLong() public {
        vm.prank(alice);
        perp.deposit(1000 * 1e6);

        vm.startPrank(operator);
        // Price is already set in setUp, but can update if needed
        // oracle.setPrice(address(indexToken), 2000 * 1e18); // ETH $2000

        // Alice buys 1 ETH at $2000
        perp.trade(alice, 1e18, 2000 * 1e18);
        vm.stopPrank();

        (int256 margin, Perpetual.Position memory pos) = perp.accounts(alice);
        assertEq(pos.size, 1e18);
        assertEq(pos.entryPrice, 2000 * 1e18);
    }
    
    function testPnL() public {
        vm.prank(alice);
        perp.deposit(1000 * 1e6);

        // Operator opens
        vm.prank(operator);
        perp.trade(alice, 1e18, 2000 * 1e18); // Open Long 1 @ 2000

        // Price goes to 2500 - update oracle (owner)
        vm.prank(oracle.owner());
        oracle.setPrice(address(indexToken), 2500 * 1e18);
        
        // Operator closes
        vm.prank(operator);
        perp.trade(alice, -1e18, 2500 * 1e18); 

        (int256 margin, Perpetual.Position memory pos) = perp.accounts(alice);
        assertEq(pos.size, 0);
        // Initial margin: 1000 * 1e18
        // PnL: (2500 - 2000) * 1 = 500 * 1e18
        // Final margin: 1500 * 1e18
        assertEq(margin, 1500 * 1e18);
    }
}
