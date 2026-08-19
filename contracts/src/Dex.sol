// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// FIX: Use named imports to satisfy Foundry linter
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ---------------------------
// Factory
// ---------------------------
contract Factory {
    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    event PairCreated(
        address indexed token0,
        address indexed token1,
        address pair,
        uint
    );

    function createPair(
        address tokenA,
        address tokenB
    ) external returns (address pair) {
        require(tokenA != tokenB, "Identical addresses");
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
        require(token0 != address(0), "Zero address");
        require(getPair[token0][token1] == address(0), "Pair exists");

        bytes memory bytecode = type(Pair).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        assembly {
            pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        Pair(pair).initialize(token0, token1);

        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }
    function allPairsLength() external view returns (uint) {
        return allPairs.length;
    }
}

// ---------------------------
// LP Token (ERC20)
// ---------------------------
contract LPToken is ERC20 {
    address public pair;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        pair = msg.sender;
    }

    modifier onlyPair() {
        require(msg.sender == pair, "Only pair");
        _;
    }

    function mint(address to, uint256 amount) external onlyPair {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyPair {
        _burn(from, amount);
    }
}

// ---------------------------
// Pair (AMM Pool)
// ---------------------------
contract Pair is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public factory;
    address public token0;
    address public token1;

    uint112 private reserve0;
    uint112 private reserve1;
    uint public constant MINIMUM_LIQUIDITY = 10 ** 3;

    LPToken public lpToken;

    event Mint(address indexed sender, uint amount0, uint amount1);
    event Burn(
        address indexed sender,
        uint amount0,
        uint amount1,
        address indexed to
    );
    event Swap(
        address indexed sender,
        uint amount0In,
        uint amount1In,
        uint amount0Out,
        uint amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    constructor() {
        factory = msg.sender;
    }

    function initialize(address _token0, address _token1) external {
        require(msg.sender == factory, "Only factory");
        token0 = _token0;
        token1 = _token1;
        lpToken = new LPToken("DEX LP Token", "DLP");
    }

    function getReserves() public view returns (uint112, uint112) {
        return (reserve0, reserve1);
    }

    function _update(uint balance0, uint balance1) private {
        // Safe to cast as long as balances don't exceed uint112
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        emit Sync(reserve0, reserve1);
    }

    function mint(address to) external nonReentrant returns (uint liquidity) {
        (uint112 _reserve0, uint112 _reserve1) = getReserves();
        uint balance0 = IERC20(token0).balanceOf(address(this));
        uint balance1 = IERC20(token1).balanceOf(address(this));
        uint amount0 = balance0 - _reserve0;
        uint amount1 = balance1 - _reserve1;

        uint _totalSupply = lpToken.totalSupply();

        if (_totalSupply == 0) {
            liquidity = sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            // CHANGED: Mint to dEaD address to bypass OpenZeppelin zero-address check
            lpToken.mint(address(0xdEaD), MINIMUM_LIQUIDITY);
        } else {
            liquidity = min(
                (amount0 * _totalSupply) / _reserve0,
                (amount1 * _totalSupply) / _reserve1
            );
        }
        require(liquidity > 0, "Insufficient liquidity");
        lpToken.mint(to, liquidity);

        _update(balance0, balance1);
        emit Mint(msg.sender, amount0, amount1);
    }

    function burn(
        address to
    ) external nonReentrant returns (uint amount0, uint amount1) {
        // FIX: Removed unused getReserves call here
        uint balance0 = IERC20(token0).balanceOf(address(this));
        uint balance1 = IERC20(token1).balanceOf(address(this));
        uint liquidity = lpToken.balanceOf(address(this));

        uint _totalSupply = lpToken.totalSupply();
        amount0 = (liquidity * balance0) / _totalSupply;
        amount1 = (liquidity * balance1) / _totalSupply;
        require(amount0 > 0 && amount1 > 0, "Insufficient amounts");

        lpToken.burn(address(this), liquidity);
        IERC20(token0).safeTransfer(to, amount0);
        IERC20(token1).safeTransfer(to, amount1);

        balance0 = IERC20(token0).balanceOf(address(this));
        balance1 = IERC20(token1).balanceOf(address(this));

        _update(balance0, balance1);
        emit Burn(msg.sender, amount0, amount1, to);
    }

    function swap(
        uint amount0Out,
        uint amount1Out,
        address to
    ) external nonReentrant {
        require(amount0Out > 0 || amount1Out > 0, "Insufficient output amount");
        (uint112 _reserve0, uint112 _reserve1) = getReserves();
        require(
            amount0Out < _reserve0 && amount1Out < _reserve1,
            "Insufficient liquidity"
        );

        uint balance0;
        uint balance1;
        {
            address _token0 = token0;
            address _token1 = token1;
            require(to != _token0 && to != _token1, "INVALID_TO");

            if (amount0Out > 0) IERC20(_token0).safeTransfer(to, amount0Out);
            if (amount1Out > 0) IERC20(_token1).safeTransfer(to, amount1Out);

            balance0 = IERC20(_token0).balanceOf(address(this));
            balance1 = IERC20(_token1).balanceOf(address(this));
        }

        uint amount0In = balance0 > _reserve0 - amount0Out
            ? balance0 - (_reserve0 - amount0Out)
            : 0;
        uint amount1In = balance1 > _reserve1 - amount1Out
            ? balance1 - (_reserve1 - amount1Out)
            : 0;
        require(amount0In > 0 || amount1In > 0, "Insufficient input amount");

        {
            uint balance0Adjusted = (balance0 * 1000) - (amount0In * 3);
            uint balance1Adjusted = (balance1 * 1000) - (amount1In * 3);
            require(
                balance0Adjusted * balance1Adjusted >=
                    uint(_reserve0) * _reserve1 * (1000 ** 2),
                "K constant invalid"
            );
        }

        _update(balance0, balance1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    function min(uint x, uint y) private pure returns (uint) {
        return x < y ? x : y;
    }
    function sqrt(uint y) private pure returns (uint z) {
        if (y > 3) {
            z = y;
            uint x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
// ---------------------------
// Router
// ---------------------------
/// @dev Canonical wrapped-native interface (WBNB on BSC, WETH on Ethereum).
interface IWETH {
    function deposit() external payable;

    function withdraw(uint256) external;

    function transfer(address to, uint256 value) external returns (bool);
}

contract Router is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public factory;

    /**
     * @dev Wrapped native coin. On BSC this holds WBNB
     * (0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c) — NOT wrapped ether.
     *
     * Native BNB is not an ERC-20 — it has no `transferFrom` — so pools can only ever
     * hold the wrapper. The `*ETH` entrypoints below wrap on the way in and unwrap on
     * the way out, so callers can deal in native BNB and never touch WBNB by hand.
     *
     * The `WETH` name is kept deliberately despite being wrong on this chain: it is the
     * Uniswap V2 name that every fork inherited, and PancakeSwap's own BSC router
     * likewise exposes WBNB through a getter called `WETH()` (verified on mainnet — it
     * has no `WBNB()` getter at all). Aggregators and integrators probe for that exact
     * selector to identify a V2-style router, so renaming it would read better and
     * silently cost interoperability. Ops-facing names say WBNB; this one stays.
     */
    address public immutable WETH;

    event SwapExecuted(
        address indexed sender,
        address[] path,
        uint256[] amounts,
        address indexed to
    );

    constructor(address _factory, address _WETH) {
        require(_factory != address(0), "Zero factory");
        require(_WETH != address(0), "Zero WETH");
        factory = _factory;
        WETH = _WETH;
    }

    /**
     * @dev Native coin is only ever accepted from the wrapper, during `withdraw()`.
     * Anything else would sit here unrecoverable, so reject it outright.
     */
    receive() external payable {
        require(msg.sender == WETH, "Only WETH");
    }

    function _safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}("");
        require(success, "ETH transfer failed");
    }

    // --- PASTE THIS MISSING PART ---
    modifier ensure(uint deadline) {
        require(block.timestamp <= deadline, "EXPIRED");
        _;
    }
    // -------------------------------

    function quote(
        uint amountA,
        uint reserveA,
        uint reserveB
    ) public pure returns (uint amountB) {
        require(amountA > 0, "Insufficient amount");
        require(reserveA > 0 && reserveB > 0, "Insufficient liquidity");
        amountB = (amountA * reserveB) / reserveA;
    }

    function getAmountOut(
        uint amountIn,
        uint reserveIn,
        uint reserveOut
    ) public pure returns (uint amountOut) {
        require(amountIn > 0, "Insufficient input amount");
        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");
        uint amountInWithFee = amountIn * 997;
        uint numerator = amountInWithFee * reserveOut;
        uint denominator = (reserveIn * 1000) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    // Helper for reserves
    function _getReserves(
        address pair,
        bool sortLowFirst
    ) internal view returns (uint reserveIn, uint reserveOut) {
        (uint reserve0, uint reserve1) = Pair(pair).getReserves();
        (reserveIn, reserveOut) = sortLowFirst
            ? (reserve0, reserve1)
            : (reserve1, reserve0);
    }

    /**
     * @dev Re-orient a pair's reserves from its own sorted (token0, token1) order into
     * the caller's (tokenA, tokenB) order.
     *
     * `Pair.getReserves()` always reports sorted-first, since `Factory.createPair`
     * sorts before `initialize`. Reading it as though it matched the argument order
     * silently transposes the two whenever `tokenA > tokenB`, which mispriced the
     * optimal-ratio maths below and let deposits land at the wrong ratio.
     */
    function _reservesFor(
        address pair,
        address tokenA,
        address tokenB
    ) internal view returns (uint reserveA, uint reserveB) {
        (uint reserve0, uint reserve1) = Pair(pair).getReserves();
        (reserveA, reserveB) = tokenA < tokenB
            ? (reserve0, reserve1)
            : (reserve1, reserve0);
    }

    /// @dev Shared ratio maths for both the plain and native-coin liquidity paths.
    /// Resolves (creating if needed) the pair and settles the amounts actually to be
    /// deposited; the caller is left to move the funds, which differ per entrypoint.
    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin
    ) internal returns (address pair, uint amountA, uint amountB) {
        pair = Factory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) {
            pair = Factory(factory).createPair(tokenA, tokenB);
        }

        (uint reserveA, uint reserveB) = _reservesFor(pair, tokenA, tokenB);

        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint amountBOptimal = quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, "Insufficient B Amount");
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint amountAOptimal = quote(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, "Insufficient A Amount");
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }

    // NOTE: Added 'deadline' param and 'ensure' modifier here too!
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    )
        external
        ensure(deadline)
        returns (uint amountA, uint amountB, uint liquidity)
    {
        address pair;
        (pair, amountA, amountB) = _addLiquidity(
            tokenA,
            tokenB,
            amountADesired,
            amountBDesired,
            amountAMin,
            amountBMin
        );

        IERC20(tokenA).safeTransferFrom(msg.sender, pair, amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, pair, amountB);
        liquidity = Pair(pair).mint(to);
    }

    /**
     * @notice Adds liquidity to a TOKEN/WBNB pool paying the second leg in native BNB.
     * @dev The sent BNB is wrapped here; any excess over the optimal ratio is refunded.
     */
    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    )
        external
        payable
        ensure(deadline)
        nonReentrant
        returns (uint amountToken, uint amountETH, uint liquidity)
    {
        address pair;
        (pair, amountToken, amountETH) = _addLiquidity(
            token,
            WETH,
            amountTokenDesired,
            msg.value,
            amountTokenMin,
            amountETHMin
        );

        IERC20(token).safeTransferFrom(msg.sender, pair, amountToken);
        IWETH(WETH).deposit{value: amountETH}();
        require(IWETH(WETH).transfer(pair, amountETH), "WETH transfer failed");

        liquidity = Pair(pair).mint(to);

        // The optimal ratio may consume less than was sent — hand back the rest.
        if (msg.value > amountETH) {
            _safeTransferETH(msg.sender, msg.value - amountETH);
        }
    }


    /**
     * @dev Walks the hops, each pair paying the next one directly.
     *
     * Assumes `amounts[0]` of `path[0]` is ALREADY sitting in the first pair — how it
     * got there is the caller's business (pulled from the user, or wrapped from native
     * coin), which is precisely why that step lives outside this loop.
     */
    function _swap(
        uint[] memory amounts,
        address[] calldata path,
        address _to
    ) internal {
        for (uint i; i < path.length - 1; i++) {
            address input = path[i];
            address output = path[i + 1];
            address pair = Factory(factory).getPair(input, output);
            require(pair != address(0), "Pair doesn't exist");

            bool sortLowFirst = input < output;
            uint amountOut = amounts[i + 1];

            (uint amount0Out, uint amount1Out) = sortLowFirst
                ? (uint(0), amountOut)
                : (amountOut, uint(0));
            address recipient = (i == path.length - 2)
                ? _to
                : Factory(factory).getPair(output, path[i + 2]);

            Pair(pair).swap(amount0Out, amount1Out, recipient);
        }
    }

    /// @dev Resolves the first pair in a path, reverting if it was never created.
    function _firstPair(
        address[] calldata path
    ) internal view returns (address pair) {
        pair = Factory(factory).getPair(path[0], path[1]);
        require(pair != address(0), "Pair doesn't exist");
    }

    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external ensure(deadline) returns (uint[] memory amounts) {
        require(path.length >= 2, "Invalid path");

        amounts = getAmountsOut(amountIn, path);
        require(
            amounts[path.length - 1] >= amountOutMin,
            "Insufficient output amount"
        );

        IERC20(path[0]).safeTransferFrom(msg.sender, _firstPair(path), amounts[0]);
        _swap(amounts, path, to);

        emit SwapExecuted(msg.sender, path, amounts, to);
    }

    /**
     * @notice Swaps native BNB for tokens. `path` must start at WBNB.
     * @dev The sent BNB is wrapped here, so callers never handle WBNB themselves.
     */
    function swapExactETHForTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    )
        external
        payable
        ensure(deadline)
        nonReentrant
        returns (uint[] memory amounts)
    {
        require(path.length >= 2, "Invalid path");
        require(path[0] == WETH, "Path must start with WETH");
        require(msg.value > 0, "Insufficient input amount");

        amounts = getAmountsOut(msg.value, path);
        require(
            amounts[path.length - 1] >= amountOutMin,
            "Insufficient output amount"
        );

        IWETH(WETH).deposit{value: amounts[0]}();
        require(
            IWETH(WETH).transfer(_firstPair(path), amounts[0]),
            "WETH transfer failed"
        );
        _swap(amounts, path, to);

        emit SwapExecuted(msg.sender, path, amounts, to);
    }

    /**
     * @notice Swaps tokens for native BNB. `path` must end at WBNB.
     * @dev The final hop lands here rather than with `to`, so the wrapper can be
     * unwrapped before paying out — the recipient only ever sees native BNB.
     */
    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external ensure(deadline) nonReentrant returns (uint[] memory amounts) {
        require(path.length >= 2, "Invalid path");
        require(path[path.length - 1] == WETH, "Path must end with WETH");

        amounts = getAmountsOut(amountIn, path);
        uint amountOut = amounts[path.length - 1];
        require(amountOut >= amountOutMin, "Insufficient output amount");

        IERC20(path[0]).safeTransferFrom(msg.sender, _firstPair(path), amounts[0]);
        _swap(amounts, path, address(this));

        IWETH(WETH).withdraw(amountOut);
        _safeTransferETH(to, amountOut);

        emit SwapExecuted(msg.sender, path, amounts, to);
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external ensure(deadline) returns (uint amountA, uint amountB) {
        address pair = Factory(factory).getPair(tokenA, tokenB);
        require(pair != address(0), "Pair doesn't exist");

        address lpAddr = address(Pair(pair).lpToken());
        IERC20(lpAddr).safeTransferFrom(msg.sender, pair, liquidity);

        // `burn` reports in the pair's own sorted order, not the caller's argument
        // order — transpose before the slippage check, or the two mins get applied to
        // the wrong legs whenever tokenA > tokenB.
        (uint amount0, uint amount1) = Pair(pair).burn(to);
        (amountA, amountB) = tokenA < tokenB
            ? (amount0, amount1)
            : (amount1, amount0);

        require(
            amountA >= amountAMin && amountB >= amountBMin,
            "Insufficient amounts"
        );
    }

    /**
     * @notice Removes liquidity from a TOKEN/WBNB pool, paying the second leg out as
     * native BNB.
     * @dev Burns to this contract so the wrapper can be unwrapped before paying out.
     * Requires the LP tokens to be approved to the Router first, as `removeLiquidity`
     * does.
     */
    function removeLiquidityETH(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    )
        external
        ensure(deadline)
        nonReentrant
        returns (uint amountToken, uint amountETH)
    {
        address pair = Factory(factory).getPair(token, WETH);
        require(pair != address(0), "Pair doesn't exist");

        address lpAddr = address(Pair(pair).lpToken());
        IERC20(lpAddr).safeTransferFrom(msg.sender, pair, liquidity);

        (uint amount0, uint amount1) = Pair(pair).burn(address(this));
        (amountToken, amountETH) = token < WETH
            ? (amount0, amount1)
            : (amount1, amount0);

        require(amountToken >= amountTokenMin, "Insufficient token amount");
        require(amountETH >= amountETHMin, "Insufficient ETH amount");

        IERC20(token).safeTransfer(to, amountToken);
        IWETH(WETH).withdraw(amountETH);
        _safeTransferETH(to, amountETH);
    }

    function getAmountsOut(
        uint amountIn,
        address[] calldata path
    ) public view returns (uint[] memory amounts) {
        require(path.length >= 2, "Invalid path");
        amounts = new uint[](path.length);
        amounts[0] = amountIn;
        for (uint i; i < path.length - 1; i++) {
            address pair = Factory(factory).getPair(path[i], path[i + 1]);
            require(pair != address(0), "Pair doesn't exist");
            bool sortLowFirst = path[i] < path[i + 1];
            (uint reserveIn, uint reserveOut) = _getReserves(
                pair,
                sortLowFirst
            );
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }
}