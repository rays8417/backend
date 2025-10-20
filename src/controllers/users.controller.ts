import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { REWARD_CONFIG } from '../config/reward.config';
import { distributeRandomPlayerTokens } from '../utils/playerTokenDistribution';

/**
 * Send starter tokens to new users
 * Randomly selects 2-5 player tokens and distributes them such that total value = 20 bosons
 */
const sendStarterTokens = async (address: string): Promise<void> => {
  try {
    console.log(`[STARTER TOKENS] Sending starter tokens to new user: ${address}`);
    
    // Get admin private key
    const adminPrivateKey = REWARD_CONFIG.ADMIN_PRIVATE_KEY;
    if (!adminPrivateKey) {
      console.error('[STARTER TOKENS] Admin private key not configured. Cannot send starter tokens.');
      return;
    }

    // Use the reusable utility to distribute 20 bosons worth of player tokens
    await distributeRandomPlayerTokens(address, 20, adminPrivateKey);
    
  } catch (error) {
    console.error('[STARTER TOKENS] Error in sendStarterTokens:', error);
    // Don't throw - we don't want to fail user tracking if starter tokens fail
  }
};

export const trackUser = async (req: Request, res: Response) => {
  try {
    const { address } = req.body;

    if (!address || typeof address !== 'string') {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { address },
    });

    const isNewUser = !existingUser;

    // Create or update user
    const user = await prisma.user.upsert({
      where: { address },
      update: {
        updatedAt: new Date(), // Update timestamp on reconnection
      },
      create: {
        address,
      },
    });

    // If this is a new user, send starter tokens (async, don't wait)
    if (isNewUser) {
      console.log(`[TRACKER] New user detected: ${address}. Sending starter tokens...`);
      // Fire and forget - don't await
      sendStarterTokens(address).catch(error => {
        console.error('[TRACKER] Failed to send starter tokens:', error);
      });
    }

    res.json({ 
      success: true, 
      user: {
        id: user.id,
        address: user.address,
        createdAt: user.createdAt,
        isNewUser,
      }
    });
  } catch (error) {
    console.error('Error tracking user:', error);
    res.status(500).json({ error: 'Failed to track user' });
  }
};

/**
 * GET /api/users/count
 * Get total unique users count (for admin/metrics)
 */
export const getUserCount = async (req: Request, res: Response) => {
  try {
    const count = await prisma.user.count();
    res.json({ success: true, count });
  } catch (error) {
    console.error('Error getting user count:', error);
    res.status(500).json({ error: 'Failed to get user count' });
  }
};

