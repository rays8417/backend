import { Request, Response } from "express";
import { prisma } from "../prisma";
import { SnapshotType } from "@prisma/client";
import { blockchain } from "../blockchain";
import { 
  calculateRewardsFromSnapshots, 
  getRewardEligibility, 
  getRewardSummary,
} from "../services/rewardCalculationService";
import { REWARD_CONFIG } from "../config/reward.config";
import { validateTournament } from "../utils/controllerHelpers";

/**
 * Rewards Controller
 * Handles reward calculation, distribution, and management
 */

// Helper Functions

/**
 * Transfer BOSON tokens to user accounts using blockchain abstraction
 */
const transferRewardsToUsers = async (rewardCalculations: any[]) => {
  console.log(`Starting real token transfers for ${rewardCalculations.length} users...`);
  
  if (!REWARD_CONFIG.ADMIN_PRIVATE_KEY || !REWARD_CONFIG.ADMIN_ACCOUNT_ADDRESS) {
    throw new Error('Admin private key and account address must be configured');
  }

  console.log(`Admin account address: ${REWARD_CONFIG.ADMIN_ACCOUNT_ADDRESS}`);

  const transferResults = [];
  
  for (const reward of rewardCalculations) {
    try {
      // Skip if reward amount is too small
      if (reward.rewardAmount < REWARD_CONFIG.MIN_REWARD_AMOUNT) {
        console.log(`Skipping ${reward.address} - reward too small: ${reward.rewardAmount}`);
        transferResults.push({
          ...reward,
          status: 'skipped',
          reason: 'Amount too small',
          transactionId: null
        });
        continue;
      }

      // Convert BOSON to base units (blockchain adapter handles decimals)
      const multiplier = Math.pow(10, REWARD_CONFIG.BOSON_DECIMALS);
      const amountInBaseUnits = Math.floor(reward.rewardAmount * multiplier);
      
      console.log(`Transferring ${reward.rewardAmount} BOSON (${amountInBaseUnits} base units) to ${reward.address}...`);
      
      // Use blockchain abstraction for transfer
      const result = await blockchain.transferTokens(
        REWARD_CONFIG.ADMIN_PRIVATE_KEY,
        reward.address,
        amountInBaseUnits,
        'Boson' // Use module name, adapter handles mint address
      );

      if (result.success) {
        console.log(`✅ Successfully transferred ${reward.rewardAmount} BOSON to ${reward.address}`);
        console.log(`   Transaction: ${result.transactionHash}`);
        
        transferResults.push({
          ...reward,
          status: 'success',
          transactionId: result.transactionHash,
          transactionUrl: result.explorerUrl,
          gasUsed: result.gasUsed,
          timestamp: new Date().toISOString()
        });
      } else {
        throw new Error(result.error || 'Transaction failed');
      }
      
    } catch (transferError) {
      console.error(`❌ Failed to transfer to ${reward.address}:`, transferError);
      
      transferResults.push({
        ...reward,
        status: 'failed',
        error: transferError instanceof Error ? transferError.message : 'Unknown error',
        transactionId: null,
        timestamp: new Date().toISOString()
      });
    }
  }

  return transferResults;
};

/**
 * Calculate transfer summary statistics - eliminates redundancy
 */
const calculateTransferSummary = (transferResults: any[], totalRewardAmount: number) => {
  const successfulTransfers = transferResults.filter(r => r.status === 'success');
  const failedTransfers = transferResults.filter(r => r.status === 'failed');
  const skippedTransfers = transferResults.filter(r => r.status === 'skipped');
  const totalDistributed = successfulTransfers.reduce((sum, r) => sum + r.rewardAmount, 0);

  return {
    totalUsers: transferResults.length,
    successful: successfulTransfers.length,
    failed: failedTransfers.length,
    skipped: skippedTransfers.length,
    totalDistributed,
    totalRewardPool: totalRewardAmount,
    successfulTransfers,
    failedTransfers,
    skippedTransfers
  };
};

// Controller Functions

/**
 * POST /api/rewards/distribute-contract-based
 * Distribute rewards using snapshot data 
 */
export const distributeSnapshotBasedRewards = async (req: Request, res: Response) => {
  try {
    const { tournamentId, totalRewardAmount } = req.body;

    if (!tournamentId || !totalRewardAmount) {
      return res.status(400).json({ 
        error: "Tournament ID and total reward amount are required" 
      });
    }

    // Validate tournament
    const validation = await validateTournament(tournamentId);
    if (validation.error) {
      return res.status(validation.error.status).json({ error: validation.error.message });
    }

    console.log(`Starting contract-based reward distribution for tournament ${tournamentId}...`);
    console.log(`Total reward amount: ${totalRewardAmount} BOSON`);

    // Step 1: Calculate rewards based on snapshot data
    const rewardDistribution = await calculateRewardsFromSnapshots(tournamentId, totalRewardAmount);

    // Step 2: Transfer rewards to users via Aptos
    const transferResults = await transferRewardsToUsers(rewardDistribution.rewardCalculations);

    // Step 3: Calculate summary
    const summary = calculateTransferSummary(transferResults, totalRewardAmount);

    // Step 4: Create reward pool and store records
    const rewardPool = await prisma.rewardPool.create({
      data: {
        tournamentId,
        name: `Tournament ${tournamentId} Rewards`,
        totalAmount: totalRewardAmount,
        distributedAmount: summary.totalDistributed,
        distributionType: 'PERCENTAGE',
        distributionRules: {
          type: 'snapshot_based',
          totalUsers: summary.totalUsers,
          successfulTransfers: summary.successful
        }
      }
    });

    // Store individual reward records
    const rewardRecords = [];
    for (const result of summary.successfulTransfers) {
      const userReward = await prisma.userReward.create({
        data: {
          address: result.address,
          rewardPoolId: rewardPool.id,
          rank: result.rank,
          amount: result.rewardAmount,
          status: 'COMPLETED',
          aptosTransactionId: result.transactionId
        } as any
      });
      rewardRecords.push(userReward);
    }

    console.log(`Reward distribution completed:`);
    console.log(`- Successful: ${summary.successful}`);
    console.log(`- Failed: ${summary.failed}`);
    console.log(`- Skipped: ${summary.skipped}`);
    console.log(`- Total distributed: ${summary.totalDistributed} BOSON`);

    res.json({
      success: true,
      message: "Contract-based rewards distributed successfully",
      summary: {
        totalUsers: summary.totalUsers,
        successful: summary.successful,
        failed: summary.failed,
        skipped: summary.skipped,
        totalDistributed: summary.totalDistributed,
        totalRewardPool: summary.totalRewardPool
      },
      transfers: transferResults,
      rewardRecords
    });
  } catch (error) {
    console.error("Contract-based reward distribution error:", error);
    res.status(500).json({ 
      error: "Failed to distribute rewards", 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * GET /api/rewards/admin-info
 * Get admin account information (blockchain-agnostic)
 */
export const getAdminInfo = async (req: Request, res: Response) => {
  try {
    if (!REWARD_CONFIG.ADMIN_ACCOUNT_ADDRESS) {
      throw new Error('Admin account address must be configured');
    }

    // Get account info using blockchain abstraction
    const accountInfo = await blockchain.getAccountInfo(REWARD_CONFIG.ADMIN_ACCOUNT_ADDRESS);
    const network = blockchain.getNetwork();

    res.json({
      success: true,
      adminInfo: {
        configuredAddress: REWARD_CONFIG.ADMIN_ACCOUNT_ADDRESS,
        address: accountInfo.address,
        publicKey: accountInfo.publicKey,
        balance: accountInfo.balanceFormatted,
        balanceRaw: accountInfo.balance,
        sequenceNumber: accountInfo.sequenceNumber,
        network: network
      },
      message: `Admin account has ${accountInfo.balanceFormatted} ${network.includes('Solana') ? 'SOL' : 'APT'}`
    });
  } catch (error) {
    console.error("Error getting admin info:", error);
    res.status(500).json({ 
      error: "Failed to get admin info", 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};


/**
 * POST /api/rewards/create-pool
 * Create reward pool (Admin only)
 */
export const createRewardPool = async (req: Request, res: Response) => {
  try {
    const {
      tournamentId,
      name,
      totalAmount,
      distributionType,
      distributionRules,
    } = req.body;

    if (!tournamentId || !name || !totalAmount || !distributionType || !distributionRules) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Validate tournament
    const validation = await validateTournament(tournamentId);
    if (validation.error) {
      return res.status(validation.error.status).json({ error: validation.error.message });
    }

    const rewardPool = await prisma.rewardPool.create({
      data: {
        tournamentId,
        name,
        totalAmount,
        distributionType,
        distributionRules: JSON.parse(distributionRules),
      },
    });

    res.json({
      success: true,
      rewardPool: {
        id: rewardPool.id,
        name: rewardPool.name,
        totalAmount: rewardPool.totalAmount,
        distributionType: rewardPool.distributionType,
        distributionRules: rewardPool.distributionRules,
        createdAt: rewardPool.createdAt,
      },
    });
  } catch (error) {
    console.error("Reward pool creation error:", error);
    res.status(500).json({ error: "Failed to create reward pool" });
  }
};


/**
 * POST /api/rewards/process/:rewardId
 * Process individual reward (Admin only)
 */
export const processReward = async (req: Request, res: Response) => {
  try {
    const { rewardId } = req.params;
    const { aptosTransactionId } = req.body;

    const reward = await prisma.userReward.findUnique({
      where: { id: rewardId },
      include: {
        rewardPool: true,
      },
    });

    if (!reward) {
      return res.status(404).json({ error: "Reward not found" });
    }

    if (reward.status !== "PENDING") {
      return res.status(400).json({ error: "Reward is not pending" });
    }

    const updatedReward = await prisma.userReward.update({
      where: { id: rewardId },
      data: {
        status: "PROCESSING",
        transactionId: aptosTransactionId || null,
      },
    });

    res.json({
      success: true,
      message: "Reward processing initiated",
      reward: {
        id: updatedReward.id,
        amount: updatedReward.amount,
        status: updatedReward.status,
        transactionId: updatedReward.transactionId,
      },
    });
  } catch (error) {
    console.error("Reward processing error:", error);
    res.status(500).json({ error: "Failed to process reward" });
  }
};

/**
 * PUT /api/rewards/:rewardId/status
 * Update reward status
 */
export const updateRewardStatus = async (req: Request, res: Response) => {
  try {
    const { rewardId } = req.params;
    const { status, aptosTransactionId } = req.body;

    if (!status || !["PENDING", "PROCESSING", "COMPLETED", "FAILED"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const reward = await prisma.userReward.update({
      where: { id: rewardId },
      data: {
        status,
        ...(aptosTransactionId && { aptosTransactionId }),
      },
    });

    res.json({
      success: true,
      message: "Reward status updated",
      reward: {
        id: reward.id,
        status: reward.status,
        transactionId: reward.transactionId,
      },
    });
  } catch (error) {
    console.error("Reward status update error:", error);
    res.status(500).json({ error: "Failed to update reward status" });
  }
};

/**
 * GET /api/rewards/user/:walletAddress
 * Get user's rewards
 */
export const getUserRewards = async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;
    const { status } = req.query;

    const rewards = await prisma.userReward.findMany({
      where: {
        address: walletAddress,
        ...(status && { status: status as any }),
      },
      include: {
        rewardPool: {
          include: {
            tournament: {
              select: {
                id: true,
                name: true,
                matchDate: true,
                team1: true,
                team2: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      success: true,
      rewards: rewards.map((reward: any) => ({
        id: reward.id,
        rank: reward.rank,
        amount: reward.amount,
        percentage: reward.percentage,
        status: reward.status,
        aptosTransactionId: reward.aptosTransactionId,
        tournament: reward.rewardPool.tournament,
        rewardPool: reward.rewardPool,
        createdAt: reward.createdAt,
      })),
    });
  } catch (error) {
    console.error("User rewards fetch error:", error);
    res.status(500).json({ error: "Failed to fetch user rewards" });
  }
};

/**
 * POST /api/rewards/calculate-snapshot-based
 * Calculate rewards using snapshot data (no distribution)
 */
export const calculateSnapshotBasedRewards = async (req: Request, res: Response) => {
  try {
    const { tournamentId, totalRewardAmount } = req.body;

    if (!tournamentId || !totalRewardAmount) {
      return res.status(400).json({ 
        error: "Tournament ID and total reward amount are required" 
      });
    }

    // Validate tournament
    const validation = await validateTournament(tournamentId);
    if (validation.error) {
      return res.status(validation.error.status).json({ error: validation.error.message });
    }

    console.log(`Calculating snapshot-based rewards for tournament ${tournamentId}...`);

    const rewardDistribution = await calculateRewardsFromSnapshots(tournamentId, totalRewardAmount);

    res.json({
      success: true,
      message: "Reward calculation completed successfully",
      rewardDistribution
    });
  } catch (error) {
    console.error('Snapshot-based reward calculation error:', error);
    res.status(500).json({ 
      error: 'Failed to calculate snapshot-based rewards',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * GET /api/rewards/eligibility/:tournamentId/:address
 * Check reward eligibility for an address
 */
export const checkRewardEligibility = async (req: Request, res: Response) => {
  try {
    const { tournamentId, address } = req.params;

    if (!tournamentId || !address) {
      return res.status(400).json({ 
        error: "Tournament ID and address are required" 
      });
    }

    // Validate tournament
    const validation = await validateTournament(tournamentId);
    if (validation.error) {
      return res.status(validation.error.status).json({ error: validation.error.message });
    }

    console.log(`Checking reward eligibility for ${address} in tournament ${tournamentId}...`);

    const eligibility = await getRewardEligibility(tournamentId, address);

    res.json({
      success: true,
      eligibility
    });
  } catch (error) {
    console.error('Reward eligibility check error:', error);
    res.status(500).json({ 
      error: 'Failed to check reward eligibility',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * GET /api/rewards/summary/:tournamentId
 * Get reward summary for a tournament
 */
export const getRewardSummaryForTournament = async (req: Request, res: Response) => {
  try {
    const { tournamentId } = req.params;

    if (!tournamentId) {
      return res.status(400).json({ 
        error: "Tournament ID is required" 
      });
    }

    // Validate tournament
    const validation = await validateTournament(tournamentId);
    if (validation.error) {
      return res.status(validation.error.status).json({ error: validation.error.message });
    }

    console.log(`Getting reward summary for tournament ${tournamentId}...`);

    const summary = await getRewardSummary(tournamentId);

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error('Reward summary error:', error);
    res.status(500).json({ 
      error: 'Failed to get reward summary',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};



