// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./CopyTradingVault.sol";

/**
 * @title CopyTradingFactory
 * @notice Deploys isolated CopyTradingVault clones for each user using EIP-1167.
 */
contract CopyTradingFactory is Ownable {
    using Clones for address;

    // --- State Variables ---
    address public immutable implementation;
    address public executor;
    address public swapRouter;

    // Mapping from User -> Their unique Vault Address
    mapping(address => address) public userVaults;

    // Array to keep track of all deployed vaults
    address[] public allVaults;

    // H3: global allowlist; tokenFeed[token] = Chainlink feed (nonzero = allowed & priceable).
    mapping(address => address) public tokenFeed;
    // H3: max slippage vs oracle price (bps), default 3%.
    uint256 public maxSlippageBps = 300;
    uint256 public constant MAX_SLIPPAGE_CAP_BPS = 2000; // 20% ceiling

    // --- Events ---
    event VaultCreated(address indexed user, address indexed vault);
    event ExecutorUpdated(address newExecutor);
    event SwapRouterUpdated(address newRouter);
    event TokenAllowed(address indexed token, address indexed feed);
    event TokenDisallowed(address indexed token);
    event MaxSlippageUpdated(uint256 bps);

    constructor(
        address _implementation,
        address _executor,
        address _swapRouter,
        address _initialOwner
    ) Ownable(_initialOwner) {
        require(_implementation != address(0), "Invalid implementation");
        require(_executor != address(0), "Invalid executor");
        require(_swapRouter != address(0), "Invalid router");

        implementation = _implementation;
        executor = _executor;
        swapRouter = _swapRouter;
    }

    /**
     * @notice Creates a new CopyTradingVault for the caller (msg.sender).
     * @dev Uses EIP-1167 minimal proxy clones for gas efficiency.
     */
    function createVault() external returns (address) {
        require(userVaults[msg.sender] == address(0), "User already has a vault");

        // Deploy Clone
        address clone = implementation.clone();
        
        // Initialize the Clone
        // Owner = msg.sender (The User)
        // Executor = global executor
        // Router = global router
        CopyTradingVault(payable(clone)).initialize(msg.sender, executor, swapRouter);

        // Store record
        userVaults[msg.sender] = clone;
        allVaults.push(clone);

        emit VaultCreated(msg.sender, clone);

        return clone;
    }

    /**
     * @notice Returns the vault address for a user.
     */
    function getVault(address user) external view returns (address) {
        return userVaults[user];
    }

    // --- Admin Functions ---

    function setExecutor(address _executor) external onlyOwner {
        require(_executor != address(0), "Invalid address");
        executor = _executor;
        emit ExecutorUpdated(_executor);
    }

    function setSwapRouter(address _swapRouter) external onlyOwner {
        require(_swapRouter != address(0), "Invalid address");
        swapRouter = _swapRouter;
        emit SwapRouterUpdated(_swapRouter);
    }

    // --- H3: token allowlist management ---

    /// H3: allow a token (feed required, so swaps are price-verifiable).
    function setAllowedToken(address token, address feed) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(feed != address(0), "Feed required");
        tokenFeed[token] = feed;
        emit TokenAllowed(token, feed);
    }

    /// H3: remove a token from the allowlist.
    function removeAllowedToken(address token) external onlyOwner {
        delete tokenFeed[token];
        emit TokenDisallowed(token);
    }

    function setMaxSlippageBps(uint256 bps) external onlyOwner {
        require(bps <= MAX_SLIPPAGE_CAP_BPS, "slippage too high");
        maxSlippageBps = bps;
        emit MaxSlippageUpdated(bps);
    }

    /// H3: allowlist view for vaults.
    function isAllowed(address token) external view returns (bool) {
        return tokenFeed[token] != address(0);
    }
}
