#!/usr/bin/env ts-node

/**
 * Export all database data to JSON files
 * Run this BEFORE running migrations
 */

import { prisma } from '../prisma';
import * as fs from 'fs';
import * as path from 'path';

const BACKUP_DIR = path.join(__dirname, '../../backups');

async function exportData() {
  console.log('🔄 EXPORTING DATABASE DATA');
  console.log('===========================\n');

  // Create backup directory
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}`);
  fs.mkdirSync(backupPath);

  console.log(`📁 Backup directory: ${backupPath}\n`);

  try {
    // Export Tournaments
    console.log('📊 Exporting tournaments...');
    const tournaments = await prisma.tournament.findMany();
    fs.writeFileSync(
      path.join(backupPath, 'tournaments.json'),
      JSON.stringify(tournaments, null, 2)
    );
    console.log(`   ✅ Exported ${tournaments.length} tournaments\n`);

    // Export PlayerScores
    console.log('🏏 Exporting player scores...');
    const playerScores = await prisma.playerScore.findMany();
    fs.writeFileSync(
      path.join(backupPath, 'player-scores.json'),
      JSON.stringify(playerScores, null, 2)
    );
    console.log(`   ✅ Exported ${playerScores.length} player scores\n`);

    // Export RewardPools
    console.log('💰 Exporting reward pools...');
    const rewardPools = await prisma.rewardPool.findMany();
    fs.writeFileSync(
      path.join(backupPath, 'reward-pools.json'),
      JSON.stringify(rewardPools, null, 2)
    );
    console.log(`   ✅ Exported ${rewardPools.length} reward pools\n`);

    // Export UserRewards
    console.log('🎁 Exporting user rewards...');
    const userRewards = await prisma.userReward.findMany();
    fs.writeFileSync(
      path.join(backupPath, 'user-rewards.json'),
      JSON.stringify(userRewards, null, 2)
    );
    console.log(`   ✅ Exported ${userRewards.length} user rewards\n`);

    // Export Snapshots (ContractSnapshots)
    console.log('📸 Exporting snapshots...');
    const snapshots = await prisma.snapshot.findMany();
    fs.writeFileSync(
      path.join(backupPath, 'snapshots.json'),
      JSON.stringify(snapshots, null, 2)
    );
    console.log(`   ✅ Exported ${snapshots.length} snapshots\n`);

    // Export Users
    console.log('👤 Exporting users...');
    const users = await prisma.user.findMany();
    fs.writeFileSync(
      path.join(backupPath, 'users.json'),
      JSON.stringify(users, null, 2)
    );
    console.log(`   ✅ Exported ${users.length} users\n`);

    // Create summary
    const summary = {
      exportDate: new Date().toISOString(),
      totalRecords: {
        tournaments: tournaments.length,
        playerScores: playerScores.length,
        rewardPools: rewardPools.length,
        userRewards: userRewards.length,
        snapshots: snapshots.length,
        users: users.length
      }
    };

    fs.writeFileSync(
      path.join(backupPath, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );

    console.log('✅ EXPORT COMPLETED SUCCESSFULLY!');
    console.log('==================================');
    console.log(`📁 Location: ${backupPath}`);
    console.log(`📊 Total records: ${Object.values(summary.totalRecords).reduce((a, b) => a + b, 0)}\n`);

    return backupPath;
  } catch (error) {
    console.error('❌ Export failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  exportData()
    .then((path) => {
      console.log(`\n✅ Data exported to: ${path}`);
      console.log('\nNext steps:');
      console.log('1. Run: npx prisma migrate reset');
      console.log('2. Run: npm run import-data <backup-path>');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed:', error);
      process.exit(1);
    });
}

export { exportData };

