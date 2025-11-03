import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { PLAYER_MODULES } from '../config/players.config';
import { RewardDistributionResult } from '../services/rewardCalculationService';
import { REWARD_CONFIG } from '../config/reward.config';

/**
 * Award invite reward to inviter
 * - 15 XP per invited user
 * - Creates a new XP entry for transaction history
 */
const awardInviteReward = async (inviterId: string, invitedUserAddress: string): Promise<void> => {
  try {
    console.log(`[INVITE REWARD] Awarding 15 XP to inviter ${inviterId} for inviting ${invitedUserAddress}`);
    
    // Create new XP entry for transaction history
    await prisma.point.create({
      data: {
        userId: inviterId,
        type: 'XP',
        amount: 15,
        playerModuleName: null
      }
    });
    console.log(`[INVITE REWARD] ✅ Created new XP entry with 15 XP for inviter ${inviterId}`);
  } catch (error) {
    console.error('[INVITE REWARD] Error awarding invite reward:', error);
    // Don't throw - we don't want to fail user tracking if reward fails
  }
};

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

    // Create 20 XP (welcome bonus)
    const xpPromise = prisma.point.create({
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

      // If user was invited, award 15 XP to the inviter (async, don't wait)
      if (invitedByUserId) {
        console.log(`[TRACKER] New user ${address} was invited. Awarding 15 XP to inviter ${invitedByUserId}...`);
        // Fire and forget - don't await
        awardInviteReward(invitedByUserId, address).catch(error => {
          console.error('[TRACKER] Failed to award invite reward:', error);
        });
      }
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
    
    // Calculate VP per player by summing all entries (for transaction history)
    const vpByPlayer = user.points
      .filter(p => p.type === 'VP' && p.playerModuleName)
      .reduce((acc, p) => {
        const moduleName = p.playerModuleName!;
        acc[moduleName] = (acc[moduleName] || 0) + p.amount;
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


const calculateTournamentXP = (totalScore: number): number => {
  if (totalScore <= 0) {
    return 0;
  }

  // Map tournament scores to XP range 300-800
  // Using logarithmic scaling to prevent extreme scores from dominating
  // Formula: XP = 300 + 500 * (log(1 + score/100) / log(1 + maxExpectedScore/100))
  // Using maxExpectedScore of 5000 for scaling reference
  const MAX_EXPECTED_SCORE = 5000;
  const MIN_XP = 300;
  const MAX_XP = 800;
  const XP_RANGE = MAX_XP - MIN_XP;

  // Use square root scaling for smoother distribution
  // Normalize score to 0-1 range using square root, then scale to XP range
  const normalizedScore = Math.sqrt(Math.min(totalScore, MAX_EXPECTED_SCORE) / MAX_EXPECTED_SCORE);
  const xpToAward = Math.floor(MIN_XP + normalizedScore * XP_RANGE);

  // Clamp to ensure it's within 300-800 range
  return Math.max(MIN_XP, Math.min(MAX_XP, xpToAward));
};

/**
 * Award XP to users based on tournament performance
 * - Maps tournament scores to XP range 300-800
 * - Uses square root scaling for fair distribution
 * - Creates new XP entry for each user for transaction history
 */
export const awardTournamentXP = async (
  tournamentId: string,
  rewardDistribution: RewardDistributionResult
): Promise<void> => {
  try {
    console.log(`[TOURNAMENT XP] Awarding XP based on tournament performance: ${tournamentId}`);
    
    let totalXPAwarded = 0;
    let usersAwarded = 0;
    let usersFailed = 0;

    for (const calculation of rewardDistribution.rewardCalculations) {
      try {
        const { address, totalScore } = calculation;
        
        // Skip if user has no score
        if (totalScore <= 0) {
          continue;
        }

        // Calculate XP using tiered system
        const xpToAward = calculateTournamentXP(totalScore);

        // Find user by address
        const user = await prisma.user.findUnique({
          where: { address }
        });

        if (!user) {
          console.log(`[TOURNAMENT XP] User not found for address ${address}, skipping...`);
          continue;
        }

        // Show detailed breakdown for this user's calculation
        if (calculation.holdings && calculation.holdings.length > 0) {
          console.log(`\n[TOURNAMENT XP] 📊 Detailed Score Breakdown for ${address.slice(0, 12)}...:`);
          console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.log(`   Player Holdings & Contributions:`);
          
          let sumCheck = 0;
          // Use the same decimal multiplier as in rewardCalculationService
          // Player tokens use 3 decimals (same as Boson token)
          const decimalMultiplier = Math.pow(10, REWARD_CONFIG.BOSON_DECIMALS); // 10^3 = 1000
          
          for (const holding of calculation.holdings) {
            const maintainedTokens = BigInt(holding.maintainedBalance);
            const tokenRatio = Number(maintainedTokens) / decimalMultiplier;
            const points = holding.points;
            sumCheck += points;
            
            console.log(`   • ${holding.moduleName}:`);
            console.log(`     - Player Fantasy Points: ${holding.playerScore.toFixed(2)}`);
            console.log(`     - Maintained Balance (raw): ${maintainedTokens.toString()}`);
            console.log(`     - Token Amount: ${tokenRatio.toFixed(3)} tokens (${maintainedTokens.toString()} / ${decimalMultiplier})`);
            console.log(`     - Contribution: ${points.toFixed(2)} = ${holding.playerScore.toFixed(2)} × ${tokenRatio.toFixed(3)}`);
          }
          
          console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.log(`   ✅ Total Fantasy Score: ${totalScore.toFixed(2)} (verified: ${sumCheck.toFixed(2)})`);
          
          // Show XP calculation step-by-step
          console.log(`\n   🎯 XP Calculation (Range: 300-800 XP):`);
          const MAX_EXPECTED_SCORE = 5000;
          const MIN_XP = 300;
          const MAX_XP = 800;
          const XP_RANGE = MAX_XP - MIN_XP;
          const normalizedScore = Math.sqrt(Math.min(totalScore, MAX_EXPECTED_SCORE) / MAX_EXPECTED_SCORE);
          console.log(`     Score: ${totalScore.toFixed(2)}`);
          console.log(`     Normalized (sqrt): ${normalizedScore.toFixed(4)}`);
          console.log(`     Formula: ${MIN_XP} + ${normalizedScore.toFixed(4)} × ${XP_RANGE}`);
          console.log(`     = ${MIN_XP} + ${(normalizedScore * XP_RANGE).toFixed(2)}`);
          console.log(`     = ${xpToAward} XP (range: ${MIN_XP}-${MAX_XP})`);
          console.log(`   ✅ Final XP Awarded: ${xpToAward} XP\n`);
        }

        // Create new XP entry for transaction history
        await prisma.point.create({
          data: {
            userId: user.id,
            type: 'XP',
            amount: xpToAward,
            playerModuleName: null
          }
        });
        console.log(`[TOURNAMENT XP] ✅ ${address}: +${xpToAward} XP (score: ${totalScore.toFixed(2)})`);

        totalXPAwarded += xpToAward;
        usersAwarded++;
      } catch (error) {
        console.error(`[TOURNAMENT XP] Error awarding XP to ${calculation.address}:`, error);
        usersFailed++;
      }
    }

    console.log(`[TOURNAMENT XP] ✅ Tournament XP awarded!`);
    console.log(`   Users awarded: ${usersAwarded}`);
    console.log(`   Total XP awarded: ${totalXPAwarded}`);
    console.log(`   Failed: ${usersFailed}`);
  } catch (error) {
    console.error('[TOURNAMENT XP] Error awarding tournament XP:', error);
    // Don't throw - we don't want to fail tournament completion if XP awarding fails
  }
};

