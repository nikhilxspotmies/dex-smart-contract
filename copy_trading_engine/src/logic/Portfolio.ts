import { ethers } from "ethers";
import { ERC20_ABI, ROUTER_ADDRESS, ROUTER_ABI, QUOTE_TOKEN_ADDRESS, QUOTE_TOKEN_DECIMALS, WHITELIST } from "../config/contracts.js";

export interface PortfolioItem {
    token: string;
    symbol: string;
    balance: bigint;
    valueUsd: number; // Value in Quote Token terms
}

export interface Portfolio {
    totalValueUsd: number;
    items: PortfolioItem[];
}

export class PortfolioAnalyzer {
    private provider: ethers.Provider;
    private router: ethers.Contract;

    constructor(provider: ethers.Provider) {
        this.provider = provider;
        this.router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider);
    }

    async getPrice(tokenAddress: string, tokenDecimals: number): Promise<number> {
        if (tokenAddress.toLowerCase() === QUOTE_TOKEN_ADDRESS.toLowerCase()) {
            return 1.0;
        }
        try {
            const oneUnit = ethers.parseUnits("1.0", tokenDecimals);
            const path = [tokenAddress, QUOTE_TOKEN_ADDRESS];
            const amounts = await (this.router as any).getAmountsOut(oneUnit, path);
            return Number(ethers.formatUnits(amounts[1], QUOTE_TOKEN_DECIMALS));
        } catch (e) {
            return 0; // No liquidity or error
        }
    }

    async calculatePortfolio(address: string, isContract: boolean = false): Promise<Portfolio> {
        let totalValueUsd = 0;
        const items: PortfolioItem[] = [];

        for (const [symbol, config] of Object.entries(WHITELIST)) {
            // 1. Get Balance
            const tokenContract = new ethers.Contract(config.address, ERC20_ABI, this.provider);
            const balance: bigint = await (tokenContract as any).balanceOf(address);

            // 2. Get Price
            const price = await this.getPrice(config.address, config.decimals);

            // 3. Calc Value
            const formattedBalance = Number(ethers.formatUnits(balance, config.decimals));
            const valueUsd = formattedBalance * price;

            totalValueUsd += valueUsd;
            items.push({
                token: config.address,
                symbol,
                balance,
                valueUsd
            });
        }
        return { totalValueUsd, items };
    }

    /**
     * Compares User vs Whale and identifies deviations > threshold.
     * Returns the token that needs to be BOUGHT to correct the specific deviation.
     */
    findDeviations(user: Portfolio, whale: Portfolio, threshold: number = 0.05) {
        const deviations: { token: string, symbol: string, type: 'BUY' | 'SELL', diff: number }[] = [];

        for (const whaleItem of whale.items) {
            // Calculate Ratios
            const whaleRatio = whale.totalValueUsd > 0 ? whaleItem.valueUsd / whale.totalValueUsd : 0;

            const userItem = user.items.find(i => i.token === whaleItem.token);
            const userValue = userItem ? userItem.valueUsd : 0;
            const userRatio = user.totalValueUsd > 0 ? userValue / user.totalValueUsd : 0;

            const diff = whaleRatio - userRatio; // Positive = Underweight (Need Buy), Negative = Overweight (Need Sell)

            if (Math.abs(diff) > threshold) {
                deviations.push({
                    token: whaleItem.token,
                    symbol: whaleItem.symbol,
                    type: diff > 0 ? 'BUY' : 'SELL',
                    diff: Math.abs(diff)
                });
            }
        }
        return deviations;
    }
}
