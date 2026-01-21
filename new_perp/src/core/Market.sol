// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./Vault.sol";
import "../oracle/OracleModule.sol";

/// @notice Isolated perpetual market (peer-to-pool).
contract Market is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    struct Position {
        uint256 size; // USD notionals in 1e18
        uint256 collateral; // USDC 6d
        uint256 entryPrice; // 1e18
        int256 fundingEntry; // funding snapshot
        bool isLong;
    }

    string public baseSymbol; // e.g., "ETH"
    IERC20 public immutable quote; // USDC (6d)
    Vault public immutable vault;
    OracleModule public immutable oracle;
    address public immutable priceFeed; // chainlink feed

    uint256 public constant WAD = 1e18;
    uint256 public constant USDC_DECIMALS = 6;
    uint256 public constant FEE_BPS = 10; // 0.1%
    uint256 public constant BPS_DIV = 10_000;
    uint256 public constant MAINT_MARGIN_BPS = 500; // 5%
    uint256 public constant FUNDING_RATE_FACTOR = 1e11; // ~0.0001% per second (1e18 scale)

    uint256 public maxOpenInterestLong = 10_000_000 * WAD; // 10m notionals
    uint256 public maxOpenInterestShort = 10_000_000 * WAD;

    uint256 public oiLong;
    uint256 public oiShort;

    // Aggregate average entry prices (1e18) for solvency estimation
    uint256 public avgEntryLongPrice;
    uint256 public avgEntryShortPrice;

    int256 public cumulativeFundingLong;
    int256 public cumulativeFundingShort;
    uint256 public lastFundingTime;

    address public positionManager; // executor authority

    mapping(address => Position) public positions;

    event PositionIncreased(address indexed user, bool isLong, uint256 size, uint256 collateral, uint256 price);
    event PositionDecreased(address indexed user, bool isLong, uint256 size, uint256 collateral, uint256 price, int256 pnl);
    event Liquidated(address indexed user, bool isLong, uint256 size, uint256 collateral, uint256 price, int256 pnl);
    event FundingUpdated(int256 cumulativeLong, int256 cumulativeShort);

    constructor(
        string memory _baseSymbol,
        address _quote,
        address _vault,
        address _oracle,
        address _priceFeed,
        address _owner
    ) {
        baseSymbol = _baseSymbol;
        quote = IERC20(_quote);
        vault = Vault(_vault);
        oracle = OracleModule(_oracle);
        priceFeed = _priceFeed;
        _transferOwnership(_owner);
        lastFundingTime = block.timestamp;
    }

    modifier onlyPM() {
        require(msg.sender == positionManager, "not pm");
        _;
    }

    // ---- Views ----

    function getOraclePrice() public view returns (uint256) {
        return oracle.getPrice(priceFeed); // 1e18
    }

    /// @notice Returns positive unrealized profits that the vault must keep (approx, aggregate).
    /// Converts to USDC (6d).
    function unrealizedProfits() external view returns (uint256) {
        uint256 price = getOraclePrice();
        uint256 longPnl;
        if (oiLong > 0 && price > avgEntryLongPrice && avgEntryLongPrice > 0) {
            longPnl = (oiLong * (price - avgEntryLongPrice)) / avgEntryLongPrice; // 1e18
        }
        uint256 shortPnl;
        if (oiShort > 0 && price < avgEntryShortPrice && avgEntryShortPrice > 0) {
            shortPnl = (oiShort * (avgEntryShortPrice - price)) / avgEntryShortPrice; // 1e18
        }
        uint256 totalUsd = longPnl + shortPnl; // 1e18
        return _usdToUsdc(totalUsd);
    }

    // ---- Core logic ----

    function _updateFunding(uint256 price) internal {
        uint256 dt = block.timestamp - lastFundingTime;
        if (dt == 0) return;
        lastFundingTime = block.timestamp;

        // funding = (oiLong - oiShort) / max(oiTotal,1) * factor * dt
        uint256 oiTotal = oiLong + oiShort;
        if (oiTotal == 0) return;

        int256 imbalance = int256(oiLong) - int256(oiShort);
        int256 fundingDelta = (imbalance * int256(FUNDING_RATE_FACTOR) * int256(dt)) / int256(oiTotal);

        // Long pays positive delta to short, and vice versa
        cumulativeFundingLong += fundingDelta;
        cumulativeFundingShort -= fundingDelta;
        emit FundingUpdated(cumulativeFundingLong, cumulativeFundingShort);
    }

    function increasePosition(
        address user,
        uint256 sizeDelta, // 1e18 USD notionals
        uint256 collateralDelta, // 6d (already transferred to vault by router/pm)
        bool isLong,
        uint256 price // 1e18
    ) external nonReentrant onlyPM {
        _updateFunding(price);

        Position storage p = positions[user];
        if (p.size > 0 && p.isLong != isLong) {
            revert("side change");
        }

        uint256 feeUsd = (sizeDelta * FEE_BPS) / BPS_DIV;
        uint256 feeUsdc = _usdToUsdc(feeUsd);
        require(collateralDelta > feeUsdc, "collat<fee");
        uint256 collateralNet = collateralDelta - feeUsdc;

        p.collateral += collateralNet;

        // OI caps and average entry tracking
        if (isLong) {
            uint256 prevOi = oiLong;
            uint256 newOi = oiLong + sizeDelta;
            require(newOi <= maxOpenInterestLong, "oi long cap");
            oiLong = newOi;
            if (newOi > 0) {
                if (prevOi == 0) {
                    avgEntryLongPrice = price;
                } else {
                    avgEntryLongPrice = (avgEntryLongPrice * prevOi + price * sizeDelta) / newOi;
                }
            }
        } else {
            uint256 prevOi = oiShort;
            uint256 newOi = oiShort + sizeDelta;
            require(newOi <= maxOpenInterestShort, "oi short cap");
            oiShort = newOi;
            if (newOi > 0) {
                if (prevOi == 0) {
                    avgEntryShortPrice = price;
                } else {
                    avgEntryShortPrice = (avgEntryShortPrice * prevOi + price * sizeDelta) / newOi;
                }
            }
        }

        // Weighted avg entry price per position
        if (p.size == 0) {
            p.entryPrice = price;
            p.isLong = isLong;
            p.fundingEntry = isLong ? cumulativeFundingLong : cumulativeFundingShort;
            p.size = sizeDelta;
        } else {
            uint256 newSize = p.size + sizeDelta;
            p.entryPrice = (p.entryPrice * p.size + price * sizeDelta) / newSize;
            p.fundingEntry = isLong ? cumulativeFundingLong : cumulativeFundingShort;
            p.size = newSize;
        }

        emit PositionIncreased(user, isLong, p.size, p.collateral, price);
    }

    function decreasePosition(
        address user,
        uint256 sizeDelta,
        bool isLong,
        uint256 price
    ) external nonReentrant onlyPM {
        _updateFunding(price);

        Position storage p = positions[user];
        require(p.size >= sizeDelta && p.size > 0, "size too big");
        require(p.isLong == isLong, "side mismatch");

        // Compute PnL
        int256 pnl = _calculatePnl(p, sizeDelta, price);

        // Funding payment
        int256 fundingPnl = _fundingPnl(p, sizeDelta, isLong);
        pnl += fundingPnl;

        // Fees (charged on notional reduced)
        uint256 feeUsd = (sizeDelta * FEE_BPS) / BPS_DIV;
        uint256 feeUsdc = _usdToUsdc(feeUsd);

        // proportional collateral to return
        uint256 collateralPortion = (p.collateral * sizeDelta) / p.size;

        // Update position
        p.size -= sizeDelta;
        if (p.size == 0) {
            p.collateral = 0;
            p.entryPrice = 0;
        } else {
            p.collateral -= collateralPortion;
        }

        uint256 userReturnUsdc = 0;
        if (pnl >= 0) {
            uint256 profitUsdc = _usdToUsdc(uint256(pnl));
            userReturnUsdc = profitUsdc + collateralPortion;
        } else {
            uint256 lossUsd = uint256(-pnl);
            uint256 lossUsdc = _usdToUsdc(lossUsd);
            if (lossUsdc >= collateralPortion) {
                userReturnUsdc = 0;
            } else {
                userReturnUsdc = collateralPortion - lossUsdc;
            }
        }

        // deduct fee from userReturn, fee stays in vault (already there)
        if (userReturnUsdc > feeUsdc) {
            userReturnUsdc -= feeUsdc;
        } else {
            userReturnUsdc = 0;
        }

        if (userReturnUsdc > 0) {
            vault.pull(user, userReturnUsdc);
        }

        emit PositionDecreased(user, isLong, sizeDelta, p.collateral, price, pnl);

        // reduce OI
        if (isLong) {
            oiLong -= sizeDelta;
        } else {
            oiShort -= sizeDelta;
        }
    }

    function liquidate(address user, uint256 price) external nonReentrant onlyPM {
        Position storage p = positions[user];
        require(p.size > 0, "no pos");
        _updateFunding(price);

        // Check maintenance margin
        int256 pnl = _calculatePnl(p, p.size, price);
        int256 fundingPnl = _fundingPnl(p, p.size, p.isLong);
        pnl += fundingPnl;

        uint256 notional = p.size; // USD 1e18
        uint256 mmRequirement = (notional * MAINT_MARGIN_BPS) / BPS_DIV; // 1e18
        uint256 mmUsdc = _usdToUsdc(mmRequirement);

        uint256 collateralPlusPnl;
        if (pnl >= 0) {
            collateralPlusPnl = p.collateral + _usdToUsdc(uint256(pnl));
        } else {
            uint256 lossUsdc = _usdToUsdc(uint256(-pnl));
            if (lossUsdc >= p.collateral) {
                collateralPlusPnl = 0;
            } else {
                collateralPlusPnl = p.collateral - lossUsdc;
            }
        }
        require(collateralPlusPnl < mmUsdc, "healthy");

        emit Liquidated(user, p.isLong, p.size, p.collateral, price, pnl);

        // adjust OI
        if (p.isLong) {
            oiLong -= p.size;
        } else {
            oiShort -= p.size;
        }
        delete positions[user];
    }

    // ---- Internal math ----

    function _calculatePnl(Position memory p, uint256 sizeDelta, uint256 price) internal pure returns (int256) {
        // PnL = size * (price - entry) / entry
        int256 priceDiff = int256(price) - int256(p.entryPrice);
        int256 pnl = (int256(sizeDelta) * priceDiff) / int256(p.entryPrice);
        if (!p.isLong) {
            pnl = -pnl;
        }
        return pnl;
    }

    function _fundingPnl(Position memory p, uint256 sizeDelta, bool isLong) internal view returns (int256) {
        int256 cumulative = isLong ? cumulativeFundingLong : cumulativeFundingShort;
        int256 entry = p.fundingEntry;
        int256 diff = cumulative - entry;
        return (int256(sizeDelta) * diff) / int256(WAD);
    }

    function _usdToUsdc(uint256 usdWad) internal pure returns (uint256) {
        // usdWad is 1e18, USDC 1e6 => divide by 1e12
        return usdWad / 1e12;
    }

    // Admin setters
    function setMaxOI(uint256 longCap, uint256 shortCap) external onlyOwner {
        maxOpenInterestLong = longCap;
        maxOpenInterestShort = shortCap;
    }

    function setPositionManager(address pm) external onlyOwner {
        positionManager = pm;
    }
}


