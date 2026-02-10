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
    private vaults: VaultInfo[] = [];
    private lastCheckedIndex: number = 0;

    constructor(provider: ethers.Provider) {
        this.provider = provider;
        this.factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
        console.log("VaultManager initialized with Factory:", FACTORY_ADDRESS);
    }

    /**
     * Fetches all vaults directly from the Factory contract's 'allVaults' array.
     * efficient: loops until it hits the end of the array (revert).
     */
    async getAllVaults(): Promise<VaultInfo[]> {
        // We simply try to fetch the next vault index.
        // If it exists, add it and continue.
        // If it reverts (or returns error), we assume we reached the end of the list.

        // Safety Break: Don't loop infinitely if something is weird
        const MAX_LOOPS_PER_CYCLE = 20;
        let loops = 0;

        console.log(`Checking for new vaults starting at index ${this.lastCheckedIndex}...`);

        while (loops < MAX_LOOPS_PER_CYCLE) {
            try {
                // Fetch vault address at current index
                // The ABI must support "function allVaults(uint256) view returns (address)"
                // Note: If index is out of bounds, this call REVERTS.
                const vaultAddr = await (this.factory as any).allVaults(this.lastCheckedIndex);

                // If we got an address (and it's not zero), process it
                if (vaultAddr && vaultAddr !== ethers.ZeroAddress) {
                    try {
                        // Always fetch latest details (Owner/TargetWhale might change)
                        const vault = new ethers.Contract(vaultAddr, VAULT_ABI, this.provider);
                        const [owner, targetWhale] = await Promise.all([
                            (vault as any).owner(),
                            (vault as any).targetWhale()
                        ]);

                        const existingVault = this.vaults.find(v => v.address === vaultAddr);
                        if (existingVault) {
                            // Update existing
                            existingVault.owner = owner;
                            existingVault.targetWhale = targetWhale;
                            console.log(`Updated Vault ${vaultAddr}: Following ${targetWhale}`);
                        } else {
                            // Add new
                            this.vaults.push({
                                address: vaultAddr,
                                owner: owner,
                                targetWhale: targetWhale
                            });
                            console.log(`Discovered Vault #${this.lastCheckedIndex}: ${vaultAddr}`);
                        }
                    } catch (e) {
                        console.error(`Failed to fetch details for vault ${vaultAddr}`, e);
                    }

                    // Move to next index
                    this.lastCheckedIndex++;
                } else {
                    // Should not happen for valid array, but if zero address, maybe skip?
                    this.lastCheckedIndex++;
                }

            } catch (e: any) {
                // If the call fails, it likely means the index is out of bounds (end of array).
                // We stop here and wait for next cycle.
                // console.log("End of vault list reached (or RPC error).");
                break;
            }
            loops++;
        }

        return this.vaults;
    }
}
