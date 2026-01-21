// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IMarket {
    function unrealizedProfits() external view returns (uint256);
}

/// @notice LP vault for a single isolated market. Holds USDC liquidity and mints LP shares.
contract Vault is ERC20, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc; // 6 decimals token
    address public market; // only market can pull funds

    error NotMarket();
    error InsufficientLiquidity();
    error MarketAlreadySet();

    modifier onlyMarket() {
        if (msg.sender != market) revert NotMarket();
        _;
    }

    constructor(address _usdc) ERC20("Perp LP", "pLP") Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    /// @notice one-time market setter by owner/factory.
    function setMarket(address _market) external onlyOwner {
        if (market != address(0)) revert MarketAlreadySet();
        market = _market;
    }

    /// @notice total USDC held by vault
    function totalAssets() public view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @notice deposits USDC and mints LP shares proportionally.
    function deposit(uint256 amount, address to) external nonReentrant {
        require(amount > 0, "amount=0");
        uint256 _totalAssets = totalAssets();
        uint256 _totalSupply = totalSupply();

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        uint256 shares;
        if (_totalSupply == 0 || _totalAssets == 0) {
            shares = amount * 1e12; // scale to 18-dec LP basis
        } else {
            shares = (amount * _totalSupply) / _totalAssets;
        }
        _mint(to, shares);
    }

    /// @notice withdraws USDC by burning LP shares; checks solvency vs unrealized profits.
    function withdraw(uint256 shares, address to) external nonReentrant {
        require(shares > 0, "shares=0");
        uint256 _totalSupply = totalSupply();
        require(_totalSupply > 0, "no supply");

        uint256 assets = (shares * totalAssets()) / _totalSupply;
        _burn(msg.sender, shares);

        uint256 unrealized = IMarket(market).unrealizedProfits();
        uint256 bal = usdc.balanceOf(address(this));
        if (assets + unrealized > bal) revert InsufficientLiquidity();

        usdc.safeTransfer(to, assets);
    }

    /// @notice callable only by market to pay trader PnL or fees.
    function pull(address to, uint256 amount) external onlyMarket nonReentrant {
        usdc.safeTransfer(to, amount);
    }

    /// @notice market can push fees back to vault.
    function push(uint256 amount) external onlyMarket nonReentrant {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }
}

