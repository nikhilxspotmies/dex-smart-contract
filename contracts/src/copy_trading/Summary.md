# Copy Trading System - Simple Summary

This document explains how the Copy Trading system works in simple terms.

## 1. The Core Concept
The goal is simple: **You (the User)** want your portfolio to automatically mirror the trades of a successful trader **(the Whale)**. When they buy, you buy. When they sell, you sell.

## 2. Your Personal Vault (The "Smart Information")
In the old way, everyone put money into one big pool. That was risky.
**Now, every User gets their own private Vault.**

*   **It's Yours:** You are the "Owner" of this vault contract.
*   **It's Safe:** Your funds are not mixed with anyone else's.
*   **It's Efficient:** We use a "Factory" to create these vaults cheaply.

Think of it like a bank safe deposit box. Only you have the key to open it (withdraw), but you give a specific permission to a "Manager" (the Bot) to arrange the contents inside.

## 3. How It Works (Step-by-Step)

### Step 1: Deposit
You create your Vault (happens automatically) and deposit your funds (e.g., 10 ETH).
*Current Status:* Your Vault holds 10 ETH.

### Step 2: Select a Whale
You tell the system, "I want to copy **Whale Bob**".

### Step 3: The Watcher (The "Eyes")
We have a backend system (The Copy Trading Engine) that watches **Whale Bob** 24/7.
*   It calculates: "Bob holds 50% ETH and 50% USDC".
*   It looks at **Your Vault**: "You hold 100% ETH".
*   **Result:** You are out of sync! You need to sell 50% of your ETH for USDC.

### Step 4: The Executor (The "Hands")
The Engine sends a command to **Your Vault**:
> "Please swap 5 ETH for USDC."

**Your Vault** checks two things:
1.  Is this command from the authorized Executor? (Yes)
2.  Is the trade safe (slippage protection)? (Yes)

Then, **Your Vault** executes the swap on the DEX.

### Step 5: Profit & Withdraw
Your Vault now holds the same ratio of tokens as the Whale. If the Whale makes money, the value of the tokens in your Vault goes up.
*   **Withdrawal:** You can click "Withdraw" at ANY time. The Vault immediately sends all your tokens back to your personal wallet.

## 4. Safety & Security
*   **No Pooling:** If another user loses money, YOU are safe. Your funds are separate.
*   **No Theft:** The "Executor" bot can only *swap* tokens (buy/sell). It CANNOT withdraw your ETH or send it to someone else.
*   **Full Control:** You essentially own a smart contract that does the trading for you.
