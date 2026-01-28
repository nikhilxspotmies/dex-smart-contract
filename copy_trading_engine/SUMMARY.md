# Copy Trading System Summary

This document explains the "Hybrid Architecture" we have built for Copy Trading, consisting of an On-Chain Vault and an Off-Chain Engine.

## 1. The Smart Contract ("The Vault")
**File:** `contracts/src/copy_trading/CopyTradingVault.sol`

Think of this contract as a **Smart Bank Account**.
-   **Custody:** It holds all user funds securely in one place.
-   **Internal Ledger:** Instead of creating separate wallets for everyone, it uses a "spreadsheet" (mapping) inside the contract to remember exactly how much of each token belongs to you.
-   **Security:** Only the **Executor** (our backend bot) is allowed to initiate trades on behalf of users.
-   **Execution:** When told to swap, it talks directly to your DEX Router to exchange tokens.

## 2. The Backend Engine ("The Brain")
**File:** `copy_trading_engine/src/index.ts`

This is a Node.js program that runs 24/7 (like a Cron Job). Its job is to **Watch** and **Decide**.

### How it works (The Loop):
1.  **Get Info:** Every few minutes, it looks at the Vault to see:
    -   *Who is User A copying?* (e.g., Whale B)
    -   *What tokens does User A have?*
    -   *What tokens does Whale B have?*

2.  **Check Prices (The "Eye"):**
    -   To know if portfolios are equal, it needs to know what tokens are worth.
    -   It calls your **DEX Router** directly (`getAmountsOut`) to check the price of every token in **TKB** (your stablecoin/base token).
    -   *Example:* "1 ETH is worth 3000 TKB".

3.  **Compare (The "Logic"):**
    -   It calculates percentages.
    -   *Whale:* 50% TKA, 50% TKB.
    -   *User:* 10% TKA, 90% TKB.
    -   **Result:** "User has too little TKA!"

4.  **Execute (The "Hand"):**
    -   If the difference is big (>5%), it creates specialized instructions ("Calldata").
    -   It sends a transaction to the **Vault** saying: *"Please swap User A's TKB for TKA right now."*

## Why this design?
-   **Gas Efficient:** Users don't pay gas for every trade; the Engine handles the logic off-chain.
-   **Accurate:** By using your DEX for prices, trades happen at real market rates.
-   **Safe:** The Engine cannot withdraw funds; it can only swap them back into the Vault.
