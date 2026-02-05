
import { createThirdwebClient } from "thirdweb";
import { defineChain } from "thirdweb/chains";
import dotenv from "dotenv";

dotenv.config();

export const client = createThirdwebClient({
  clientId: process.env.THIRDWEB_CLIENT_ID || "8ca215ef540ad64e09539db92ef92e91",
});

export const chain = defineChain({
  id: 56,
  name: "Binance Smart Chain",
  rpc: process.env.RPC_URL || "https://bsc-dataseed.binance.org/",
});
