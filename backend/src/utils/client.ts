
import { createThirdwebClient } from "thirdweb";
import { defineChain } from "thirdweb/chains";
import dotenv from "dotenv";

dotenv.config();

export const client = createThirdwebClient({
  clientId: process.env.THIRDWEB_CLIENT_ID || "8ca215ef540ad64e09539db92ef92e91",
});

const chainId = Number(process.env.CHAIN_ID) || 56;
const rpcUrl = process.env.RPC_URL || "https://bsc-dataseed.binance.org/";

export const chain = defineChain({
  id: chainId,
  rpc: rpcUrl,
});

export const p2pChain = defineChain({
  id: chainId,
  rpc: process.env.P2P_RPC_URL || rpcUrl,
});
