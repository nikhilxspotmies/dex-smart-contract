
// import { getContract, readContract } from "thirdweb";
// import { client, chain } from "../src/utils/client.js";
// import { config } from "dotenv";

// config();

// const MARKET_ADDRESS = process.env.PERP_MARKET_ADDRESS || process.env.VITE_PERP_MARKET_ADDRESS;

// if (!MARKET_ADDRESS) {
//     console.error("No Market Address found");
//     process.exit(1);
// }

// const contract = getContract({
//     client,
//     chain,
//     address: MARKET_ADDRESS
// });

// async function main() {
//     console.log("Checking Market State at:", MARKET_ADDRESS);

//     try {
//         const nextId = await readContract({
//             contract,
//             method: "function nextPositionId() view returns (uint256)",
//             params: []
//         });
//         console.log("Current nextPositionId:", nextId.toString());

//         // Also check recent positions
//         const lastId = Number(nextId) - 1;
//         if (lastId > 0) {
//             console.log(`Checking Position ${lastId}...`);
//             const pos = await readContract({
//                 contract,
//                 method: "function positions(uint256) view returns (uint256 size, uint256 collateral, uint256 entryPrice, int256 fundingEntry, bool isLong)",
//                 params: [BigInt(lastId)]
//             });
//             // Manual serialization for BigInt
//             const posFormatted = {
//                 size: pos[0].toString(),
//                 collateral: pos[1].toString(),
//                 entryPrice: pos[2].toString(),
//                 fundingEntry: pos[3].toString(),
//                 isLong: pos[4]
//             };
//             console.log(`Position ${lastId} details:`, JSON.stringify(posFormatted, null, 2));
//         }

//     } catch (e: any) {
//         console.error("Error fetching state:", e.message || e);
//     }
// }

// main();
