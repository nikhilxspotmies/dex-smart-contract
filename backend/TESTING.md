# Testing Release Funds Flow (Local Integration)

This guide explains how to test the Release Funds backend functionality using a local Anvil blockchain.

## Prerequisites
- **Anvil**: Installed via Foundry (`foundryup`).
- **Node.js**: Installed.

## Steps

### 1. Start Local Blockchain
Open a terminal and run Anvil:
```bash
anvil
```
Keep this running. It exposes an RPC at `http://127.0.0.1:8545` and pre-funded accounts.

### 2. Seed the Blockchain
Open a new terminal in `backend/`. Run the seed script to deploy contracts and set up a "Locked" purchase:
```bash
npx ts-node --esm src/scripts/seedLocalChain.ts
```
**Output:**
- It will deploy a Test Token and the Escrow Contract.
- It will simulate a trade: Listing -> Proposal -> Lock.
- It will print the `CONTRACT_ADDRESS`.

### 3. Configure Backend
Update your `backend/.env` file with the address from the previous step:
```env
RPC_URL=http://127.0.0.1:8545
# Use Account #0 Private Key from Anvil (Deployer/Admin)
ADMIN_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
CONTRACT_ADDRESS=<PASTE_ADDRESS_FROM_SEED_SCRIPT>
MONGO_URI=<YOUR_MONGO_URI>
```

### 4. Start Backend
```bash
npm run dev
```
The backend will connect to Anvil. You should see "Blockchain Event Listener..." in the logs.
*Note: Since the Purchase was locked *before* the backend started, the event listener might not catch the historic log unless you restart the backend *before* runnning the seed script (if you want to test listener) OR just check the DB update on Release.*

### 5. Trigger Release
Send a POST request to release the funds (Purchase ID 1 is created by the seed script):
```bash
curl -X POST http://localhost:8080/api/trade/release \
  -H "Content-Type: application/json" \
  -d '{"purchaseId": 1}'
```

### 6. Verify Result
- **Backend Logs**: Should show "Releasing purchase 1..." and "Purchase 1 released".
- **Anvil Logs**: Should show a transaction trace.
- **Database**: Trade status should update to `Released`.
