import { Request, Response } from 'express';
import { prisma } from '../prisma';

/**
 * Create a welcome BASE pack for new users
 * Creates a BASE pack (20 bosons) that the user can open later as a gift
 */
const createWelcomePack = async (address: string): Promise<void> => {
  try {
    console.log(`[WELCOME PACK] Creating welcome BASE pack for new user: ${address}`);
    
    // Find the user
    const user = await prisma.user.findUnique({
      where: { address }
    });

    if (!user) {
      console.error('[WELCOME PACK] User not found, cannot create welcome pack');
      return;
    }

    // Import the pack generation utility
    const { generatePackData, PACK_TYPES } = await import('../utils/playerTokenDistribution');
    
    // Get BASE pack info (20 bosons)
    const basePackInfo = PACK_TYPES.find(p => p.type === 20);
    if (!basePackInfo) {
      console.error('[WELCOME PACK] BASE pack type not found');
      return;
    }

    // Generate pack data
    const packData = await generatePackData(basePackInfo.price);

    // Create the welcome pack in database
    const welcomePack = await prisma.playerPack.create({
      data: {
        userId: user.id,
        packType: 'BASE',
        isOpened: false,
        players: packData.players as any,
        totalValue: packData.totalValue
      }
    });

    console.log(`[WELCOME PACK] ✅ Welcome pack created: ${welcomePack.id} (${packData.players.length} players, ${packData.totalValue} bosons)`);
    
  } catch (error) {
    console.error('[WELCOME PACK] Error in createWelcomePack:', error);
    // Don't throw - we don't want to fail user tracking if welcome pack creation fails
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

    // If this is a new user, create a welcome pack (async, don't wait)
    if (isNewUser) {
      console.log(`[TRACKER] New user detected: ${address}. Creating welcome pack...`);
      // Fire and forget - don't await
      createWelcomePack(address).catch(error => {
        console.error('[TRACKER] Failed to create welcome pack:', error);
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

