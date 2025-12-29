// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IDexRouter {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts);
}

contract CopyTrading is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IDexRouter public immutable dexRouter;
    address public botAddress;

    // The Vault Bucket: Noob -> Whale -> Token -> Balance
    mapping(address => mapping(address => mapping(address => uint256))) public bucketBalances;
    
    // Whitelisted tokens (available in DEX liquidity pools)
    mapping(address => bool) public isWhitelisted;
    address[] public whitelistedTokens;

    event Subscribed(address indexed noob, address indexed whale, address token, uint256 amount);
    event BatchTradeExecuted(address indexed whale, address tokenIn, address tokenOut, uint256 totalAmountIn, uint256 totalAmountOut, uint256 noobsInBatch);
    event WithdrawnAll(address indexed noob, address indexed whale);
    event TokenWithdrawn(address indexed noob, address indexed whale, address token, uint256 amount);

    constructor(address _dexRouter, address _botAddress) Ownable(msg.sender) {
        dexRouter = IDexRouter(_dexRouter);
        botAddress = _botAddress;
    }

    modifier onlyBot() {
        require(msg.sender == botAddress || msg.sender == owner(), "Not authorized bot");
        _;
    }

    // --- Admin Functions ---

    function setBotAddress(address _botAddress) external onlyOwner {
        botAddress = _botAddress;
    }

    function addWhitelistedToken(address _token) external onlyOwner {
        require(!isWhitelisted[_token], "Already whitelisted");
        isWhitelisted[_token] = true;
        whitelistedTokens.push(_token);
        // Infinite move: Approve DEX Router once at whitelist time
        IERC20(_token).forceApprove(address(dexRouter), type(uint256).max);
    }

    // --- User (Noob) Functions ---

    /**
     * @notice Deposit a whitelisted token into a whale's bucket.
     * @param whale The address of the whale to copy.
     * @param token The token being deposited.
     * @param amount The amount to deposit.
     */
    function subscribe(address whale, address token, uint256 amount) external nonReentrant {
        require(isWhitelisted[token], "Token not whitelisted");
        require(amount > 0, "Amount must be > 0");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        bucketBalances[msg.sender][whale][token] += amount;

        emit Subscribed(msg.sender, whale, token, amount);
    }

    /**
     * @notice Withdraw everything from a whale's bucket.
     * @param whale The whale subscription to exit from.
     */
    function withdrawAll(address whale) external nonReentrant {
        for (uint256 i = 0; i < whitelistedTokens.length; i++) {
            address token = whitelistedTokens[i];
            uint256 balance = bucketBalances[msg.sender][whale][token];
            if (balance > 0) {
                bucketBalances[msg.sender][whale][token] = 0;
                IERC20(token).safeTransfer(msg.sender, balance);
                emit TokenWithdrawn(msg.sender, whale, token, balance);
            }
        }
        emit WithdrawnAll(msg.sender, whale);
    }

    // --- Bot Functions ---

    /**
     * @notice Executes a copy trade mirroring the bot's calculated target ratio.
     * @dev Bot provides the path (e.g. [USDC, ETH]) and the % of 'noobs' current tokenIn to sell.
     * @param whale The whale being followed.
     * @param noobs Subscribers to mirror for.
     * @param path The swap routing path (must provide at least 2 tokens).
     * @param percentageBasisPoints % of Noob's current tokenIn balance to sell (10000 = 100%).
     * @param slippageBasisPoints Tolerance (e.g. 100 = 1%).
     */
    function executeBatchCopyTrade(
        address whale,
        address[] calldata noobs,
        address[] calldata path,
        uint256 percentageBasisPoints,
        uint256 slippageBasisPoints
    ) external onlyBot nonReentrant {
        require(path.length >= 2, "Invalid swap path");
        require(percentageBasisPoints <= 10000, "Invalid percentage");
        
        address tokenIn = path[0];
        address tokenOut = path[path.length - 1];
        uint256 totalAmountIn = 0;
        uint256[] memory individualAmountsIn = new uint256[](noobs.length);

        // 1. Calculate total amount to swap and deduct from users
        for (uint256 i = 0; i < noobs.length; i++) {
            uint256 balance = bucketBalances[noobs[i]][whale][tokenIn];
            if (balance > 0) {
                uint256 amountToSwap = (balance * percentageBasisPoints) / 10000;
                if (amountToSwap > 0) {
                    bucketBalances[noobs[i]][whale][tokenIn] -= amountToSwap;
                    individualAmountsIn[i] = amountToSwap;
                    totalAmountIn += amountToSwap;
                }
            }
        }

        if (totalAmountIn == 0) return;

        // 2. Execute ONE BIG SWAP on DEX
        uint256 totalReceived = _swapOnDex(path, totalAmountIn, slippageBasisPoints);

        // 3. Distribute Received Tokens Proportionally
        for (uint256 i = 0; i < noobs.length; i++) {
            if (individualAmountsIn[i] > 0) {
                uint256 received = (totalReceived * individualAmountsIn[i]) / totalAmountIn;
                bucketBalances[noobs[i]][whale][tokenOut] += received;
            }
        }

        emit BatchTradeExecuted(whale, tokenIn, tokenOut, totalAmountIn, totalReceived, noobs.length);
    }

    // --- Internal Helpers ---

    function _swapOnDex(address[] memory path, uint256 amountIn, uint256 slippage) internal returns (uint256) {
        // Approval removed from here (moved to addWhitelistedToken)
        uint256 amountOutMin = 0;
        if (slippage > 0) {
            uint256[] memory expected = dexRouter.getAmountsOut(amountIn, path);
            amountOutMin = (expected[expected.length - 1] * (10000 - slippage)) / 10000;
        }

        uint256[] memory amounts = dexRouter.swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            address(this),
            block.timestamp + 600
        );

        return amounts[amounts.length - 1];
    }

    // --- View Functions ---

    function getBucketBalance(address noob, address whale, address token) external view returns (uint256) {
        return bucketBalances[noob][whale][token];
    }

    function getWhitelistedTokens() external view returns (address[] memory) {
        return whitelistedTokens;
    }
}
