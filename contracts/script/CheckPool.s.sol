// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";

interface IFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface IPair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
    function token1() external view returns (address);
}

contract CheckPool is Script {
    address constant DEX_FACTORY = 0xecb64015331902795323b56A04710e2d6cC3A21d;
    address constant ETH = 0xa2E3356610840701BDf5611a53974510Ae27E2e1;
    address constant USDC = 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d;

    function run() external view {
        address pair = IFactory(DEX_FACTORY).getPair(ETH, USDC);
        console.log("Pair Address:", pair);

        if (pair == address(0)) {
            console.log("Error: Pool does not exist!");
            return;
        }

        (uint112 res0, uint112 res1, ) = IPair(pair).getReserves();
        address t0 = IPair(pair).token0();
        address t1 = IPair(pair).token1();

        console.log("Token 0:", t0);
        console.log("Token 1:", t1);
        console.log("Reserve 0:", uint256(res0));
        console.log("Reserve 1:", uint256(res1));
        
        if (res0 == 0 || res1 == 0) {
            console.log("Error: Pool has NO liquidity!");
        } else {
            console.log("Pool has liquidity.");
        }
    }
}
