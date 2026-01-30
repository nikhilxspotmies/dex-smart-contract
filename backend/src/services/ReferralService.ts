import User from '../models/User.js';

export class ReferralService {
    /**
     * Checks if the user is completing their first trade and awards referral points if applicable.
     * @param walletAddress The wallet address of the user performing the trade.
     */
    static async checkAndAwardReferral(walletAddress: string): Promise<void> {
        try {
            // Case-insensitive search
            const user = await User.findOne({
                walletAddress: { $regex: new RegExp(`^${walletAddress}$`, 'i') }
            });

            if (!user) {
                console.log(`Referral check skipped: User not found for address ${walletAddress}`);
                return;
            }

            if (user.hasCompletedFirstTrade) {
                // User has already completed a trade, no new reward.
                return;
            }

            // Mark as completed first trade
            user.hasCompletedFirstTrade = true;
            await user.save();

            // Check if they were referred by someone
            if (user.referredBy) {
                const referrer = await User.findOneAndUpdate(
                    { referralCode: user.referredBy },
                    { $inc: { referralPoints: 100 } },
                    { new: true }
                );

                if (referrer) {
                    console.log(`Referral Reward: 100 points awarded to referrer ${referrer.walletAddress} (Code: ${user.referredBy}) for user ${user.walletAddress}`);
                }
            } else {
                console.log(`User ${user.walletAddress} verified first trade, but has no referrer.`);
            }

        } catch (error) {
            console.error("Referral Service Error:", error);
        }
    }
}

export default ReferralService;
