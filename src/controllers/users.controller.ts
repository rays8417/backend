import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { PLAYER_MODULES } from '../config/players.config';

/**
 * Create welcome points for new users
 * - 5 VP (Validity Points) for each player
 * - 20 XP (Experience Points)
 */
const createWelcomePoints = async (userId: string): Promise<void> => {
  try {
    console.log(`[WELCOME POINTS] Creating welcome points for user: ${userId}`);
    
    // Create 5 VP for each player
    const vpPromises = PLAYER_MODULES.map(player => 
      prisma.point.create({
        data: {
          userId,
          type: 'VP',
          amount: 5,
          playerModuleName: player.moduleName
        }
      }).catch(error => {
        // Log error but continue with other players
        console.error(`[WELCOME POINTS] Failed to create VP for ${player.moduleName}:`, error);
      })
    );

    // Create 20 XP (only if it doesn't exist)
    const existingXP = await prisma.point.findFirst({
      where: {
        userId,
        type: 'XP',
        playerModuleName: null
      }
    });

    const xpPromise = existingXP 
      ? Promise.resolve(null) // XP already exists, skip
      : prisma.point.create({
          data: {
            userId,
            type: 'XP',
            amount: 20,
            playerModuleName: null
          }
        }).catch(error => {
          console.error('[WELCOME POINTS] Failed to create XP:', error);
        });

    // Wait for all points to be created
    await Promise.all([...vpPromises, xpPromise]);

    console.log(`[WELCOME POINTS] ✅ Created ${PLAYER_MODULES.length} VP entries (5 VP each) and 20 XP for user`);
  } catch (error) {
    console.error('[WELCOME POINTS] Error in createWelcomePoints:', error);
    // Don't throw - we don't want to fail user tracking if points creation fails
  }
};

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
    
    // Also create welcome points (5 VP per player + 20 XP)
    await createWelcomePoints(user.id);
    
  } catch (error) {
    console.error('[WELCOME PACK] Error in createWelcomePack:', error);
    // Don't throw - we don't want to fail user tracking if welcome pack creation fails
  }
};

export const trackUser = async (req: Request, res: Response) => {
  try {
    const { address, twitterUsername, inviteCode } = req.body;

    if (!address || typeof address !== 'string') {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { address },
    });

    const isNewUser = !existingUser;

    // Handle invite code - if provided, find the inviter by twitterUsername
    let invitedByUserId: string | undefined = undefined;
    if (inviteCode && typeof inviteCode === 'string' && isNewUser) {
      try {
        // inviteCode is the twitterUsername of the inviter
        const inviter = await prisma.user.findUnique({
          where: { twitterUsername: inviteCode },
        });
        
        if (inviter) {
          invitedByUserId = inviter.id;
          console.log(`[TRACKER] User ${address} invited by ${inviteCode} (${inviter.id})`);
        } else {
          console.log(`[TRACKER] Invite code ${inviteCode} not found, proceeding without invite`);
        }
      } catch (inviteError) {
        console.error('[TRACKER] Error looking up invite code:', inviteError);
        // Continue without invite if lookup fails
      }
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: new Date(), // Update timestamp on reconnection
    };

    // Update twitterUsername if provided (only if not already set or if different)
    if (twitterUsername && typeof twitterUsername === 'string') {
      // Normalize twitterUsername (remove @ if present, lowercase)
      const normalizedTwitterUsername = twitterUsername.replace(/^@/, '').toLowerCase();
      updateData.twitterUsername = normalizedTwitterUsername;
    }

    // Prepare create data
    const createData: any = {
      address,
    };

    if (twitterUsername && typeof twitterUsername === 'string') {
      const normalizedTwitterUsername = twitterUsername.replace(/^@/, '').toLowerCase();
      createData.twitterUsername = normalizedTwitterUsername;
    }

    if (invitedByUserId) {
      createData.invitedBy = invitedByUserId;
    }

    // Create or update user
    const user = await prisma.user.upsert({
      where: { address },
      update: updateData,
      create: createData,
    });

    // If this is a new user, create a welcome pack (async, don't wait)
    if (isNewUser) {
      console.log(`[TRACKER] New user detected: ${address}. Creating welcome pack and points...`);
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
        twitterUsername: user.twitterUsername,
        createdAt: user.createdAt,
        isNewUser,
      }
    });
  } catch (error: any) {
    console.error('Error tracking user:', error);
    
    // Handle unique constraint violations
    if (error.code === 'P2002') {
      if (error.meta?.target?.includes('twitterUsername')) {
        return res.status(400).json({ error: 'Twitter username already taken' });
      }
    }
    
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

/**
 * GET /api/users/:address
 * Get user details including points
 */
export const getUser = async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    if (!address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    const user = await prisma.user.findUnique({
      where: { address },
      include: {
        points: {
          orderBy: [
            { type: 'asc' },
            { createdAt: 'asc' }
          ]
        },
        inviter: {
          select: {
            id: true,
            address: true,
            twitterUsername: true
          }
        },
        invitedUsers: {
          select: {
            id: true,
            address: true,
            twitterUsername: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate totals
    const totalXP = user.points
      .filter(p => p.type === 'XP')
      .reduce((sum, p) => sum + p.amount, 0);
    
    const totalVP = user.points
      .filter(p => p.type === 'VP')
      .reduce((sum, p) => sum + p.amount, 0);
    
    const vpByPlayer = user.points
      .filter(p => p.type === 'VP' && p.playerModuleName)
      .reduce((acc, p) => {
        acc[p.playerModuleName!] = p.amount;
        return acc;
      }, {} as Record<string, number>);

    res.json({
      success: true,
      user: {
        id: user.id,
        address: user.address,
        twitterUsername: user.twitterUsername,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        points: {
          totalXP,
          totalVP,
          xpEntries: user.points.filter(p => p.type === 'XP'),
          vpByPlayer,
          allPoints: user.points
        },
        inviter: user.inviter,
        invitedUsers: user.invitedUsers,
        invitedCount: user.invitedUsers.length
      }
    });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};

