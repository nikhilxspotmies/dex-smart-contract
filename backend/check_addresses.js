import { createThirdwebClient, getContract, readContract } from "thirdweb";
import { config } from "dotenv";
config();

const client = createThirdwebClient({ clientId: process.env.THIRDWEB_CLIENT_ID || "" });
const chain = { id: 56 }; // BSC

const routerAddr = process.env.PERP_ROUTER_ADDRESS;
const pmAddr = process.env.PERP_POSITION_MANAGER_ADDRESS;

async function check() {
    console.log("Router Address:", routerAddr);
    console.log("PositionManager Address:", pmAddr);

    const pmContract = getContract({
        client,
        address: pmAddr,
        chain,
    });

    try {
        const pmRouter = await readContract({
            contract: pmContract,
            method: "function router() view returns (address)",
            params: [],
        });
        console.log("Router address set in PositionManager:", pmRouter);

        if (pmRouter.toLowerCase() !== routerAddr.toLowerCase()) {
            console.error("MISMATCH DETECTED!");
        } else {
            console.log("Addresses match.");
        }
    } catch (err) {
        console.error("Failed to read router() from PM:", err.message);
    }
}

check();
