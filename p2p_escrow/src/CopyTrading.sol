// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ISwapRouter {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts);
}

contract CopyTrading {
    using SafeERC20 for IERC20;

    // Mapping from Whale Address -> List of Subscriber Addresses
    mapping(address => address[]) public whaleSubscribers;
    
    // Quick lookup to check if a user is already subscribed to a whale
    mapping(address => mapping(address => bool)) public isSubscribed;

    // Mapping from Noob -> Whale -> Percentage (in Basis Points: 100 = 1%)
    // This determines how much of the Noob's locked balance to use per trade.
    mapping(address => mapping(address => uint256)) public copyPercentage;

    // Mapping from Noob -> Whale -> Locked Amount
    // This tracks the collateral the user has deposited specifically for copying this whale.
    mapping(address => mapping(address => uint256)) public noobAmountToWhaleAddr;

    address public allowedContract;  // The contract/bot allowed to trigger copy trades
    IERC20 public token;             // The base token used for trading (e.g., USDC/USDT)
    address public swapContract;     // The DEX Router address

    event Subscribed(address indexed noob, address indexed whale, uint256 amount, uint256 percentage);
    event CopyTradeExecuted(address indexed whale, address indexed noob, uint256 amountIn, uint256 amountOut);

    constructor(address _token, address _allowedContract, address _swapContract) {
        allowedContract = _allowedContract;
        token = IERC20(_token);
        swapContract = _swapContract;
    }

    modifier onlyAllowedContract() {
        require(msg.sender == allowedContract, "Not authorized");
        _;
    }

    /**
     * @notice Helper to get the number of subscribers for a whale to help with batching
     */
    function getSubscriberCount(address whale) external view returns (uint256) {
        return whaleSubscribers[whale].length;
    }

    /**
     * @notice User subscribes to a whale, deposits funds, and sets a copy percentage.
     * @param whaleAddr The address of the whale to copy.
     * @param amount The amount of tokens to lock for copy trading.
     * @param percentageBasisPoints The % of locked balance to use per trade (100 = 1%, 10000 = 100%).
     */
    function noobSubscribeToWhale(address whaleAddr, uint256 amount, uint256 percentageBasisPoints) public {
        require(amount > 0, "Amount must be > 0");
        require(percentageBasisPoints > 0 && percentageBasisPoints <= 10000, "Invalid percentage");
        require(!isSubscribed[msg.sender][whaleAddr], "Already subscribed");

        address noob = msg.sender;

        // Transfer tokens from user to contract
        token.safeTransferFrom(noob, address(this), amount);

        // Update state
        noobAmountToWhaleAddr[noob][whaleAddr] += amount;
        copyPercentage[noob][whaleAddr] = percentageBasisPoints;
        
        whaleSubscribers[whaleAddr].push(noob);
        isSubscribed[noob][whaleAddr] = true;

        emit Subscribed(noob, whaleAddr, amount, percentageBasisPoints);
    }

    /**
     * @notice Admin/Bot triggers copy trades for a batch of subscribers.
     * @param whaleAddr The whale who just traded.
     * @param path The swap path (e.g., [USDC, ETH]).
     * @param startIndex Start index for the batch loop.
     * @param endIndex End index for the batch loop (exclusive).
     * @param slippageBasisPoints Slippage tolerance (e.g., 100 = 1%).
     * @param deadline Transaction deadline.
     */
    function copyTradeOfWhale(
        address whaleAddr,
        address[] calldata path,
        uint256 startIndex,
        uint256 endIndex,
        uint256 slippageBasisPoints,
        uint deadline
    ) public onlyAllowedContract {
        require(endIndex <= whaleSubscribers[whaleAddr].length, "Index out of bounds");
        require(startIndex < endIndex, "Invalid range");

        for (uint i = startIndex; i < endIndex; i++) {
            address noob = whaleSubscribers[whaleAddr][i];
            
            // Skip logic if user ran out of funds or withdrew
            uint256 availableBalance = noobAmountToWhaleAddr[noob][whaleAddr];
            if (availableBalance == 0) continue;

            uint256 percentage = copyPercentage[noob][whaleAddr];
            uint256 amountIn = (availableBalance * percentage) / 10000;

            if (amountIn == 0) continue; // Too small to trade

            // Calculate expected output with slippage protection
            // We use a try/catch approach or check beforehand? 
            // For gas efficiency in this loop, we assume the pool has liquidity. 
            // If getAmountsOut reverts, the whole batch reverts. This is expected behavior for safety.
            uint[] memory expectedOuts = ISwapRouter(swapContract).getAmountsOut(amountIn, path);
            uint expectedOut = expectedOuts[expectedOuts.length - 1];
            uint amountOutMin = (expectedOut * (10000 - slippageBasisPoints)) / 10000;

            // Approve Router
            token.forceApprove(swapContract, amountIn);

            // Execute Swap
            // Tokens are sent directly to the Noob's wallet, NOT back to the contract.
            // This means the 'compounding' effect is not active; only the initial principal is used.
            try ISwapRouter(swapContract).swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                path,
                noob, // Send output tokens to Noob
                deadline
            ) returns (uint[] memory amounts) {
                // Deduct only after successful swap
                noobAmountToWhaleAddr[noob][whaleAddr] -= amountIn;
                emit CopyTradeExecuted(whaleAddr, noob, amountIn, amounts[amounts.length - 1]);
            } catch {
                // If a single swap fails (e.g. slippage), we continue to the next user
                // This prevents one user's failure from blocking others
            }
        }
    }

    // Function to withdraw unused funds
    function withdraw(address whaleAddr) public {
        uint256 amount = noobAmountToWhaleAddr[msg.sender][whaleAddr];
        require(amount > 0, "No funds");
        
        noobAmountToWhaleAddr[msg.sender][whaleAddr] = 0;
        // Note: We don't remove from subscribers array to avoid gas costs of shifting; 
        // logic handles 0 balance gracefully.
        
        token.safeTransfer(msg.sender, amount);
    }
}