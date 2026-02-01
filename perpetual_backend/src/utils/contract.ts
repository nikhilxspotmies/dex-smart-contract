import {
    type Hex,
    type Address,
    type Chain,
    createPublicClient,
    createWalletClient,
    http,
    getContract
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { localhost } from 'viem/chains';
import dotenv from 'dotenv';
import { PerpetualABI } from '../abis/Perpetual.js';
import { MockOracleABI } from '../abis/MockOracle.js';
import { getMarket, getDefaultMarket, getAllMarkets, type MarketConfig } from './markets.js';

dotenv.config();

const OPERATOR_PRIVATE_KEY = process.env.OPERATOR_PRIVATE_KEY as Hex;
const PERPETUAL_ADDRESS = process.env.PERPETUAL_CONTRACT_ADDRESS as Address; // Legacy support
const ORACLE_ADDRESS = process.env.MOCK_ORACLE_ADDRESS as Address;
const CHAIN_ID = Number(process.env.CHAIN_ID) || 31337;
const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';

console.log(`[Perpetual Backend] Initializing contract utils...`);
console.log(`[Perpetual Backend] Using CHAIN_ID: ${CHAIN_ID}`);
console.log(`[Perpetual Backend] Using RPC_URL: ${RPC_URL}`);


// Create custom chain with correct ID
const localChain = {
    ...localhost,
    id: CHAIN_ID,
} as Chain;

// Create public client for reading
export const publicClient = createPublicClient({
    chain: localChain,
    transport: http(RPC_URL),
});

// Create wallet client for operator transactions
if (!OPERATOR_PRIVATE_KEY) {
    throw new Error('OPERATOR_PRIVATE_KEY is required for the backend');
}
const account = privateKeyToAccount(OPERATOR_PRIVATE_KEY as Hex);
export const walletClient = createWalletClient({
    account,
    chain: localChain,
    transport: http(RPC_URL),
});

/**
 * Get Perpetual contract instance for a specific market
 * @param marketSymbol - Market symbol (e.g., "ETH-PERP"). If not provided, uses default market
 * @returns Contract instance
 */
export const getPerpetualContract = (marketSymbol?: string) => {
    let contractAddress: Address;

    if (marketSymbol) {
        // Get market-specific contract
        const market = getMarket(marketSymbol);
        if (!market) {
            throw new Error(`Market "${marketSymbol}" not found. Available markets: ${getAllMarkets().map(m => m.symbol).join(', ')}`);
        }
        contractAddress = market.perpetualAddress;
    } else {
        // Use default market or legacy env var
        const defaultMarket = getDefaultMarket();
        if (defaultMarket) {
            contractAddress = defaultMarket.perpetualAddress;
        } else if (PERPETUAL_ADDRESS) {
            // Backward compatibility
            contractAddress = PERPETUAL_ADDRESS;
        } else {
            throw new Error('No market specified and no default market or PERPETUAL_CONTRACT_ADDRESS found');
        }
    }

    return getContract({
        address: contractAddress,
        abi: PerpetualABI,
        client: { public: publicClient, wallet: walletClient },
    });
};

/**
 * Get market configuration
 * @param marketSymbol - Market symbol. If not provided, returns default market
 */
export const getMarketConfig = (marketSymbol?: string): MarketConfig => {
    if (marketSymbol) {
        const market = getMarket(marketSymbol);
        if (!market) {
            throw new Error(`Market "${marketSymbol}" not found`);
        }
        return market;
    }

    const defaultMarket = getDefaultMarket();
    if (!defaultMarket) {
        throw new Error('No default market configured');
    }
    return defaultMarket;
};

// Re-export for convenience
export { getAllMarkets, hasMarket, getDefaultMarketSymbol } from './markets.js';

// Get MockOracle contract instance
export const getOracleContract = () => {
    if (!ORACLE_ADDRESS) {
        throw new Error('MOCK_ORACLE_ADDRESS not set in environment variables');
    }
    return getContract({
        address: ORACLE_ADDRESS,
        abi: MockOracleABI,
        client: { public: publicClient, wallet: walletClient },
    });
};

