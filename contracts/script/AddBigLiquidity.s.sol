// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}

interface IMintable {
    function mint(address to, uint256 amount) external;
}

interface IRouter {
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB, uint liquidity);
}

contract AddBigLiquidity is Script {
    address constant DEX_ROUTER = 0x104835d5Df633E685DA07d853B78D3d9369649BF;
    address constant ETH = 0xa2E3356610840701BDf5611a53974510Ae27E2e1;
    address constant USDC = 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d;

    function run() external {
        vm.startBroadcast();

        // 1. Mint 1 ETH and 2500 USDC
        // ETH is 18 decimals, USDC is 6 decimals
        uint256 ethAmt = 1 * 10**18;
        uint256 usdcAmt = 2500 * 10**6;

        console.log("Minting tokens...");
        IMintable(ETH).mint(msg.sender, ethAmt);
        IMintable(USDC).mint(msg.sender, usdcAmt);

        // 2. Approve Router
        console.log("Approving router...");
        IERC20(ETH).approve(DEX_ROUTER, ethAmt);
        IERC20(USDC).approve(DEX_ROUTER, usdcAmt);

        // 3. Add Liquidity
        console.log("Adding liquidity (1 ETH / 2500 USDC)...");
        IRouter(DEX_ROUTER).addLiquidity(
            ETH,
            USDC,
            ethAmt,
            usdcAmt,
            0,
            0,
            msg.sender,
            block.timestamp + 3600
        );

        vm.stopBroadcast();
        console.log("Success! Price established at $2500/ETH");
    }
}
