
import { getContract, readContract, prepareContractCall, sendTransaction, waitForReceipt } from "thirdweb";
import { client, chain } from "../utils/client.js";
import { privateKeyToAccount } from "thirdweb/wallets";
import { config } from "dotenv";

config();

const ROUTER_ADDRESS = process.env.PERP_ROUTER_ADDRESS;
const PM_ADDRESS = process.env.PERP_POSITION_MANAGER_ADDRESS;

if (!ROUTER_ADDRESS || !PM_ADDRESS) {
    console.error("Missing PERP_ROUTER_ADDRESS or PERP_POSITION_MANAGER_ADDRESS");
}

const POLL_INTERVAL = 5000; // 5 seconds for trade execution

export class RequestKeeper {
    private isRunning: boolean = false;
    private account: any;
    private lastProcessedRequestId: bigint = 0n;

    constructor() {
        console.log("DEBUG: RequestKeeper constructor called");
        if (!process.env.PRIVATE_KEY) {
            console.error("PRIVATE_KEY missing for RequestKeeper");
            return;
        }
        try {
            this.account = privateKeyToAccount({
                client,
                privateKey: process.env.PRIVATE_KEY as string,
            });
            console.log("RequestKeeper initialized with account:", this.account.address);
        } catch (err) {
            console.error("DEBUG: Failed to initialize RequestKeeper account:", err);
        }
    }

    async start() {
        console.log("DEBUG: RequestKeeper.start() called");
        if (this.isRunning) return;
        this.isRunning = true;

        // Initialize lastProcessedRequestId to nextRequestId - some buffer
        try {
            const routerContract = getContract({
                client,
                chain,
                address: ROUTER_ADDRESS!
            });
            const nextId = await readContract({
                contract: routerContract,
                method: "function nextRequestId() view returns (uint256)",
                params: [],
            }) as bigint;
            this.lastProcessedRequestId = nextId > 10n ? nextId - 10n : 0n;
            console.log(`RequestKeeper starting from request ID: ${this.lastProcessedRequestId}`);
        } catch (e) {
            console.error("Failed to initialize RequestKeeper state:", e);
        }

        this.loop();
    }

    private async loop() {
        if (!this.isRunning) return;

        try {
            await this.checkAndExecuteRequests();
        } catch (error) {
            console.error("Error in RequestKeeper loop:", error);
        }

        setTimeout(() => this.loop(), POLL_INTERVAL);
    }

    private async checkAndExecuteRequests() {
        if (!ROUTER_ADDRESS || !PM_ADDRESS) return;

        const routerContract = getContract({
            client,
            chain,
            address: ROUTER_ADDRESS
        });

        const pmContract = getContract({
            client,
            chain,
            address: PM_ADDRESS
        });

        // 1. Get nextRequestId
        const nextId = await readContract({
            contract: routerContract,
            method: "function nextRequestId() view returns (uint256)",
            params: [],
        }) as bigint;

        if (nextId <= this.lastProcessedRequestId) return;

        console.log(`Checking requests from ${this.lastProcessedRequestId} to ${nextId - 1n}`);

        // 2. Iterate through new requests
        for (let id = this.lastProcessedRequestId; id < nextId; id++) {
            try {
                // function getRequest(uint256 id) public view returns (Request memory)
                const request = await readContract({
                    contract: routerContract,
                    method: "function getRequest(uint256) view returns (address user, address market, uint256 positionId, uint256 sizeDelta, uint256 collateralDelta, bool isLong, uint256 acceptablePrice, uint256 executionFee, bool isIncrease, bool exists)",
                    params: [id],
                }) as any;

                console.log(`DEBUG: Request ${id} data:`, JSON.stringify(request, (key, value) => typeof value === 'bigint' ? value.toString() : value));

                if (request.exists || request[9] === true) {
                    console.log(`Executing request ${id} (${request.isIncrease ? "Increase" : "Decrease"}) for user ${request.user}`);

                    const method = request.isIncrease ? "executeIncrease" : "executeDecrease";
                    const tx = prepareContractCall({
                        contract: pmContract,
                        method: `function ${method}(uint256 requestId)`,
                        params: [id],
                    });

                    const result = await sendTransaction({
                        transaction: tx,
                        account: this.account
                    });

                    console.log(`Transaction sent for request ${id}: ${result.transactionHash}`);
                    const receipt = await waitForReceipt(result);
                    console.log(`Request ${id} executed successfully in tx ${receipt.transactionHash}`);
                }
            } catch (error: any) {
                // If it fails with "already executed" or similar, we might still want to increment lastProcessedRequestId
                console.error(`Failed to execute request ${id}:`, error.message);

                try {
                    const checkReq = await readContract({
                        contract: routerContract,
                        method: "function getRequest(uint256) view returns (address user, address market, uint256 positionId, uint256 sizeDelta, uint256 collateralDelta, bool isLong, uint256 acceptablePrice, uint256 executionFee, bool isIncrease, bool exists)",
                        params: [id],
                    }) as any;
                    if (!checkReq.exists) {
                        console.log(`Request ${id} no longer exists, marking as processed.`);
                        this.lastProcessedRequestId = id + 1n;
                    } else {
                        console.log(`Request ${id} still exists (likely slippage), will retry in next poll.`);
                        // Do NOT increment lastProcessedRequestId, we want to stop and retry from here
                        return;
                    }
                } catch (e) {
                    console.error(`Error re-checking request ${id}`);
                    return; // Stop polling for now if we can't verify state
                }
            }
        }
    }
}
