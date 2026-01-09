# System LP (Synthetic Liquidity Provider) Setup Guide

## Overview
The System LP is a special wallet that acts as a counterparty for unmatched orders, ensuring positions can be closed immediately even when there's no other trader available. This is essential for testing and initial bootstrapping.

## What is System LP?
- A regular wallet address (not a smart contract)
- Funded with USDC tokens
- Deposits USDC into the Perpetual contract
- Automatically acts as your trading partner when closing positions
- Takes losses so you can realize profits

## Prerequisites
1. Perpetual contract deployed
2. USDC token (mock token) deployed
3. Deployer wallet has USDC tokens (from initial deployment)

## Setup Methods

### Method 1: Automated Setup (Recommended)

#### Step 1: Set Environment Variables
Create or update your `.env` file in the `contracts` directory:

```bash
PERPETUAL_CONTRACT_ADDRESS=0x... # Your deployed Perpetual contract
USDC_ADDRESS=0x... # Your deployed USDC token address
SYSTEM_LP_DEPOSIT_AMOUNT=100000 # Amount to deposit (default: 100,000)
PRIVATE_KEY=0x... # Deployer private key (for funding)
```

#### Step 2: Run Setup Script
From the `contracts` directory:

```bash
forge script script/SetupSyntheticLP.s.sol:SetupSyntheticLP --rpc-url http://localhost:8545 --broadcast
```

#### Step 3: Copy Output
The script will output:
- System LP Address
- Instructions for `.env` configuration

#### Step 4: Configure Backend
Add to your backend `.env` file:

```env
USE_SYNTHETIC_LP=true
SYSTEM_LP_ADDRESS=0x... # Address from script output
```

#### Step 5: Restart Backend
Restart your backend server to apply changes.

### Method 2: Manual Setup

#### Step 1: Create System LP Wallet
Generate a new wallet (use MetaMask, Hardhat, or any wallet generator).

#### Step 2: Fund System LP Wallet
Transfer USDC tokens from your deployer wallet to the System LP wallet:
- Amount: At least 100,000 USDC (or desired amount)
- Use your wallet or a script to transfer tokens

#### Step 3: Approve Perpetual Contract
From System LP wallet, approve the Perpetual contract to spend USDC:
```solidity
usdc.approve(perpetualAddress, type(uint256).max);
```

#### Step 4: Deposit USDC
From System LP wallet, deposit USDC into Perpetual contract:
```solidity
// If your token uses 18 decimals, convert to 6 decimals for deposit
uint256 depositAmount = 100000 * 10**6; // 100,000 USDC in 6 decimals
perpetual.deposit(depositAmount);
```

#### Step 5: Configure Backend
Add to backend `.env`:
```env
USE_SYNTHETIC_LP=true
SYSTEM_LP_ADDRESS=0x... # Your System LP wallet address
```

## Verifying Setup

### Check System LP Balance
```bash
# Check USDC balance in System LP wallet
cast call <USDC_ADDRESS> "balanceOf(address)(uint256)" <SYSTEM_LP_ADDRESS>

# Check margin balance in Perpetual contract
cast call <PERPETUAL_CONTRACT> "getAccountSummary(address)(int256,int256,uint256,int256)" <SYSTEM_LP_ADDRESS>
```

### Check Contract USDC Balance
The Perpetual contract should have USDC equal to the deposit amount:
```bash
cast call <USDC_ADDRESS> "balanceOf(address)(uint256)" <PERPETUAL_CONTRACT_ADDRESS>
```

## Testing

### Test Close Position with Profit
1. Open a long position at price $2000
2. Set oracle price to $2200
3. Close the position
4. Verify:
   - Position closes immediately
   - Profit is added to your margin balance
   - You can withdraw the profit

### Expected Behavior
- Close position executes immediately (no waiting for counterparty)
- System LP acts as counterparty automatically
- Contract has USDC to pay your profit
- Withdrawal succeeds

## Troubleshooting

### Issue: "Insufficient balance" when withdrawing
**Solution**: Ensure System LP has deposited enough USDC into the contract.

### Issue: "Transaction reverted" when closing
**Solution**: 
- Check System LP has sufficient margin balance
- Verify `USE_SYNTHETIC_LP=true` in backend `.env`
- Check `SYSTEM_LP_ADDRESS` is correct

### Issue: System LP not acting as counterparty
**Solution**:
- Verify `USE_SYNTHETIC_LP=true` in backend
- Restart backend server
- Check backend logs for System LP usage

## Security Notes
- ⚠️ Never commit private keys to version control
- Store System LP private key securely (only needed for funding, not daily operations)
- System LP should have sufficient funds for expected trading volume
- Monitor System LP balance and refill as needed

## Production Considerations
For production, consider:
- Using a multisig wallet for System LP
- Implementing automated refilling mechanisms
- Setting limits on System LP exposure
- Using an insurance fund instead of System LP

