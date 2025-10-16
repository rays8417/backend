import { 
  getContractSnapshot, 
  comparePrePostMatchSnapshots,
  calculateRewardEligibility,
  ContractSnapshotData,
  ContractHolder
} from './contractSnapshotService';
import { prisma } from '../prisma';
import { parseIgnoredAddresses } from '../config/reward.config';
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
        playerId: true
      }
    });

    return playerScores.map(score => ({
      moduleName: score.moduleName || 'Unknown',
      fantasyPoints: Number(score.fantasyPoints),
      playerId: score.playerId || undefined
    }));
  } catch (error) {
    console.error('[REWARD_CALC] Error getting player scores:', error);
    throw new Error(`Failed to get player scores: ${error}`);
  }
}

/**
 * Calculate user score based on MAINTAINED token holdings and player performance
 * Only counts tokens that were held BOTH pre-match AND post-match
 */
function calculateUserScore(
  preMatchHoldings: ContractHolder['holdings'],
  postMatchHoldings: ContractHolder['holdings'],
  playerScores: PlayerScoreData[]
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
      const preBalance = BigInt(preHolding.balance);
      const postBalance = postHoldingsMap.get(preHolding.moduleName) || BigInt(0);
      
      // Use MINIMUM of pre and post - only count maintained tokens
      const maintainedBalance = preBalance < postBalance ? preBalance : postBalance;
      
      // Calculate points based on MAINTAINED tokens only
      const tokenRatio = Number(maintainedBalance) / 100000000;
      const weightedPoints = playerScore.fantasyPoints * tokenRatio;
      
      totalScore += weightedPoints;
      
      detailedScores.push({
        moduleName: preHolding.moduleName,
        preBalance: preHolding.balance,
        postBalance: postBalance.toString(),
        maintainedBalance: maintainedBalance.toString(),
        playerScore: playerScore.fantasyPoints,
        points: weightedPoints
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

        // Calculate user score based on MAINTAINED holdings (min of pre and post)
        const { totalScore: userScore, detailedScores } = calculateUserScore(
          preHolder.holdings,
          postHolder.holdings,
          playerScores
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
