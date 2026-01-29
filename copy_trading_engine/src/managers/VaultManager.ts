import { ethers } from "ethers";
import { FACTORY_ADDRESS, FACTORY_ABI, VAULT_ABI } from "../config/contracts.js";

export interface VaultInfo {
    address: string;
    owner: string;
    targetWhale: string;
}

export class VaultManager {
    private provider: ethers.Provider;
    private factory: ethers.Contract;

    constructor(provider: ethers.Provider) {
        this.provider = provider;
        this.factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
    }

    /**
     * Fetches all vaults deployed by the factory using 'VaultCreated' events.
     * Note: In production, cache this or use a subgraph.
     */
    async getAllVaults(): Promise<VaultInfo[]> {
        console.log("Fetching all vaults...");

        // 1. Fetch Events
        // Filter: VaultCreated(address indexed user, address indexed vault)
        const filter = this.factory.filters.VaultCreated!();

        // Query from block 0 (or deployment block) to latest
        const events = await this.factory.queryFilter(filter);

        const vaultList: VaultInfo[] = [];

        for (const event of events) {
            if ('args' in event) {
                const user = event.args[0];
                const vaultAddr = event.args[1];

                // 2. Fetch Vault Details (Target Whale)
                try {
                    const vault = new ethers.Contract(vaultAddr, VAULT_ABI, this.provider);
                    const targetWhale = await (vault as any).targetWhale();

                    vaultList.push({
                        address: vaultAddr,
                        owner: user,
                        targetWhale: targetWhale
                    });
                } catch (e) {
                    console.error(`Failed to fetch details for vault ${vaultAddr}`, e);
                }
            }
        }

        return vaultList;
    }
}
