/**
 * Referral Service for Limit Order Backend
 * Makes HTTP calls to the main backend to process first trade rewards.
 */

const MAIN_BACKEND_URL = process.env.MAIN_BACKEND_URL || 'http://localhost:3000';
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

export async function processFirstTradeReferral(walletAddress: string): Promise<void> {
    console.log(`[DEBUG] Calling referral endpoint for wallet: ${walletAddress}`);
    try {
        const response = await fetch(`${MAIN_BACKEND_URL}/api/user/referral/first-trade`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Key': INTERNAL_SERVICE_KEY,
            },
            body: JSON.stringify({ walletAddress })
        });

        if (response.ok) {
            const data = await response.json();
            console.log(`Referral reward processed for ${walletAddress}:`, data.message);
        } else {
            console.log(`Referral check failed for ${walletAddress}: ${response.status}`);
        }
    } catch (error) {
        console.error(`Failed to process referral for ${walletAddress}:`, error);
    }
}
