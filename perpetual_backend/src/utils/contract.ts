import {
    createPublicClient,
    createWalletClient,
    http,
    type Hex,
    type Address,
    getContract
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { localhost } from 'viem/chains';
import dotenv from 'dotenv';
import { PerpetualABI } from '../abis/Perpetual.js';
import { MockOracleABI } from '../abis/MockOracle.js';

dotenv.config();

const OPERATOR_PRIVATE_KEY = process.env.OPERATOR_PRIVATE_KEY as Hex;
const PERPETUAL_ADDRESS = process.env.PERPETUAL_CONTRACT_ADDRESS as Address;
const ORACLE_ADDRESS = process.env.MOCK_ORACLE_ADDRESS as Address;
const CHAIN_ID = Number(process.env.CHAIN_ID) || 31337;
const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';

// Create public client for reading
export const publicClient = createPublicClient({
    chain: localhost,
    transport: http(RPC_URL),
});

// Create wallet client for operator transactions
const account = OPERATOR_PRIVATE_KEY ? privateKeyToAccount(OPERATOR_PRIVATE_KEY as Hex) : null;
export const walletClient = account ? createWalletClient({
    account,
    chain: localhost,
    transport: http(RPC_URL),
}) : null;

// Get Perpetual contract instance
export const getPerpetualContract = () => {
    if (!PERPETUAL_ADDRESS) {
        throw new Error('PERPETUAL_CONTRACT_ADDRESS not set in environment variables');
    }
    return getContract({
        address: PERPETUAL_ADDRESS,
        abi: PerpetualABI,
        client: { public: publicClient, wallet: walletClient },
    });
};

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

