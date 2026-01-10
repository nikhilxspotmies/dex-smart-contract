/**
 * Utility functions for perpetual futures calculations
 */
const ONE = BigInt('1000000000000000000'); // 1e18
/**
 * Calculate unrealized PnL
 */
export function calculateUnrealizedPnl(size, // Signed size (+ for long, - for short)
entryPrice, markPrice) {
    const sizeSigned = BigInt(size);
    const priceDiff = BigInt(markPrice) - BigInt(entryPrice);
    return (sizeSigned * priceDiff) / ONE;
}
/**
 * Calculate equity (margin balance + unrealized PnL)
 */
export function calculateEquity(marginBalance, // Signed (can be negative)
size, entryPrice, markPrice) {
    const upnl = calculateUnrealizedPnl(size, entryPrice, markPrice);
    return BigInt(marginBalance) + upnl;
}
/**
 * Calculate position notional value
 */
export function calculateNotional(size, markPrice) {
    const sizeAbs = size < 0n ? -size : size;
    return (sizeAbs * markPrice) / ONE;
}
/**
 * Calculate margin ratio
 */
export function calculateMarginRatio(marginBalance, size, entryPrice, markPrice) {
    if (size === 0n) {
        return BigInt('0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'); // Max int256
    }
    const equity = calculateEquity(marginBalance, size, entryPrice, markPrice);
    const notional = calculateNotional(size, markPrice);
    if (notional === 0n) {
        return BigInt('0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    }
    return (equity * ONE) / notional;
}
/**
 * Calculate leverage
 */
export function calculateLeverage(marginBalance, size, entryPrice, markPrice) {
    if (size === 0n) {
        return 0n;
    }
    const equity = calculateEquity(marginBalance, size, entryPrice, markPrice);
    const notional = calculateNotional(size, markPrice);
    if (equity <= 0n) {
        return BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'); // Max uint256
    }
    return (notional * ONE) / BigInt(equity);
}
/**
 * Calculate liquidation price for long position
 */
export function calculateLiquidationPriceLong(entryPrice, initialMarginRatio, leverage) {
    // LiqPrice = EntryPrice * (1 - InitialMarginRatio / Leverage)
    if (leverage === 0n)
        return 0n;
    const ratio = (initialMarginRatio * ONE) / leverage;
    return (entryPrice * (ONE - ratio)) / ONE;
}
/**
 * Calculate liquidation price for short position
 */
export function calculateLiquidationPriceShort(entryPrice, initialMarginRatio, leverage) {
    // For short: LiqPrice = EntryPrice * (1 + InitialMarginRatio / Leverage)
    if (leverage === 0n)
        return 0n;
    const ratio = (initialMarginRatio * ONE) / leverage;
    return (entryPrice * (ONE + ratio)) / ONE;
}
