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
contract Router {
    using SafeERC20 for IERC20;

    address public factory;

    constructor(address _factory) {
        factory = _factory;
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
        address pair = Factory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) {
            pair = Factory(factory).createPair(tokenA, tokenB);
        }

        (uint reserveA, uint reserveB) = Pair(pair).getReserves();

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

        IERC20(tokenA).safeTransferFrom(msg.sender, pair, amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, pair, amountB);
        liquidity = Pair(pair).mint(to);
    }
    

    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external ensure(deadline) returns (uint[] memory amounts) {
        require(path.length >= 2, "Invalid path");

        // 1) Precompute amounts
        amounts = getAmountsOut(amountIn, path);
        require(
            amounts[path.length - 1] >= amountOutMin,
            "Insufficient output amount"
        );

        // 2) Execute swaps
        for (uint i; i < path.length - 1; i++) {
            address input = path[i];
            address output = path[i + 1];
            address pair = Factory(factory).getPair(input, output);
            require(pair != address(0), "Pair doesn't exist");

            bool sortLowFirst = input < output;
            uint amountOut = amounts[i + 1];

            // Only first hop pulls from user
            if (i == 0) {
                IERC20(input).safeTransferFrom(msg.sender, pair, amounts[0]);
            }

            (uint amount0Out, uint amount1Out) = sortLowFirst
                ? (uint(0), amountOut)
                : (amountOut, uint(0));
            address recipient = (i == path.length - 2)
                ? to
                : Factory(factory).getPair(output, path[i + 2]);

            Pair(pair).swap(amount0Out, amount1Out, recipient);
        }
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

        (amountA, amountB) = Pair(pair).burn(to);
        require(
            amountA >= amountAMin && amountB >= amountBMin,
            "Insufficient amounts"
        );
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