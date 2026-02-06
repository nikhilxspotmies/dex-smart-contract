import { getContract, readContract, prepareEvent, getContractEvents } from "thirdweb";
import { client, chain } from "./src/utils/client.js";
import dotenv from "dotenv";

dotenv.config();

const MARKET_ADDRESS = process.env.PERP_MARKET_ADDRESS || "";

async function check() {
    console.log("Checking Market:", MARKET_ADDRESS);
    const market = getContract({ client, chain, address: MARKET_ADDRESS });

    try {
        const pmAddress = await readContract({
            contract: market,
            method: "function positionManager() view returns (address)",
            params: [],
        }) as string;
        console.log("Position Manager:", pmAddress);

        const pm = getContract({ client, chain, address: pmAddress });
        const routerAddress = await readContract({
            contract: pm,
            method: "function router() view returns (address)",
            params: [],
        }) as string;
        console.log("Router:", routerAddress);

        const router = getContract({ client, chain, address: routerAddress });
        
        // Let's try to get the latest RequestCreated events
        const requestCreatedEvent = prepareEvent({
            signature: "event RequestCreated(uint256 indexed requestId, address indexed account, address indexed market, bool isIncrease)"
        });

        const events = await getContractEvents({
            contract: router,
            events: [requestCreatedEvent],
            limit: 10
        });

        console.log("\n--- Recent Requests ---");
        for (const event of events) {
            const { requestId, account, isIncrease } = event.args;
            
            // Check if request still exists (if not, it was executed or cancelled)
            const request = await readContract({
                contract: router,
                method: "function getRequest(uint256 requestId) view returns (bool exists, address account, address market, uint256 positionId, uint256 sizeDelta, uint256 collateralDelta, bool isLong, uint256 acceptablePrice, uint256 executionFee, uint256 timestamp)",
                params: [requestId],
            }) as any;

            console.log(`ID: ${requestId}, User: ${account}, Type: ${isIncrease ? "Increase" : "Decrease"}, Exists: ${request[0]}, Timestamp: ${new Date(Number(request[9]) * 1000).toLocaleString()}`);
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

check();
