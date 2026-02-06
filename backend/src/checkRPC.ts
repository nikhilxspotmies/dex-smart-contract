import { createThirdwebClient } from "thirdweb";
import { defineChain } from "thirdweb/chains";
import { getRpcClient, eth_blockNumber, eth_getBlockByNumber } from "thirdweb/rpc";
import dotenv from "dotenv";

dotenv.config();

const rpcUrl = process.env.RPC_URL || "https://bsc-dataseed.binance.org/";
console.log("Testing RPC URL:", rpcUrl);

const client = createThirdwebClient({
    clientId: process.env.THIRDWEB_CLIENT_ID || "demo",
});

const chain = defineChain({
    id: 56,
    name: "Binance Smart Chain",
    rpc: rpcUrl,
});

async function test() {
    try {
        const rpcRequest = getRpcClient({ client, chain });

        console.log("Fetching latest block number...");
        const blockNumber = await eth_blockNumber(rpcRequest);
        console.log("Latest block number:", blockNumber);

        console.log("Fetching latest block...");
        const block = await eth_getBlockByNumber(rpcRequest, { blockTag: "latest" });
        if (block) {
            console.log("Latest block found. Hash:", block.hash);
        } else {
            console.error("Latest block NOT found!");
        }

        // specific block test (e.g. current - 100)
        const oldBlockNum = blockNumber - 100n;
        console.log("Fetching block:", oldBlockNum);
        const oldBlock = await eth_getBlockByNumber(rpcRequest, { blockNumber: oldBlockNum });
        if (oldBlock) {
            console.log("Old block found. Hash:", oldBlock.hash);
        } else {
            console.error("Old block NOT found!");
        }

    } catch (error) {
        console.error("RPC Test Failed:", error);
    }
}

test();
