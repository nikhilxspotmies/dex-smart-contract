// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/new_perp/src/oracle/DexPriceAdapter.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock Token to control decimals
contract MockToken is ERC20 {
    uint8 private _customDecimals;

    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {
        _customDecimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _customDecimals;
    }
}

// Mock Router to return prices
contract MockRouter {
    uint256 public priceToReturn;

    function setPrice(uint256 _price) external {
        priceToReturn = _price;
    }

    function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts) {
        amounts = new uint[](2);
        amounts[0] = amountIn;
        amounts[1] = priceToReturn; // Simplified: always returns fixed output for test
        return amounts;
    }
}

contract DexPriceAdapterTest is Test {
    DexPriceAdapter adapter;
    MockRouter router;
    MockToken btc; // Base
    MockToken usdc6; // Quote (Ethereum style)
    MockToken usdc18; // Quote (BSC style)

    function setUp() public {
        router = new MockRouter();
        btc = new MockToken("Bitcoin", "BTC", 18);
        usdc6 = new MockToken("USDC 6", "USDC", 6);
        usdc18 = new MockToken("USDC 18", "USDC", 18);
    }

    // Test Case 1: Ethereum Style (Quote = 6 decimals, Target = 8 decimals)
    // Price of BTC = 60,000 USDC
    // Router returns: 60,000 * 10^6 (since output is in USDC units)
    // Target Oracle: 60,000 * 10^8
    // Expectation: Adapter multiplies by 100
    function testEthStyleScaling() public {
        address[] memory path = new address[](2);
        path[0] = address(btc);
        path[1] = address(usdc6);

        // Deploy adapter expecting 8 decimals output
        adapter = new DexPriceAdapter(address(router), path, 8);

        // Router returns 60,000 USDC (6 decimals)
        // 60000 * 1e6 = 60,000,000,000
        router.setPrice(60000 * 1e6);

        (, int256 price, , ,) = adapter.latestRoundData();
        
        uint256 expected = 60000 * 1e8; // 6,000,000,000,000
        assertEq(uint256(price), expected, "ETH Style: Should upscale 6->8 decimals");
    }

    // Test Case 2: BSC Style (Quote = 18 decimals, Target = 8 decimals)
    // Price of BTC = 60,000 USDC
    // Router returns: 60,000 * 10^18 (since output is in USDC units)
    // Target Oracle: 60,000 * 10^8
    // Expectation: Adapter divides by 10^10
    function testBscStyleScaling() public {
        address[] memory path = new address[](2);
        path[0] = address(btc);
        path[1] = address(usdc18);

        // Deploy adapter expecting 8 decimals output
        adapter = new DexPriceAdapter(address(router), path, 8);

        // Router returns 60,000 USDC (18 decimals)
        // 60000 * 1e18
        router.setPrice(60000 * 1e18);

        (, int256 price, , ,) = adapter.latestRoundData();
        
        uint256 expected = 60000 * 1e8; 
        assertEq(uint256(price), expected, "BSC Style: Should downscale 18->8 decimals");
    }

    // Test Case 3: Exact Match (Quote = 8 decimals, Target = 8 decimals)
    function testExactMatch() public {
        MockToken usdc8 = new MockToken("USDC 8", "USDC", 8);
        address[] memory path = new address[](2);
        path[0] = address(btc);
        path[1] = address(usdc8);

        adapter = new DexPriceAdapter(address(router), path, 8);

        // Router returns 60,000 USDC (8 decimals)
        router.setPrice(60000 * 1e8);

        (, int256 price, , ,) = adapter.latestRoundData();
        
        uint256 expected = 60000 * 1e8;
        assertEq(uint256(price), expected, "Exact Match: Should keep price as is");
    }
}
