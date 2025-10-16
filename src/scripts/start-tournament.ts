#!/usr/bin/env ts-node

import { TournamentStatus } from '@prisma/client';
import { Command } from 'commander';
import { prisma } from '../prisma';
import { createContractSnapshot, createSnapshotSummary } from '../services/contractSnapshotService';

/**
 * STEP 2: Start Tournament
 * Changes tournament status from UPCOMING to ONGOING and takes pre-match snapshot
 * 
 * Usage: npm run tournament:start -- <tournament-id>
 */

/**
 * Start tournament and take pre-match snapshot
 */
async function startTournament(tournamentId: string) {
  console.log('\n🚀 STEP 2: START TOURNAMENT');
  console.log('===========================\n');
  console.log(`Tournament ID: ${tournamentId}\n`);

  // Get tournament
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId }
  });

  if (!tournament) {
    throw new Error('Tournament not found');
  }

  console.log(`📋 Tournament: ${tournament.name}`);
  console.log(`   Teams: ${tournament.team1} vs ${tournament.team2}`);
  console.log(`   Current Status: ${tournament.status}\n`);

  // Check current status
  if (tournament.status === TournamentStatus.ONGOING) {
    console.log('⚠️  Tournament is already ONGOING');
    return tournament;
  }

  if (tournament.status === TournamentStatus.COMPLETED) {
    console.log('❌ Tournament is already COMPLETED');
    return tournament;
  }

  // Change status to ONGOING
  console.log('🔄 Changing status to ONGOING...');
  const updatedTournament = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { 
      status: TournamentStatus.ONGOING,
      updatedAt: new Date()
    }
  });

  console.log(`✅ Status updated: ${updatedTournament.status}\n`);

  // Take pre-match snapshot
  console.log('📸 Taking pre-match snapshot...');
  const snapshot = await createContractSnapshot(tournamentId, 'PRE_MATCH');

  console.log(`✅ Pre-match snapshot created!`);
  console.log(`   Snapshot ID: ${snapshot.snapshotId}`);
  console.log(`   Block Number: ${snapshot.blockNumber}`);
  console.log(`   Total Holders: ${snapshot.totalHolders}`);
  console.log(`   Unique Addresses: ${snapshot.uniqueAddresses}\n`);

  // Display snapshot summary
  const snapshotData = await prisma.contractSnapshot.findUnique({
    where: { id: snapshot.snapshotId }
  });
  
  if (snapshotData) {
    console.log(createSnapshotSummary(snapshotData.data as any));
  }

  console.log('\n🎯 Next Steps:');
  console.log('   → During/after match: npm run scores:fetch-api -- <tournament-id> <match-id>');
  console.log('   → Or use hardcoded scores: npm run scores:update <tournament-id>');
  console.log('   → After match ends: npm run tournament:end -- <tournament-id>\n');

  return { tournament: updatedTournament, snapshot };
}

/**
 * List tournaments to help find IDs
 */
async function listTournaments() {
  console.log('\n📋 TOURNAMENTS');
  console.log('==============\n');

  const tournaments = await prisma.tournament.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { rewardPools: true }
  });

  if (tournaments.length === 0) {
    console.log('No tournaments found.\n');
    return;
  }

  tournaments.forEach((t, i) => {
    console.log(`${i + 1}. ${t.name}`);
    console.log(`   ID: ${t.id}`);
    console.log(`   Status: ${t.status}`);
    console.log(`   Teams: ${t.team1} vs ${t.team2}`);
    console.log(`   Date: ${t.matchDate.toISOString()}`);
    if (t.rewardPools.length > 0) {
      const total = t.rewardPools.reduce((sum, p) => sum + Number(p.totalAmount), 0);
      console.log(`   💰 Reward Pool: ${total} BOSON`);
    }
    console.log('');
  });
}

// Main CLI
async function main() {
  const program = new Command();

  program
    .name('start-tournament')
    .description('Start tournament and take pre-match snapshot')
    .version('1.0.0');

  program
    .command('start')
    .description('Change status to ONGOING and take pre-match snapshot')
    .argument('<tournament-id>', 'Tournament ID to start')
    .action(async (tournamentId: string) => {
      try {
        await startTournament(tournamentId);
      } catch (error) {
        console.error('Failed to start tournament:', error);
        process.exit(1);
      } finally {
        await prisma.$disconnect();
      }
    });

  program
    .command('list')
    .description('List all tournaments')
    .action(async () => {
      try {
        await listTournaments();
      } catch (error) {
        console.error('Failed to list tournaments:', error);
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

