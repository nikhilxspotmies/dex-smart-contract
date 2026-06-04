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
    const applicantId = accessToken.data.userId;

    // 1. Correctly track the internal Sumsub ID
    if (!user.sumsubId || user.sumsubId !== applicantId) {
      user.sumsubId = applicantId;
      await user.save();
    }

    // 2. Handle Resubmission: If user was REJECTED and it's not final, reset them so they can upload new docs
    if (user.kycStatus === 'REJECTED' && !user.kycIsFinal) {
      try {
        console.log(`Resetting applicant ${applicantId} for resubmission...`);
        await sumsub.resetApplicant(applicantId);
      } catch (resetError: any) {
        console.error("Failed to reset applicant:", resetError.response?.data || resetError.message);
      }
    }

    res.status(200).json({ token: accessToken.data.token });

    // Only sync if not already verified to avoid unnecessary API hits
    if (user.kycStatus !== 'VERIFIED') {
        syncStatusInternal(externalUserId).catch(console.error);
    }
  } catch (error: any) {
    console.error('Sumsub token generation error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.response?.data || error.message
    });
  }
};

/**
 * Internal helper to sync KYC status from Sumsub API
 */
async function syncStatusInternal(walletAddress: string) {
    try {
        console.log(`Syncing KYC status for: ${walletAddress}`);
        const response = await sumsub.getApplicantByExternalUserId(walletAddress);
        const applicant = response.data;

        if (applicant && applicant.review) {
            const reviewStatus = applicant.review.reviewStatus;
            const reviewResult = applicant.review.reviewResult;

            let kycStatus = 'NONE';
            let kycRejectionReasons: string[] = [];
            let kycComment = '';
            let kycIsFinal = false;

            if (reviewStatus === 'completed') {
                const isApproved = reviewResult?.reviewAnswer === 'GREEN';
                kycStatus = isApproved ? 'VERIFIED' : 'REJECTED';

                if (!isApproved) {
                    kycRejectionReasons = reviewResult?.rejectLabels || [];
                    kycComment = reviewResult?.clientComment || reviewResult?.moderationComment || '';
                    kycIsFinal = reviewResult?.reviewRejectType === 'FINAL';
                }
            } else if (reviewStatus === 'init') {
                // Applicant started but hasn't submitted all required documents yet
                kycStatus = 'INCOMPLETE';
            } else if (['pending', 'prechecked', 'queued', 'onHold'].includes(reviewStatus)) {
                kycStatus = 'PENDING';
            }

            await User.updateOne(
                { walletAddress: { $regex: new RegExp(`^${walletAddress}$`, 'i') } },
                { 
                    kycStatus,
                    kycRejectionReasons,
                    kycComment,
                    kycIsFinal,
                    sumsubId: applicant.id // Update internal ID if found
                }
            );
            console.log(`Synced status for ${walletAddress}: ${kycStatus}`);
            return kycStatus;
        }
    } catch (error: any) {
        if (error.response?.status === 404) {
            console.log(`No Sumsub applicant found for ${walletAddress}`);
        } else {
            console.error(`Error syncing status for ${walletAddress}:`, error.message);
        }
    }
    return 'NONE';
}

/**
 * Public endpoint to trigger a sync
 */
export const syncStatus = async (req: AuthRequest, res: Response) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        // If already verified, no need to hit Sumsub
        if (user.kycStatus === 'VERIFIED') {
            res.status(200).json({ kycStatus: 'VERIFIED' });
            return;
        }

        const newStatus = await syncStatusInternal(user.walletAddress);
        res.status(200).json({ kycStatus: newStatus });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
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
        { 
            kycStatus: kycStatus,
            kycRejectionReasons: isApproved ? [] : (reviewResult?.rejectLabels || []),
            kycComment: isApproved ? '' : (reviewResult?.clientComment || reviewResult?.moderationComment || ''),
            kycIsFinal: isApproved ? false : (reviewResult?.reviewRejectType === 'FINAL')
        }
      );

      console.log(`User ${externalUserId} KYC updated to: ${kycStatus}`);
    } else if (type === 'applicantCreated') {
      await User.updateOne(
        { walletAddress: { $regex: new RegExp(`^${externalUserId}$`, 'i') } },
        { kycStatus: 'INCOMPLETE', kycRejectionReasons: [], kycComment: '', kycIsFinal: false }
      );
      console.log(`User ${externalUserId} KYC updated to: INCOMPLETE (via ${type})`);
    } else if (['applicantPending', 'applicantReset', 'applicantOnHold'].includes(type)) {
      await User.updateOne(
        { walletAddress: { $regex: new RegExp(`^${externalUserId}$`, 'i') } },
        { kycStatus: 'PENDING', kycRejectionReasons: [], kycComment: '', kycIsFinal: false }
      );
      console.log(`User ${externalUserId} KYC updated to: PENDING (via ${type})`);
    }

    // Always return 200 to Sumsub
    res.status(200).send('OK');
  } catch (error: any) {
    console.error('Sumsub Webhook error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
