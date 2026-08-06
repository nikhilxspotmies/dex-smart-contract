// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../core/Market.sol";
import "./Router.sol";

/// @notice Keeper-facing executor for async requests.
contract PositionManager is Ownable {
    Router public immutable router;

    /// @notice Blocks that must elapse between a request being created and executed.
    /// The request/execute split only defends against oracle front-running if the
    /// execution price is unknowable at request time. With no delay a trader can
    /// request and execute in one transaction at a price they can already see -
    /// e.g. opening ahead of a pending Chainlink update and closing right after it,
    /// risk-free, at the LP vault's expense.
    uint256 public minExecutionDelayBlocks = 1;

    /// @notice Addresses permitted to execute requests and liquidations.
    /// The delay above is only meaningful if traders cannot self-execute: otherwise
    /// they still choose the block their order lands in.
    mapping(address => bool) public isKeeper;

    event KeeperSet(address indexed keeper, bool allowed);
    event MinExecutionDelaySet(uint256 blocks);

    error NotKeeper();
    error RequestNotFound();
    error TooSoon();

    modifier onlyKeeper() {
        if (!isKeeper[msg.sender]) revert NotKeeper();
        _;
    }

    constructor(address _router) Ownable(msg.sender) {
        router = Router(_router);
    }

    // ---- Admin ----

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        require(keeper != address(0), "zero keeper");
        isKeeper[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    /// @dev Floored at 1 block so the delay can never be configured away.
    function setMinExecutionDelayBlocks(uint256 blocks_) external onlyOwner {
        require(blocks_ >= 1, "delay too low");
        minExecutionDelayBlocks = blocks_;
        emit MinExecutionDelaySet(blocks_);
    }

    // ---- Execution ----

    function _requireExecutable(Router.Request memory r) internal view {
        if (!r.exists) revert RequestNotFound();
        if (block.number < r.blockNumber + minExecutionDelayBlocks) revert TooSoon();
    }

    function executeIncrease(uint256 requestId) external onlyKeeper {
        Router.Request memory viewReq = router.getRequest(requestId);
        _requireExecutable(viewReq);

        Router.Request memory r = router.consumeIncrease(requestId, address(Market(viewReq.market).vault()), msg.sender);
        uint256 price = Market(r.market).getOraclePrice();
        if (r.isLong) {
            require(price <= r.acceptablePrice, "slip long");
        } else {
            require(price >= r.acceptablePrice, "slip short");
        }
        Market(r.market).increasePosition(r.user, r.positionId, r.sizeDelta, r.collateralDelta, r.isLong, price);
    }

    function executeDecrease(uint256 requestId) external onlyKeeper {
        Router.Request memory viewReq = router.getRequest(requestId);
        _requireExecutable(viewReq);

        Router.Request memory r = router.consumeDecrease(requestId, msg.sender);
        uint256 price = Market(r.market).getOraclePrice();
        if (r.isLong) {
            require(price >= r.acceptablePrice, "slip long dec");
        } else {
            require(price <= r.acceptablePrice, "slip short dec");
        }
        Market(r.market).decreasePosition(r.user, r.positionId, r.sizeDelta, r.isLong, price);
    }

    /// @dev Keeper-gated for the same reason as execution: an unrestricted caller could
    /// front-run a pending oracle update to liquidate a position that the new price
    /// would have kept solvent. Margin is still checked inside Market.liquidate.
    function liquidate(address market, uint256 positionId) external onlyKeeper {
        uint256 price = Market(market).getOraclePrice();
        Market(market).liquidate(positionId, price);
    }
}
