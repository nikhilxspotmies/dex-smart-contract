import { ethers } from 'ethers';

const RPC_URL = "https://bsc-dataseed.binance.org/";
const ETH = "0xa2E3356610840701BDf5611a53974510Ae27E2e1";
const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const PAIR_ADDRESS = "0x3e64105239C0fc054efe131C6D6b4f7415851a19";

const TOKEN_ABI = [
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)"
];

const PAIR_ABI = [
    "function getReserves() external view returns (uint256 reserve0, uint256 reserve1)",
    "function token0() external view returns (address)",
    "function token1() external view returns (address)"
];

async function verifyLiquidity() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const pair = new ethers.Contract(PAIR_ADDRESS, PAIR_ABI, provider);

    const [res0, res1] = await pair.getReserves();
    const t0Address = await pair.token0();
    const t1Address = await pair.token1();

    const t0 = new ethers.Contract(t0Address, TOKEN_ABI, provider);
    const t1 = new ethers.Contract(t1Address, TOKEN_ABI, provider);

    const s0 = await t0.symbol();
    const s1 = await t1.symbol();
    const d0 = await t0.decimals();
    const d1 = await t1.decimals();

    console.log(`Token 0 (${s0}): ${t0Address}`);
    console.log(`  Decimals: ${d0}`);
    console.log(`  Reserve: ${res0.toString()}`);
    console.log(`  Human Readable: ${ethers.formatUnits(res0, d0)}`);

    console.log(`Token 1 (${s1}): ${t1Address}`);
    console.log(`  Decimals: ${d1}`);
    console.log(`  Reserve: ${res1.toString()}`);
    console.log(`  Human Readable: ${ethers.formatUnits(res1, d1)}`);
}

verifyLiquidity().catch(console.error);
