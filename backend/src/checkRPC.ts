import { createThirdwebClient } from "thirdweb";
import { defineChain } from "thirdweb/chains";
import { getRpcClient, eth_blockNumber, eth_getBlockByNumber } from "thirdweb/rpc";
import dotenv from "dotenv";

dotenv.config();

const p2pRpcUrl = process.env.P2P_RPC_URL || "https://bsc-dataseed.binance.org/";
const mainRpcUrl = process.env.RPC_URL;

console.log("Testing P2P RPC URL:", p2pRpcUrl);
console.log("Main RPC URL (preserved):", mainRpcUrl);

const client = createThirdwebClient({
    clientId: process.env.THIRDWEB_CLIENT_ID || "demo",
});

const chain = defineChain({
    id: 56,
    name: "Binance Smart Chain (P2P)",
    rpc: p2pRpcUrl,
});

async function test() {
    try {
        const rpcRequest = getRpcClient({ client, chain });

        console.log("Fetching latest block number from P2P RPC...");
        const blockNumber = await eth_blockNumber(rpcRequest);
        console.log("Latest block number:", blockNumber);

        console.log("Fetching basic valid block...");
        const block = await eth_getBlockByNumber(rpcRequest, { blockTag: "latest" });
        if (block) {
            console.log("SUCCESS: P2P RPC is working! Block Hash:", block.hash);
        } else {
            console.error("FAILURE: Latest block NOT found on P2P RPC!");
        }

    } catch (error) {
        console.error("P2P RPC Test Failed:", error);
    }
}

test();
