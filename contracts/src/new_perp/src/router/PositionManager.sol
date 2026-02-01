// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../core/Market.sol";
import "./Router.sol";

/// @notice Keeper-facing executor for async requests.
contract PositionManager is Ownable {
    Router public immutable router;

    constructor(address _router) Ownable(msg.sender) {
        router = Router(_router);
    }

    function executeIncrease(uint256 requestId) external {
        Router.Request memory viewReq = router.getRequest(requestId);
        Router.Request memory r = router.consumeIncrease(requestId, address(Market(viewReq.market).vault()), msg.sender);
        uint256 price = Market(r.market).getOraclePrice();
        if (r.isLong) {
            require(price <= r.acceptablePrice, "slip long");
        } else {
            require(price >= r.acceptablePrice, "slip short");
        }
        Market(r.market).increasePosition(r.user, r.positionId, r.sizeDelta, r.collateralDelta, r.isLong, price);
    }

    function executeDecrease(uint256 requestId) external {
        Router.Request memory r = router.consumeDecrease(requestId, msg.sender);
        uint256 price = Market(r.market).getOraclePrice();
        if (r.isLong) {
            require(price >= r.acceptablePrice, "slip long dec");
        } else {
            require(price <= r.acceptablePrice, "slip short dec");
        }
        Market(r.market).decreasePosition(r.user, r.positionId, r.sizeDelta, r.isLong, price);
    }

    function liquidate(address market, uint256 positionId) external {
        uint256 price = Market(market).getOraclePrice();
        Market(market).liquidate(positionId, price);
    }
}

