import { getContract, readContract } from "thirdweb";
import { client, chain } from "./src/utils/client.js";
import dotenv from "dotenv";

dotenv.config();

const MARKET_ADDRESS = process.env.PERP_MARKET_ADDRESS || "";

async function check() {
    console.log("Market Address:", MARKET_ADDRESS);
    const contract = getContract({
        client,
        chain,
        address: MARKET_ADDRESS,
    });

    try {
        const pmAddress = await readContract({
            contract,
            method: "function positionManager() view returns (address)",
            params: [],
        });
        console.log("Position Manager Address:", pmAddress);

        // We need to find the Router address. Often stored in PositionManager or Market.
        // Looking at README, PositionManager has router address.
        const pmContract = getContract({
            client,
            chain,
            address: pmAddress as string,
        });

        const routerAddress = await readContract({
            contract: pmContract,
            method: "function router() view returns (address)",
            params: [],
        });
        console.log("Router Address:", routerAddress);

    } catch (e) {
        console.error("Error fetching addresses:", e);
    }
}

check();
