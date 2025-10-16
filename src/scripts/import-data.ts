#!/usr/bin/env ts-node

/**
 * Import data from backup and transform to new schema
 * Run this AFTER running migrations
 */

import { prisma } from '../prisma';
import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';

interface OldSnapshot {
  id: string;
  contractType: 'PRE_MATCH' | 'POST_MATCH';
  contractAddress: string;
  blockNumber: bigint | string;
  data: any;
  createdAt: string | Date;
}

async function importData(backupPath: string) {
  console.log('🔄 IMPORTING DATABASE DATA');
  console.log('===========================\n');
  console.log(`📁 Backup path: ${backupPath}\n`);

  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup directory not found: ${backupPath}`);
  }

  try {
    // Import in order (respecting foreign key constraints)
    
    // 1. Import Tournaments first
    console.log('📊 Importing tournaments...');
    const tournamentsFile = path.join(backupPath, 'tournaments.json');
    if (fs.existsSync(tournamentsFile)) {
      const tournaments = JSON.parse(fs.readFileSync(tournamentsFile, 'utf8'));
      for (const tournament of tournaments) {
        await prisma.tournament.create({
          data: {
            id: tournament.id,
            name: tournament.name,
            description: tournament.description,
            matchDate: new Date(tournament.matchDate),
            team1: tournament.team1,
            team2: tournament.team2,
            venue: tournament.venue,
            currentParticipants: tournament.currentParticipants || 0,
            status: tournament.status,
            matchId: tournament.matchId,
            createdAt: new Date(tournament.createdAt),
            updatedAt: new Date(tournament.updatedAt)
          }
        });
      }
      console.log(`   ✅ Imported ${tournaments.length} tournaments\n`);
    }

    // 2. Import PlayerScores
    console.log('🏏 Importing player scores...');
    const playerScoresFile = path.join(backupPath, 'player-scores.json');
    if (fs.existsSync(playerScoresFile)) {
      const playerScores = JSON.parse(fs.readFileSync(playerScoresFile, 'utf8'));
      for (const score of playerScores) {
        await prisma.playerScore.create({
          data: {
            id: score.id,
            tournamentId: score.tournamentId,
            moduleName: score.moduleName,
            runs: score.runs || 0,
            ballsFaced: score.ballsFaced || 0,
            wickets: score.wickets || 0,
            oversBowled: score.oversBowled || 0,
            runsConceded: score.runsConceded || 0,
            catches: score.catches || 0,
            stumpings: score.stumpings || 0,
            runOuts: score.runOuts || 0,
            fantasyPoints: score.fantasyPoints || 0,
            createdAt: new Date(score.createdAt),
            updatedAt: new Date(score.updatedAt)
          }
        });
      }
      console.log(`   ✅ Imported ${playerScores.length} player scores\n`);
    }

    // 3. Import RewardPools
    console.log('💰 Importing reward pools...');
    const rewardPoolsFile = path.join(backupPath, 'reward-pools.json');
    if (fs.existsSync(rewardPoolsFile)) {
      const rewardPools = JSON.parse(fs.readFileSync(rewardPoolsFile, 'utf8'));
      for (const pool of rewardPools) {
        await prisma.rewardPool.create({
          data: {
            id: pool.id,
            tournamentId: pool.tournamentId,
            name: pool.name,
            totalAmount: pool.totalAmount,
            distributedAmount: pool.distributedAmount || 0,
            distributionType: pool.distributionType,
            distributionRules: pool.distributionRules,
            createdAt: new Date(pool.createdAt),
            updatedAt: new Date(pool.updatedAt)
          }
        });
      }
      console.log(`   ✅ Imported ${rewardPools.length} reward pools\n`);
    }

    // 4. Import UserRewards
    console.log('🎁 Importing user rewards...');
    const userRewardsFile = path.join(backupPath, 'user-rewards.json');
    if (fs.existsSync(userRewardsFile)) {
      const userRewards = JSON.parse(fs.readFileSync(userRewardsFile, 'utf8'));
      for (const reward of userRewards) {
        await prisma.userReward.create({
          data: {
            id: reward.id,
            address: reward.address,
            rewardPoolId: reward.rewardPoolId,
            amount: reward.amount || 0,
            percentage: reward.percentage,
            status: reward.status,
            transactionId: reward.transactionId,
            metadata: reward.metadata,
            createdAt: new Date(reward.createdAt),
            updatedAt: new Date(reward.updatedAt)
          }
        });
      }
      console.log(`   ✅ Imported ${userRewards.length} user rewards\n`);
    }

    // 5. Import Snapshots (with transformation)
    console.log('📸 Importing snapshots (transforming schema)...');
    const snapshotsFile = path.join(backupPath, 'snapshots.json');
    if (fs.existsSync(snapshotsFile)) {
      const oldSnapshots: OldSnapshot[] = JSON.parse(fs.readFileSync(snapshotsFile, 'utf8'));
      
      for (const oldSnapshot of oldSnapshots) {
        // Extract tournamentId from JSON data
        const tournamentId = oldSnapshot.data?.tournamentId;
        
        if (!tournamentId) {
          console.warn(`   ⚠️  Skipping snapshot ${oldSnapshot.id} - no tournamentId in data`);
          continue;
        }

        // Transform contractType to snapshotType
        const snapshotType = oldSnapshot.contractType; // Already 'PRE_MATCH' or 'POST_MATCH'

        await prisma.snapshot.create({
          data: {
            id: oldSnapshot.id,
            tournamentId: tournamentId,
            snapshotType: snapshotType,
            contractAddress: oldSnapshot.contractAddress,
            blockNumber: BigInt(oldSnapshot.blockNumber),
            data: oldSnapshot.data, // Keep full JSON data
            createdAt: new Date(oldSnapshot.createdAt)
          }
        });
      }
      console.log(`   ✅ Imported ${oldSnapshots.length} snapshots\n`);
    }

    // 6. Import Users
    console.log('👤 Importing users...');
    const usersFile = path.join(backupPath, 'users.json');
    if (fs.existsSync(usersFile)) {
      const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
      for (const user of users) {
        await prisma.user.create({
          data: {
            id: user.id,
            address: user.address,
            createdAt: new Date(user.createdAt),
            updatedAt: new Date(user.updatedAt)
          }
        });
      }
      console.log(`   ✅ Imported ${users.length} users\n`);
    }

    console.log('✅ IMPORT COMPLETED SUCCESSFULLY!');
    console.log('==================================\n');

  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// CLI
async function main() {
  const program = new Command();

  program
    .name('import-data')
    .description('Import data from backup after schema migration')
    .version('1.0.0');

  program
    .argument('[backup-path]', 'Path to backup directory')
    .action(async (backupPath?: string) => {
      try {
        // If no path provided, find the latest backup
        if (!backupPath) {
          const backupsDir = path.join(__dirname, '../../backups');
          if (!fs.existsSync(backupsDir)) {
            throw new Error('No backups directory found. Please run export-data first.');
          }

          const backups = fs.readdirSync(backupsDir)
            .filter(f => f.startsWith('backup-'))
            .sort()
            .reverse();

          if (backups.length === 0) {
            throw new Error('No backups found. Please run export-data first.');
          }

          backupPath = path.join(backupsDir, backups[0]);
          console.log(`📁 Using latest backup: ${backups[0]}\n`);
        }

        await importData(backupPath);
      } catch (error) {
        console.error('Failed:', error);
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

if (require.main === module) {
  main();
}

export { importData };

