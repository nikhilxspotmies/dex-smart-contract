// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Stores user requests for async execution.
contract Router is Ownable {
    using SafeERC20 for IERC20;

    struct Request {
        address user;
        address market;
        uint256 sizeDelta; // 1e18
        uint256 collateralDelta; // 6d
        bool isLong;
        uint256 acceptablePrice; // 1e18
        uint256 executionFee; // in USDC (6d)
        bool isIncrease;
        bool exists;
    }

    IERC20 public immutable quote; // USDC
    address public positionManager;
    uint256 public nextRequestId = 1;
    mapping(uint256 => Request) public requests;

    event RequestCreated(uint256 indexed id, address indexed user, address indexed market, bool isIncrease);
    event RequestCancelled(uint256 indexed id, address indexed user);

    modifier onlyPM() {
        require(msg.sender == positionManager, "not pm");
        _;
    }

    constructor(address _quote) Ownable(msg.sender) {
        quote = IERC20(_quote);
    }

    function setPositionManager(address pm) external onlyOwner {
        positionManager = pm;
    }

    function createIncreaseRequest(
        address market,
        uint256 sizeDelta,
        uint256 collateralDelta,
        bool isLong,
        uint256 acceptablePrice,
        uint256 executionFee
    ) external returns (uint256 id) {
        require(collateralDelta > 0, "collat=0");
        id = nextRequestId++;
        requests[id] = Request({
            user: msg.sender,
            market: market,
            sizeDelta: sizeDelta,
            collateralDelta: collateralDelta,
            isLong: isLong,
            acceptablePrice: acceptablePrice,
            executionFee: executionFee,
            isIncrease: true,
            exists: true
        });

        uint256 total = collateralDelta + executionFee;
        quote.safeTransferFrom(msg.sender, address(this), total);
        emit RequestCreated(id, msg.sender, market, true);
    }

    function createDecreaseRequest(
        address market,
        uint256 sizeDelta,
        bool isLong,
        uint256 acceptablePrice,
        uint256 executionFee
    ) external returns (uint256 id) {
        id = nextRequestId++;
        requests[id] = Request({
            user: msg.sender,
            market: market,
            sizeDelta: sizeDelta,
            collateralDelta: 0,
            isLong: isLong,
            acceptablePrice: acceptablePrice,
            executionFee: executionFee,
            isIncrease: false,
            exists: true
        });
        if (executionFee > 0) {
            quote.safeTransferFrom(msg.sender, address(this), executionFee);
        }
        emit RequestCreated(id, msg.sender, market, false);
    }

    /// @notice PositionManager consumes an increase request and moves funds.
    function consumeIncrease(uint256 id, address vault, address executor) external onlyPM returns (Request memory r) {
        r = requests[id];
        require(r.exists && r.isIncrease, "bad req");
        delete requests[id];

        if (r.collateralDelta > 0) {
            quote.safeTransfer(vault, r.collateralDelta);
        }
        if (r.executionFee > 0 && executor != address(0)) {
            quote.safeTransfer(executor, r.executionFee);
        }
    }

    /// @notice PositionManager consumes a decrease request and pays executor fee.
    function consumeDecrease(uint256 id, address executor) external onlyPM returns (Request memory r) {
        r = requests[id];
        require(r.exists && !r.isIncrease, "bad req");
        delete requests[id];
        if (r.executionFee > 0 && executor != address(0)) {
            quote.safeTransfer(executor, r.executionFee);
        }
    }

    function cancel(uint256 id) external {
        Request memory r = requests[id];
        require(r.exists, "no req");
        require(r.user == msg.sender, "not owner");
        delete requests[id];
        uint256 refund = r.collateralDelta + r.executionFee;
        if (refund > 0) quote.safeTransfer(msg.sender, refund);
        emit RequestCancelled(id, msg.sender);
    }

    function getRequest(uint256 id) external view returns (Request memory) {
        return requests[id];
    }
}

