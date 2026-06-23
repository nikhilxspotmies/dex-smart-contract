import type { Request, Response } from 'express';
import { sdk } from 'sumsub-node-sdk';
import User from '../models/User.js';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { normalizeAddress } from '../utils/addressUtils.js';

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
    const sumsubError = error.response?.data;
    const statusCode = error.response?.status;
    console.error('Sumsub token generation error:', JSON.stringify(sumsubError || error.message));

    // Country/region restriction — Sumsub returns 400 with specific error codes
    if (
      statusCode === 400 &&
      (sumsubError?.description?.toLowerCase().includes('country') ||
       sumsubError?.code === 'COUNTRY_RESTRICTED' ||
       sumsubError?.description?.toLowerCase().includes('not supported') ||
       sumsubError?.description?.toLowerCase().includes('sanctioned'))
    ) {
      res.status(403).json({
        message: 'KYC verification is not available in your region.',
        code: 'COUNTRY_RESTRICTED'
      });
      return;
    }

    // Propagate the real Sumsub error so the frontend can show something useful
    res.status(statusCode || 500).json({
      message: sumsubError?.description || sumsubError?.message || 'Failed to initialize verification. Please try again.',
      code: sumsubError?.code || 'SUMSUB_ERROR',
      error: sumsubError
    });
  }
};

/**
 * Internal helper to sync KYC status from Sumsub API
 */
async function syncStatusInternal(walletAddress: string) {
    // H7: normalize address before use in DB query
    const addr = normalizeAddress(walletAddress);
    if (!addr) {
        console.error(`syncStatusInternal: invalid address: ${walletAddress}`);
        return 'NONE';
    }
    try {
        console.log(`Syncing KYC status for: ${addr}`);
        const response = await sumsub.getApplicantByExternalUserId(addr);
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
                { walletAddress: { $regex: `^${addr}$`, $options: 'i' } },
                {
                    kycStatus,
                    kycRejectionReasons,
                    kycComment,
                    kycIsFinal,
                    sumsubId: applicant.id
                }
            );
            console.log(`Synced status for ${addr}: ${kycStatus}`);
            return kycStatus;
        }
    } catch (error: any) {
        if (error.response?.status === 404) {
            console.log(`No Sumsub applicant found for ${addr}`);
        } else {
            console.error(`Error syncing status for ${addr}:`, error.message);
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
    const digestAlg = (req.headers['x-payload-digest-alg'] as string || 'sha256').toLowerCase();

    // H6: always verify signature — reject unconditionally if secret not configured or sig absent.
    if (!env.SUMSUB_WEBHOOK_SECRET) {
      console.error('Sumsub Webhook: SUMSUB_WEBHOOK_SECRET not configured; rejecting request.');
      res.status(401).json({ message: 'Webhook not configured' });
      return;
    }
    if (!signature) {
      res.status(401).json({ message: 'No signature provided' });
      return;
    }
    // Restrict to known HMAC algorithms to prevent algorithm-confusion attacks.
    const allowedAlgs = new Set(['sha256', 'sha512']);
    if (!allowedAlgs.has(digestAlg)) {
      res.status(400).json({ message: 'Unsupported digest algorithm' });
      return;
    }
    const hmac = crypto.createHmac(digestAlg, env.SUMSUB_WEBHOOK_SECRET);
    hmac.update(req.rawBody);
    const calculatedDigest = hmac.digest('hex');
    if (signature !== calculatedDigest) {
      console.error('Sumsub Webhook: Invalid signature');
      res.status(401).json({ message: 'Invalid signature' });
      return;
    }

    // 2. Process Payload
    const { type, externalUserId, reviewStatus, reviewResult } = req.body;

    // H7: validate externalUserId (wallet address) before any DB query
    const extAddr = normalizeAddress(externalUserId);
    if (!extAddr) {
      console.error(`Sumsub Webhook: invalid externalUserId: ${externalUserId}`);
      res.status(400).json({ message: 'Invalid externalUserId' });
      return;
    }

    console.log(`Sumsub Webhook [${type}] received for: ${extAddr}`);

    if (type === 'applicantReviewed') {
      const isApproved = reviewResult?.reviewAnswer === 'GREEN';
      const kycStatus = isApproved ? 'VERIFIED' : 'REJECTED';

      await User.updateOne(
        { walletAddress: { $regex: `^${extAddr}$`, $options: 'i' } },
        {
            kycStatus,
            kycRejectionReasons: isApproved ? [] : (reviewResult?.rejectLabels || []),
            kycComment: isApproved ? '' : (reviewResult?.clientComment || reviewResult?.moderationComment || ''),
            kycIsFinal: isApproved ? false : (reviewResult?.reviewRejectType === 'FINAL')
        }
      );

      console.log(`User ${extAddr} KYC updated to: ${kycStatus}`);
    } else if (type === 'applicantCreated') {
      await User.updateOne(
        { walletAddress: { $regex: `^${extAddr}$`, $options: 'i' } },
        { kycStatus: 'INCOMPLETE', kycRejectionReasons: [], kycComment: '', kycIsFinal: false }
      );
      console.log(`User ${extAddr} KYC updated to: INCOMPLETE (via ${type})`);
    } else if (['applicantPending', 'applicantReset', 'applicantOnHold'].includes(type)) {
      await User.updateOne(
        { walletAddress: { $regex: `^${extAddr}$`, $options: 'i' } },
        { kycStatus: 'PENDING', kycRejectionReasons: [], kycComment: '', kycIsFinal: false }
      );
      console.log(`User ${extAddr} KYC updated to: PENDING (via ${type})`);
    }

    // Always return 200 to Sumsub
    res.status(200).send('OK');
  } catch (error: any) {
    console.error('Sumsub Webhook error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
