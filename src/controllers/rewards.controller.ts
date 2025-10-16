import { Request, Response } from "express";
import { prisma } from "../prisma";
import { ContractType } from "@prisma/client";
import { aptos } from "../services/aptosService";
import { Ed25519PrivateKey, Ed25519Account } from "@aptos-labs/ts-sdk";
import { 
  calculateRewardsFromSnapshots, 
  getRewardEligibility, 
  getRewardSummary,
} from "../services/rewardCalculationService";
import { REWARD_CONFIG, parseIgnoredAddresses } from "../config/reward.config";
import { validateTournament } from "../utils/controllerHelpers";

/**
 * Rewards Controller
 * Handles reward calculation, distribution, and management
 */

// Helper Functions

/**
 * Create admin account from private key - eliminates duplication
 */
const createAdminAccount = () => {
  if (!REWARD_CONFIG.ADMIN_PRIVATE_KEY || !REWARD_CONFIG.ADMIN_ACCOUNT_ADDRESS) {
    throw new Error('Admin private key and account address must be configured');
  }

  const privateKeyBytes = REWARD_CONFIG.ADMIN_PRIVATE_KEY.split(',').map(Number);
  const privateKey = new Ed25519PrivateKey(new Uint8Array(privateKeyBytes));
  const publicKey = privateKey.publicKey();
  const authKey = publicKey.authKey();
  const adminAccountAddress = authKey.derivedAddress();

  // Verify account address matches configuration
  if (adminAccountAddress.toString() !== REWARD_CONFIG.ADMIN_ACCOUNT_ADDRESS) {
    throw new Error(`Account address mismatch. Expected: ${REWARD_CONFIG.ADMIN_ACCOUNT_ADDRESS}, Got: ${adminAccountAddress}`);
  }

  return {
    account: new Ed25519Account({ privateKey }),
    address: adminAccountAddress,
    publicKey
  };
};

/**
 * Transfer BOSON tokens to user accounts using Aptos SDK
 */
const transferRewardsToUsers = async (rewardCalculations: any[]) => {
  console.log(`Starting real token transfers for ${rewardCalculations.length} users...`);
  
  const { account: adminAccount, address: adminAccountAddress } = createAdminAccount();
  console.log(`Admin account address: ${adminAccountAddress}`);

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

      // Convert BOSON to base units
      const multiplier = Math.pow(10, REWARD_CONFIG.BOSON_DECIMALS);
      const amountInBaseUnits = Math.floor(reward.rewardAmount * multiplier);
      
      console.log(`Transferring ${reward.rewardAmount} BOSON (${amountInBaseUnits} base units) to ${reward.address}...`);
      
      // Create and submit transfer transaction
      const transferTransaction = await aptos.transferCoinTransaction({
        sender: adminAccountAddress.toString(),
        recipient: reward.address,
        amount: amountInBaseUnits,
        coinType: REWARD_CONFIG.BOSON_COIN_TYPE as `${string}::${string}::${string}`,
      });

      const committedTransaction = await aptos.signAndSubmitTransaction({
        signer: adminAccount,
        transaction: transferTransaction,
      });

      console.log(`Transaction submitted: ${committedTransaction.hash}`);

      // Wait for transaction
      const transactionResult = await aptos.waitForTransaction({ 
        transactionHash: committedTransaction.hash 
      });

      if (transactionResult.success) {
        console.log(`✅ Successfully transferred ${reward.rewardAmount} BOSON to ${reward.address}`);
        console.log(`   Transaction: ${committedTransaction.hash}`);
        
        transferResults.push({
          ...reward,
          status: 'success',
          transactionId: committedTransaction.hash,
          transactionUrl: `https://explorer.aptoslabs.com/txn/${committedTransaction.hash}?network=testnet`,
          gasUsed: transactionResult.gas_used,
          timestamp: new Date().toISOString()
        });
      } else {
        throw new Error(`Transaction failed: ${transactionResult.vm_status}`);
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
 * Distribute rewards using contract data and Aptos transfers
 */
export const distributeContractBasedRewards = async (req: Request, res: Response) => {
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
 * Get admin account information
 */
export const getAdminInfo = async (req: Request, res: Response) => {
  try {
    const { address: derivedAddress, publicKey } = createAdminAccount();

    // Get account balance
    const balance = await aptos.getAccountAPTAmount({
      accountAddress: derivedAddress.toString()
    });

    const balanceInAPT = Number(balance) / 100000000;

    // Get account info
    const accountInfo = await aptos.getAccountInfo({
      accountAddress: derivedAddress.toString()
    });

    res.json({
      success: true,
      adminInfo: {
        configuredAddress: REWARD_CONFIG.ADMIN_ACCOUNT_ADDRESS,
        derivedAddress: derivedAddress.toString(),
        publicKey: publicKey.toString(),
        balance: balanceInAPT,
        balanceOctas: balance.toString(),
        sequenceNumber: accountInfo.sequence_number,
        isConfiguredCorrectly: derivedAddress.toString() === REWARD_CONFIG.ADMIN_ACCOUNT_ADDRESS
      },
      message: `Admin account has ${balanceInAPT} APT`
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
 * GET /api/rewards/admin-balance
 * Check admin account balance (legacy endpoint)
 */
export const getAdminBalance = async (req: Request, res: Response) => {
  try {
    if (!REWARD_CONFIG.ADMIN_ACCOUNT_ADDRESS) {
      return res.status(400).json({ 
        error: "Admin account address not configured" 
      });
    }

    const balance = await aptos.getAccountAPTAmount({
      accountAddress: REWARD_CONFIG.ADMIN_ACCOUNT_ADDRESS
    });

    const balanceInAPT = Number(balance) / 100000000;

    res.json({
      success: true,
      adminAddress: REWARD_CONFIG.ADMIN_ACCOUNT_ADDRESS,
      balance: balanceInAPT,
      balanceOctas: balance.toString(),
      message: `Admin account has ${balanceInAPT} APT`
    });
  } catch (error) {
    console.error("Error checking admin balance:", error);
    res.status(500).json({ 
      error: "Failed to check admin balance", 
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
 * GET /api/rewards/tournament/:tournamentId
 * Get reward pools for tournament
 */
export const getTournamentRewardPools = async (req: Request, res: Response) => {
  try {
    const { tournamentId } = req.params;

    const rewardPools = await prisma.rewardPool.findMany({
      where: { tournamentId },
      include: {
        rewards: {
          orderBy: { rank: "asc" },
        },
      },
    });

    res.json({
      success: true,
      rewardPools: rewardPools.map((pool: any) => ({
        id: pool.id,
        name: pool.name,
        totalAmount: pool.totalAmount,
        distributedAmount: pool.distributedAmount,
        distributionType: pool.distributionType,
        distributionRules: pool.distributionRules,
        rewards: pool.rewards.map((reward: any) => ({
          id: reward.id,
          address: reward.address,
          rank: reward.rank,
          amount: reward.amount,
          percentage: reward.percentage,
          status: reward.status,
          aptosTransactionId: reward.aptosTransactionId,
          createdAt: reward.createdAt,
          updatedAt: reward.updatedAt,
        })),
      })),
    });
  } catch (error) {
    console.error("Reward pools fetch error:", error);
    res.status(500).json({ error: "Failed to fetch reward pools" });
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
        aptosTransactionId: aptosTransactionId || null,
      },
    });

    res.json({
      success: true,
      message: "Reward processing initiated",
      reward: {
        id: updatedReward.id,
        amount: updatedReward.amount,
        status: updatedReward.status,
        aptosTransactionId: updatedReward.aptosTransactionId,
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
        aptosTransactionId: reward.aptosTransactionId,
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

/**
 * POST /api/rewards/calculate-simple
 * Simplified reward calculation based on post-match snapshot
 */
export const calculateSimpleRewards = async (req: Request, res: Response) => {
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

    const tournament = validation.tournament!;

    console.log(`[SIMPLE_REWARDS] Calculating simplified rewards for tournament ${tournamentId}...`);
    console.log(`[SIMPLE_REWARDS] Total reward amount: ${totalRewardAmount} BOSON`);

    // Step 1: Get post-match snapshot
    console.log('[SIMPLE_REWARDS] Getting post-match snapshot...');
    const postMatchSnapshot = await prisma.contractSnapshot.findFirst({
      where: {
        data: {
          path: ['tournamentId'],
          equals: tournamentId
        },
        contractType: 'POST_MATCH' as ContractType
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!postMatchSnapshot) {
      return res.status(404).json({ error: "Post-match snapshot not found" });
    }

    const snapshotData = postMatchSnapshot.data as any;
    const ignored = parseIgnoredAddresses();
    if (ignored.size > 0) {
      snapshotData.holders = snapshotData.holders.filter((h: any) => !ignored.has(String(h.address).toLowerCase()));
    }
    console.log(`[SIMPLE_REWARDS] Found ${snapshotData.holders.length} holders in post-match snapshot`);

    // Step 2: Get player scores
    console.log('[SIMPLE_REWARDS] Getting player performance scores...');
    const playerScores = await prisma.playerScore.findMany({
      where: { tournamentId },
      select: {
        moduleName: true,
        fantasyPoints: true,
        playerId: true
      }
    });

    if (playerScores.length === 0) {
      return res.status(404).json({ error: "No player scores found for tournament" });
    }

    console.log(`[SIMPLE_REWARDS] Found ${playerScores.length} player scores`);

    // Step 3: Calculate user scores
    console.log('[SIMPLE_REWARDS] Calculating user scores...');
    const userRewards = [];
    let totalScore = 0;

    for (const holder of snapshotData.holders) {
      let userScore = 0;
      const holdings = [];

      for (const holding of holder.holdings) {
        const playerScore = playerScores.find(ps => ps.moduleName === holding.moduleName);
        
        if (playerScore) {
          const tokenAmount = BigInt(holding.balance);
          const normalizedTokens = Number(tokenAmount) / 100000000;
          const points = normalizedTokens * Number(playerScore.fantasyPoints);
          
          userScore += points;
          
          holdings.push({
            moduleName: holding.moduleName,
            tokenAmount: holding.balance,
            playerScore: Number(playerScore.fantasyPoints),
            points
          });
        }
      }

      if (userScore > 0) {
        totalScore += userScore;
        userRewards.push({
          address: holder.address,
          totalScore: userScore,
          holdings,
          rewardAmount: 0
        });
      }
    }

    if (totalScore === 0) {
      return res.status(400).json({ error: "No eligible users found for rewards" });
    }

    console.log(`[SIMPLE_REWARDS] Found ${userRewards.length} eligible users with total score: ${totalScore}`);

    // Step 4: Distribute rewards proportionally
    console.log('[SIMPLE_REWARDS] Distributing rewards proportionally...');
    const finalRewards = userRewards.map(user => {
      const scorePercentage = user.totalScore / totalScore;
      const rewardAmount = totalRewardAmount * scorePercentage;
      
      return {
        address: user.address,
        totalScore: user.totalScore,
        scorePercentage: scorePercentage * 100,
        rewardAmount,
        holdings: user.holdings,
        rank: 0
      };
    });

    // Sort and rank
    finalRewards.sort((a, b) => b.rewardAmount - a.rewardAmount);
    finalRewards.forEach((reward, index) => {
      reward.rank = index + 1;
    });

    const totalDistributed = finalRewards.reduce((sum, reward) => sum + reward.rewardAmount, 0);

    console.log(`[SIMPLE_REWARDS] Reward calculation completed:`);
    console.log(`- Total users: ${finalRewards.length}`);
    console.log(`- Total distributed: ${totalDistributed} BOSON`);
    console.log(`- Highest reward: ${finalRewards[0]?.rewardAmount || 0} BOSON`);

    // Format rewards
    const formattedRewards = finalRewards.map(reward => ({
      address: reward.address,
      rank: reward.rank,
      rewardAmount: reward.rewardAmount,
      rewardAmountFormatted: `${reward.rewardAmount.toFixed(6)} BOSON`,
      scorePercentage: reward.scorePercentage,
      totalScore: reward.totalScore,
      playerHoldings: reward.holdings.map(holding => ({
        player: holding.moduleName,
        tokensHeld: (BigInt(holding.tokenAmount) / BigInt(100000000)).toString(),
        playerPerformance: holding.playerScore,
        contributionToScore: holding.points
      }))
    }));

    res.json({
      success: true,
      message: "Simplified reward calculation completed successfully",
      tournament: {
        id: tournamentId,
        name: tournament.name,
        matchDate: tournament.matchDate,
        teams: `${tournament.team1} vs ${tournament.team2}`
      },
      rewardPool: {
        totalAmount: totalRewardAmount,
        totalAmountFormatted: `${totalRewardAmount} BOSON`,
        totalDistributed,
        totalDistributedFormatted: `${totalDistributed.toFixed(6)} BOSON`
      },
      participants: {
        totalUsers: finalRewards.length,
        totalScore,
        averageReward: totalDistributed / finalRewards.length,
        highestReward: finalRewards[0]?.rewardAmount || 0
      },
      rewardDistribution: formattedRewards,
      rewards: finalRewards
    });
  } catch (error) {
    console.error('[SIMPLE_REWARDS] Error calculating simplified rewards:', error);
    res.status(500).json({ 
      error: 'Failed to calculate simplified rewards',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

