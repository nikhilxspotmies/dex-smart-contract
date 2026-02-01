// import { createThirdwebClient, getContract, prepareContractCall, sendTransaction, waitForReceipt } from "thirdweb";
// import { privateKeyToAccount } from "thirdweb/wallets";
// import { sepolia } from "thirdweb/chains";
// import dotenv from "dotenv";
// import { fileURLToPath } from 'url';
// import path from 'path';

// // Load env from parent if needed, or current dir
// dotenv.config();

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// async function main() {
//     const args = process.argv.slice(2);
//     if (args.length < 1) {
//         console.error("Usage: npx ts-node scripts/whitelistToken.ts <TOKEN_ADDRESS>");
//         process.exit(1);
//     }

//     const tokenAddress = args[0];
//     const privateKey = process.env.PRIVATE_KEY;
//     const p2pAddress = process.env.P2P_CONTRACT_ADDRESS || process.env.VITE_P2P_CONTRACT; // Check both naming conventions
//     const secretKey = process.env.THIRDWEB_SECRET_KEY;

//     if (!privateKey) {
//         console.error("Error: PRIVATE_KEY not found in .env");
//         process.exit(1);
//     }
//     if (!p2pAddress) {
//         console.error("Error: P2P_CONTRACT_ADDRESS not found in .env");
//         process.exit(1);
//     }
//     if (!secretKey) {
//         console.error("Error: THIRDWEB_SECRET_KEY not found in .env");
//         process.exit(1);
//     }

//     const client = createThirdwebClient({
//         secretKey: secretKey,
//     });

//     const account = privateKeyToAccount({
//         client,
//         privateKey,
//     });

//     const contract = getContract({
//         client,
//         chain: sepolia,
//         address: p2pAddress,
//     });

//     console.log(`Whitelisting token ${tokenAddress} on P2P Contract ${p2pAddress}...`);

//     try {
//         const transaction = prepareContractCall({
//             contract,
//             method: "function setTokenWhitelist(address token, bool status)",
//             params: [tokenAddress, true],
//         });

//         const { transactionHash } = await sendTransaction({
//             transaction,
//             account,
//         });

//         console.log("Transaction sent. Hash:", transactionHash);

//         const receipt = await waitForReceipt({
//             client,
//             chain: sepolia,
//             transactionHash,
//         });

//         console.log("Token whitelisted successfully!");
//         console.log("Status:", receipt.status);

//     } catch (error) {
//         console.error("Failed to whitelist token:", error);
//     }
// }

// main();
