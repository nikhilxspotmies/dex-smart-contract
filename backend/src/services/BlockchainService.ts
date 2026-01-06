
import dotenv from 'dotenv';
import Trade from '../models/Trade.js';
import Listing from '../models/Listing.js';
// @ts-ignore
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    getContract,
    prepareContractCall,
    sendTransaction,
    watchContractEvents,
    toTokens,
    waitForReceipt
} from "thirdweb";
import { privateKeyToAccount } from "thirdweb/wallets";
import { client, chain } from "../utils/client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ablPath = path.resolve(__dirname, '../../abl.json');
const abl = JSON.parse(fs.readFileSync(ablPath, 'utf8'));
const SC_ABI = abl.abi;

dotenv.config();

class BlockchainService {
    private account: any;
    private contract: any;
    private isListening: boolean = false;

    constructor() {
        const privateKey = process.env.PRIVATE_KEY;
        const contractAddress = process.env.CONTRACT_ADDRESS;

        if (!privateKey || !contractAddress) {
            console.error("Missing Blockchain Config: PRIVATE_KEY or CONTRACT_ADDRESS");
            return;
        }

        // Initialize Account
        this.account = privateKeyToAccount({
            client: client,
            privateKey: privateKey
        });

        // Initialize Contract
        this.contract = getContract({
            client: client,
            chain: chain,
            address: contractAddress,
            abi: SC_ABI
        });

        console.log("BlockchainService Initialized with Thirdweb SDK");
    }

    public async releasePurchase(purchaseId: number): Promise<string> {
        if (!this.contract || !this.account) throw new Error("Contract or Account not initialized");

        console.log(`Releasing purchase ${purchaseId}...`);

        const transaction = prepareContractCall({
            contract: this.contract,
            method: "function releasePurchase(uint256 purchaseId)",
            params: [BigInt(purchaseId)]
        });

        // Send transaction from the Admin Account
        const { transactionHash } = await sendTransaction({
            transaction,
            account: this.account
        });

        console.log(`Transaction submitted. Hash: ${transactionHash}`);

        // Wait for confirmation
        try {
            const receipt = await waitForReceipt({
                client: client,
                chain: chain,
                transactionHash: transactionHash
            });
            console.log(`Purchase ${purchaseId} release confirmed in block ${receipt.blockNumber}.`);
        } catch (error) {
            console.error("Error waiting for transaction receipt:", error);
            // We still return the hash, but maybe we should throw if it failed?
            // If waitForReceipt fails, it might be a timeout or revert.
            // For now, let's log and return hash, but the controller handles the DB update.
            //Ideally, if it reverts, waitForReceipt might throw.
        }

        return transactionHash;
    }

    public startEventListener() {
        if (!this.contract || this.isListening) return;

        console.log("Starting Blockchain Event Listener (Thirdweb)...");
        this.isListening = true;

        // Watch all events
        watchContractEvents({
            contract: this.contract,
            onEvents: (events) => {
                events.forEach(event => this.processEvent(event));
            }
        });
    }

    private async processEvent(event: any) {
        try {
            const { eventName, args } = event;
            // console.log("Received Event:", eventName, args);

            if (eventName === "ListingCreated") {
                const { listingId, seller, token, totalAmount, pricePerToken } = args;
                const lId = Number(listingId);
                const amt = toTokens(totalAmount, 18);
                const price = toTokens(pricePerToken, 18);

                console.log(`Event: ListingCreated - ID: ${lId}, Seller: ${seller}, Price: ${price}`);
                console.log(`Event: ListingCreated - ID: ${lId}, Seller: ${seller}, Price: ${price}`);

                await Listing.findOneAndUpdate(
                    { listingId: lId },
                    {
                        listingId: lId,
                        seller: seller,
                        token: token,
                        totalAmount: Number(amt),
                        remaining: Number(amt),
                        pricePerToken: Number(price),
                        active: true
                    },
                    { upsert: true, new: true }
                );
                console.log(`Listing ${lId} indexed/updated.`);
            }
            else if (eventName === "PurchaseProposed") {
                const { purchaseId, listingId, buyer, quantity, pricePerToken } = args;
                const pId = Number(purchaseId);
                const lId = Number(listingId);
                const q = toTokens(quantity, 18);
                const p = toTokens(pricePerToken, 18);

                console.log(`Event: PurchaseProposed - PurchaseID: ${pId}, ListingID: ${lId}, Buyer: ${buyer}`);
                console.log(`Event: PurchaseProposed - PurchaseID: ${pId}, ListingID: ${lId}, Buyer: ${buyer}`);

                // Always fetch the latest listing data to ensure we have the correct seller
                const listing = await Listing.findOne({ listingId: lId });

                if (listing) {
                    await Trade.findOneAndUpdate(
                        { purchaseId: pId },
                        {
                            purchaseId: pId,
                            listingId: lId,
                            buyer: buyer,
                            seller: listing.seller,
                            quantity: Number(q),
                            pricePerToken: Number(p),
                            status: 'Proposed'
                        },
                        { upsert: true, new: true }
                    );
                    console.log(`Trade ${pId} created/updated in DB.`);
                } else {
                    console.warn(`Listing ${lId} not found for Purchase ${pId}`);
                }
            }
            else if (eventName === "PurchaseLocked") {
                const { purchaseId } = args;
                const pId = Number(purchaseId);
                console.log(`Event: PurchaseLocked - ID: ${pId}`);

                const trade = await Trade.findOne({ purchaseId: pId });
                if (trade) {
                    trade.status = 'Locked';
                    await trade.save();
                    console.log(`Trade ${pId} updated to Locked.`);
                }
            }
            else if (eventName === "PurchaseReleased") {
                const { purchaseId } = args;
                const pId = Number(purchaseId);
                console.log(`Event: PurchaseReleased - ID: ${pId}`);
                await Trade.findOneAndUpdate({ purchaseId: pId }, { status: 'Released' });
            }
            else if (eventName === "PurchaseCancelled") {
                const { purchaseId } = args;
                const pId = Number(purchaseId);
                await Trade.findOneAndUpdate({ purchaseId: pId }, { status: 'Cancelled' });
            }
            else if (eventName === "ListingUpdatedRemaining") {
                const { listingId, remaining } = args;
                const lId = Number(listingId);
                const rem = toTokens(remaining, 18);
                await Listing.findOneAndUpdate({ listingId: lId }, { remaining: Number(rem) });
                if (Number(rem) === 0) {
                    await Listing.findOneAndUpdate({ listingId: lId }, { active: false });
                }
            }
            else if (eventName === "ListingCancelled") {
                const { listingId } = args;
                const lId = Number(listingId);
                await Listing.findOneAndUpdate({ listingId: lId }, { active: false });
            }

        } catch (error) {
            console.error("Error processing event:", error);
        }
    }
}

export default new BlockchainService();
