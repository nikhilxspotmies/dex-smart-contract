// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {AmxSale} from "../src/AmxSale.sol";

/// @notice Deploys AmxSale on BSC. Defaults for USDC/USDT/the BNB-USD Chainlink feed are the
/// real BSC mainnet addresses already used elsewhere in this workspace (Amerox-dex's
/// .env.production, DeployNewPerpBSC.s.sol) — override via env for testnet.
///
/// Required env vars:
///   PRIVATE_KEY                - deployer key, pays gas
///   ADMIN_ADDRESS               - holds DEFAULT_ADMIN_ROLE
///   PAUSER_ADDRESS               - holds PAUSER_ROLE
///   BNB_TREASURY_ADDRESS          - sweepBNB() destination
///   USDC_TREASURY_ADDRESS          - sweepToken(usdc) destination
///   USDT_TREASURY_ADDRESS           - sweepToken(usdt) destination
/// Optional env vars:
///   USDC_ADDRESS (default: BSC mainnet Binance-Peg USDC)
///   USDT_ADDRESS (default: BSC mainnet Binance-Peg USDT)
///   BNB_USD_PRICE_FEED (default: BSC mainnet Chainlink BNB/USD)
///   AMX_PRICE_USD_E18 (default: 0.5e18 = $0.50/AMX)
///   MIN_PURCHASE_USD_E18 (default: 1e18 = $1)
///   MAX_PURCHASE_USD_E18 (default: 10000e18 = $10,000)
contract DeployAmxSale is Script {
    address constant BSC_MAINNET_USDC = 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d;
    address constant BSC_MAINNET_USDT = 0x55d398326f99059fF775485246999027B3197955;
    address constant BSC_MAINNET_BNB_USD_FEED = 0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE;

    function setUp() public {}

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        address admin = vm.envAddress("ADMIN_ADDRESS");
        address pauser = vm.envAddress("PAUSER_ADDRESS");
        address bnbTreasury = vm.envAddress("BNB_TREASURY_ADDRESS");
        address usdcTreasury = vm.envAddress("USDC_TREASURY_ADDRESS");
        address usdtTreasury = vm.envAddress("USDT_TREASURY_ADDRESS");

        address usdcAddress = vm.envOr("USDC_ADDRESS", BSC_MAINNET_USDC);
        address usdtAddress = vm.envOr("USDT_ADDRESS", BSC_MAINNET_USDT);
        address priceFeed = vm.envOr("BNB_USD_PRICE_FEED", BSC_MAINNET_BNB_USD_FEED);

        uint256 amxPriceUsdE18 = vm.envOr("AMX_PRICE_USD_E18", uint256(0.5e18));
        uint256 minPurchaseUsdE18 = vm.envOr("MIN_PURCHASE_USD_E18", uint256(1e18));
        uint256 maxPurchaseUsdE18 = vm.envOr("MAX_PURCHASE_USD_E18", uint256(10_000e18));

        vm.startBroadcast(deployerPrivateKey);

        AmxSale sale = new AmxSale(
            admin,
            pauser,
            usdcAddress,
            usdtAddress,
            priceFeed,
            bnbTreasury,
            usdcTreasury,
            usdtTreasury,
            amxPriceUsdE18,
            minPurchaseUsdE18,
            maxPurchaseUsdE18
        );
        console.log("AmxSale deployed at:", address(sale));

        vm.stopBroadcast();
    }
}
