// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MockOracle} from "../MockOracle.sol";

/**
 * @title Perpetual
 * @notice Simplified dYdX-style perpetual derivatives risk engine.
 * @dev Handles margin, positions, funding, and liquidations. 
 *      Matching is off-chain; settlement is on-chain.
 */
contract Perpetual is ReentrancyGuard {

    /*//////////////////////////////////////////////////////////////
                                TYPES
    //////////////////////////////////////////////////////////////*/

    struct Position {
        int256 size;              // Signed size. +Long, -Short. (1e18)
        uint256 entryPrice;       // Average entry price. (1e18)
        int256 lastFundingIndex; // The global funding index when this position was last touched
    }

    struct Account {
        int256 marginBalance;     // Collateral + Realized PnL. (1e18)
        Position position;
    }

    /*//////////////////////////////////////////////////////////////
                            CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint256 public constant ONE = 1e18;
    // Parameters
    uint256 public initialMarginRatio = 1e17; // 10%
    uint256 public maintenanceMarginRatio = 5e16;   // 5%
    uint256 public constant LIQUIDATION_FEE = 1e16;      // 1% reward

    /*//////////////////////////////////////////////////////////////
                            STORAGE
    //////////////////////////////////////////////////////////////*/

    IERC20 public immutable usdc;
    address public immutable operator;
    MockOracle public immutable oracle;
    address public immutable indexToken;

    // User State
    mapping(address => Account) public accounts;

    // Global State
    // MarkPrice is now fetched from Oracle dynamically
    // MarkPrice is now fetched from Oracle dynamically
    
    // Funding
    // Funding is a payment exchanged between longs and shorts.
    // Funding Index (longs pay shorts if positive).
    // Let's use dYdX style: Global Index accumulates funding per unit of size.
    int256 public fundingIndex;    
    int256 public fundingRate;     // Hourly or 8-hour rate? Let's say per second.
    uint256 public lastFundingTimestamp;

    /*//////////////////////////////////////////////////////////////
                            EVENTS
    //////////////////////////////////////////////////////////////*/

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event Trade(address indexed user, int256 sizeDelta, uint256 price, int256 realizedPnl);
    event FundingPayment(address indexed user, int256 fundingAmount);
    event Liquidation(address indexed user, address indexed liquidator, int256 sizeLiquidated, uint256 price);
    event PriceUpdated(uint256 newPrice);
    event FundingUpdated(int256 newIndex, int256 rate);
    event RiskConfigUpdated(uint256 imRatio, uint256 mmRatio);

    /*//////////////////////////////////////////////////////////////
                            MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier onlyOperator() {
        require(msg.sender == operator, "Only operator");
        _;
    }

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address _usdc, address _operator, address _oracle, address _indexToken) {
        usdc = IERC20(_usdc);
        operator = _operator;
        oracle = MockOracle(_oracle);
        indexToken = _indexToken;
        lastFundingTimestamp = block.timestamp;
    }

    /*//////////////////////////////////////////////////////////////
                        COLLATERAL OPERATIONS
    //////////////////////////////////////////////////////////////*/

    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        require(usdc.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        _settleFunding(msg.sender);

        // Convert 6 decimals to 18 decimals
        uint256 amount18 = amount * 1e12;
        accounts[msg.sender].marginBalance += int256(amount18);

        emit Deposit(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        _settleFunding(msg.sender);

        uint256 amount18 = amount * 1e12;
        Account storage acc = accounts[msg.sender];
        
        // Optimistically deduct
        acc.marginBalance -= int256(amount18);

        // Solvency check
        require(_isInitialMarginSafe(msg.sender), "IM violation");

        require(usdc.transfer(msg.sender, amount), "Transfer failed");        
        emit Withdraw(msg.sender, amount);
    }

    /*//////////////////////////////////////////////////////////////
                        TRADE & RISK ENGINE
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Execute a matched trade. Called by operator.
     * @param user The trader address.
     * @param sizeDelta Change in position size (+ buy, - sell). 1e18.
     * @param price Execution price. Determined by off-chain matching engine.
     */
    function trade(address user, int256 sizeDelta, uint256 price) external onlyOperator nonReentrant {
        _settleFunding(user);
        Account storage acc = accounts[user];
        Position storage pos = acc.position;

        int256 realizedPnl = 0;
        int256 nextSize = pos.size + sizeDelta;

        // 1. Determine if we are reducing risk (closing) or increasing/flipping
        // Simplified Logic: 
        // If signs match (or zero), we are opening.
        // If signs differ, we are closing.
        
        bool isLong = pos.size > 0;
        bool isShort = pos.size < 0;
        bool isBuy = sizeDelta > 0;
        bool isSell = sizeDelta < 0;

        if (pos.size == 0) {
            // New Position
            pos.size = sizeDelta;
            pos.entryPrice = price;
        } else if ((isLong && isBuy) || (isShort && isSell)) {
            // INCREASE SIZE (Averaging Up/Down)
            // New Entry = (OldSize * OldEntry + Delta * Price) / NewSize
            // Use absolute values for math
            uint256 oldSizeAbs = _abs(pos.size);
            uint256 deltaAbs = _abs(sizeDelta);
            uint256 totalVal = (oldSizeAbs * pos.entryPrice) + (deltaAbs * price);
            pos.entryPrice = totalVal / (oldSizeAbs + deltaAbs);
            pos.size = nextSize;
        } else {
            // DECREASE SIZE or FLIP
            // e.g. Long 10, Sell 5 -> Close 5
            // e.g. Long 10, Sell 15 -> Close 10, Open Short 5 at new price
            
            uint256 oldSizeAbs = _abs(pos.size); // 10
            uint256 deltaAbs = _abs(sizeDelta);   // 5 or 15

            if (deltaAbs <= oldSizeAbs) {
                // PARTIAL or FULL CLOSE
                // PnL = (Exit - Entry) * Qty (for Long)
                // PnL = (Entry - Exit) * Qty (for Short)
                // Long 10. Sell 2. delta = -2. 
                // PnL logic: (Price - Entry) * 2. 
                
                int256 qtyClosed = int256(deltaAbs);
                int256 priceDiff = int256(price) - int256(pos.entryPrice);
                
                if (isLong) {
                    realizedPnl = qtyClosed * priceDiff / int256(ONE);
                } else {
                    realizedPnl = qtyClosed * (-priceDiff) / int256(ONE);
                }

                pos.size = nextSize;
                // Entry price stays same for remaining portion
                if (nextSize == 0) pos.entryPrice = 0;

            } else {
                // FLIP
                // 1. Close entire old position
                // PnL on oldSizeAbs
                int256 priceDiff = int256(price) - int256(pos.entryPrice);
                if (isLong) {
                    realizedPnl = pos.size * priceDiff / int256(ONE); // pos.size is +
                } else {
                    realizedPnl = pos.size * priceDiff / int256(ONE); // pos.size is -, result corrects itself?
                    // Short: (Entry - Price) * SizeAbs
                    // Formula: Size * (Price - Entry)
                    // If Size = -10, Price=100, Entry=110. Diff=-10. -10 * -10 = +100. Correct.
                }

                // 2. Open new position for (Delta - OldSize)
                // New size = nextSize
                // New Entry = Price
                pos.size = nextSize;
                pos.entryPrice = price;
            }
        }

        acc.marginBalance += realizedPnl;

        require(_isInitialMarginSafe(user), "IM violation");
        
        emit Trade(user, sizeDelta, price, realizedPnl);
    }

    /*//////////////////////////////////////////////////////////////
                            FUNDING
    //////////////////////////////////////////////////////////////*/

    function updateIndex(int256 rate) external onlyOperator {
        // Calculate accrued funding since last update
        uint256 timeDelta = block.timestamp - lastFundingTimestamp;
        if (timeDelta > 0) {
            // fundingIndex += rate * timeDelta
            // Simplification: index is just cumulative
            fundingIndex += rate * int256(timeDelta);
            lastFundingTimestamp = block.timestamp;
            fundingRate = rate;
            emit FundingUpdated(fundingIndex, rate);
        }
    }
    
    // Manual helper to force index update using existing rate
    function accrueFunding() public {
        uint256 timeDelta = block.timestamp - lastFundingTimestamp;
        if (timeDelta > 0 && fundingRate != 0) {
             fundingIndex += fundingRate * int256(timeDelta);
             lastFundingTimestamp = block.timestamp;
        }
    }

    function _settleFunding(address user) internal {
        accrueFunding(); // Update global index first

        Account storage acc = accounts[user];
        Position storage pos = acc.position;
        
        if (pos.size == 0) {
            pos.lastFundingIndex = fundingIndex; // Sync if empty
            return;
        }

        int256 diff = fundingIndex - pos.lastFundingIndex;
        if (diff != 0) {
           // Funding Payment = Size * (IndexDiff)
           // If Size > 0 (Long) and Index went up (Longs pay Shorts), payment is Positive (Debit from Long).
           // Wait. dYdX: "Funding is paid BY Longs TO Shorts if Rate is Positive".
           // Payment = Size * Rate. 
           // If I hold +1 Long. Rate is +1. I pay 1.
           // My Balance should DECREASE.
           
           // Formula: Payment = Size * Diff.
           // +1 * +1 = +1. 
           // Balance -= Payment.
           
           // If I hold -1 Short. Rate is +1.
           // -1 * +1 = -1.
           // Balance -= (-1) => Balance += 1. (Short receives). Correct.
           
           int256 payment = (pos.size * diff) / int256(ONE);
           acc.marginBalance -= payment;
           pos.lastFundingIndex = fundingIndex;
           
           emit FundingPayment(user, payment);
        }
    }

    /*//////////////////////////////////////////////////////////////
                        LIQUIDATION
    //////////////////////////////////////////////////////////////*/

    function liquidate(address user, address liquidator) external onlyOperator {
        _settleFunding(user);
        
        require(!_isMaintenanceMarginSafe(user), "Position healthy"); // Position must be unhealthy to liquidate
        
        Account storage acc = accounts[user];
        Position storage pos = acc.position;

        // Full liquidation: Liquidator takes entire position
        // PnL realization happens implicitly by transferring the position?
        // No, we need to close the position against the Liquidator (or Insurance Fund).
        // Here, Operator passes `liquidator` who presumably takes the position.
        // BUT `liquidator` needs to have margin?
        // Let's assume simple model: Close position at Oracle Price. 
        // Any remaining margin goes to user? Or seized?
        // "Losses capped by collateral".
        
        // Logic:
        // 1. Calculate value of position at Oracle Price.
        // 2. Liquidator takes position.
        // 3. User pays fee.
        
        // Easier: Just close it at Oracle Price - Penalty.
        // User Balance += PnL(OraclePrice).
        // User Balance -= Penalty.
        // If Balance < 0, set to 0 (Insurance fund absorbs, logic omitted for simplicity).
        
        // If Balance < 0, set to 0 (Insurance fund absorbs, logic omitted for simplicity).
        
        uint256 markPrice = getMarkPrice();
        int256 mark = int256(markPrice);
        
        // PnL from Entry
        // (Mark - Entry) * Size
        int256 priceDiff = mark - int256(pos.entryPrice);
        int256 pnl = (pos.size * priceDiff) / int256(ONE);
        
        acc.marginBalance += pnl;
        
        // Apply Penalty
        uint256 positionNotional = _abs(pos.size) * markPrice / ONE;
        uint256 penalty = positionNotional * LIQUIDATION_FEE / ONE;
        acc.marginBalance -= int256(penalty);
        
        // Reset Position
        int256 sizeLiquidated = pos.size;
        pos.size = 0;
        pos.entryPrice = 0;
        
        // If balance negative, set to 0? default to bad debt.
        
        emit Liquidation(user, liquidator, sizeLiquidated, markPrice);
    }
    
    function getMarkPrice() public view returns (uint256) {
        return oracle.getPrice(indexToken);
    }
    
    /**
     * @notice Update risk parameters.
     * @dev Allows adjusting max leverage (1 / IM).
     */
    function setRiskConfig(uint256 _imRatio, uint256 _mmRatio) external onlyOperator {
        require(_imRatio > _mmRatio, "IM must be > MM");
        initialMarginRatio = _imRatio;
        maintenanceMarginRatio = _mmRatio;
        emit RiskConfigUpdated(_imRatio, _mmRatio);
    }

    /*//////////////////////////////////////////////////////////////
                        VIEW / RISK
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Returns the current account leverage.
     * @dev Leverage = Notional / Equity.
     */
    function getAccountLeverage(address user) external view returns (uint256) {
         Account storage acc = accounts[user];
         if (acc.position.size == 0) return 0;
         
         uint256 markPrice = getMarkPrice();
         uint256 notional = (_abs(acc.position.size) * markPrice) / ONE;
         
         // Equity calculation duplicated for view (refactor potential)
         int256 mark = int256(markPrice);
         int256 priceDiff = mark - int256(acc.position.entryPrice);
         int256 upnl = (acc.position.size * priceDiff) / int256(ONE);
         int256 equity = acc.marginBalance + upnl;
         
         if (equity <= 0) return type(uint256).max; // Infinite leverage if insolvent/zero equity
         
         return (notional * ONE) / uint256(equity);
    }
    
    function getMarginRatio(address user) public view returns (int256) {
        Account storage acc = accounts[user];
        if (acc.position.size == 0) return type(int256).max;

        // Equity = MarginBalance + UnrealizedPnL
        // UnrealizedPnL = Size * (Mark - Entry)
        uint256 markPrice = getMarkPrice();
        int256 mark = int256(markPrice);
        int256 priceDiff = mark - int256(acc.position.entryPrice);
        int256 upnl = (acc.position.size * priceDiff) / int256(ONE);
        
        int256 equity = acc.marginBalance + upnl;
        
        // Notional = Size * Mark
        uint256 notional = (_abs(acc.position.size) * markPrice) / ONE;
        if (notional == 0) return type(int256).max; // Should not happen if size != 0

        // Ratio = Equity / Notional
        return (equity * int256(ONE)) / int256(notional);
    }

    function _isInitialMarginSafe(address user) internal view returns (bool) {
        int256 ratio = getMarginRatio(user);
        return ratio >= int256(initialMarginRatio);
    }

    function _isMaintenanceMarginSafe(address user) internal view returns (bool) {
         int256 ratio = getMarginRatio(user);
        return ratio >= int256(maintenanceMarginRatio);       
    }

    function _abs(int256 x) internal pure returns (uint256) {
        return uint256(x >= 0 ? x : -x);
    }

    /*//////////////////////////////////////////////////////////////
                        ACCOUNT SUMMARY VIEW
    //////////////////////////////////////////////////////////////*/

    struct AccountSummary {
        int256 marginBalance;
        int256 size;
        uint256 entryPrice;
        int256 unrealizedPnl;
        int256 marginRatio;
        uint256 leverage;
    }

    /**
     * @notice Get complete account summary in one call for frontend efficiency
     * @param user The account address
     * @return summary Account summary struct with all relevant data
     */
    function getAccountSummary(address user) external view returns (AccountSummary memory summary) {
        Account storage acc = accounts[user];
        Position storage pos = acc.position;
        
        summary.marginBalance = acc.marginBalance;
        summary.size = pos.size;
        summary.entryPrice = pos.entryPrice;

        if (pos.size == 0) {
            summary.unrealizedPnl = 0;
            summary.marginRatio = type(int256).max;
            summary.leverage = 0;
            return summary;
        }

        // Calculate unrealized PnL
        uint256 markPrice = getMarkPrice();
        int256 mark = int256(markPrice);
        int256 priceDiff = mark - int256(pos.entryPrice);
        summary.unrealizedPnl = (pos.size * priceDiff) / int256(ONE);

        // Calculate equity
        int256 equity = acc.marginBalance + summary.unrealizedPnl;

        // Calculate margin ratio
        uint256 notional = (_abs(pos.size) * markPrice) / ONE;
        if (notional == 0) {
            summary.marginRatio = type(int256).max;
            summary.leverage = 0;
            return summary;
        }
        summary.marginRatio = (equity * int256(ONE)) / int256(notional);

        // Calculate leverage
        if (equity <= 0) {
            summary.leverage = type(uint256).max;
        } else {
            summary.leverage = (notional * ONE) / uint256(equity);
        }
    }
}
