// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {Factory} from "../src/Dex.sol";

/**
 * @dev Creates empty pairs (USDT as the quote leg, matching every existing pair's
 * topology) for tokens that are listed in the frontend but have no pool yet.
 *
 * Deliberately does NOT add liquidity — these pairs are created inert. A pair with
 * zero reserves reverts on every quote/swap ("Insufficient liquidity") until someone
 * deposits into it; that's the intended state here, liquidity comes later.
 */
contract CreatePairs is Script {
    address constant FACTORY = 0xa94Fb3865399fF5391215F224ABF6096E7d4daB1;
    address constant USDT = 0x55d398326f99059fF775485246999027B3197955;

    address constant XRP = 0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE;
    address constant SOL = 0x570A5D26f7765Ecb712C0924E4De545B89fD43dF;
    address constant TRX = 0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e3;
    address constant DOGE = 0xbA2aE424d960c26247Dd6c32edC70B295c744C43;
    address constant CAKE = 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        Factory factory = Factory(FACTORY);

        vm.startBroadcast(deployerPrivateKey);

        _createIfMissing(factory, "XRP", XRP);
        _createIfMissing(factory, "SOL", SOL);
        _createIfMissing(factory, "TRX", TRX);
        _createIfMissing(factory, "DOGE", DOGE);
        _createIfMissing(factory, "CAKE", CAKE);

        vm.stopBroadcast();
    }

    function _createIfMissing(Factory factory, string memory symbol, address token) internal {
        address existing = factory.getPair(token, USDT);
        if (existing != address(0)) {
            console.log(string.concat(symbol, "/USDT already exists at:"), existing);
            return;
        }
        address pair = factory.createPair(token, USDT);
        console.log(string.concat(symbol, "/USDT created at:"), pair);
    }
}
