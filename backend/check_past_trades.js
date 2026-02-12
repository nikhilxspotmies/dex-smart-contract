import { getContract, readContract } from "thirdweb";
import { client, chain } from "./src/utils/client.js";
import dotenv from "dotenv";
dotenv.config();
const MARKET_ADDRESS = process.env.PERP_MARKET_ADDRESS || "";
async function check() {
    const market = getContract({ client, chain, address: MARKET_ADDRESS });
    try {
        const count = await readContract({
            contract: market,
            method: "function nextPositionId() view returns (uint256)",
            params: [],
        });
        console.log("Total positions created on-chain:", count.toString());
        // Check the last few positions
        for (let i = Number(count) - 1; i >= Math.max(0, Number(count) - 5); i--) {
            const pos = await readContract({
                contract: market,
                method: "function getPosition(uint256) view returns (uint256 size, uint256 collateral, uint256 entryPrice, uint256 fundingEntry, bool isLong)",
                params: [BigInt(i)],
            });
            console.log(`Pos ${i}: Size ${pos[0]}, Long: ${pos[4]}`);
        }
    }
    catch (e) {
        console.error("Error:", e);
    }
}
check();
//# sourceMappingURL=check_past_trades.js.map