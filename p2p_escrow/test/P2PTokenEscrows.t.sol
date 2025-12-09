// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {P2PTokenEscrows} from "../src/P2PTokenEscrow.sol"; 
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// 1. Create a Mock Token to test transfers
contract MockUSDT is ERC20 {
    constructor() ERC20("Mock USDT", "mUSDT") {
        _mint(msg.sender, 1000000 * 10**18);
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}

// 2. The Main Test Contract
contract P2PTokenEscrowsTest is Test {
    P2PTokenEscrows public escrow;
    MockUSDT public token;

    address public owner;
    address public seller;
    address public buyer;
    address public stranger;

    // Events to check
    event PurchaseLocked(uint256 indexed purchaseId, uint256 indexed listingId, address indexed seller, uint256 quantity);
    event PurchaseReleased(uint256 indexed purchaseId, uint256 indexed listingId, address indexed buyer, uint256 quantity);
    event TokenWhitelistUpdated(address indexed token, bool isWhitelisted);

    function setUp() public {
        // Setup accounts
        owner = address(this); // The test contract is the owner
        seller = makeAddr("seller");
        buyer = makeAddr("buyer");
        stranger = makeAddr("stranger");

        // Deploy contracts
        token = new MockUSDT();
        escrow = new P2PTokenEscrows();

        // --- NEW REQUIREMENT: WHITELIST THE TOKEN ---
        // Since createListing now checks for whitelist, we must enable it here
        // or all subsequent tests will fail.
        escrow.setTokenWhitelist(address(token), true);

        // Fund the seller with tokens
        token.mint(seller, 1000 * 10**18);
        
        // Seller must approve the escrow contract to move funds
        vm.prank(seller);
        token.approve(address(escrow), type(uint256).max);
    }

    // =======================================
    //          Create Listing Tests
    // =======================================

    function test_CreateListing() public {
        vm.prank(seller);
        uint256 listingId = escrow.createListing(IERC20(address(token)), 500 * 10**18, 1 * 10**18);

        P2PTokenEscrows.Listing memory l = escrow.getListingById(listingId);
        
        assertEq(l.seller, seller);
        assertEq(l.totalAmount, 500 * 10**18);
        assertTrue(l.active);
    }

    function test_RevertCreateListing_ZeroAmount() public {
        vm.prank(seller);
        vm.expectRevert("Amount(qty of token) must be > 0");
        escrow.createListing(IERC20(address(token)), 0, 1);
    }

    // --- NEW TEST FOR WHITELIST ---
    function test_RevertCreateListing_NotWhitelisted() public {
        // 1. Admin removes token from whitelist
        escrow.setTokenWhitelist(address(token), false);

        // 2. Seller tries to create listing
        vm.prank(seller);
        vm.expectRevert("Token not whitelisted by Admin");
        escrow.createListing(IERC20(address(token)), 100 * 10**18, 1);
    }

    // --- NEW TEST FOR BALANCE CHECK ---
    function test_RevertCreateListing_InsufficientBalance() public {
        // Seller has 1000 tokens. Let's try to list 2000.
        // Even if they approved "max", they don't *have* the tokens.
        
        vm.prank(seller);
        vm.expectRevert("Insufficient token balance");
        escrow.createListing(IERC20(address(token)), 2000 * 10**18, 1);
    }

    // =======================================
    //          Full Purchase Flow Tests
    // =======================================

    function test_FullPurchaseFlow() public {
        // 1. Seller creates listing
        vm.prank(seller);
        uint256 listingId = escrow.createListing(IERC20(address(token)), 100 * 10**18, 10);

        // 2. Buyer proposes purchase (Buying 50 tokens)
        vm.prank(buyer);
        uint256 purchaseId = escrow.proposePurchase(listingId, 50 * 10**18, 10);

        // Verify purchase created
        (uint256 pid, address pBuyer, uint256 pQty, , P2PTokenEscrows.PurchaseStatus status, ,) = escrow.purchases(purchaseId);
        assertEq(pid, listingId);
        assertEq(pBuyer, buyer);
        assertLe(pQty, 100 * 10**18);
        assertEq(uint(status), uint(P2PTokenEscrows.PurchaseStatus.Proposed));

        // 3. Seller Locks tokens (Escrow pulls tokens here)
        vm.prank(seller);
        
        vm.expectEmit(true, true, true, true);
        emit PurchaseLocked(purchaseId, listingId, seller, 50 * 10**18);
        
        escrow.lockPurchase(purchaseId);

        // Check Balances: Seller should have 50 less, Escrow should have 50
        assertEq(token.balanceOf(seller), 950 * 10**18); // Started with 1000, 50 locked
        assertEq(token.balanceOf(address(escrow)), 50 * 10**18);

        // Check Status is Locked
        (,,,, status,,) = escrow.purchases(purchaseId);
        assertEq(uint(status), uint(P2PTokenEscrows.PurchaseStatus.Locked));

        // 4. Owner Releases
        vm.expectEmit(true, true, true, true);
        emit PurchaseReleased(purchaseId, listingId, buyer, 50 * 10**18);
        
        escrow.releasePurchase(purchaseId);

        // Check Final Balances
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(token.balanceOf(buyer), 50 * 10**18);
        
        // Check Status is Released
        (,,,, status,,) = escrow.purchases(purchaseId);
        assertEq(uint(status), uint(P2PTokenEscrows.PurchaseStatus.Released));
    }

    // SCENARIO 1: Seller says "I didn't get Fiat" -> Owner confirms -> Refund Seller
    function test_Dispute_SellerClaimsNoFiat_OwnerRefunds() public {
        // 1. Setup: Listing exists and Tokens are LOCKED in Escrow
        vm.prank(seller);
        uint256 listingId = escrow.createListing(IERC20(address(token)), 100 * 10**18, 10);
        
        vm.prank(buyer);
        uint256 purchaseId = escrow.proposePurchase(listingId, 50 * 10**18, 10);
        
        vm.prank(seller);
        escrow.lockPurchase(purchaseId);

        // 2. DISPUTE: Seller checks bank, sees NO FIAT. Raises dispute.
        vm.prank(seller);
        escrow.raiseDispute(purchaseId);

        // Verify status is now DISPUTED
        (,,,, P2PTokenEscrows.PurchaseStatus status,,) = escrow.purchases(purchaseId);
        assertEq(uint(status), uint(P2PTokenEscrows.PurchaseStatus.Disputed));

        // 3. RESOLUTION: Owner checks offline, confirms NO payment.
        // Owner calls refundPurchase to return tokens to Seller.
        escrow.refundPurchase(purchaseId);

        // 4. CHECK: Seller got their tokens back
        assertEq(token.balanceOf(seller), 1000 * 10**18); // Original balance restored
        assertEq(token.balanceOf(buyer), 0);              // Buyer gets nothing
    }

    // SCENARIO 2: Buyer says "I sent Fiat" -> Owner confirms -> Release to Buyer
    function test_Dispute_BuyerClaimsFiatSent_OwnerReleases() public {
        // 1. Setup: Listing exists and Tokens are LOCKED in Escrow
        vm.prank(seller);
        uint256 listingId = escrow.createListing(IERC20(address(token)), 100 * 10**18, 10);
        
        vm.prank(buyer);
        uint256 purchaseId = escrow.proposePurchase(listingId, 50 * 10**18, 10);
        
        vm.prank(seller);
        escrow.lockPurchase(purchaseId);

        // 2. DISPUTE: Buyer sent money, but Seller isn't releasing. Buyer raises dispute.
        vm.prank(buyer);
        escrow.raiseDispute(purchaseId);

        // Verify status is now DISPUTED
        (,,,, P2PTokenEscrows.PurchaseStatus status,,) = escrow.purchases(purchaseId);
        assertEq(uint(status), uint(P2PTokenEscrows.PurchaseStatus.Disputed));

        // 3. RESOLUTION: Owner checks offline, confirms payment WAS sent.
        // Owner calls releasePurchase to force tokens to Buyer.
        escrow.releasePurchase(purchaseId);

        // 4. CHECK: Buyer got the tokens
        assertEq(token.balanceOf(buyer), 50 * 10**18);     // Buyer gets tokens
        assertEq(token.balanceOf(seller), 950 * 10**18);   // Seller stays minus 50
    }

    // =======================================
    //          Edge Case / Revert Tests
    // =======================================

    function test_RevertLock_IfNotSeller() public {
        // Setup listing and proposal
        vm.prank(seller);
        uint256 listingId = escrow.createListing(IERC20(address(token)), 100, 10);
        
        vm.prank(buyer);
        uint256 purchaseId = escrow.proposePurchase(listingId, 50, 10);

        // Stranger tries to lock
        vm.prank(stranger);
        vm.expectRevert("Only seller can lock");
        escrow.lockPurchase(purchaseId);
    }

    function test_RevertRelease_IfNotOwner() public {
        // Run flow up to lock
        vm.prank(seller);
        uint256 listingId = escrow.createListing(IERC20(address(token)), 100, 10);
        vm.prank(buyer);
        uint256 purchaseId = escrow.proposePurchase(listingId, 50, 10);
        vm.prank(seller);
        escrow.lockPurchase(purchaseId);

        // Seller tries to release
        vm.prank(seller);
        
        // We expect the OwnableUnauthorizedAccount error
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, seller)
        );
        escrow.releasePurchase(purchaseId);
    }

    function test_RefundFlow() public {
        // Setup Lock
        vm.prank(seller);
        uint256 listingId = escrow.createListing(IERC20(address(token)), 100 * 10**18, 10);
        vm.prank(buyer);
        uint256 purchaseId = escrow.proposePurchase(listingId, 50 * 10**18, 10);
        vm.prank(seller);
        escrow.lockPurchase(purchaseId);

        // Owner refunds
        escrow.refundPurchase(purchaseId);

        // Tokens return to Seller
        assertEq(token.balanceOf(seller), 1000 * 10**18); // Back to original
        assertEq(token.balanceOf(buyer), 0);
        
        // Listing remaining amount should restore
        P2PTokenEscrows.Listing memory l = escrow.getListingById(listingId);
        assertEq(l.remaining, 100 * 10**18);
    }
}