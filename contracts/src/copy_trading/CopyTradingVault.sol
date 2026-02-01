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
interface IDexRouter {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}

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
    constructor() Ownable(msg.sender) {
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

    /**
     * @notice Withdraw multiple tokens in a single transaction.
     * @param tokens Array of token addresses
     * @param amounts Array of amounts to withdraw (use type(uint256).max for 'All')
     */
    function withdrawBatch(address[] calldata tokens, uint256[] calldata amounts) external nonReentrant onlyOwner {
        require(tokens.length == amounts.length, "Length mismatch");
        
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 amount = amounts[i];
            
            // Check if user requested "All" (using a high number convention or just checking balance)
            // For strictness, we just use the amount provided.
            
            if (amount > 0) {
                 uint256 currentBalance = IERC20(token).balanceOf(address(this));
                 // If sending type(uint256).max, just withdraw everything? 
                 // The user plan said "explicit amounts", but for "Withdraw Funds" button ease, 
                 // we might pass exact balances from frontend. 
                 // Let's safe-guard: limit to balance.
                 
                 if (amount > currentBalance) {
                     amount = currentBalance;
                 }

                 if (amount > 0) {
                     IERC20(token).safeTransfer(msg.sender, amount);
                     emit Withdrawn(token, amount);
                 }
            }
        }
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
            uint256 netAmountReceived = _performSwapCall(swap.tokenIn, swap.tokenOut, swap.amountIn, swap.minAmountOut, swap.data);

            // 3. Slippage Check (Redundant if Router checks it, but good for double safety)
            require(netAmountReceived >= swap.minAmountOut, "Slippage tolerance exceeded");

            emit Swapped(swap.tokenIn, swap.tokenOut, swap.amountIn, netAmountReceived);
        }
    }

    function _performSwapCall(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory data
    ) internal returns (uint256) {
        // Decode path from data
        address[] memory path = abi.decode(data, (address[]));
        require(path.length >= 2, "Invalid path length");
        require(path[0] == tokenIn, "Path start mismatch");
        require(path[path.length - 1] == tokenOut, "Path end mismatch");

        // Approve Router
        IERC20(tokenIn).forceApprove(swapRouter, amountIn);

        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));

        // Execute Swap
        // IDexRouter interface defined locally or cast to generic interface with signature
        // We use low-level call or cast to interface. User requested "specifically call the swapExactTokensForTokens function".
        // Let's cast msg.sender (which is Router in the context of the OTHER file, but here swapRouter is the address)
        
        // Define interface signature inline or assume it is available. 
        // To be safe and clean, I will cast to an interface I define at top of file, 
        // OR just use abi.encodeWithSelector since I am already editing the file.
        // But user explicitly said "specifically call...".
        
        // Let's modify the file to include the interface at the top first, or validly usage here.
        // For now, I will use the interface call.
        IDexRouter(swapRouter).swapExactTokensForTokens(
            amountIn,
            minAmountOut,
            path,
            address(this),
            block.timestamp + 60 // Deadline
        );

        uint256 balanceAfter = IERC20(tokenOut).balanceOf(address(this));
        
        // Reset approval
        IERC20(tokenIn).forceApprove(swapRouter, 0);

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
