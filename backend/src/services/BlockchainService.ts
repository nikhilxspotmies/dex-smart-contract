
import { ethers } from 'ethers';
import dotenv from 'dotenv';
// import { createTradeMetadata } from '../controllers/TradeController.js';
import Trade from '../models/Trade.js';
import Listing from '../models/Listing.js';
// @ts-ignore
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ablPath = path.resolve(__dirname, '../../abl.json');
const abl = JSON.parse(fs.readFileSync(ablPath, 'utf8'));
const SC_ABI = abl.abi;

dotenv.config();

class BlockchainService {
    private provider?: ethers.JsonRpcProvider;
    private wallet?: ethers.Wallet;
    private contract?: ethers.Contract;
    private isListening: boolean = false;

    constructor() {
        const rpcUrl = process.env.RPC_URL;
        const privateKey = process.env.ADMIN_PRIVATE_KEY;
        const contractAddress = process.env.CONTRACT_ADDRESS;

        if (!rpcUrl || !privateKey || !contractAddress) {
            console.error("Missing Blockchain Config: RPC_URL, ADMIN_PRIVATE_KEY, or CONTRACT_ADDRESS");
            // We don't throw here to avoid crashing the server if config is missing, 
            // but functionality will be limited.
        }

        if (rpcUrl) {
            this.provider = new ethers.JsonRpcProvider(rpcUrl);
            if (privateKey) {
                this.wallet = new ethers.Wallet(privateKey, this.provider);
                if (contractAddress) {
                    this.contract = new ethers.Contract(contractAddress, SC_ABI, this.wallet);
                }
            }
        }
    }

    public async releasePurchase(purchaseId: number): Promise<string> {
        if (!this.contract) throw new Error("Contract not initialized");
        const contract = this.contract;

        console.log(`Releasing purchase ${purchaseId}...`);
        const tx = await contract.releasePurchase!(purchaseId);
        await tx.wait();
        console.log(`Purchase ${purchaseId} released. Tx Hash: ${tx.hash}`);
        return tx.hash;
    }

    public async getListingDetails(listingId: number) {
        if (!this.contract) throw new Error("Contract not initialized");
        const contract = this.contract;
        const listing = await contract.listings!(listingId);
        return {
            seller: listing[0],
            token: listing[1],
            pricePerToken: listing[4]
        };
    }

    public startEventListener() {
        if (!this.contract || this.isListening) return;
        const contract = this.contract;

        console.log("Starting Blockchain Event Listener...");
        this.isListening = true;

        // ==========================================
        //             LISTING EVENTS
        // ==========================================

        contract.on("ListingCreated", async (listingId, seller, token, totalAmount, pricePerToken) => {
            try {
                const lId = Number(listingId);
                const amt = ethers.formatEther(totalAmount);
                const price = ethers.formatEther(pricePerToken);

                console.log(`Event: ListingCreated - ID: ${lId}, Seller: ${seller}, Price: ${price}`);

                const exists = await Listing.findOne({ listingId: lId });
                if (exists) return;

                await Listing.create({
                    listingId: lId,
                    seller: seller,
                    token: token,
                    totalAmount: Number(amt),
                    remaining: Number(amt), // Initially remaining == totalAmount
                    pricePerToken: Number(price),
                    active: true
                });
                console.log(`Listing ${lId} indexed.`);

            } catch (err) {
                console.error("Error processing ListingCreated:", err);
            }
        });

        contract.on("ListingCancelled", async (listingId) => {
            try {
                const lId = Number(listingId);
                await Listing.findOneAndUpdate({ listingId: lId }, { active: false });
                console.log(`Listing ${lId} marked inactive.`);
            } catch (err) {
                console.error("Error processing ListingCancelled:", err);
            }
        });

        contract.on("ListingUpdatedRemaining", async (listingId, remaining) => {
            try {
                const lId = Number(listingId);
                const rem = ethers.formatEther(remaining);
                await Listing.findOneAndUpdate({ listingId: lId }, { remaining: Number(rem) });
                console.log(`Listing ${lId} remaining updated to ${rem}`);

                // If remaining is 0, we can also mark as inactive if desired, 
                // but contract might keep it active until manually cancelled? 
                // Contract: "active" is boolean. It stays true even if remaining is 0 usually.
                if (Number(rem) === 0) {
                    await Listing.findOneAndUpdate({ listingId: lId }, { active: false });
                }

            } catch (err) {
                console.error("Error processing ListingUpdatedRemaining:", err);
            }
        });


        // ==========================================
        //             PURCHASE EVENTS
        // ==========================================

        contract.on("PurchaseProposed", async (purchaseId, listingId, buyer, quantity, pricePerToken, event) => {
            try {
                const pId = Number(purchaseId);
                const lId = Number(listingId);
                const q = ethers.formatEther(quantity);
                const p = ethers.formatEther(pricePerToken);

                console.log(`Event: PurchaseProposed - PurchaseID: ${pId}, ListingID: ${lId}, Buyer: ${buyer}, Qty: ${q}, Price: ${p}`);

                const exists = await Trade.findOne({ purchaseId: pId });
                if (exists) {
                    console.log(`Trade ${pId} already exists in DB.`);
                    return;
                }

                // We might want to fetch seller from DB Listing instead of Contract for speed, 
                // but Contract is authoritative. Let's stick to contract for now or DB if indexed.
                // Since we are indexing Listings now, we can try DB first?
                // Let's stick to existing logic for safety: fetch details from Contract helper.
                const listing = await this.getListingDetails(lId);

                await Trade.create({
                    purchaseId: pId,
                    listingId: lId,
                    buyer: buyer,
                    seller: listing.seller,
                    quantity: Number(q),
                    pricePerToken: Number(p),
                    status: 'Proposed'
                });
                console.log(`Trade ${pId} created in DB via Event.`);

            } catch (err) {
                console.error("Error processing PurchaseProposed event:", err);
            }
        });

        // Listen for Locked to update status
        // We fetch the purchase details to ensure we have the correct buyer address
        // in case the event signature in ABI doesn't match the deployed contract yet.
        contract.on("PurchaseLocked", async (purchaseId, listingId, seller, quantity) => { // Accepted args based on old ABI
            try {
                const pId = Number(purchaseId);
                console.log(`Event: PurchaseLocked - PurchaseID: ${pId}`);

                // Fetch full purchase details from contract to get buyer
                // struct Purchase { listingId, buyer, quantity, ... }
                const purchase = await contract.purchases!(pId);
                const buyerAddress = purchase[1]; // Access by index if struct
                const qty = ethers.formatEther(purchase[2]);
                const price = ethers.formatEther(purchase[3]);

                // Upsert or update
                const trade = await Trade.findOne({ purchaseId: pId });
                if (trade) {
                    trade.status = 'Locked';
                    trade.buyer = buyerAddress; // Update buyer just in case
                    await trade.save();
                    console.log(`Trade ${pId} status updated to Locked.`);
                } else {
                    // If missed Proposed event, create it now
                    await Trade.create({
                        purchaseId: pId,
                        listingId: Number(listingId),
                        buyer: buyerAddress,
                        seller: seller,
                        quantity: Number(qty),
                        pricePerToken: Number(price),
                        status: 'Locked'
                    });
                    console.log(`Trade ${pId} created as Locked (missed proposal).`);
                }
            } catch (err) {
                console.error("Error processing PurchaseLocked event:", err);
            }
        });

        contract.on("PurchaseReleased", async (purchaseId, listingId, buyer, quantity) => {
            try {
                const pId = Number(purchaseId);
                await Trade.findOneAndUpdate({ purchaseId: pId }, { status: 'Released' });
                console.log(`Trade ${pId} status updated to Released via Event.`);
            } catch (err) {
                console.error("Error processing PurchaseReleased event:", err);
            }
        });
    }
}

export default new BlockchainService();
