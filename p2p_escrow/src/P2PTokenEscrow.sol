// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract P2PTokenEscrows is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    struct Listing {
        address seller;
        IERC20 token;
        uint256 totalAmount;     // total tokens seller is offering in this listing
        uint256 remaining;       // remaining tokens not locked in purchases
        uint256 pricePerToken;   // informational: price per token in (INR). purely UI/off-chain
        bool active;
        uint256 createdAt;
    }

    enum PurchaseStatus { Proposed, Locked, Released, Refunded, Cancelled, Disputed }

    struct Purchase {
        uint256 listingId;
        address buyer;
        uint256 quantity;       // tokens buyer wants to buy from listing
        uint256 agreedPricePerToken; // agreed price per token (paise) stored for audit/UI
        PurchaseStatus status;
        address seller;         // snapshot of listing.seller at time of proposal
        uint256 createdAt;
    }

    Listing[] public listings; 
    mapping(address => uint256[]) public sellerListings; //for seller dashboard


    Purchase[] public purchases; 
    mapping(uint256 => uint256[]) public listingPurchases; //listingid->purchaseids

    event ListingCreated(uint256 indexed listingId, address indexed seller, address token, uint256 totalAmount, uint256 pricePerToken);
    event PurchaseProposed(uint256 indexed purchaseId, uint256 indexed listingId, address indexed buyer, uint256 quantity, uint256 pricePerToken);
    event PurchaseLocked(uint256 indexed purchaseId, uint256 indexed listingId, address indexed  seller, uint256 quantity);
    event PurchaseReleased(uint256 indexed purchaseId, uint256 indexed listingId, address indexed buyer, uint256 quantity);
    event ListingUpdatedRemaining(uint256 indexed listingId, uint256 remaining);
    event PurchaseRefunded(uint256 indexed purchaseId, uint256 indexed listingId, address indexed seller, uint256 quantity);
    event PurchaseCancelled(uint256 indexed purchaseId);
    event ListingCancelled(uint256 indexed listingId);

    constructor() Ownable(msg.sender) {}

    function createListing(IERC20 token, uint256 totalAmount, uint256 pricePerToken) external returns (uint256) {
        require(totalAmount > 0, "totalAmount>0");
        require(address(token) != address(0), "invalid token");

        Listing memory l = Listing({
            seller: msg.sender,
            token: token,
            totalAmount: totalAmount,
            remaining: totalAmount,
            pricePerToken: pricePerToken,
            active: true,
            createdAt: block.timestamp
        });

        listings.push(l);
        uint256 listingId = listings.length - 1;
        sellerListings[msg.sender].push(listingId);

        emit ListingCreated(listingId, msg.sender, address(token), totalAmount, pricePerToken);
        return listingId;
    }

    function getListings() external  view returns (
        uint256[] memory ids,
        address[] memory sellers,
        address[] memory tokens,
        uint256[] memory totals,
        uint256[] memory remainings,
        uint256[] memory prices,
        bool[] memory actives,
        uint256[] memory createdAts
    ) {

        uint256 n = listings.length;
        ids = new uint256[](n);

        sellers = new address[](n);
        tokens = new address[](n);
        totals = new uint256[](n);
        remainings = new uint256[](n);
        prices = new uint256[](n);
        actives = new bool[](n);
        createdAts = new uint256[](n);

        for (uint256 i = 0; i < n; ++i) {
            Listing storage l = listings[i];
            ids[i] = i;
            sellers[i] = l.seller;
            tokens[i] = address(l.token);
            totals[i] = l.totalAmount;
            remainings[i] = l.remaining;
            prices[i] = l.pricePerToken;
            actives[i] = l.active;
            createdAts[i] = l.createdAt;
        }
    }

    function getSellerListings(address seller) external view returns (uint256[] memory) {
        return sellerListings[seller];
    }

    function proposePurchase(uint256 listingId, uint256 quantity, uint256 agreedPricePerToken) external returns (uint256) {

        require(listingId < listings.length, "invalid listing");
        Listing storage l = listings[listingId];
        require(l.active, "listing not active");
        require(quantity > 0 && quantity <= l.remaining, "invalid quantity");

        Purchase memory p = Purchase({
            listingId: listingId,
            buyer: msg.sender,
            quantity: quantity,
            agreedPricePerToken: agreedPricePerToken,
            status: PurchaseStatus.Proposed,
            seller: l.seller,
            createdAt: block.timestamp
        });

        purchases.push(p);
        uint256 purchaseId = purchases.length - 1;
        listingPurchases[listingId].push(purchaseId);

        emit PurchaseProposed(purchaseId, listingId, msg.sender, quantity, agreedPricePerToken);
        return purchaseId;

    }

    function lockPurchase(uint256 purchaseId) external nonReentrant {
        require(purchaseId < purchases.length, "invalid purchase");
        Purchase storage p = purchases[purchaseId];
        Listing storage l = listings[p.listingId];

        require(p.status == PurchaseStatus.Proposed, "purchase not proposed");
        require(msg.sender == l.seller, "only seller can lock");
        require(l.remaining >= p.quantity, "not enough remaining in listing");
        require(l.active, "listing inactive");

        // Transfer tokens from seller to contract
        l.token.safeTransferFrom(msg.sender, address(this), p.quantity);

        // Update states
        p.status = PurchaseStatus.Locked;
        l.remaining -= p.quantity;

        emit PurchaseLocked(purchaseId, p.listingId, msg.sender, p.quantity);
        emit ListingUpdatedRemaining(p.listingId, l.remaining);

    } 

    // Owner/arbiter releases locked tokens to buyer after backend verifies fiat
    function releasePurchase(uint256 purchaseId) external nonReentrant onlyOwner {
        require(purchaseId < purchases.length, "invalid purchase");
        Purchase storage p = purchases[purchaseId];
        Listing storage l = listings[p.listingId];
        
        // should add dispute function in future right now its unreachable status..
        require(p.status == PurchaseStatus.Locked || p.status == PurchaseStatus.Disputed, "not releasable");

        p.status = PurchaseStatus.Released;
        l.token.safeTransfer(p.buyer, p.quantity);

        emit PurchaseReleased(purchaseId, p.listingId, p.buyer, p.quantity);
    }

    function refundPurchase(uint256 purchaseId) external nonReentrant onlyOwner {
        require(purchaseId < purchases.length, "invalid purchase");
        Purchase storage p = purchases[purchaseId];
        Listing storage l = listings[p.listingId];

        require(p.status == PurchaseStatus.Locked || p.status == PurchaseStatus.Disputed, "not refundable");

        p.status = PurchaseStatus.Refunded;
        l.token.safeTransfer(l.seller, p.quantity);

        // restore listing remaining (seller can re-list or keep)
        l.remaining += p.quantity;
        l.active = true;

        emit PurchaseRefunded(purchaseId, p.listingId, l.seller, p.quantity);
        emit ListingUpdatedRemaining(p.listingId, l.remaining);
    }

    function cancelProposedPurchase(uint256 purchaseId) external {
        require(purchaseId < purchases.length, "invalid purchase");
        Purchase storage p = purchases[purchaseId];
        require(p.status == PurchaseStatus.Proposed, "not cancellable");
        require(msg.sender == p.buyer || msg.sender == p.seller, "only buyer or seller");

        p.status = PurchaseStatus.Cancelled;
        emit PurchaseCancelled(purchaseId);
    }

    function cancelListing(uint256 listingId) external {
        require(listingId < listings.length, "invalid listing");
        Listing storage l = listings[listingId];
        require(msg.sender == l.seller, "only seller");
        require(l.active, "not active");

        // We do NOT need to check for locked purchases. 
        // Locked purchases are already secured in the contract.
        // Cancelling simply stops NEW locks/proposals.
        
        l.active = false;
        emit ListingCancelled(listingId);
    }

    function getListingById(uint256 id) public view returns (Listing memory) {
        return listings[id];
    }
}