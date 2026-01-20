// src/client.ts
import { createThirdwebClient } from "thirdweb";
import { anvil, bsc, sepolia } from "thirdweb/chains";
import dotenv from "dotenv";

dotenv.config();

export const client = createThirdwebClient({
  clientId: process.env.THIRDWEB_CLIENT_ID!,
});
// export const chain = bsc;
// export const chain = anvil;

// import { createThirdwebClient } from "thirdweb";
import { defineChain } from "thirdweb/chains";

// export const client = createThirdwebClient({
//   clientId: process.env.THIRDWEB_CLIENT_ID!,
// });

// // Define your custom chain with RPC
export const chain = defineChain({
  id: 56, // BNB Smart Chain Mainnet
  name: "BNB Smart Chain",
  rpc: process.env.RPC_URL || "https://bsc-dataseed.binance.org/",
});

// // Example: use with a contract
// import { getContract } from "thirdweb";

// const contract = getContract({
//   client,
//   chain: bnbChain,
//   address: "0xYourContractAddress",
// });
