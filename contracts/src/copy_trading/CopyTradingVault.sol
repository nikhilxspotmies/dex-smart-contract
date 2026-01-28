// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/**
 * @title CopyTradingVault (Logic Implementation)
 * @notice Simplified vault logic designed to be used with Clones.
 * @dev One-Vault-Per-User architecture. No internal accounting needed.
 */
contract CopyTradingVault is Ownable, ReentrancyGuard, Initializable {
    using SafeERC20 for IERC20;

    // --- Structs ---
    struct SwapData { 
        address tokenIn; 
        address tokenOut; 
        uint256 amountIn; 
        uint256 minAmountOut; 
        bytes data; 
    }

    // --- State Variables ---
    
    // Configuration
    address public executor;
    address public swapRouter;
    address public targetWhale;
    
    // --- Events ---
    event Deposited(address indexed token, uint256 amount);
    event Withdrawn(address indexed token, uint256 amount);
    event Swapped(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event TargetWhaleUpdated(address indexed newWhale);
    event ExecutorUpdated(address newExecutor);
    event SwapRouterUpdated(address newRouter);

    // --- Constructor / Initializer ---
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() Ownable(address(0)) {
        _disableInitializers();
    }

    /**
     * @notice Initializes the clone. Replaces constructor.
     * @param _owner The user who owns this vault.
     * @param _executor The backend bot address.
     * @param _swapRouter The DEX router address.
     */
    function initialize(
        address _owner,
        address _executor,
        address _swapRouter
    ) external initializer {
        // Initialize Ownable manually since we can't call super constructor in initialize
        _transferOwnership(_owner);
        
        require(_executor != address(0), "Invalid executor");
        require(_swapRouter != address(0), "Invalid router");

        executor = _executor;
        swapRouter = _swapRouter;
    }

    // --- Modifiers ---
    modifier onlyExecutor() {
        require(msg.sender == executor, "Caller is not the executor");
        _;
    }

    // --- Core User Functions ---

    /**
     * @notice Set the target whale to copy.
     */
    function setTargetWhale(address _whale) external onlyOwner {
        targetWhale = _whale;
        emit TargetWhaleUpdated(_whale);
    }

    /**
     * @notice Deposit funds and optionally execute immediate swaps.
     * @dev Users can also just transfer ERC20 tokens directly to this address.
     */
    function depositAndSwap(
        address tokenIn,
        uint256 amountIn,
        SwapData[] calldata immediateSwaps
    ) external nonReentrant {
        require(amountIn > 0, "Amount must be > 0");
        
        // 1. Pull tokens from user (if this function is called)
        // Note: If user sent tokens directly, they skip this and just call manual trade or wait for executor.
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        emit Deposited(tokenIn, amountIn);

        // 2. Immediate Execution
        if (immediateSwaps.length > 0) {
            _executeSwaps(immediateSwaps);
        }
    }

    /**
     * @notice Withdraw funds from the vault.
     * @dev Only the owner (User) can call this.
     */
    function withdraw(address token, uint256 amount) external nonReentrant onlyOwner {
        require(amount > 0, "Amount must be > 0");
        
        uint256 currentBalance = IERC20(token).balanceOf(address(this));
        require(currentBalance >= amount, "Insufficient balance");

        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(token, amount);
    }

    /**
     * @notice Withdraw ALL funds of a specific token.
     */
    function withdrawAll(address token) external nonReentrant onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No funds to withdraw");
        
        IERC20(token).safeTransfer(msg.sender, balance);
        emit Withdrawn(token, balance);
    }

    // --- Executor Functions ---

    /**
     * @notice Called by the off-chain bot to rebalance the portfolio.
     */
    function rebalance(
        SwapData[] calldata swaps
    ) external nonReentrant onlyExecutor {
        // Validation handled in _executeSwaps
        _executeSwaps(swaps);
    }

    // --- Internal Logic ---

    function _executeSwaps(SwapData[] calldata swaps) internal {
        for (uint256 i = 0; i < swaps.length; i++) {
            SwapData memory swap = swaps[i];

            // 1. Validation
            // We use physical balance check instead of internal ledger
            uint256 balanceIn = IERC20(swap.tokenIn).balanceOf(address(this));
            require(balanceIn >= swap.amountIn, "Insufficient balance for swap");

            // 2. Execute Swap on Router
            uint256 netAmountReceived = _performSwapCall(swap.tokenIn, swap.tokenOut, swap.amountIn, swap.data);

            // 3. Slippage Check
            require(netAmountReceived >= swap.minAmountOut, "Slippage tolerance exceeded");

            emit Swapped(swap.tokenIn, swap.tokenOut, swap.amountIn, netAmountReceived);
        }
    }

    function _performSwapCall(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes memory data
    ) internal returns (uint256) {
        // Approve Router
        IERC20(tokenIn).forceApprove(swapRouter, amountIn);

        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));

        // Execute
        (bool success, bytes memory returnData) = swapRouter.call(data);
        if (!success) {
            if (returnData.length > 0) {
                assembly {
                    let returndata_size := mload(returnData)
                    revert(add(32, returnData), returndata_size)
                }
            } else {
                revert("Swap execution failed");
            }
        }

        uint256 balanceAfter = IERC20(tokenOut).balanceOf(address(this));
        
        // Reset approval
        IERC20(tokenIn).forceApprove(swapRouter, 0);

        require(balanceAfter >= balanceBefore, "Negative balance change?");
        return balanceAfter - balanceBefore;
    }

    // --- Admin Configuration ---
    // Note: 'setTargetWhale' is above as it is a core user function

    function setExecutor(address _executor) external onlyOwner {
        require(_executor != address(0), "Invalid address");
        executor = _executor;
        emit ExecutorUpdated(_executor);
    }
}
