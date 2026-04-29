import type { Request, Response } from 'express';
import { sdk } from 'sumsub-node-sdk';
import User from '../models/User.js';
import crypto from 'crypto';

interface AuthRequest extends Request {
  user?: any;
  rawBody?: any;
}

// Initialize Sumsub SDK
// Note: These variables should be in your .env file
const sumsub = sdk({
  baseURL: process.env.SUMSUB_BASE_URL || 'https://api.sumsub.com',
  appToken: process.env.SUMSUB_APP_TOKEN || '',
  secretKey: process.env.SUMSUB_SECRET_KEY || '',
});

/**
 * Generates a temporary access token for the Sumsub WebSDK.
 * Tied to the authenticated user's wallet address.
 */
export const generateToken = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user; // Injected by authMiddleware
    if (!user) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const externalUserId = user.walletAddress;
    const levelName = process.env.SUMSUB_LEVEL_NAME || 'basic-kyc-level';

    console.log(`Generating Sumsub token for user: ${externalUserId} (Level: ${levelName})`);

    // Generate access token (TTL: 30 mins)
    const accessToken = await sumsub.generateAccessToken(externalUserId, levelName, 1800);

    // Track the Sumsub ID in our database
    if (!user.sumsubId) {
        user.sumsubId = externalUserId;
        await user.save();
    }

    res.status(200).json({ token: accessToken.data.token });
  } catch (error: any) {
    console.error('Sumsub token generation error:', error);
    res.status(500).json({ 
        message: 'Internal server error', 
        error: error.response?.data || error.message 
    });
  }
};

/**
 * Handles Webhook notifications from Sumsub.
 * Verifies the signature to ensure the request is actually from Sumsub.
 */
export const handleWebhook = async (req: AuthRequest, res: Response) => {
  try {
    const signature = req.headers['x-payload-digest'] as string;
    const webhookSecret = process.env.SUMSUB_WEBHOOK_SECRET;

    // 1. Verify Signature (Security)
    if (webhookSecret) {
        if (!signature) {
            res.status(401).json({ message: 'No signature provided' });
            return;
        }

        const hmac = crypto.createHmac('sha256', webhookSecret);
        hmac.update(req.rawBody); // req.rawBody is captured in app.ts
        const calculatedDigest = hmac.digest('hex');

        if (signature !== calculatedDigest) {
            console.error('Sumsub Webhook: Invalid signature');
            res.status(401).json({ message: 'Invalid signature' });
            return;
        }
    } else {
        console.warn('SUMSUB_WEBHOOK_SECRET not set. Webhook verification skipped (UNSAFE).');
    }

    // 2. Process Payload
    const { type, externalUserId, reviewStatus, reviewResult } = req.body;

    console.log(`Sumsub Webhook [${type}] received for: ${externalUserId}`);

    if (type === 'applicantReviewed') {
      const isApproved = reviewResult?.reviewAnswer === 'GREEN';
      const kycStatus = isApproved ? 'VERIFIED' : 'REJECTED';

      await User.updateOne(
        { walletAddress: { $regex: new RegExp(`^${externalUserId}$`, 'i') } },
        { kycStatus: kycStatus }
      );

      console.log(`User ${externalUserId} KYC updated to: ${kycStatus}`);
    } else if (type === 'applicantPending') {
        await User.updateOne(
            { walletAddress: { $regex: new RegExp(`^${externalUserId}$`, 'i') } },
            { kycStatus: 'PENDING' }
        );
        console.log(`User ${externalUserId} KYC updated to: PENDING`);
    }

    // Always return 200 to Sumsub
    res.status(200).send('OK');
  } catch (error: any) {
    console.error('Sumsub Webhook error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
