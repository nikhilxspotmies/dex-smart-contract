# Biconomy Social Login Integration Guide

## Overview
Biconomy Social Login (part of the Biconomy SDK / Particle Auth) allows users to log in using Web2 credentials (Google, Facebook, etc.) and automatically generates a non-custodial Smart Account (ERC-4337 compliant) for them.

## Frontend Integration (Conceptual)
1.  **Install SDK**: `@biconomy/account`, `@biconomy/bundler`, `@biconomy/paymaster`.
2.  **Initialize**:
    ```javascript
    import { SocialLogin } from "@biconomy/web3-auth";
    
    const socialLogin = new SocialLogin();
    await socialLogin.init();
    socialLogin.showWallet(); // Shows the login modal
    ```
3.  **Get Provider**: Once logged in, Biconomy provides an EIP-1193 provider.
4.  **Create Smart Account**:
    ```javascript
    const smartAccount = await BiconomySmartAccountV2.create({ 
      signer: provider, 
      chainId: ChainId.POLYGON_MUMBAI 
    });
    const address = await smartAccount.getAccountAddress();
    ```

## Backend Interaction
The backend does **not** directly handle the Google OAuth tokens. Instead, it interacts with the **Smart Account Address**.

### Authentication (SIWE)
To prove to the backend that `User A` controls `Address X`:
1.  **Frontend**: Requests a nonce from Backend.
2.  **Frontend**: Signs a message `Sign this message to login: <nonce>` using the Biconomy Smart Account signer (or the underlying EOA if compatible, but usually 1271 signature validation is safer for Smart Accounts).
3.  **Backend**: Verifies the signature.
    *   For EOAs: `ethers.verifyMessage`.
    *   For Smart Accounts (ERC-1271): Call `isValidSignature` on the verification contract/Smart Account.

## P2P Trade Flow with Biconomy
1.  **Login**: User logs in via Social Login -> Gets Smart Account Address on Frontend.
2.  **Profile**: User signs msg -> Backend verifies -> User sets UPI ID.
3.  **Interact**: User calls `P2PTokenEscrow` methods via Biconomy Bundler (Gasless transactions possible).
    *   `msg.sender` in the contract will be the Smart Account Address.
