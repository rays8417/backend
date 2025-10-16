#!/usr/bin/env ts-node

import { TournamentStatus, ContractType } from '@prisma/client';
import { Command } from 'commander';
import { prisma } from '../prisma';
import { createContractSnapshot, createSnapshotSummary } from '../services/contractSnapshotService';
import { calculateRewardsFromSnapshots, RewardCalculation } from '../services/rewardCalculationService';
import { aptos } from '../services/aptosService';
import { Ed25519PrivateKey, Ed25519Account } from '@aptos-labs/ts-sdk';
import { REWARD_CONFIG } from '../config/reward.config';
import { parsePrivateKey } from '../utils/crypto';

/**
 * STEP 4: End Tournament
 * Takes post-match snapshot, calculates & distributes rewards, and completes tournament
 * 
 * Usage: npm run tournament:end -- <tournament-id> --amount 100
 */

/**
 * Take post-match snapshot
 */
async function takePostMatchSnapshot(tournamentId: string) {
  console.log(`\n📸 TAKING POST-MATCH SNAPSHOT`);
  console.log('=============================\n');

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId }
  });

  if (!tournament) {
    throw new Error('Tournament not found');
  }

  console.log(`Tournament: ${tournament.name}`);
  console.log(`Status: ${tournament.status}\n`);

  if (tournament.status === TournamentStatus.COMPLETED) {
    console.log('⚠️  Tournament already completed');
    return null;
  }

  // Check for existing snapshot
  const existing = await prisma.contractSnapshot.findFirst({
    where: {
      data: { path: ['tournamentId'], equals: tournamentId },
      contractType: 'POST_MATCH' as ContractType
    },
    orderBy: { createdAt: 'desc' }
  });

  if (existing) {
    console.log('⚠️  Post-match snapshot already exists');
    console.log(`   Using existing snapshot: ${existing.id}\n`);
    return existing;
  }

  console.log('📸 Creating post-match snapshot...');
  const snapshot = await createContractSnapshot(tournamentId, 'POST_MATCH');

  console.log(`✅ Snapshot created!`);
  console.log(`   ID: ${snapshot.snapshotId}`);
  console.log(`   Holders: ${snapshot.totalHolders}`);
  console.log(`   Addresses: ${snapshot.uniqueAddresses}\n`);

  const snapshotData = await prisma.contractSnapshot.findUnique({
    where: { id: snapshot.snapshotId }
  });
  if (snapshotData) {
    console.log(createSnapshotSummary(snapshotData.data as any));
  }

  return snapshot;
}

/**
 * Calculate rewards and create reward pool
 */
async function calculateRewards(tournamentId: string, totalRewardAmount?: number) {
  console.log(`\n💰 CALCULATING REWARDS`);
  console.log('=====================\n');

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { rewardPools: true }
  });

  if (!tournament) {
    throw new Error('Tournament not found');
  }

  // Use existing reward pool or provided amount
  let rewardPool;
  if (tournament.rewardPools.length > 0) {
    rewardPool = tournament.rewardPools[0];
    totalRewardAmount = totalRewardAmount || Number(rewardPool.totalAmount);
    console.log(`Using existing reward pool: ${rewardPool.id}`);
    console.log(`Total Pool: ${totalRewardAmount} BOSON\n`);
  } else {
    totalRewardAmount = totalRewardAmount || 100; // Default
    console.log(`Creating new reward pool: ${totalRewardAmount} BOSON\n`);
    
    // Create reward pool
    rewardPool = await prisma.rewardPool.create({
      data: {
        tournamentId,
        name: `${tournament.name} - Rewards`,
        totalAmount: totalRewardAmount,
        distributedAmount: 0,
        distributionType: 'PERCENTAGE',
        distributionRules: {
          type: 'performance_based',
          calculation: 'score_weighted'
        }
      }
    });
    
    console.log(`✅ Reward pool created: ${rewardPool.id}\n`);
  }

  const rewardDistribution = await calculateRewardsFromSnapshots(tournamentId, totalRewardAmount);

  console.log('📈 REWARD DISTRIBUTION:');
  console.log(`Eligible Holders: ${rewardDistribution.totalEligibleHolders}`);
  console.log(`Total Distributed: ${rewardDistribution.summary.totalRewardsDistributed.toFixed(6)} BOSON\n`);

  // Show top 10
  const top10 = rewardDistribution.rewardCalculations
    .sort((a, b) => b.rewardAmount - a.rewardAmount)
    .slice(0, 10);

  console.log('🏆 TOP 10 REWARDS:');
  top10.forEach((reward, i) => {
    console.log(`${i + 1}. ${reward.address.slice(0, 12)}...`);
    console.log(`   ${reward.rewardAmount.toFixed(6)} BOSON | Score: ${reward.totalScore.toFixed(2)}\n`);
  });

  return {
    rewardPool,
    rewardDistribution
  };
}

/**
 * Distribute rewards on-chain and save to database
 */
async function distributeRewards(
  tournamentId: string,
  rewardPoolId: string,
  rewardCalculations: RewardCalculation[]
) {
  console.log(`\n🚚 DISTRIBUTING REWARDS ON-CHAIN`);
  console.log('=================================\n');

  if (!REWARD_CONFIG.ADMIN_PRIVATE_KEY || !REWARD_CONFIG.ADMIN_ACCOUNT_ADDRESS) {
    throw new Error('Admin credentials not configured in .env');
  }

  // Create admin account - support both hex and comma-separated formats
  const privateKeyBytes = parsePrivateKey(REWARD_CONFIG.ADMIN_PRIVATE_KEY);
  const privateKey = new Ed25519PrivateKey(privateKeyBytes);
  const adminAccount = new Ed25519Account({ privateKey });
  const adminAddress = privateKey.publicKey().authKey().derivedAddress();

  console.log(`Admin: ${adminAddress}\n`);

  let success = 0, failed = 0, skipped = 0;
  let totalDistributed = 0;

  for (const reward of rewardCalculations) {
    try {
      if (reward.rewardAmount < REWARD_CONFIG.MIN_REWARD_AMOUNT) {
        console.log(`⏭️  Skip: ${reward.address.slice(0, 12)}... (too small)`);
        
        // Save skipped reward to database
        await prisma.userReward.create({
          data: {
            address: reward.address,
            rewardPoolId,
            amount: reward.rewardAmount,
            status: 'PENDING',
            metadata: {
              totalScore: reward.totalScore,
              totalTokens: reward.totalTokens,
              holdings: reward.holdings,
              reason: 'Amount below minimum threshold'
            }
          }
        });
        
        skipped++;
        continue;
      }

      const amountInBaseUnits = Math.floor(reward.rewardAmount * Math.pow(10, REWARD_CONFIG.BOSON_DECIMALS));

      console.log(`💸 ${reward.address.slice(0, 12)}... → ${reward.rewardAmount} BOSON`);

      // Send transaction
      const transferTx = await aptos.transferCoinTransaction({
        sender: adminAddress.toString(),
        recipient: reward.address,
        amount: amountInBaseUnits,
        coinType: REWARD_CONFIG.BOSON_COIN_TYPE as `${string}::${string}::${string}`,
      });

      const committed = await aptos.signAndSubmitTransaction({
        signer: adminAccount,
        transaction: transferTx,
      });

      await aptos.waitForTransaction({ transactionHash: committed.hash });

      console.log(`   ✅ TX: ${committed.hash}\n`);
      
      // Save successful reward to database
      await prisma.userReward.create({
        data: {
          address: reward.address,
          rewardPoolId,
          amount: reward.rewardAmount,
          status: 'COMPLETED',
          aptosTransactionId: committed.hash,
          metadata: {
            totalScore: reward.totalScore,
            totalTokens: reward.totalTokens,
            holdings: reward.holdings,
            eligibility: reward.eligibility
          }
        }
      });

      success++;
      totalDistributed += reward.rewardAmount;
    } catch (error) {
      console.log(`   ❌ Failed: ${error}\n`);
      
      // Save failed reward to database
      await prisma.userReward.create({
        data: {
          address: reward.address,
          rewardPoolId,
          amount: reward.rewardAmount,
          status: 'FAILED',
          metadata: {
            totalScore: reward.totalScore,
            totalTokens: reward.totalTokens,
            holdings: reward.holdings,
            error: error instanceof Error ? error.message : String(error)
          }
        }
      });
      
      failed++;
    }
  }

  // Update reward pool with distributed amount
  await prisma.rewardPool.update({
    where: { id: rewardPoolId },
    data: { 
      distributedAmount: totalDistributed,
      updatedAt: new Date()
    }
  });

  console.log('📊 DISTRIBUTION SUMMARY:');
  console.log(`✅ Successful: ${success}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`💰 Total Distributed: ${totalDistributed} BOSON\n`);
}

/**
 * Complete tournament
 */
async function completeTournament(tournamentId: string) {
  console.log(`\n🏁 COMPLETING TOURNAMENT`);
  console.log('========================\n');

  const tournament = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { 
      status: TournamentStatus.COMPLETED,
      updatedAt: new Date()
    }
  });

  console.log(`✅ Tournament completed!`);
  console.log(`   Name: ${tournament.name}`);
  console.log(`   Status: ${tournament.status}`);
  console.log(`   Ended: ${tournament.updatedAt.toISOString()}\n`);

  return tournament;
}

/**
 * End tournament with complete workflow
 */
async function endTournamentWithSnapshot(tournamentId: string, options: any = {}) {
  console.log(`\n🎬 STEP 4: END TOURNAMENT (COMPLETE WORKFLOW)`);
  console.log('=============================================\n');
  console.log(`Tournament ID: ${tournamentId}\n`);

  // Step 1: Post-match snapshot
  const snapshot = await takePostMatchSnapshot(tournamentId);

  // Step 2: Calculate rewards and create reward pool
  const rewardAmount = options.amount ? parseFloat(options.amount) : undefined;
  const { rewardPool, rewardDistribution } = await calculateRewards(tournamentId, rewardAmount);

  // Step 3: Distribute rewards and save to database
  await distributeRewards(tournamentId, rewardPool.id, rewardDistribution.rewardCalculations);

  // Step 4: Complete tournament
  const completedTournament = await completeTournament(tournamentId);

  // Final summary
  console.log('\n🎉 TOURNAMENT ENDED SUCCESSFULLY!');
  console.log('=================================');
  console.log(`Tournament: ${completedTournament.name}`);
  console.log(`Teams: ${completedTournament.team1} vs ${completedTournament.team2}`);
  console.log(`Status: ${completedTournament.status}`);
  console.log(`Distributed: ${rewardDistribution.summary.totalRewardsDistributed.toFixed(6)} BOSON\n`);

  console.log('✅ All steps completed:');
  console.log('   ✅ Post-match snapshot taken');
  console.log('   ✅ Rewards calculated');
  console.log('   ✅ Rewards distributed on-chain');
  console.log('   ✅ Tournament marked as COMPLETED\n');

  return { tournament: completedTournament, snapshot, rewardDistribution };
}

// Main CLI
async function main() {
  const program = new Command();

  program
    .name('end-tournament')
    .description('End tournament with rewards distribution')
    .version('1.0.0');

  program
    .command('end-with-snapshot')
    .description('Complete workflow: snapshot → rewards → distribute → complete')
    .argument('<tournament-id>', 'Tournament ID')
    .option('-a, --amount <amount>', 'Total reward amount in BOSON (optional)')
    .action(async (tournamentId: string, options) => {
      try {
        await endTournamentWithSnapshot(tournamentId, options);
      } catch (error) {
        console.error('Failed:', error);
        process.exit(1);
      } finally {
        await prisma.$disconnect();
      }
    });

  if (process.argv.length <= 2) {
    program.help();
  }

  await program.parseAsync(process.argv);
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});

