// src/client.ts
import { createThirdwebClient } from "thirdweb";
import { anvil, sepolia } from "thirdweb/chains";
import dotenv from "dotenv";

dotenv.config();

export const client = createThirdwebClient({
    clientId: process.env.THIRDWEB_CLIENT_ID!,
});
// export const chain = sepolia;
export const chain = anvil;