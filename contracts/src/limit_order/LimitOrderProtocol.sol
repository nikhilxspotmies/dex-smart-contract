// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

/**
 * @title LimitOrderProtocol
 * @dev A core smart contract for handling off-chain signed limit orders with on-chain settlement.
 * Inspired by the 1inch Limit Order Protocol.
 */
contract LimitOrderProtocol is EIP712 {
    using SafeERC20 for IERC20;

    bytes32 private constant _ORDER_TYPEHASH = keccak256(
        "Order(address makerAsset,address takerAsset,address maker,uint256 makingAmount,uint256 takingAmount,uint256 salt,uint256 deadline)"
    );

    struct Order {
        address makerAsset;
        address takerAsset;
        address maker;
        uint256 makingAmount;
        uint256 takingAmount;
        uint256 salt;
        uint256 deadline;
    }

    struct PermitParams {
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    // Hash of the order => total amount of makerAsset filled
    mapping(bytes32 => uint256) public filledAmount;

    // Hash of the order => if the order is cancelled
    mapping(bytes32 => bool) public isCancelled;

    event OrderFilled(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed taker,
        uint256 makingAmount,
        uint256 takingAmount
    );

    event OrderCancelled(bytes32 indexed orderHash, address indexed maker);

    constructor() EIP712("LimitOrderProtocol", "1") {}

    /**
     * @notice Cancels a limit order on-chain.
     * @param order The limit order details.
     */
    function cancelOrder(Order calldata order) external {
        require(msg.sender == order.maker, "Only maker can cancel");
        bytes32 orderHash = _hashOrder(order);
        isCancelled[orderHash] = true;
        emit OrderCancelled(orderHash, order.maker);
    }

    /**
     * @notice Fills a signed limit order partially or fully.
     * @param order The limit order details.
     * @param signature The EIP-712 signature from the maker.
     * @param fillAmount The amount of makerAsset to fill (can be partial).
     */
    function fillOrder(
        Order calldata order,
        bytes calldata signature,
        uint256 fillAmount
    ) external {
        _fillOrderInternal(order, signature, fillAmount);
    }

    /**
     * @notice Fills a signed limit order partially or fully with a permit.
     * @param order The limit order details.
     * @param signature The EIP-712 signature from the maker for the order.
     * @param fillAmount The amount of makerAsset to fill (can be partial).
     * @param permit The permit details for the makerAsset.
     */
    function fillOrderWithPermit(
        Order calldata order,
        bytes calldata signature,
        uint256 fillAmount,
        PermitParams calldata permit
    ) external {
        IERC20Permit(order.makerAsset).permit(
            order.maker,
            address(this),
            permit.value,
            permit.deadline,
            permit.v,
            permit.r,
            permit.s
        );
        _fillOrderInternal(order, signature, fillAmount);
    }

    function _fillOrderInternal(
        Order calldata order,
        bytes calldata signature,
        uint256 fillAmount
    ) internal {
        require(block.timestamp <= order.deadline, "Order expired");
        require(fillAmount > 0, "Fill amount must be greater than 0");

        bytes32 orderHash = _hashOrder(order);
        require(!isCancelled[orderHash], "Order is cancelled");

        uint256 alreadyFilled = filledAmount[orderHash];
        require(alreadyFilled + fillAmount <= order.makingAmount, "Fill exceeds remaining amount");

        // Verify signature. SignatureChecker accepts both EOA (ECDSA) signatures and
        // EIP-1271 contract-wallet signatures, so smart-contract wallets can place orders. (L1)
        bytes32 digest = _hashTypedDataV4(orderHash);
        require(
            SignatureChecker.isValidSignatureNow(order.maker, digest, signature),
            "Invalid signature"
        );

        // Calculate taker amount proportional to the fill amount (supporting partial fills).
        // L1: round UP (ceil) so rounding favors the maker, never the taker, on tiny fills.
        // takerAmount = ceil(takingAmount * fillAmount / makingAmount)
        uint256 takerAmount =
            (order.takingAmount * fillAmount + order.makingAmount - 1) / order.makingAmount;
        require(takerAmount > 0, "Taker amount too small");

        // Update state before external calls
        filledAmount[orderHash] = alreadyFilled + fillAmount;

        // Perform settlement
        // Maker -> Taker: fillAmount of makerAsset
        IERC20(order.makerAsset).safeTransferFrom(order.maker, msg.sender, fillAmount);
        
        // Taker -> Maker: takerAmount of takerAsset
        IERC20(order.takerAsset).safeTransferFrom(msg.sender, order.maker, takerAmount);

        emit OrderFilled(orderHash, order.maker, msg.sender, fillAmount, takerAmount);
    }

    /**
     * @dev Generates the struct hash for an Order.
     */
    function _hashOrder(Order calldata order) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                _ORDER_TYPEHASH,
                order.makerAsset,
                order.takerAsset,
                order.maker,
                order.makingAmount,
                order.takingAmount,
                order.salt,
                order.deadline
            )
        );
    }
}
