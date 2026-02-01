// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/limit_order/LimitOrderProtocol.sol";
import "../src/MockERC20.sol";

contract LimitOrderTest is Test {
    LimitOrderProtocol public protocol;
    MockERC20 public makerAsset;
    MockERC20 public takerAsset;

    address public maker = address(0x1);
    address public taker = address(0x2);
    uint256 public makerPrivateKey = 0x1234;

    function setUp() public {
        maker = vm.addr(makerPrivateKey);
        protocol = new LimitOrderProtocol();
        makerAsset = new MockERC20("Maker Asset", "MKR");
        takerAsset = new MockERC20("Taker Asset", "TKR");

        // Mint tokens to maker and taker
        makerAsset.mint(maker, 1000 ether);
        takerAsset.mint(taker, 1000 ether);

        // Approve protocol to spend tokens
        vm.prank(maker);
        makerAsset.approve(address(protocol), 1000 ether);

        vm.prank(taker);
        takerAsset.approve(address(protocol), 1000 ether);
    }

    function testFullFill() public {
        LimitOrderProtocol.Order memory order = LimitOrderProtocol.Order({
            makerAsset: address(makerAsset),
            takerAsset: address(takerAsset),
            maker: maker,
            makingAmount: 100 ether,
            takingAmount: 200 ether,
            salt: 1,
            deadline: block.timestamp + 1 hours
        });

        bytes32 orderHash = _getStructHash(order);
        bytes32 digest = _getTypedDataHash(orderHash);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPrivateKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.prank(taker);
        protocol.fillOrder(order, signature, 100 ether);

        assertEq(makerAsset.balanceOf(maker), 900 ether);
        assertEq(makerAsset.balanceOf(taker), 100 ether);
        assertEq(takerAsset.balanceOf(maker), 200 ether);
        assertEq(takerAsset.balanceOf(taker), 800 ether);
        assertEq(protocol.filledAmount(orderHash), 100 ether);
    }

    function testPartialFill() public {
        LimitOrderProtocol.Order memory order = LimitOrderProtocol.Order({
            makerAsset: address(makerAsset),
            takerAsset: address(takerAsset),
            maker: maker,
            makingAmount: 100 ether,
            takingAmount: 200 ether,
            salt: 1,
            deadline: block.timestamp + 1 hours
        });

        bytes32 orderHash = _getStructHash(order);
        bytes32 digest = _getTypedDataHash(orderHash);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPrivateKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        // First partial fill
        vm.prank(taker);
        protocol.fillOrder(order, signature, 40 ether);

        assertEq(makerAsset.balanceOf(maker), 960 ether);
        assertEq(makerAsset.balanceOf(taker), 40 ether);
        assertEq(takerAsset.balanceOf(maker), 80 ether); // (200 * 40) / 100 = 80
        assertEq(takerAsset.balanceOf(taker), 920 ether);
        assertEq(protocol.filledAmount(orderHash), 40 ether);

        // Second partial fill
        vm.prank(taker);
        protocol.fillOrder(order, signature, 60 ether);

        assertEq(makerAsset.balanceOf(maker), 900 ether);
        assertEq(makerAsset.balanceOf(taker), 100 ether);
        assertEq(takerAsset.balanceOf(maker), 200 ether); 
        assertEq(takerAsset.balanceOf(taker), 800 ether);
        assertEq(protocol.filledAmount(orderHash), 100 ether);
    }

    function testExpiredOrder() public {
        LimitOrderProtocol.Order memory order = LimitOrderProtocol.Order({
            makerAsset: address(makerAsset),
            takerAsset: address(takerAsset),
            maker: maker,
            makingAmount: 100 ether,
            takingAmount: 200 ether,
            salt: 1,
            deadline: block.timestamp - 1
        });

        bytes32 orderHash = _getStructHash(order);
        bytes32 digest = _getTypedDataHash(orderHash);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPrivateKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.prank(taker);
        vm.expectRevert("Order expired");
        protocol.fillOrder(order, signature, 100 ether);
    }

    function testInvalidSignature() public {
        LimitOrderProtocol.Order memory order = LimitOrderProtocol.Order({
            makerAsset: address(makerAsset),
            takerAsset: address(takerAsset),
            maker: maker,
            makingAmount: 100 ether,
            takingAmount: 200 ether,
            salt: 1,
            deadline: block.timestamp + 1 hours
        });

        bytes32 orderHash = _getStructHash(order);
        bytes32 digest = _getTypedDataHash(orderHash);

        // Sign with wrong private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0x9999, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.prank(taker);
        vm.expectRevert("Invalid signature");
        protocol.fillOrder(order, signature, 100 ether);
    }

    function testCancelOrder() public {
        LimitOrderProtocol.Order memory order = LimitOrderProtocol.Order({
            makerAsset: address(makerAsset),
            takerAsset: address(takerAsset),
            maker: maker,
            makingAmount: 100 ether,
            takingAmount: 200 ether,
            salt: 1,
            deadline: block.timestamp + 1 hours
        });

        bytes32 orderHash = _getStructHash(order);
        bytes32 digest = _getTypedDataHash(orderHash);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPrivateKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Maker cancels the order
        vm.prank(maker);
        protocol.cancelOrder(order);

        assertTrue(protocol.isCancelled(orderHash));

        // Taker tries to fill the cancelled order
        vm.prank(taker);
        vm.expectRevert("Order is cancelled");
        protocol.fillOrder(order, signature, 100 ether);
    }

    function testFillOrderWithPermit() public {
        LimitOrderProtocol.Order memory order = LimitOrderProtocol.Order({
            makerAsset: address(makerAsset),
            takerAsset: address(takerAsset),
            maker: maker,
            makingAmount: 100 ether,
            takingAmount: 200 ether,
            salt: 1,
            deadline: block.timestamp + 1 hours
        });

        bytes32 orderHash = _getStructHash(order);
        bytes32 orderDigest = _getTypedDataHash(orderHash);

        (uint8 orderV, bytes32 orderR, bytes32 orderS) = vm.sign(makerPrivateKey, orderDigest);
        bytes memory orderSignature = abi.encodePacked(orderR, orderS, orderV);

        // Prepare Permit
        uint256 permitValue = 100 ether;
        uint256 permitDeadline = block.timestamp + 1 hours;
        uint256 nonce = makerAsset.nonces(maker);
        
        bytes32 permitHash = _getPermitHash(
            address(makerAsset),
            maker,
            address(protocol),
            permitValue,
            nonce,
            permitDeadline
        );

        (uint8 pV, bytes32 pR, bytes32 pS) = vm.sign(makerPrivateKey, permitHash);

        LimitOrderProtocol.PermitParams memory permit = LimitOrderProtocol.PermitParams({
            value: permitValue,
            deadline: permitDeadline,
            v: pV,
            r: pR,
            s: pS
        });

        // Reset allowance to 0 to ensure permit works
        vm.prank(maker);
        makerAsset.approve(address(protocol), 0);
        assertEq(makerAsset.allowance(maker, address(protocol)), 0);

        vm.prank(taker);
        protocol.fillOrderWithPermit(order, orderSignature, 100 ether, permit);

        assertEq(makerAsset.balanceOf(maker), 900 ether);
        assertEq(makerAsset.balanceOf(taker), 100 ether);
        assertEq(protocol.filledAmount(orderHash), 100 ether);
    }

    function _getPermitHash(
        address token,
        address owner,
        address spender,
        uint256 value,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                MockERC20(token).DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                        owner,
                        spender,
                        value,
                        nonce,
                        deadline
                    )
                )
            )
        );
    }

    function _getStructHash(LimitOrderProtocol.Order memory order) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("Order(address makerAsset,address takerAsset,address maker,uint256 makingAmount,uint256 takingAmount,uint256 salt,uint256 deadline)"),
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

    function _getTypedDataHash(bytes32 structHash) internal view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("LimitOrderProtocol")),
                keccak256(bytes("1")),
                block.chainid,
                address(protocol)
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }
}
