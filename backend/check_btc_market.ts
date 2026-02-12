import { getContract, readContract } from "thirdweb";
import { client, chain } from "./src/utils/client.js";
import dotenv from "dotenv";

dotenv.config();

const BTC_MARKET = process.env.VITE_PERP_MARKET_BTC_ADDRESS || "";

async function check() {
    if (!BTC_MARKET) { console.log("No BTC Market address"); return; }
    console.log("Checking BTC Market:", BTC_MARKET);
    const market = getContract({ client, chain, address: BTC_MARKET });
    try {
        const count = await readContract({
            contract: market,
            method: "function nextPositionId() view returns (uint256)",
            params: [],
        }) as bigint;
        console.log("BTC Positions:", count.toString());
    } catch (e) {
        console.error("Error:", e);
    }
}
check();
