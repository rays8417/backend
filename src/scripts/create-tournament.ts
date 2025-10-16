#!/usr/bin/env ts-node

import { TournamentStatus } from '@prisma/client';
import { prisma } from '../prisma';

/**
 * STEP 1: Create Upcoming Tournament
 * Creates a tournament with UPCOMING status
 * 
 * Usage: npm run tournament:create
 */

interface TournamentData {
  name: string;
  description?: string;
  matchDate: Date;
  team1: string;
  team2: string;
  venue?: string;
  matchId: string;
  rewardPoolAmount: number;
}

// Sample tournament data (customize as needed)
const sampleTournament: TournamentData = {
  name: "Australia vs India ",
  description: "India tour of Australia, 2025 - 1st ODI",
  matchDate: new Date(1760844600000),
  team1: "Australia",
  team2: "India",
  venue: "Perth Stadium",
  matchId: "116912", // Replace with actual Cricbuzz match ID
  rewardPoolAmount: 50000 // 100 BOSON tokens
};

/**
 * Create upcoming tournament
 */
async function createTournament(tournamentData: TournamentData) {
  console.log('\n🏏 STEP 1: CREATE UPCOMING TOURNAMENT');
  console.log('====================================\n');
  console.log(`Name: ${tournamentData.name}`);
  console.log(`Teams: ${tournamentData.team1} vs ${tournamentData.team2}`);
  console.log(`Match Date: ${tournamentData.matchDate.toISOString()}`);
  console.log(`Match ID: ${tournamentData.matchId}`);
  console.log(`Reward Pool: ${tournamentData.rewardPoolAmount} BOSON\n`);

  // Create tournament
  const tournament = await prisma.tournament.create({
    data: {
      name: tournamentData.name,
      description: tournamentData.description,
      matchDate: tournamentData.matchDate,
      team1: tournamentData.team1,
      team2: tournamentData.team2,
      venue: tournamentData.venue,
      status: TournamentStatus.UPCOMING,
      matchId: tournamentData.matchId,
      currentParticipants: 0
    }
  });

  console.log(`✅ Tournament created!`);
  console.log(`   ID: ${tournament.id}`);
  console.log(`   Status: ${tournament.status}\n`);

  // Create reward pool
  if (tournamentData.rewardPoolAmount > 0) {
    const rewardPool = await prisma.rewardPool.create({
      data: {
        tournamentId: tournament.id,
        name: `${tournament.name} - Prize Pool`,
        totalAmount: tournamentData.rewardPoolAmount,
        distributedAmount: 0,
        distributionType: 'PERCENTAGE',
        distributionRules: {
          type: 'snapshot_based',
          description: 'Rewards distributed based on holdings and performance'
        }
      }
    });

    console.log(`💰 Reward pool created: ${rewardPool.totalAmount} BOSON\n`);
  }

  console.log('🎯 Next Steps:');
  console.log('   → When match is about to start: npm run tournament:start -- <tournament-id>');
  console.log('   → This will change status to ONGOING and take pre-match snapshot\n');
  console.log(`📋 Tournament ID: ${tournament.id}`);
  console.log('   Copy this ID for the next steps!\n');

  return tournament;
}

// Run script
createTournament(sampleTournament)
  .then(() => {
    console.log('✅ Step 1 completed successfully!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });

