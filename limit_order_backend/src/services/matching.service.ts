import {
    createPublicClient,
    createWalletClient,
    http,
    parseEther,
    type Hex,
    type Address,
    getContract
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { localhost, mainnet, bsc } from 'viem/chains';
import { LimitOrderProtocolABI } from '../abis/LimitOrderProtocol.js';
import { findToken } from '../utils/tokenConfig.js';
import { processFirstTradeReferral } from './referral.service.js';
import { prisma, OrderStatus } from '../controllers/orders.controller.js';
import type { Order } from '@prisma/client';
import dotenv from 'dotenv';
import fs from 'fs';

const logToFile = (msg: string) => {
    const timestamp = new Date().toISOString();
    fs.appendFileSync('engine.log', `[${timestamp}] ${msg}\n`);
};

dotenv.config();

const MATCHER_PRIVATE_KEY = process.env.MATCHER_PRIVATE_KEY as Hex;
const LIMIT_ORDER_ADDRESS = process.env.LIMIT_ORDER_ADDRESS as Address;
const CHAIN_ID = Number(process.env.CHAIN_ID) || 31337;
const RPC_URL = process.env.RPC_URL;
console.log('📡 RPC_URL:', RPC_URL ? `${RPC_URL.slice(0, 20)}...` : 'Using default');
const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

const ERC20ABI = [
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'uint256' }],
    },
    {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
        ],
        outputs: [{ type: 'uint256' }],
    },
    {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ type: 'bool' }],
    },
] as const;

export class MatchingEngine {
    private publicClient: any;
    private walletClient: any;
    private account;

    constructor() {
        if (!MATCHER_PRIVATE_KEY) {
            throw new Error('MATCHER_PRIVATE_KEY is missing');
        }
        if (!LIMIT_ORDER_ADDRESS) {
            throw new Error('LIMIT_ORDER_ADDRESS is missing');
        }

        this.account = privateKeyToAccount(MATCHER_PRIVATE_KEY);
        const chain = CHAIN_ID === 56 ? bsc : (CHAIN_ID === 31337 ? localhost : mainnet);
        const transport = RPC_URL ? http(RPC_URL) : http();

        this.publicClient = createPublicClient({
            chain,
            transport,
        });

        this.walletClient = createWalletClient({
            account: this.account,
            chain,
            transport,
        });

        this.init();
    }

    private async init() {
        try {
            const networkChainId = await this.publicClient.getChainId();
            console.log(`ℹ️  Network Chain ID: ${networkChainId} (type: ${typeof networkChainId})`);
            console.log(`ℹ️  Env CHAIN_ID: ${CHAIN_ID} (type: ${typeof CHAIN_ID})`);

            const transport = RPC_URL ? http(RPC_URL) : http();

            if (Number(networkChainId) !== Number(CHAIN_ID)) {
                console.log(`⚠️  Chain ID mismatch! Env: ${CHAIN_ID}, Network: ${networkChainId}. Adjusting clients...`);

                const chain = { id: networkChainId };

                this.publicClient = createPublicClient({
                    chain: chain as any,
                    transport,
                });

                this.walletClient = createWalletClient({
                    account: this.account,
                    chain: chain as any,
                    transport,
                });
                console.log(`✅ Clients adjusted to Chain ID: ${networkChainId}`);
            } else {
                // Even if it matches, ensure we use the explicit chain object to avoid localhost:1337 default
                const chain = CHAIN_ID === 56 ? bsc : (CHAIN_ID === 31337 ? { ...localhost, id: CHAIN_ID } : mainnet);
                this.publicClient = createPublicClient({ chain: chain as any, transport });
                this.walletClient = createWalletClient({ account: this.account, chain: chain as any, transport });
            }
        } catch (error) {
            console.error('❌ Failed to connect to network:', error);
        }
    }

    public start(intervalMs: number = 3000) {
        console.log('🚀 Matching Engine started...');
        setInterval(() => this.scanOrders(), intervalMs);
        // Run sanity check every 60 seconds
        setInterval(() => this.sanityCheckOrders(), 60000);
    }

    private async scanOrders() {
        try {
            const openOrders = await prisma.order.findMany({ where: { status: OrderStatus.OPEN } });
            if (openOrders.length > 0) {
                logToFile(`Scanning ${openOrders.length} open orders...`);
            }
            if (openOrders.length === 0) return;

            // Group orders by trading pair (e.g. AssetA/AssetB)
            // We use a canonical key by sorting asset addresses
            const pairs = new Map<string, Order[]>();
            openOrders.forEach((order: Order) => {
                const assets = [order.makerAsset, order.takerAsset].sort();
                const key = assets.join('-');
                if (!pairs.has(key)) pairs.set(key, []);
                pairs.get(key)!.push(order);
            });

            for (const [key, pairOrders] of pairs) {
                const [assetA, assetB] = key.split('-');

                // Bids: Maker wants assetB, gives assetA (AssetB for AssetA)
                // Asks: Maker wants assetA, gives assetB (AssetA for AssetB)
                // Note: This simplification assumes one is the "base" and one "quote"
                // For matching, we just need to see if someone wants what someone else has

                const bids = pairOrders.filter(o => o.takerAsset === assetB);
                const asks = pairOrders.filter(o => o.takerAsset === assetA);

                // SORTING
                // Bid Price (quote/base) -> DESC (Highest buy price first)
                // Ask Price (quote/base) -> ASC (Lowest sell price first)
                // For assetA/assetB pair (where assetB is quote):
                // Price = takingAmount (assetB) / makingAmount (assetA)

                const sortedBids = bids.sort((a, b) => {
                    const priceA = Number(a.takingAmount) / Number(a.makingAmount);
                    const priceB = Number(b.takingAmount) / Number(b.makingAmount);
                    if (priceB !== priceA) return priceB - priceA;
                    return a.createdAt.getTime() - b.createdAt.getTime();
                });

                const sortedAsks = asks.sort((a, b) => {
                    const priceA = Number(a.takingAmount) / Number(a.makingAmount);
                    const priceB = Number(b.takingAmount) / Number(b.makingAmount);
                    if (priceA !== priceB) return priceA - priceB;
                    return a.createdAt.getTime() - b.createdAt.getTime();
                });

                // MATCHING
                for (const bid of sortedBids) {
                    if (bid.status === OrderStatus.FILLED) continue;

                    for (const ask of sortedAsks) {
                        if (ask.status === OrderStatus.FILLED) continue;

                        // Bid Price: Quote (TKB) / Base (TKA) => bid.makingAmount / bid.takingAmount
                        const bidPriceB = Number(bid.makingAmount) / Number(bid.takingAmount);
                        // Ask Price: Quote (TKB) / Base (TKA) => ask.takingAmount / ask.makingAmount
                        const askPriceB = Number(ask.takingAmount) / Number(ask.makingAmount);

                        if (bidPriceB >= askPriceB) {
                            // Determine Maker (Earliest Order) to set the execution price
                            // If Bid is older, execute at Bid Price. If Ask is older, execute at Ask Price.
                            const isBidMaker = bid.createdAt.getTime() <= ask.createdAt.getTime();

                            await this.executeMatch(bid, ask, isBidMaker);
                            break; // One bid matched, move to next
                        }
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error in scanOrders:', error);
        }
    }

    private async executeMatch(bid: Order, ask: Order, isBidMaker: boolean) {
        logToFile(`🚀 Match found! Bid: ${bid.orderHash.slice(0, 10)}, Ask: ${ask.orderHash.slice(0, 10)}`);
        console.log(`🚀 Matching found!`);
        console.log(`   Matcher Account: ${this.account.address}`);
        console.log(`   Execution based on ${isBidMaker ? 'Bid (Maker)' : 'Ask (Maker)'} Price`);

        const currentChainId = await this.publicClient.getChainId();
        console.log(`   Current Network Chain ID: ${currentChainId}`);
        console.log(`   Internal CHAIN_ID: ${CHAIN_ID}`);

        try {
            // Convert to Solidity structs
            const bidStruct = this.toSolidityOrder(bid);
            const askStruct = this.toSolidityOrder(ask);

            const checkAndApprove = async (token: Address, amount: bigint) => {
                const code = await this.publicClient.getBytecode({ address: token });
                if (!code || code === '0x') {
                    throw new Error(`Token address ${token} is not a contract. Did you redeploy?`);
                }

                // Check Matcher's balance
                const matcherBalance = await this.publicClient.readContract({
                    address: token,
                    abi: ERC20ABI,
                    functionName: 'balanceOf',
                    args: [this.account.address],
                });
                console.log(`   Matcher Token Balance: ${matcherBalance}`);

                const allowance = await this.publicClient.readContract({
                    address: token,
                    abi: ERC20ABI,
                    functionName: 'allowance',
                    args: [this.account.address, LIMIT_ORDER_ADDRESS],
                });
                console.log(`   Matcher Allowance: ${allowance}`);

                if (allowance < amount) {
                    const ethBalance = await this.publicClient.getBalance({ address: this.account.address });
                    if (ethBalance === 0n) {
                        throw new Error(`Matcher account ${this.account.address} has 0 ETH and cannot pay for gas.`);
                    }

                    console.log(`   ⏳ Approving ${token.slice(0, 10)} for Protocol...`);
                    const { request } = await this.publicClient.simulateContract({
                        account: this.account,
                        address: token,
                        abi: ERC20ABI,
                        functionName: 'approve',
                        args: [LIMIT_ORDER_ADDRESS, maxUint256],
                    });
                    const hash = await this.walletClient.writeContract(request);
                    await this.publicClient.waitForTransactionReceipt({ hash });
                    console.log(`   ✅ Approved ${token.slice(0, 10)} for Protocol.`);
                }
            };

            const checkMakerAllowance = async (maker: Address, token: Address, amount: bigint) => {
                const allowance = await this.publicClient.readContract({
                    address: token,
                    abi: ERC20ABI,
                    functionName: 'allowance',
                    args: [maker, LIMIT_ORDER_ADDRESS],
                });
                console.log(`   Maker Allowance: ${allowance}`);
                if (allowance < amount) {
                    console.warn(`   ⚠️  WARNING: Maker ${maker} has insufficient allowance (${allowance} < ${amount})`);
                }

                const balance = await this.publicClient.readContract({
                    address: token,
                    abi: ERC20ABI,
                    functionName: 'balanceOf',
                    args: [maker],
                });
                console.log(`   Maker Balance: ${balance}`);
                if (balance < amount) {
                    throw new Error(`Insufficient maker funds: ${maker} has ${balance}, needs ${amount}`);
                }
            };

            const checkBalance = async (token: Address, amount: bigint) => {
                const balance = await this.publicClient.readContract({
                    address: token,
                    abi: ERC20ABI,
                    functionName: 'balanceOf',
                    args: [this.account.address],
                });
                if (balance < amount) {
                    throw new Error(`Insufficient matcher balance for ${token}. Has: ${balance}, Needs: ${amount}`);
                }
            };

            // 1. Fill the Ask (Bot buys makerAsset from seller using its own takerAsset)
            // Matcher needs takerAsset of the Ask
            console.log(`⏳ Filling Ask: ${ask.orderHash.slice(0, 10)}...`);
            await checkMakerAllowance(ask.maker as Address, ask.makerAsset as Address, BigInt(ask.makingAmount));
            // Calculate remaining amounts
            const bidRemainingMaking = BigInt(bid.makingAmount) - BigInt(bid.filledMakingAmount);
            const askRemainingMaking = BigInt(ask.makingAmount) - BigInt(ask.filledMakingAmount);

            // We need to calculate how much TakerAsset each order wants (remaining)
            // For a match to happen, one side's TakingAmount must be fulfilled by the other side's MakingAmount

            // bidNeedsTaker (TKA) = (bidTakingAmount * bidRemainingMaking) / bidMakingAmount
            const bidRemainingTaking = (BigInt(bid.takingAmount) * bidRemainingMaking) / BigInt(bid.makingAmount);
            // askNeedsTaker (TKB) = (askTakingAmount * askRemainingMaking) / askMakingAmount
            const askRemainingTaking = (BigInt(ask.takingAmount) * askRemainingMaking) / BigInt(ask.makingAmount);

            // The match amount is limited by:
            // 1. Bid's remaining taking (TKA) vs Ask's remaining making (TKA)
            // 2. Ask's remaining taking (TKB) vs Bid's remaining making (TKB)

            // Let's use TKA as the common denominator for "match size"
            const matchSizeTKA = bidRemainingTaking < askRemainingMaking ? bidRemainingTaking : askRemainingMaking;

            if (matchSizeTKA === 0n) {
                console.log(`   ⚠️ Match size is 0, skipping.`);
                return;
            }

            // Calculate corresponding TKB amount
            // Since they match, we use the price of the MAKER order (the one that was there first).
            let matchSizeTKB: bigint;
            if (isBidMaker) {
                // Use Bid Price: Price = BidQuote / BidBase = makingAmount / takingAmount
                matchSizeTKB = (BigInt(bid.makingAmount) * matchSizeTKA) / BigInt(bid.takingAmount);
            } else {
                // Use Ask Price: Price = AskQuote / AskBase = takingAmount / makingAmount
                matchSizeTKB = (BigInt(ask.takingAmount) * matchSizeTKA) / BigInt(ask.makingAmount);
            }

            console.log(`   Match Size: ${matchSizeTKA} TKA <-> ${matchSizeTKB} TKB`);

            // 1. Fill the Ask (Seller sells TKA, receives TKB)
            // Contract fillOrder(order, signature, fillAmount) -> fillAmount is makerAsset (TKA)
            console.log(`⏳ Filling Ask: ${ask.orderHash.slice(0, 10)}... (Amount: ${matchSizeTKA})`);
            await checkMakerAllowance(ask.maker as Address, ask.makerAsset as Address, matchSizeTKA);
            await checkAndApprove(ask.takerAsset as Address, matchSizeTKB);
            await checkBalance(ask.takerAsset as Address, matchSizeTKB);

            const hash1 = await this.walletClient.writeContract({
                address: LIMIT_ORDER_ADDRESS,
                abi: LimitOrderProtocolABI,
                functionName: 'fillOrder',
                args: [askStruct, ask.signature as Hex, matchSizeTKA],
            });
            console.log(`✅ Ask partial fill! TX: ${hash1}`);

            // 2. Fill the Bid (Buyer buys TKA, sells TKB)
            // Contract fillOrder(order, signature, fillAmount) -> fillAmount is makerAsset (TKB)
            console.log(`⏳ Filling Bid: ${bid.orderHash.slice(0, 10)}... (Amount: ${matchSizeTKB})`);
            await checkMakerAllowance(bid.maker as Address, bid.makerAsset as Address, matchSizeTKB);
            await checkAndApprove(bid.takerAsset as Address, matchSizeTKA);
            await checkBalance(bid.takerAsset as Address, matchSizeTKA);

            const hash2 = await this.walletClient.writeContract({
                address: LIMIT_ORDER_ADDRESS,
                abi: LimitOrderProtocolABI,
                functionName: 'fillOrder',
                args: [bidStruct, bid.signature as Hex, matchSizeTKB],
            });
            console.log(`✅ Bid partial fill! TX: ${hash2}`);

            const newBidFilled = (BigInt(bid.filledMakingAmount) + matchSizeTKB).toString();
            const newAskFilled = (BigInt(ask.filledMakingAmount) + matchSizeTKA).toString();
            const bidStatus = BigInt(newBidFilled) >= BigInt(bid.makingAmount) ? OrderStatus.FILLED : OrderStatus.OPEN;
            const askStatus = BigInt(newAskFilled) >= BigInt(ask.makingAmount) ? OrderStatus.FILLED : OrderStatus.OPEN;

            await prisma.order.update({
                where: { orderHash: bid.orderHash },
                data: { filledMakingAmount: newBidFilled, status: bidStatus },
            });
            await prisma.order.update({
                where: { orderHash: ask.orderHash },
                data: { filledMakingAmount: newAskFilled, status: askStatus },
            });

            bid.filledMakingAmount = newBidFilled;
            ask.filledMakingAmount = newAskFilled;

            console.log(`✨ Match partial/full execution completed!`);
            console.log(`   Bid Fill: ${bid.filledMakingAmount}/${bid.makingAmount}`);
            console.log(`   Ask Fill: ${ask.filledMakingAmount}/${ask.makingAmount}`);

            // ... price update logic (keeping it as is)
            const askToken = findToken(ask.makerAsset);
            const bidToken = findToken(bid.makerAsset);

            // ... (keeping existing code)
            const askSymbol = askToken ? askToken.symbol : ask.makerAsset;
            const bidSymbol = bidToken ? bidToken.symbol : bid.makerAsset;

            const askDecimals = askToken ? askToken.decimals : 18;
            const bidDecimals = bidToken ? bidToken.decimals : 18;

            const amountBase = Number(matchSizeTKA) / Math.pow(10, askDecimals);
            const amountQuote = Number(matchSizeTKB) / Math.pow(10, bidDecimals);

            const price = amountQuote / amountBase;

            const key = `${askSymbol}-${bidSymbol}`;

            await prisma.lastTradedPrice.upsert({
                where: { key },
                update: { price: price.toString() },
                create: { key, price: price.toString() },
            });
            await prisma.priceHistory.create({
                data: { key, price: price.toString(), volume: amountQuote.toString(), timestamp: Date.now() },
            });

            console.log(`   Updated Price for ${key}: ${price}`);

            processFirstTradeReferral(bid.maker).catch(e => console.error('Referral error (bid):', e));
            processFirstTradeReferral(ask.maker).catch(e => console.error('Referral error (ask):', e));

        } catch (error: any) {
            console.error('❌ Match execution failed:');
            const errorMsg = error.shortMessage || error.message || "";
            console.error(`   Error: ${errorMsg}`);

            // If execution failed due to funds/allowance, cancel the orders
            if (errorMsg.toLowerCase().includes('insufficient funds') ||
                errorMsg.toLowerCase().includes('insufficient maker funds') ||
                errorMsg.toLowerCase().includes('allowance') ||
                errorMsg.toLowerCase().includes('transfer amount exceeds balance')) {

                console.log(`   ⚠️  Cancelling invalid orders due to execution failure...`);
                // If it's a MAKER funds error, we can identify which one
                if (errorMsg.toLowerCase().includes(bid.maker.toLowerCase())) {
                    await this.verifyAndCancelOrder(bid);
                } else if (errorMsg.toLowerCase().includes(ask.maker.toLowerCase())) {
                    await this.verifyAndCancelOrder(ask);
                } else {
                    // Fallback: verify both
                    await this.verifyAndCancelOrder(bid);
                    await this.verifyAndCancelOrder(ask);
                }
            }

            if (error.details) console.error(`   Details: ${error.details}`);
        }
    }

    private async sanityCheckOrders() {
        try {
            const openOrders = await prisma.order.findMany({ where: { status: OrderStatus.OPEN } });
            console.log(`🔍 [${new Date().toLocaleTimeString()}] Sanity check: validating ${openOrders.length} orders...`);
            if (openOrders.length === 0) return;

            logToFile(`Running sanity check on ${openOrders.length} open orders...`);

            for (const order of openOrders) {
                await this.verifyAndCancelOrder(order);
            }
        } catch (error) {
            console.error('❌ Error in sanityCheckOrders:', error);
        }
    }

    private async verifyAndCancelOrder(order: Order) {
        if (order.status !== OrderStatus.OPEN) return;

        try {
            const remainingMaking = BigInt(order.makingAmount) - BigInt(order.filledMakingAmount);
            if (remainingMaking <= 0n) return;

            // Check Balance
            const balance = await this.publicClient.readContract({
                address: order.makerAsset as Address,
                abi: ERC20ABI,
                functionName: 'balanceOf',
                args: [order.maker as Address],
            });

            if (balance < remainingMaking) {
                console.log(`   🚫 Cancelling order ${order.orderHash.slice(0, 10)}: Insufficient Balance (${balance} < ${remainingMaking})`);
                await prisma.order.update({ where: { orderHash: order.orderHash }, data: { status: OrderStatus.CANCELLED } });
                return;
            }

            // Check Allowance
            const allowance = await this.publicClient.readContract({
                address: order.makerAsset as Address,
                abi: ERC20ABI,
                functionName: 'allowance',
                args: [order.maker as Address, LIMIT_ORDER_ADDRESS],
            });

            if (allowance < remainingMaking) {
                console.log(`   🚫 Cancelling order ${order.orderHash.slice(0, 10)}: Insufficient Allowance (${allowance} < ${remainingMaking})`);
                await prisma.order.update({ where: { orderHash: order.orderHash }, data: { status: OrderStatus.CANCELLED } });
                return;
            }
        } catch (error) {
            console.error(`   ⚠️ Failed to verify order ${order.orderHash.slice(0, 10)}:`, error);
        }
    }

    private toSolidityOrder(order: Order) {
        return {
            makerAsset: order.makerAsset as Address,
            takerAsset: order.takerAsset as Address,
            maker: order.maker as Address,
            makingAmount: BigInt(order.makingAmount),
            takingAmount: BigInt(order.takingAmount),
            salt: BigInt(order.salt),
            deadline: BigInt(order.deadline),
        };
    }
}
