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
import { localhost, mainnet } from 'viem/chains';
import { orders, OrderStatus, lastTradedPrices, priceHistory } from '../controllers/orders.controller.js';
import type { Order } from '../controllers/orders.controller.js';
import { LimitOrderProtocolABI } from '../abis/LimitOrderProtocol.js';
import { TOKENS } from '../utils/tokenConfig.js';
import dotenv from 'dotenv';

dotenv.config();

const MATCHER_PRIVATE_KEY = process.env.MATCHER_PRIVATE_KEY as Hex;
const LIMIT_ORDER_ADDRESS = process.env.LIMIT_ORDER_ADDRESS as Address;
const CHAIN_ID = Number(process.env.CHAIN_ID) || 31337;
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
        const chain = CHAIN_ID === 31337 ? localhost : mainnet;

        this.publicClient = createPublicClient({
            chain,
            transport: http(),
        });

        this.walletClient = createWalletClient({
            account: this.account,
            chain,
            transport: http(),
        });

        this.init();
    }

    private async init() {
        try {
            const networkChainId = await this.publicClient.getChainId();
            console.log(`ℹ️  Network Chain ID: ${networkChainId}`);
            if (networkChainId !== CHAIN_ID) {
                console.log(`⚠️  Chain ID mismatch! Env: ${CHAIN_ID}, Network: ${networkChainId}. Adjusting clients...`);

                const chain = { ...localhost, id: networkChainId };

                this.publicClient = createPublicClient({
                    chain: chain as any,
                    transport: http(),
                });

                this.walletClient = createWalletClient({
                    account: this.account,
                    chain: chain as any,
                    transport: http(),
                });
                console.log(`✅ Clients adjusted to Chain ID: ${networkChainId}`);
            } else {
                // Even if it matches, ensure we use the explicit chain object to avoid localhost:1337 default
                const chain = { ...localhost, id: CHAIN_ID };
                this.publicClient = createPublicClient({ chain: chain as any, transport: http() });
                this.walletClient = createWalletClient({ account: this.account, chain: chain as any, transport: http() });
            }
        } catch (error) {
            console.error('❌ Failed to connect to network:', error);
        }
    }

    public start(intervalMs: number = 3000) {
        console.log('🚀 Matching Engine started...');
        setInterval(() => this.scanOrders(), intervalMs);
    }

    private async scanOrders() {
        try {
            const openOrders = orders.filter(o => o.status === OrderStatus.OPEN);
            if (openOrders.length === 0) return;

            // Group orders by trading pair (e.g. AssetA/AssetB)
            // We use a canonical key by sorting asset addresses
            const pairs = new Map<string, Order[]>();
            openOrders.forEach(order => {
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
                    return priceB - priceA;
                });

                const sortedAsks = asks.sort((a, b) => {
                    const priceA = Number(a.takingAmount) / Number(a.makingAmount);
                    const priceB = Number(b.takingAmount) / Number(b.makingAmount);
                    return priceA - priceB;
                });

                // MATCHING
                for (const bid of sortedBids) {
                    if (bid.status === OrderStatus.FILLED) continue;

                    for (const ask of sortedAsks) {
                        if (ask.status === OrderStatus.FILLED) continue;

                        const bidPrice = Number(bid.takingAmount) / Number(bid.makingAmount);
                        const askPrice = Number(ask.makingAmount) / Number(ask.takingAmount);
                        // Careful with inverse: ask maker asset is assetB, bid taker asset is assetB
                        // Ask: Maker gives AssetB, wants AssetA. Price = taking (A) / making (B)

                        // Let's use a simpler logic:
                        // Bid wants to buy X AssetA for Y AssetB. Price = Y/X.
                        // Ask wants to sell X AssetA for Z AssetB. Price = Z/X.
                        // Match if Y >= Z.

                        // We need to normalize prices based on assetA as base.
                        const bidPriceNorm = Number(bid.takingAmount) / Number(bid.makingAmount);
                        const askPriceNorm = Number(ask.makingAmount) / Number(ask.takingAmount); // This is wrong if we want same base

                        // CORRECT LOGIC:
                        // Bid: wants AssetB, gives AssetA. (Buyer of B)
                        // Ask: wants AssetA, gives AssetB. (Seller of B)
                        // AssetB price in terms of AssetA:
                        // Bid: Price = makingAmount(A) / takingAmount(B) (Willing to pay A's for B's)
                        // Ask: Price = takingAmount(A) / makingAmount(B) (Wants A's for B's)
                        // Match if BidPrice >= AskPrice

                        const bidPriceB = Number(bid.makingAmount) / Number(bid.takingAmount);
                        const askPriceB = Number(ask.takingAmount) / Number(ask.makingAmount);

                        if (bidPriceB >= askPriceB) {
                            await this.executeMatch(bid, ask);
                            break; // One bid matched, move to next
                        }
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error in scanOrders:', error);
        }
    }

    private async executeMatch(bid: Order, ask: Order) {
        console.log(`🚀 Matching found!`);
        console.log(`   Matcher Account: ${this.account.address}`);
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
                    console.warn(`   ⚠️  WARNING: Maker ${maker} has insufficient balance (${balance} < ${amount})`);
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
            // Since they match, we use the price of the orders. 
            // In a more robust system we'd handle price gaps (slippage/spread), but here we follow the order's own math.
            const matchSizeTKB = (BigInt(bid.makingAmount) * matchSizeTKA) / BigInt(bid.takingAmount);

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

            // Update in-memory state
            bid.filledMakingAmount = (BigInt(bid.filledMakingAmount) + matchSizeTKB).toString();
            ask.filledMakingAmount = (BigInt(ask.filledMakingAmount) + matchSizeTKA).toString();

            if (BigInt(bid.filledMakingAmount) >= BigInt(bid.makingAmount)) {
                bid.status = OrderStatus.FILLED;
            }
            if (BigInt(ask.filledMakingAmount) >= BigInt(ask.makingAmount)) {
                ask.status = OrderStatus.FILLED;
            }

            bid.updatedAt = new Date();
            ask.updatedAt = new Date();

            console.log(`✨ Match partial/full execution completed!`);
            console.log(`   Bid Fill: ${bid.filledMakingAmount}/${bid.makingAmount}`);
            console.log(`   Ask Fill: ${ask.filledMakingAmount}/${ask.makingAmount}`);

            // Update lastTradedPrices
            const askToken = TOKENS.find(t => t.address.toLowerCase() === ask.makerAsset.toLowerCase());
            const bidToken = TOKENS.find(t => t.address.toLowerCase() === bid.makerAsset.toLowerCase());

            const askSymbol = askToken ? askToken.symbol : ask.makerAsset;
            const bidSymbol = bidToken ? bidToken.symbol : bid.makerAsset;

            // Price of Ask Asset (Base) in terms of Bid Asset (Quote)
            // Ask Asset is the one being sold by the Ask maker (MakerAsset of Ask)
            // Bid Asset is the one being sold by the Bid maker (MakerAsset of Bid) which is the "Payment"
            // Price = Amount(Payment) / Amount(Sold) = matchSizeTKB / matchSizeTKA
            const price = Number(matchSizeTKB) / Number(matchSizeTKA);

            const key = `${askSymbol}-${bidSymbol}`;
            lastTradedPrices.set(key, price.toString());

            // Update Price History
            if (!priceHistory.has(key)) {
                priceHistory.set(key, []);
            }
            priceHistory.get(key)?.push({
                price: price.toString(),
                timestamp: Date.now()
            });

            console.log(`   Updated Price for ${key}: ${price}`);

        } catch (error: any) {
            console.error('❌ Match execution failed:');
            if (error.shortMessage) console.error(`   Error: ${error.shortMessage}`);
            else console.error(`   Error: ${error.message}`);

            // Log details for debugging
            if (error.details) console.error(`   Details: ${error.details}`);
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
