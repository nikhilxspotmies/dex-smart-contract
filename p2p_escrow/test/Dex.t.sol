// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Dex.sol"; // Adjust this path to where your contract file is!
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock Token for testing
contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 1000000 * 10 ** 18);
    }
}

contract DexTest is Test {
    Factory factory;
    Router router;
    MockERC20 tokenA;
    MockERC20 tokenB;
    address pairAddress;
    
    // User accounts
    address owner = address(this);
    address alice = address(0x1);
    address bob = address(0x2);

    function setUp() public {
        // 1. Deploy Factory
        factory = new Factory();

        // 2. Deploy Router
        router = new Router(address(factory));

        // 3. Deploy Mock Tokens
        tokenA = new MockERC20("Token A", "TKA");
        tokenB = new MockERC20("Token B", "TKB");

        // 4. Distribute tokens to Alice
        tokenA.transfer(alice, 1000 ether);
        tokenB.transfer(alice, 1000 ether);
    }

    function testCreatePair() public {
        // Alice creates the pair
        vm.prank(alice);
        address pair = factory.createPair(address(tokenA), address(tokenB));
        
        assertTrue(pair != address(0), "Pair address should not be zero");
        assertEq(factory.allPairsLength(), 1, "Should have 1 pair");
    }

    function testAddLiquidity() public {
        // 1. Alice approves Router
        vm.startPrank(alice);
        tokenA.approve(address(router), 1000 ether);
        tokenB.approve(address(router), 1000 ether);

        // 2. Add Liquidity
        // Adding 100 Token A and 100 Token B
        (uint amountA, uint amountB, uint liquidity) = router.addLiquidity(
            address(tokenA),
            address(tokenB),
            100 ether,
            100 ether,
            90 ether, // Min amount A
            90 ether, // Min amount B
            alice,
            block.timestamp + 1000 // Deadline
        );

        vm.stopPrank();

        // 3. Assertions
        assertEq(amountA, 100 ether, "Should add exactly 100 A");
        assertEq(amountB, 100 ether, "Should add exactly 100 B");
        assertTrue(liquidity > 0, "Should mint LP tokens");

        // Verify Pair Balance
        address pair = factory.getPair(address(tokenA), address(tokenB));
        assertEq(tokenA.balanceOf(pair), 100 ether, "Pair should hold 100 A");
        assertEq(tokenB.balanceOf(pair), 100 ether, "Pair should hold 100 B");
    }

    function testSwap() public {
        // --- SETUP LIQUIDITY FIRST ---
        vm.startPrank(alice);
        tokenA.approve(address(router), 1000 ether);
        tokenB.approve(address(router), 1000 ether);
        
        router.addLiquidity(
            address(tokenA), 
            address(tokenB), 
            100 ether, 
            100 ether, 
            0, 0, 
            alice, 
            block.timestamp
        );
        vm.stopPrank();

        // --- PERFORM SWAP ---
        // Alice wants to swap 10 Token A for Token B
        uint swapAmount = 10 ether;
        
        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);

        // Calculate expected output
        uint[] memory amountsOut = router.getAmountsOut(swapAmount, path);
        uint expectedOut = amountsOut[1];

        vm.startPrank(alice);
        tokenA.approve(address(router), swapAmount);
        
        uint startBalanceB = tokenB.balanceOf(alice);
        
        router.swapExactTokensForTokens(
            swapAmount,
            0, // Accept any amount for this test
            path,
            alice,
            block.timestamp
        );
        vm.stopPrank();

        uint endBalanceB = tokenB.balanceOf(alice);
        
        // Assert Alice received the correct amount of Token B
        assertEq(endBalanceB - startBalanceB, expectedOut, "Swap output mismatch");
        
        // Console Log for visual verification
        console.log("Swapped 10 Token A");
        console.log("Received Token B:", expectedOut);
    }
}