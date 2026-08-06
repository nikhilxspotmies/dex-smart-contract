// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IAggregatorV3 {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/// @notice Chainlink wrapper with round-completeness, per-feed staleness and sanity-bound checks.
contract OracleModule is Ownable {
    error StalePrice();
    error InvalidPrice();
    error IncompleteRound();
    error PriceOutOfBounds();

    /// @notice Default staleness window used when a feed has no per-feed override.
    uint256 public constant DEFAULT_MAX_STALE = 1 hours;

    /// @notice Per-feed staleness window (seconds). 0 = use DEFAULT_MAX_STALE. (M2)
    mapping(address => uint256) public feedMaxStale;
    /// @notice Per-feed sanity bounds on the scaled 1e18 price. 0 = unset/skip. (M2)
    mapping(address => uint256) public feedMinPriceE18;
    mapping(address => uint256) public feedMaxPriceE18;

    event FeedMaxStaleSet(address indexed feed, uint256 maxStale);
    event FeedBoundsSet(address indexed feed, uint256 minPriceE18, uint256 maxPriceE18);

    constructor() Ownable(msg.sender) {}

    /// @notice owner sets a per-feed staleness window matched to that feed's heartbeat.
    function setFeedMaxStale(address feed, uint256 maxStale) external onlyOwner {
        feedMaxStale[feed] = maxStale;
        emit FeedMaxStaleSet(feed, maxStale);
    }

    /// @notice owner sets optional sanity bounds on a feed's scaled 1e18 price (0 = skip).
    function setFeedBounds(address feed, uint256 minPriceE18, uint256 maxPriceE18) external onlyOwner {
        require(maxPriceE18 == 0 || maxPriceE18 >= minPriceE18, "bad bounds");
        feedMinPriceE18[feed] = minPriceE18;
        feedMaxPriceE18[feed] = maxPriceE18;
        emit FeedBoundsSet(feed, minPriceE18, maxPriceE18);
    }

    function getPrice(address feed) external view returns (uint256 priceE18) {
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = IAggregatorV3(feed).latestRoundData();

        if (answer <= 0) revert InvalidPrice();
        // M2: round must be complete and not from a prior (stuck) round.
        if (updatedAt == 0) revert IncompleteRound();
        if (answeredInRound < roundId) revert IncompleteRound();

        // M2: per-feed staleness window (falls back to the conservative default).
        uint256 maxStale = feedMaxStale[feed];
        if (maxStale == 0) maxStale = DEFAULT_MAX_STALE;
        if (block.timestamp - updatedAt > maxStale) revert StalePrice();

        // Chainlink answers are 8 decimals; scale to 1e18
        priceE18 = uint256(answer) * 1e10;

        // M2: optional sanity bounds catch obviously-bad feed values.
        uint256 minP = feedMinPriceE18[feed];
        uint256 maxP = feedMaxPriceE18[feed];
        if (minP != 0 && priceE18 < minP) revert PriceOutOfBounds();
        if (maxP != 0 && priceE18 > maxP) revert PriceOutOfBounds();
    }
}
