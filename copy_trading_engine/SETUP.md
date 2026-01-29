# Copy Trading System Setup Guide

This guide explains how to start the entire system (Blockchain, Backend, and Frontend) from scratch.

## 1. Start the Blockchain (Anvil)
We need a local blockchain to run everything on.

1.  Open a terminal.
2.  Run:
    ```bash
    anvil
    ```
3.  Keep this terminal **OPEN**. This is your "local internet".

## 2. Deploy Contracts
We need to put our Smart Contracts onto the blockchain.

1.  Open a **new** terminal.
2.  Go to the contracts folder:
    ```bash
    cd dex-smart-contract/contracts
    ```
3.  Run the deployment script:
    ```bash
    forge script script/DeployIntegration.s.sol:DeployIntegration --rpc-url http://127.0.0.1:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
    ```
    *(Note: The private key is the default Anvil account #0)*

### 🚀 IMPORTANT: Save Your Addresses!
The script output will print addresses for:
-   **Token A**
-   **Token B**
-   **Factory**
-   **Router**
-   **Vault** (Base/Implementation)

You will need these for the next steps.

---

## 3. Setup the Backend (The Engine)
The backend watches the blockchain and executes trades.

1.  Go to the engine folder:
    ```bash
    cd ../copy_trading_engine
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  **Configure Environment**:
    -   Copy `.env.example` to `.env`.
    -   Open `.env`.
    -   Update `FACTORY_ADDRESS` (Use the **CopyTrading Factory** address, NOT the DEX Factory), `ROUTER_ADDRESS` (Use the **DEX Router**), `TOKEN_A_ADDRESS`, etc.
4.  Start the Engine:
    ```bash
    npm start
    ```
5.  You should see: `Copy Trading Engine V2 Initialized.`

---

## 4. Setup the Frontend (The Website)
The user interface where you can create your account and follow traders.

1.  Open a **new** terminal.
2.  Go to the frontend folder:
    ```bash
    cd ../../Amerox-dex
    ```
3.  **Configure Environment**:
    -   Create or open `.env`.
    -   Update the variables with the addresses from **Step 2**:
        ```env
        VITE_COPY_TRADING_FACTORY=0x...
        VITE_TOKEN_A_ADDRESS=0x...
        VITE_TOKEN_B_ADDRESS=0x...
        ```
4.  Start the Website:
    ```bash
    npm run dev
    ```

---

## 5. How to Test (User Flow)

Now that everything is running, here is how to simulate a user:

1.  **Connect Wallet**: Open the website (`localhost:5173`) and connect your wallet (use a different Anvil private key, e.g., Account #1).
2.  **Go to Copy Trading**: Click on the "Copy Trading" page.
3.  **Follow a Whale**:
    -   Click **"Follow"** on a trader (e.g., CryptoWhale).
    -   **Step A (First Time)**: It will ask you to **"Create Trading Account"**. Click it and sign the transaction.
    -   **Step B**: Once created, it will ask to **"Follow [Name]"**. Click to confirm (this sets the target whale on-chain).
    -   **Step C**: Select **Token B (TKB)** (since it's the stable/quote token) and enter an amount (e.g., 100). Click **"Deposit"**.
4.  **Watch it Work**:
    -   Check your Backend terminal.
    -   It will say `Found 1 vaults`.
    -   Every 30 seconds, it will compare your vault vs. the whale.
    -   If the whale's portfolio changes, your vault will automatically swap tokens to match!




== Logs ==
  Token A deployed at: 0x5FbDB2315678afecb367f032d93F642f64180aa3
  Token B deployed at: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
  DEX Factory deployed at: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
  DEX Router deployed at: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
  Pair (TKNA/TKNB) created at: 0x021e183241a950AbF48EF4702A812A6fcA6DaC80
  CopyTrading Vault Impl deployed at: 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853
  CopyTrading Factory deployed at: 0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6

## Setting up 1 EVM.

==========================

Chain 31337
