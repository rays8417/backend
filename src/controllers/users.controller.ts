import { Request, Response } from 'express';
import { prisma } from '../prisma';

/**
 * Users Controller
 * Handles user tracking and metrics
 */

/**
 * POST /api/users/track
 * Track a wallet connection for metrics
 */
export const trackUser = async (req: Request, res: Response) => {
  try {
    const { address } = req.body;

    if (!address || typeof address !== 'string') {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    // Check if user already exists, if not create it
    const user = await prisma.user.upsert({
      where: { address },
      update: {
        updatedAt: new Date(), // Update timestamp on reconnection
      },
      create: {
        address,
      },
    });

    res.json({ 
      success: true, 
      user: {
        id: user.id,
        address: user.address,
        createdAt: user.createdAt,
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

