#!/usr/bin/env ts-node

import { Command } from 'commander';
import { prisma } from '../prisma';
import { parseScorecard } from '../services/cricketApiService';
import { calculateTotalFantasyPoints } from '../utils/fantasyPointsCalculator';

/**
 * STEP 3: Update Player Scores
 * Updates player scores for a tournament (hardcoded or from Cricket API)
 * 
 * Usage: 
 *   npm run scores:update <tournament-id>           (hardcoded sample data)
 *   npm run scores:fetch-api -- <tournament-id> <match-id>  (real Cricbuzz data)
 *   npm run scores:get <tournament-id>              (view current scores)
 */

// Sample player scores for testing
const sampleScoresData = {
  playerScores: [
    {
      moduleName: 'ViratKohli',
      runs: 85,
      ballsFaced: 65,
      wickets: 0,
      oversBowled: 0,
      runsConceded: 0,
      catches: 1,
      stumpings: 0,
      runOuts: 0,
    },
    {
      moduleName: 'BenStokes',
      runs: 45,
      ballsFaced: 38,
      wickets: 2,
      oversBowled: 4,
      runsConceded: 28,
      catches: 0,
      stumpings: 0,
      runOuts: 1,
    },
    {
      moduleName: 'KaneWilliamson',
      runs: 72,
      ballsFaced: 58,
      wickets: 0,
      oversBowled: 0,
      runsConceded: 0,
      catches: 2,
      stumpings: 0,
      runOuts: 0,
    },
    {
      moduleName: 'AbhishekSharma',
      runs: 38,
      ballsFaced: 42,
      wickets: 1,
      oversBowled: 3,
      runsConceded: 22,
      catches: 1,
      stumpings: 0,
      runOuts: 0,
    },
    {
      moduleName: 'HardikPandya',
      runs: 56,
      ballsFaced: 45,
      wickets: 1,
      oversBowled: 2,
      runsConceded: 18,
      catches: 0,
      stumpings: 0,
      runOuts: 1,
    },
    {
      moduleName: 'JaspreetBumhrah',
      runs: 12,
      ballsFaced: 8,
      wickets: 3,
      oversBowled: 4,
      runsConceded: 25,
      catches: 0,
      stumpings: 0,
      runOuts: 0,
    },
  ]
};

/**
 * Update player scores with sample data or custom data
 */
async function updatePlayerScores(tournamentId: string) {
  console.log(`\n📊 STEP 3: UPDATE PLAYER SCORES`);
  console.log('================================\n');
  console.log(`Tournament ID: ${tournamentId}\n`);

  // Verify tournament
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId }
  });

  if (!tournament) {
    throw new Error('Tournament not found');
  }

  console.log(`✅ Tournament: ${tournament.name}`);
  console.log(`   Teams: ${tournament.team1} vs ${tournament.team2}`);
  console.log(`   Status: ${tournament.status}\n`);

  console.log('🏏 Updating player scores with sample data...\n');

  // Calculate and save scores
  const updatedScores = [];
  for (const playerScore of sampleScoresData.playerScores) {
    const fantasyPoints = calculateTotalFantasyPoints(playerScore);
    
    await prisma.playerScore.upsert({
      where: {
        tournamentId_moduleName: {
          tournamentId,
          moduleName: playerScore.moduleName
        }
      },
      update: {
        runs: playerScore.runs,
        ballsFaced: playerScore.ballsFaced,
        wickets: playerScore.wickets,
        oversBowled: playerScore.oversBowled,
        runsConceded: playerScore.runsConceded,
        catches: playerScore.catches,
        stumpings: playerScore.stumpings,
        runOuts: playerScore.runOuts,
        fantasyPoints
      },
      create: {
        tournamentId,
        moduleName: playerScore.moduleName,
        runs: playerScore.runs,
        ballsFaced: playerScore.ballsFaced,
        wickets: playerScore.wickets,
        oversBowled: playerScore.oversBowled,
        runsConceded: playerScore.runsConceded,
        catches: playerScore.catches,
        stumpings: playerScore.stumpings,
        runOuts: playerScore.runOuts,
        fantasyPoints
      }
    });

    updatedScores.push({ ...playerScore, fantasyPoints });
  }

  updatedScores.sort((a, b) => b.fantasyPoints - a.fantasyPoints);

  console.log('📊 FANTASY POINTS:');
  updatedScores.forEach((player, index) => {
    console.log(`${index + 1}. ${player.moduleName}: ${player.fantasyPoints.toFixed(2)} points`);
  });

  console.log(`\n✅ Updated ${updatedScores.length} player scores!\n`);
  console.log('🎯 Next Steps:');
  console.log('   → View scores: npm run scores:get <tournament-id>');
  console.log('   → End tournament: npm run tournament:end -- <tournament-id>\n');

  return updatedScores;
}

/**
 * Fetch scores from Cricket API
 */
async function fetchScoresFromAPI(tournamentId: string, matchId: number) {
  console.log(`\n🏏 STEP 3: FETCH SCORES FROM CRICKET API`);
  console.log('========================================\n');
  console.log(`Tournament ID: ${tournamentId}`);
  console.log(`Match ID: ${matchId}\n`);

  // Fetch from Cricbuzz API
  const playerScores = await parseScorecard(matchId);

  if (playerScores.length === 0) {
    console.log('⚠️  No player scores found from API');
    return;
  }

  console.log(`📡 Fetched ${playerScores.length} player scores from API\n`);

  // Calculate fantasy points and save
  const updatedScores = [];
  for (const playerScore of playerScores) {
    const fantasyPoints = calculateTotalFantasyPoints(playerScore);

    await prisma.playerScore.upsert({
      where: {
        tournamentId_moduleName: {
          tournamentId,
          moduleName: playerScore.moduleName
        }
      },
      update: {
        runs: playerScore.runs,
        ballsFaced: playerScore.ballsFaced,
        wickets: playerScore.wickets,
        oversBowled: playerScore.oversBowled,
        runsConceded: playerScore.runsConceded,
        catches: playerScore.catches,
        stumpings: playerScore.stumpings,
        runOuts: playerScore.runOuts,
        fantasyPoints
      },
      create: {
        tournamentId,
        moduleName: playerScore.moduleName,
        runs: playerScore.runs,
        ballsFaced: playerScore.ballsFaced,
        wickets: playerScore.wickets,
        oversBowled: playerScore.oversBowled,
        runsConceded: playerScore.runsConceded,
        catches: playerScore.catches,
        stumpings: playerScore.stumpings,
        runOuts: playerScore.runOuts,
        fantasyPoints
      }
    });

    updatedScores.push({ ...playerScore, fantasyPoints });
  }

  updatedScores.sort((a, b) => b.fantasyPoints - a.fantasyPoints);

  console.log('📊 FANTASY POINTS:');
  updatedScores.forEach((player, index) => {
    console.log(`${index + 1}. ${player.moduleName}: ${player.fantasyPoints.toFixed(2)} points`);
  });

  console.log(`\n✅ Updated ${updatedScores.length} player scores from API!\n`);
  console.log('🎯 Next Steps:');
  console.log('   → View scores: npm run scores:get <tournament-id>');
  console.log('   → End tournament: npm run tournament:end -- <tournament-id>\n');

  return updatedScores;
}

/**
 * Get current player scores
 */
async function getPlayerScores(tournamentId: string) {
  console.log(`\n📊 CURRENT PLAYER SCORES`);
  console.log('========================\n');

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId }
  });

  if (!tournament) {
    throw new Error('Tournament not found');
  }

  console.log(`Tournament: ${tournament.name}`);
  console.log(`Teams: ${tournament.team1} vs ${tournament.team2}\n`);

  const playerScores = await prisma.playerScore.findMany({
    where: { tournamentId },
    orderBy: { fantasyPoints: 'desc' }
  });

  if (playerScores.length === 0) {
    console.log('❌ No player scores found');
    console.log('💡 Use: npm run scores:update <tournament-id>\n');
    return [];
  }

  console.log('🏆 Player Scores:');
  playerScores.forEach((player, index) => {
    console.log(`${index + 1}. ${player.moduleName}`);
    console.log(`   Points: ${Number(player.fantasyPoints).toFixed(2)}`);
    console.log(`   Runs: ${player.runs} (${player.ballsFaced} balls)`);
    console.log(`   Wickets: ${player.wickets} (${player.oversBowled} overs)`);
    console.log(`   Fielding: ${player.catches}c ${player.stumpings}st ${player.runOuts}ro\n`);
  });

  return playerScores;
}

// Main CLI
async function main() {
  const program = new Command();

  program
    .name('update-scores')
    .description('Update player scores for a tournament')
    .version('1.0.0');

  program
    .command('update')
    .description('Update scores with sample/hardcoded data')
    .argument('<tournament-id>', 'Tournament ID')
    .action(async (tournamentId: string) => {
      try {
        await updatePlayerScores(tournamentId);
      } catch (error) {
        console.error('Failed:', error);
        process.exit(1);
      } finally {
        await prisma.$disconnect();
      }
    });

  program
    .command('fetch-from-api')
    .description('Fetch real scores from Cricbuzz API')
    .argument('<tournament-id>', 'Tournament ID')
    .argument('<match-id>', 'Cricbuzz match ID')
    .action(async (tournamentId: string, matchId: string) => {
      try {
        const matchIdNum = parseInt(matchId);
        if (isNaN(matchIdNum)) {
          throw new Error('Invalid match ID');
        }
        await fetchScoresFromAPI(tournamentId, matchIdNum);
      } catch (error) {
        console.error('Failed:', error);
        process.exit(1);
      } finally {
        await prisma.$disconnect();
      }
    });

  program
    .command('get')
    .description('View current player scores')
    .argument('<tournament-id>', 'Tournament ID')
    .action(async (tournamentId: string) => {
      try {
        await getPlayerScores(tournamentId);
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

