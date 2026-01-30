// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {Factory, Router} from "../src/Dex.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract InitializeLiquidity is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Initializing Liquidity with deployer:", deployer);
        
        // Load addresses from Environment or Hardcoded from previous log
        // Using the addresses you confirmed from run-latest.json
        address usdcAddr = 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318;
        address ethAddr = 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e;
        address factoryAddr = 0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0;
        address routerAddr = 0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82;

        vm.startBroadcast(deployerPrivateKey);

        Router router = Router(routerAddr);
        IERC20 usdc = IERC20(usdcAddr);
        IERC20 eth = IERC20(ethAddr);

        // Approve Router to spend tokens
        usdc.approve(routerAddr, type(uint256).max);
        eth.approve(routerAddr, type(uint256).max);
        console.log("Approved Router");

        // Add Liquidity
        // 1000 ETH : 1000 USDC (1:1 price for simplicity initially, or 1 ETH = 3000 USDC)
        // Let's do 1 ETH = 3000 USDC
        uint256 ethAmount = 100 * 10**18;
        uint256 usdcAmount = 300000 * 10**18; 

        (uint amountA, uint amountB, uint liquidity) = router.addLiquidity(
            address(eth),
            address(usdc),
            ethAmount,
            usdcAmount,
            0, // Min amount (slippage)
            0,
            deployer,
            block.timestamp + 1200
        );

        console.log("Likquidity Added:");
        console.log("ETH:", amountA);
        console.log("USDC:", amountB);
        console.log("LP Tokens:", liquidity);

        vm.stopBroadcast();
    }
}
