import { 
  getContractSnapshot, 
  comparePrePostMatchSnapshots,
  calculateRewardEligibility,
  ContractSnapshotData,
  ContractHolder
} from './contractSnapshotService';
import { prisma } from '../prisma';
import { parseIgnoredAddresses, REWARD_CONFIG } from '../config/reward.config';
import dotenv from 'dotenv';

dotenv.config();

// New interfaces for contract-based reward calculation
export interface PlayerScoreData {
  moduleName: string;
  fantasyPoints: number;
  playerId?: string;
}

export interface RewardCalculation {
  address: string;
  totalTokens: string;
  totalScore: number;
  rewardAmount: number;
  eligibility: {
    eligible: boolean;
    maintainedHoldings: number;
    totalHoldings: number;
    eligibilityPercentage: number;
  };
  holdings: {
    moduleName: string;
    preBalance: string;
    postBalance: string;
    maintainedBalance: string;
    playerScore: number;
    points: number;
  }[];
}

export interface RewardDistributionResult {
  totalRewardAmount: number;
  totalEligibleHolders: number;
  totalTokens: string;
  rewardCalculations: RewardCalculation[];
  summary: {
    successfulCalculations: number;
    failedCalculations: number;
    totalRewardsDistributed: number;
  };
}

/**
 * Get player scores for a tournament
 */
async function getPlayerScores(tournamentId: string): Promise<PlayerScoreData[]> {
  try {
    const playerScores = await prisma.playerScore.findMany({
      where: { tournamentId },
      select: {
        moduleName: true,
        fantasyPoints: true,

      }
    });

    return playerScores.map(score => ({
      moduleName: score.moduleName || 'Unknown',
      fantasyPoints: Number(score.fantasyPoints),
    }));
  } catch (error) {
    console.error('[REWARD_CALC] Error getting player scores:', error);
    throw new Error(`Failed to get player scores: ${error}`);
  }
}

/**
 * Calculate user score based on MAINTAINED token holdings and player performance
 * Only counts tokens that were held BOTH pre-match AND post-match
 * Only includes players where user has VP > 0 (validity points requirement)
 */
function calculateUserScore(
  preMatchHoldings: ContractHolder['holdings'],
  postMatchHoldings: ContractHolder['holdings'],
  playerScores: PlayerScoreData[],
  userVPByPlayer: Map<string, number> = new Map()
): { totalScore: number; detailedScores: any[] } {
  let totalScore = 0;
  const detailedScores = [];

  // Create a map of post-match holdings for quick lookup
  const postHoldingsMap = new Map(
    postMatchHoldings.map(h => [h.moduleName, BigInt(h.balance)])
  );

  for (const preHolding of preMatchHoldings) {
    const playerScore = playerScores.find(ps => ps.moduleName === preHolding.moduleName);
    
    if (playerScore) {
      // Check if user has VP for this player (VP > 0 required)
      const userVP = userVPByPlayer.get(preHolding.moduleName) || 0;
      
      if (userVP <= 0) {
        // User has 0 VP for this player - exclude from score calculation
        console.log(`[REWARD_CALC] Skipping player ${preHolding.moduleName}: user has 0 VP`);
        continue;
      }
      
      const preBalance = BigInt(preHolding.balance);
      const postBalance = postHoldingsMap.get(preHolding.moduleName) || BigInt(0);
      
      // Use MINIMUM of pre and post - only count maintained tokens
      const maintainedBalance = preBalance < postBalance ? preBalance : postBalance;
      
      // Calculate points based on MAINTAINED tokens only
      // Use proper decimals for Solana (3 decimals)
      const decimalMultiplier = Math.pow(10, REWARD_CONFIG.BOSON_DECIMALS);
      const tokenRatio = Number(maintainedBalance) / decimalMultiplier;
      const weightedPoints = playerScore.fantasyPoints * tokenRatio;
      
      totalScore += weightedPoints;
      
      detailedScores.push({
        moduleName: preHolding.moduleName,
        preBalance: preHolding.balance,
        postBalance: postBalance.toString(),
        maintainedBalance: maintainedBalance.toString(),
        playerScore: playerScore.fantasyPoints,
        points: weightedPoints,
        userVP: userVP // Include VP info for debugging
      });
    }
  }

  return { totalScore, detailedScores };
}

/**
 * Calculate rewards based on snapshot data and player scores
 */
export async function calculateRewardsFromSnapshots(
  tournamentId: string,
  totalRewardAmount: number
): Promise<RewardDistributionResult> {
  try {
    console.log(`[REWARD_CALC] Calculating rewards for tournament ${tournamentId}...`);
    console.log(`[REWARD_CALC] Total reward amount: ${totalRewardAmount} BOSON`);

    // Step 1: Get player scores
    console.log('[REWARD_CALC] Getting player scores...');
    const playerScores = await getPlayerScores(tournamentId);
    
    if (playerScores.length === 0) {
      throw new Error('No player scores found for tournament');
    }

    console.log(`[REWARD_CALC] Found ${playerScores.length} player scores`);

    // Step 2: Get pre-match snapshot
    console.log('[REWARD_CALC] Getting pre-match snapshot...');
    const preMatchSnapshot = await getContractSnapshot(tournamentId, 'PRE_MATCH');
    
    if (!preMatchSnapshot) {
      throw new Error('Pre-match snapshot not found');
    }

    const ignored = parseIgnoredAddresses();
    const displayUnique = preMatchSnapshot.uniqueAddresses;
    console.log(`[REWARD_CALC] Pre-match snapshot: ${displayUnique} addresses, ${preMatchSnapshot.totalHolders} holdings`);

    // Step 3: Calculate rewards for each holder
    console.log('[REWARD_CALC] Calculating rewards for each holder...');
    const rewardCalculations: RewardCalculation[] = [];
    let totalScore = 0;

    // Step 3: Get post-match snapshot for comparison
    console.log('[REWARD_CALC] Getting post-match snapshot...');
    const postMatchSnapshot = await getContractSnapshot(tournamentId, 'POST_MATCH');
    
    if (!postMatchSnapshot) {
      throw new Error('Post-match snapshot not found');
    }

    console.log(`[REWARD_CALC] Post-match snapshot: ${postMatchSnapshot.uniqueAddresses} addresses`);

    // Create a map of post-match holdings by address
    const postMatchHoldersMap = new Map(
      postMatchSnapshot.holders.map(h => [h.address, h])
    );

    // Get tournament eligible players to check VP requirements
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { eligiblePlayers: true }
    });

    const eligiblePlayerModules = tournament?.eligiblePlayers || [];

    // Batch fetch all user VP data to optimize performance
    const uniqueAddresses = Array.from(
      new Set(preMatchSnapshot.holders.map(h => h.address))
    ).filter(addr => !ignored.has(addr.toLowerCase()));

    console.log(`[REWARD_CALC] Fetching VP data for ${uniqueAddresses.length} users...`);
    const usersWithVP = await prisma.user.findMany({
      where: {
        address: { in: uniqueAddresses }
      },
      include: {
        points: {
          where: {
            type: 'VP',
            playerModuleName: { in: eligiblePlayerModules }
          }
        }
      }
    });

    // Create a map of address -> VP by player module name (sum all entries for transaction history)
    const userVPByAddressMap = new Map<string, Map<string, number>>();
    for (const user of usersWithVP) {
      const vpMap = new Map<string, number>();
      for (const point of user.points) {
        if (point.playerModuleName) {
          // Sum all VP entries for this player
          const currentVP = vpMap.get(point.playerModuleName) || 0;
          vpMap.set(point.playerModuleName, currentVP + point.amount);
        }
      }
      userVPByAddressMap.set(user.address, vpMap);
    }

    for (const preHolder of preMatchSnapshot.holders) {
      if (ignored.has(preHolder.address.toLowerCase())) {
        continue;
      }
      
      try {
        // Get post-match holdings for this address
        const postHolder = postMatchHoldersMap.get(preHolder.address);
        
        if (!postHolder) {
          // User had tokens pre-match but sold everything - not eligible
          console.log(`[REWARD_CALC] Address ${preHolder.address} not eligible: sold all tokens`);
          continue;
        }

        // Get user VP data from pre-fetched map
        const userVPByPlayer = userVPByAddressMap.get(preHolder.address) || new Map<string, number>();

        // Calculate user score based on MAINTAINED holdings (min of pre and post)
        // Only includes players where user has VP > 0
        const { totalScore: userScore, detailedScores } = calculateUserScore(
          preHolder.holdings,
          postHolder.holdings,
          playerScores,
          userVPByPlayer
        );

        // Calculate total MAINTAINED tokens
        const totalTokens = detailedScores.reduce((sum, h) => {
          return sum + BigInt(h.maintainedBalance);
        }, BigInt(0)).toString();

        // Check reward eligibility
        const eligibility = await calculateRewardEligibility(tournamentId, preHolder.address);

        // Only include eligible holders with non-zero score in reward calculation
        if (eligibility.eligible && userScore > 0) {
          totalScore += userScore;
          
          rewardCalculations.push({
            address: preHolder.address,
            totalTokens,
            totalScore: userScore,
            rewardAmount: 0, // Will be calculated after we know total score
            eligibility,
            holdings: detailedScores
          });
        } else if (!eligibility.eligible) {
          console.log(`[REWARD_CALC] Address ${preHolder.address} not eligible: ${eligibility.eligibilityPercentage}% maintained`);
        } else if (userScore === 0) {
          console.log(`[REWARD_CALC] Address ${preHolder.address} skipped: no maintained holdings or zero score`);
        }
      } catch (error) {
        console.error(`[REWARD_CALC] Error calculating reward for ${preHolder.address}:`, error);
      }
    }

    if (totalScore === 0) {
      throw new Error('Total score is zero - no eligible holders found');
    }

    console.log(`[REWARD_CALC] Found ${rewardCalculations.length} eligible holders`);
    console.log(`[REWARD_CALC] Total score: ${totalScore}`);

    // Step 4: Calculate proportional rewards
    console.log('[REWARD_CALC] Calculating proportional rewards...');
    const finalRewardCalculations = rewardCalculations.map(calculation => {
      const scorePercentage = calculation.totalScore / totalScore;
      const rewardAmount = totalRewardAmount * scorePercentage;
      
      return {
        ...calculation,
        rewardAmount
      };
    });

    // Step 5: Calculate summary statistics
    const totalTokens = finalRewardCalculations.reduce((sum, calc) => {
      return sum + BigInt(calc.totalTokens);
    }, BigInt(0)).toString();

    const totalRewardsDistributed = finalRewardCalculations.reduce((sum, calc) => {
      return sum + calc.rewardAmount;
    }, 0);

    const summary = {
      successfulCalculations: finalRewardCalculations.length,
      failedCalculations: 0, // Could track failed calculations if needed
      totalRewardsDistributed
    };

    console.log(`[REWARD_CALC] Reward calculation completed:`, summary);

    return {
      totalRewardAmount,
      totalEligibleHolders: finalRewardCalculations.length,
      totalTokens,
      rewardCalculations: finalRewardCalculations,
      summary
    };

  } catch (error) {
    console.error('[REWARD_CALC] Error calculating rewards from snapshots:', error);
    throw new Error(`Failed to calculate rewards from snapshots: ${error}`);
  }
}

/**
 * Get reward eligibility for a specific address
 */
export async function getRewardEligibility(
  tournamentId: string,
  address: string
): Promise<{
  eligible: boolean;
  preMatchHoldings: ContractHolder | null;
  postMatchHoldings: ContractHolder | null;
  maintainedHoldings: number;
  totalHoldings: number;
  eligibilityPercentage: number;
}> {
  try {
    return await calculateRewardEligibility(tournamentId, address);
  } catch (error) {
    console.error('[REWARD_CALC] Error getting reward eligibility:', error);
    throw new Error(`Failed to get reward eligibility: ${error}`);
  }
}

/**
 * Get reward summary for a tournament
 */
export async function getRewardSummary(tournamentId: string): Promise<{
  tournamentId: string;
  preMatchSnapshot: ContractSnapshotData | null;
  postMatchSnapshot: ContractSnapshotData | null;
  playerScores: PlayerScoreData[];
  comparison: any;
  totalEligibleHolders: number;
  totalTokens: string;
}> {
  try {
    console.log(`[REWARD_CALC] Getting reward summary for tournament ${tournamentId}...`);

    const [preMatchSnapshot, postMatchSnapshot, playerScores, comparison] = await Promise.all([
      getContractSnapshot(tournamentId, 'PRE_MATCH'),
      getContractSnapshot(tournamentId, 'POST_MATCH'),
      getPlayerScores(tournamentId),
      comparePrePostMatchSnapshots(tournamentId)
    ]);

    const totalEligibleHolders = preMatchSnapshot?.uniqueAddresses || 0;
    const totalTokens = preMatchSnapshot?.totalTokens || '0';

    return {
      tournamentId,
      preMatchSnapshot,
      postMatchSnapshot,
      playerScores,
      comparison,
      totalEligibleHolders,
      totalTokens
    };
  } catch (error) {
    console.error('[REWARD_CALC] Error getting reward summary:', error);
    throw new Error(`Failed to get reward summary: ${error}`);
  }
}

/**
 * Reduce VP (Validity Points) for users after tournament ends
 * Reduces VP by 1 for each player that played in the match
 * Only reduces VP for users who participated in the tournament (had tokens in pre-match snapshot)
 */
export async function reduceVPAfterTournament(tournamentId: string): Promise<{
  totalUsersAffected: number;
  totalVPReduced: number;
  details: Array<{ address: string; playersAffected: number; vpReduced: number }>;
}> {
  try {
    console.log(`[VP_REDUCTION] Reducing VP after tournament ${tournamentId}...`);

    // Get tournament details and player scores
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { eligiblePlayers: true }
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    // Get all players that played in the match (have scores)
    const playerScores = await getPlayerScores(tournamentId);
    const playersThatPlayed = playerScores.map(ps => ps.moduleName);
    
    if (playersThatPlayed.length === 0) {
      console.log('[VP_REDUCTION] No players found in tournament - skipping VP reduction');
      return {
        totalUsersAffected: 0,
        totalVPReduced: 0,
        details: []
      };
    }

    console.log(`[VP_REDUCTION] Players that played: ${playersThatPlayed.join(', ')}`);

    // Get pre-match snapshot to find all users who participated
    const preMatchSnapshot = await getContractSnapshot(tournamentId, 'PRE_MATCH');
    
    if (!preMatchSnapshot) {
      console.log('[VP_REDUCTION] No pre-match snapshot found - skipping VP reduction');
      return {
        totalUsersAffected: 0,
        totalVPReduced: 0,
        details: []
      };
    }

    // Get all unique addresses from pre-match snapshot
    const participantAddresses = Array.from(
      new Set(preMatchSnapshot.holders.map(h => h.address))
    );

    console.log(`[VP_REDUCTION] Found ${participantAddresses.length} participants`);

    let totalUsersAffected = 0;
    let totalVPReduced = 0;
    const details: Array<{ address: string; playersAffected: number; vpReduced: number }> = [];

    // Process each participant
    for (const address of participantAddresses) {
      try {
        // Find user by address
        const user = await prisma.user.findUnique({
          where: { address }
        });

        if (!user) {
          // User doesn't exist in database - skip
          continue;
        }

        let userVPReduced = 0;
        let playersAffected = 0;

        // Get all VP entries for this user to calculate current VP totals
        const allVPPoints = await prisma.point.findMany({
          where: {
            userId: user.id,
            type: 'VP',
            playerModuleName: { in: playersThatPlayed }
          }
        });

        // Calculate current VP for each player (sum of all entries)
        const vpByPlayer = new Map<string, number>();
        for (const point of allVPPoints) {
          if (point.playerModuleName) {
            const current = vpByPlayer.get(point.playerModuleName) || 0;
            vpByPlayer.set(point.playerModuleName, current + point.amount);
          }
        }

        // Reduce VP by 1 for each player that played (create new entry with -1)
        for (const playerModuleName of playersThatPlayed) {
          const currentVP = vpByPlayer.get(playerModuleName) || 0;
          
          if (currentVP > 0) {
            // Create new VP entry with -1 to represent the reduction (transaction history)
            await prisma.point.create({
              data: {
                userId: user.id,
                type: 'VP',
                amount: -1,
                playerModuleName: playerModuleName
              }
            });

            userVPReduced += 1;
            playersAffected++;
          }
        }

        if (playersAffected > 0) {
          totalUsersAffected++;
          totalVPReduced += userVPReduced;
          details.push({
            address,
            playersAffected,
            vpReduced: userVPReduced
          });
        }
      } catch (error) {
        console.error(`[VP_REDUCTION] Error processing user ${address}:`, error);
        // Continue with other users
      }
    }

    console.log(`[VP_REDUCTION] ✅ VP reduction completed:`);
    console.log(`   Users affected: ${totalUsersAffected}`);
    console.log(`   Total VP reduced: ${totalVPReduced}`);

    return {
      totalUsersAffected,
      totalVPReduced,
      details
    };
  } catch (error) {
    console.error('[VP_REDUCTION] Error reducing VP after tournament:', error);
    throw new Error(`Failed to reduce VP after tournament: ${error}`);
  }
}
