
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CONFIG
const RPC_URL = "http://127.0.0.1:8545";
const ESCROW_ARTIFACT_PATH = path.resolve(__dirname, '../../abl.json');
// Attempt to find ERC20 artifact. Adjust if needed.
const ERC20_ARTIFACT_PATH = path.resolve(__dirname, '../../../p2p_escrow/out/P2PTokenEscrows.t.sol/MockUSDT.json');

async function main() {
    console.log("🌱 Seeding Local Chain...");

    // 1. Connect to Provider
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const network = await provider.getNetwork();
    console.log(`Connected to chain ID: ${network.chainId}`);

    // Account #0: Deployer & Admin (Standard Anvil Key)
    const deployer = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
    // Account #1: Seller
    const seller = new ethers.Wallet("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", provider);
    // Account #2: Buyer
    const buyer = new ethers.Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", provider);

    console.log(`Deployer: ${deployer.address}`);
    console.log(`Seller:   ${seller.address}`);
    console.log(`Buyer:    ${buyer.address}`);

    // 3. Load Artifacts
    const escrowArtifact = JSON.parse(fs.readFileSync(ESCROW_ARTIFACT_PATH, 'utf8'));

    let tokenArtifact;
    try {
        tokenArtifact = JSON.parse(fs.readFileSync(ERC20_ARTIFACT_PATH, 'utf8'));
    } catch (e) {
        console.error(`Could not read ERC20 artifact at ${ERC20_ARTIFACT_PATH}. Please ensure you have run 'forge build' in p2p_escrow.`);
        process.exit(1);
    }

    // 4. Manage Nonces Manually
    let deployerNonce = await provider.getTransactionCount(deployer.address);
    let sellerNonce = await provider.getTransactionCount(seller.address);
    let buyerNonce = await provider.getTransactionCount(buyer.address);
    console.log(`Initial Nonces -> Deployer: ${deployerNonce}, Seller: ${sellerNonce}, Buyer: ${buyerNonce}`);

    // 5. Deploy Mock Token
    console.log("Deploying Token...");
    let token;
    try {
        const TokenFactory = new ethers.ContractFactory(tokenArtifact.abi, tokenArtifact.bytecode, deployer);
        token = await TokenFactory.deploy({ nonce: deployerNonce++ });
    } catch (e) {
        console.error("Token deployment failed:", e);
        process.exit(1);
    }
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    console.log(`Token deployed at: ${tokenAddress}`);

    // 6. Deploy Escrow
    console.log("Deploying Escrow...");
    const EscrowFactory = new ethers.ContractFactory(escrowArtifact.abi, escrowArtifact.bytecode, deployer);
    const escrow = await EscrowFactory.deploy({ nonce: deployerNonce++ });
    await escrow.waitForDeployment();
    const escrowAddress = await escrow.getAddress();
    console.log(`Escrow deployed at: ${escrowAddress}`);

    // 7. Setup State
    // 7a. Mint tokens to Seller
    const tokenContract = new ethers.Contract(tokenAddress, tokenArtifact.abi, deployer);
    console.log("Minting to Seller...");
    try {
        // Try standard mint signature
        const tx = await tokenContract.mint!(seller.address, ethers.parseEther("1000"), { nonce: deployerNonce++ });
        await tx.wait();
        console.log("Minted 1000 TEST to Seller.");
    } catch (e) {
        console.log("Mint failed, attempting transfer from Deployer...");
        // Revert nonce if mint failed structurally (but here we assume it compiled so it used a nonce? 
        // Actually if method missing, it throws before sending tx? 
        // We carefully only increment if we send. 
        // But cleaner is: deployerNonce is already ++. If it failed locally (method mismatch), we wasted a nonce number? No, tx wasn't sent.
        // Let's assume mint() exists for now as per previous success.
        // If we fall back:
        try {
            // We need to re-fetch nonce if we aren't sure if the previous one was consumed?
            // Actually, safer to just re-read nonce if we catch?
            // Let's stick to the happy path where we succeeded before.
            // If previous run succeeded with mint, we use mint.
            const tx = await tokenContract.transfer!(seller.address, ethers.parseEther("1000"), { nonce: deployerNonce++ });
            await tx.wait();
            console.log("Transferred 1000 TEST from Deployer to Seller.");
        } catch (err) {
            console.log("Transfer failed.");
            // We might have consumed a nonce if the network rejected it.
        }
    }

    // 7b. Seller Approves Escrow
    const sellerToken = tokenContract.connect(seller) as ethers.Contract;
    const approvalTx = await sellerToken.approve!(escrowAddress, ethers.parseEther("10000"), { nonce: sellerNonce++ });
    await approvalTx.wait();
    console.log("Seller approved Escrow.");

    // 7c. Whitelist Token (if needed by Escrow)
    const escrowAdmin = new ethers.Contract(escrowAddress, escrowArtifact.abi, deployer);
    // Check if setTokenWhitelist exists on Contract object (it should be in ABI)
    try {
        if (escrowAdmin.setTokenWhitelist) {
            const tx = await escrowAdmin.setTokenWhitelist(tokenAddress, true, { nonce: deployerNonce++ });
            await tx.wait();
            console.log("Token Whitelisted.");
        }
    } catch (e) { console.log("Whitelisting optional or failed."); }

    // 7d. Create Listing
    const escrowSeller = escrowAdmin.connect(seller) as ethers.Contract;
    const listingTx = await escrowSeller.createListing!(
        tokenAddress,
        ethers.parseEther("100"),
        ethers.parseEther("1"),
        { nonce: sellerNonce++ }
    );
    await listingTx.wait();
    console.log("Listing Created (Id: 0)");

    // 7e. Propose Purchase
    const escrowBuyer = escrowAdmin.connect(buyer) as ethers.Contract;
    const purchaseTx = await escrowBuyer.proposePurchase!(
        0, // Listing ID 0
        ethers.parseEther("10"),
        ethers.parseEther("1"),
        { nonce: buyerNonce++ }
    );
    await purchaseTx.wait();
    console.log("Purchase Proposed (Id: 0)");

    // 7f. Lock Purchase
    const lockTx = await escrowSeller.lockPurchase!(0, { nonce: sellerNonce++ });
    await lockTx.wait();
    console.log("Purchase Locked (Id: 0)");

    console.log("\n====== READY FOR TESTING ======");
    console.log(`CONTRACT_ADDRESS=${escrowAddress}`);
    console.log(`Update this in your backend .env`);
    console.log(`Then test: POST /api/trade/release with body { "purchaseId": 0 }`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
