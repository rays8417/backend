import axios from 'axios';
import { getPlayerModuleNames } from '../config/players.config';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ;
const RAPIDAPI_HOST = 'cricbuzz-cricket.p.rapidapi.com';

export interface CricketPlayerScore {
  moduleName: string;
  runs: number;
  ballsFaced: number;
  wickets: number;
  oversBowled: number;
  runsConceded: number;
  catches: number;
  stumpings: number;
  runOuts: number;
  fantasyPoints?: number;
}

/**
 * Fetch live matches from Cricbuzz API
 * Returns all currently live matches
 */
export async function fetchLiveMatches(): Promise<any> {
  try {
    console.log(`📡 Fetching live matches...`);
    
    const options = {
      method: 'GET',
      url: `https://cricbuzz-cricket.p.rapidapi.com/matches/v1/live`,
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST
      }
    };

    const response = await axios.request(options);
    console.log(`✅ Live matches fetched successfully`);
    
    return response.data;
  } catch (error) {
    console.error('❌ Error fetching live matches:', error);
    throw new Error(`Failed to fetch live matches: ${error}`);
  }
}

/**
 * Fetch scorecard from Cricbuzz API
 * This endpoint provides detailed statistics after match completion or during match
 */
export async function fetchMatchScorecard(matchId: number): Promise<any> {
  try {
    console.log(`📡 Fetching scorecard for match ID: ${matchId}`);
    
    const options = {
      method: 'GET',
      url: `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${matchId}/scard`,
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST
      }
    };

    const response = await axios.request(options);
    console.log(`✅ Scorecard fetched successfully`);
    
    return response.data;
  } catch (error) {
    console.error('❌ Error fetching scorecard:', error);
    throw new Error(`Failed to fetch scorecard for match ${matchId}: ${error}`);
  }
}

/**
 * Map player name to module name with multiple matching strategies
 * This maps actual cricket player names to your smart contract module names
 */
function mapPlayerNameToModuleName(playerName: string): string | null {
  // Remove special characters and spaces for matching
  const cleanName = playerName.toLowerCase().replace(/[^a-z]/g, '');
  
  // Try to extract last name for fallback matching
  const nameParts = playerName.trim().split(/\s+/);
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1].toLowerCase().replace(/[^a-z]/g, '') : '';
  const firstName = nameParts.length > 0 ? nameParts[0].toLowerCase().replace(/[^a-z]/g, '') : '';
  
  // Player name mapping with multiple variations
  // TODO: Consider using fuzzy matching library (e.g., fuzzball) for better automation
  const nameMap: { [key: string]: string } = {
    // Abhishek Sharma
    'abhisheksharma': 'AbhishekSharma',
    'asharma': 'AbhishekSharma',
    'abhishek': 'AbhishekSharma',
    'sharma': 'AbhishekSharma',
    
    // Alick Athanaze
    'alickathanaze': 'AlickAthanaze',
    'aathanaze': 'AlickAthanaze',
    'athanaze': 'AlickAthanaze',
    'alick': 'AlickAthanaze',
    
    // Ben Stokes
    'benstokes': 'BenStokes',
    'bstokes': 'BenStokes',
    'stokes': 'BenStokes',
    'benjaminstokes': 'BenStokes',
    'ben': 'BenStokes',
    
    // Glenn Maxwell
    'glenmaxwell': 'GlenMaxwell',
    'glennmaxwell': 'GlenMaxwell',
    'gmaxwell': 'GlenMaxwell',
    'maxwell': 'GlenMaxwell',
    'glenn': 'GlenMaxwell',
    
    // Hardik Pandya
    'hardikpandya': 'HardikPandya',
    'hpandya': 'HardikPandya',
    'hardik': 'HardikPandya',
    'pandya': 'HardikPandya',
    
    // Harry Brook
    'harrybrook': 'HarryBrook',
    'hbrook': 'HarryBrook',
    'brook': 'HarryBrook',
    'harry': 'HarryBrook',
    
    // Jasprit Bumrah
    'jaspritbumrah': 'JaspreetBumhrah',
    'jaspreetbumrah': 'JaspreetBumhrah',
    'jbumrah': 'JaspreetBumhrah',
    'bumrah': 'JaspreetBumhrah',
    'jasprit': 'JaspreetBumhrah',
    'jaspreet': 'JaspreetBumhrah',
    
    // Joe Root
    'joeroot': 'JoeRoot',
    'jroot': 'JoeRoot',
    'root': 'JoeRoot',
    'joe': 'JoeRoot',
    
    // John Campbell
    'johncampbell': 'JohnCampbell',
    'jcampbell': 'JohnCampbell',
    'campbell': 'JohnCampbell',
    'john': 'JohnCampbell',
    
    // Jos Buttler
    'josbuttler': 'JosButtler',
    'jbuttler': 'JosButtler',
    'buttler': 'JosButtler',
    'butler': 'JosButtler', // Common misspelling
    'jos': 'JosButtler',
    'josephbuttler': 'JosButtler',
    
    // Josh Inglis
    'joshinglis': 'JoshInglis',
    'jinglis': 'JoshInglis',
    'inglis': 'JoshInglis',
    'josh': 'JoshInglis',
    
    // Kane Williamson
    'kanewilliamson': 'KaneWilliamson',
    'kwilliamson': 'KaneWilliamson',
    'williamson': 'KaneWilliamson',
    'kane': 'KaneWilliamson',
    
    // Khary Pierre
    'kharypierre': 'KharyPierre',
    'kpierre': 'KharyPierre',
    'pierre': 'KharyPierre',
    'khary': 'KharyPierre',
    
    // KL Rahul
    'klrahul': 'KLRahul',
    'krahul': 'KLRahul',
    'rahul': 'KLRahul',
    'lokeshrahul': 'KLRahul',
    'kannurlokeshrahul': 'KLRahul',
    
    // Mohammed Siraj
    'mohammedsiraj': 'MohammedSiraj',
    'mohammadsiraj': 'MohammedSiraj',
    'msiraj': 'MohammedSiraj',
    'siraj': 'MohammedSiraj',
    'mohammed': 'MohammedSiraj',
    
    // Rishabh Pant
    'rishabhpant': 'RishabhPant',
    'rpant': 'RishabhPant',
    'pant': 'RishabhPant',
    'rishabh': 'RishabhPant',
    
    // Rohit Sharma
    'rohitsharma': 'RohitSharma',
    'rsharma': 'RohitSharma',
    'rohit': 'RohitSharma',
    
    // Shai Hope
    'shaihope': 'ShaiHope',
    'shope': 'ShaiHope',
    'hope': 'ShaiHope',
    'shai': 'ShaiHope',
    
    // Shubham Dube
    'shubhamdube': 'ShubhamDube',
    'shivamdube': 'ShubhamDube', // Common name variation
    'sdube': 'ShubhamDube',
    'dube': 'ShubhamDube',
    'shubham': 'ShubhamDube',
    'shivam': 'ShubhamDube',
    
    // Shubman Gill
    'shubhmangill': 'ShubhmanGill',
    'shubmangill': 'ShubhmanGill',
    'sgill': 'ShubhmanGill',
    'gill': 'ShubhmanGill',
    'shubman': 'ShubhmanGill',
    
    // Suryakumar Yadav
    'suryakumaryadav': 'SuryakumarYadav',
    'skyadav': 'SuryakumarYadav',
    'surya': 'SuryakumarYadav',
    'suryakumar': 'SuryakumarYadav',
    'yadav': 'SuryakumarYadav',
    'sky': 'SuryakumarYadav',
    
    // Travis Head
    'travishead': 'TravisHead',
    'thead': 'TravisHead',
    'head': 'TravisHead',
    'travis': 'TravisHead',
    
    // Virat Kohli
    'viratkholi': 'ViratKohli',
    'viratkohli': 'ViratKohli',
    'vkohli': 'ViratKohli',
    'kohli': 'ViratKohli',
    'virat': 'ViratKohli',
    
    // Washington Sundar
    'washingtonsundar': 'WashingtonSundar',
    'wsundar': 'WashingtonSundar',
    'sundar': 'WashingtonSundar',
    'washington': 'WashingtonSundar',
    'washi': 'WashingtonSundar',
    
    // Yashasvi Jaiswal
    'yashasvijaiswal': 'YashasviJaiswal',
    'yjaiswal': 'YashasviJaiswal',
    'jaiswal': 'YashasviJaiswal',
    'yashasvi': 'YashasviJaiswal',
    'yashaswi': 'YashasviJaiswal', // Common spelling variation
  };
  
  // Try matching strategies in order of preference
  // 1. Try full name match
  if (nameMap[cleanName]) {
    return nameMap[cleanName];
  }
  
  // 2. Try last name match (most reliable for cricket)
  if (lastName && nameMap[lastName]) {
    return nameMap[lastName];
  }
  
  // 3. Try first name match as last resort
  if (firstName && nameMap[firstName]) {
    return nameMap[firstName];
  }
  
  return null;
}

/**
 * Parse batting performance from scorecard
 */
function parseBattingPerformance(scorecardData: any): Map<string, { runs: number; ballsFaced: number }> {
  const battingStats = new Map<string, { runs: number; ballsFaced: number }>();
  
  try {
    if (!scorecardData || !Array.isArray(scorecardData)) {
      return battingStats;
    }

    for (const innings of scorecardData) {
      if (!innings.batsman || !Array.isArray(innings.batsman)) continue;
      
      // Process each batsman
      for (const batsman of innings.batsman) {
        if (!batsman.name) continue;
        
        const moduleName = mapPlayerNameToModuleName(batsman.name);
        if (!moduleName) continue;
        
        const runs = parseInt(batsman.runs) || 0;
        const balls = parseInt(batsman.balls) || 0;
        
        // If player batted in multiple innings, add them up
        if (battingStats.has(moduleName)) {
          const existing = battingStats.get(moduleName)!;
          battingStats.set(moduleName, {
            runs: existing.runs + runs,
            ballsFaced: existing.ballsFaced + balls
          });
        } else {
          battingStats.set(moduleName, { runs, ballsFaced: balls });
        }
      }
    }
  } catch (error) {
    console.error('Error parsing batting performance:', error);
  }
  
  return battingStats;
}

/**
 * Parse bowling performance from scorecard
 */
function parseBowlingPerformance(scorecardData: any): Map<string, { wickets: number; oversBowled: number; runsConceded: number }> {
  const bowlingStats = new Map<string, { wickets: number; oversBowled: number; runsConceded: number }>();
  
  try {
    if (!scorecardData || !Array.isArray(scorecardData)) {
      return bowlingStats;
    }

    for (const innings of scorecardData) {
      if (!innings.bowler || !Array.isArray(innings.bowler)) continue;
      
      // Process each bowler
      for (const bowler of innings.bowler) {
        if (!bowler.name) continue;
        
        const moduleName = mapPlayerNameToModuleName(bowler.name);
        if (!moduleName) continue;
        
        const wickets = parseInt(bowler.wickets) || 0;
        const overs = parseFloat(bowler.overs) || 0;
        const runs = parseInt(bowler.runs) || 0;
        
        // If player bowled in multiple innings, add them up
        if (bowlingStats.has(moduleName)) {
          const existing = bowlingStats.get(moduleName)!;
          bowlingStats.set(moduleName, {
            wickets: existing.wickets + wickets,
            oversBowled: existing.oversBowled + overs,
            runsConceded: existing.runsConceded + runs
          });
        } else {
          bowlingStats.set(moduleName, { wickets, oversBowled: overs, runsConceded: runs });
        }
      }
    }
  } catch (error) {
    console.error('Error parsing bowling performance:', error);
  }
  
  return bowlingStats;
}

/**
 * Parse fielding performance from scorecard
 * Note: Cricbuzz API doesn't always provide detailed fielding stats
 * This is a best-effort extraction from wicket details
 */
function parseFieldingPerformance(scorecardData: any): Map<string, { catches: number; stumpings: number; runOuts: number }> {
  const fieldingStats = new Map<string, { catches: number; stumpings: number; runOuts: number }>();
  
  try {
    if (!scorecardData || !Array.isArray(scorecardData)) {
      return fieldingStats;
    }

    for (const innings of scorecardData) {
      if (!innings.batsman || !Array.isArray(innings.batsman)) continue;
      
      // Check wicket information for fielding credits
      for (const batsman of innings.batsman) {
        // Parse dismissal info (e.g., "c Smith b Johnson", "run out (Smith)")
        const outDesc = batsman.outdec || '';
        
        // Extract fielder names from dismissal
        // Format: "c Tilak Varma b Varun Chakaravarthy"
        const catchMatch = outDesc.match(/c\s+([A-Za-z\s]+?)\s+b\s+/i);
        if (catchMatch) {
          const fielderName = catchMatch[1].trim();
          const moduleName = mapPlayerNameToModuleName(fielderName);
          if (moduleName) {
            const existing = fieldingStats.get(moduleName) || { catches: 0, stumpings: 0, runOuts: 0 };
            fieldingStats.set(moduleName, { ...existing, catches: existing.catches + 1 });
          }
        }
        
        // Check for stumpings
        // Format: "st Samson b Kuldeep Yadav"
        const stumpingMatch = outDesc.match(/st\s+([A-Za-z\s]+?)\s+b\s+/i);
        if (stumpingMatch) {
          const fielderName = stumpingMatch[1].trim();
          const moduleName = mapPlayerNameToModuleName(fielderName);
          if (moduleName) {
            const existing = fieldingStats.get(moduleName) || { catches: 0, stumpings: 0, runOuts: 0 };
            fieldingStats.set(moduleName, { ...existing, stumpings: existing.stumpings + 1 });
          }
        }
        
        // Check for run outs
        // Format: "run out (Rinku Singh)" or "run out (Rinku Singh/Bumrah)"
        const runoutMatch = outDesc.match(/run\s+out\s+\(([^)]+)\)/i);
        if (runoutMatch) {
          const fielders = runoutMatch[1].split('/');
          for (const fielder of fielders) {
            const fielderName = fielder.trim();
            const moduleName = mapPlayerNameToModuleName(fielderName);
            if (moduleName) {
              const existing = fieldingStats.get(moduleName) || { catches: 0, stumpings: 0, runOuts: 0 };
              fieldingStats.set(moduleName, { ...existing, runOuts: existing.runOuts + 1 });
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error parsing fielding performance:', error);
  }
  
  return fieldingStats;
}

/**
 * Parse complete scorecard and convert to player scores format
 */
export async function parseScorecard(matchId: number): Promise<CricketPlayerScore[]> {
  try {
    console.log(`\n🏏 PARSING CRICKET SCORECARD`);
    console.log('============================');
    console.log(`Match ID: ${matchId}\n`);
    
    // Fetch scorecard from API
    const data = await fetchMatchScorecard(matchId);
    
    if (!data || !data.scorecard) {
      throw new Error('Invalid scorecard data received from API');
    }
    
    // Parse different aspects of performance
    const battingStats = parseBattingPerformance(data.scorecard);
    const bowlingStats = parseBowlingPerformance(data.scorecard);
    const fieldingStats = parseFieldingPerformance(data.scorecard);
    
    // Combine all stats
    const allPlayers = new Set<string>();
    battingStats.forEach((_, player) => allPlayers.add(player));
    bowlingStats.forEach((_, player) => allPlayers.add(player));
    fieldingStats.forEach((_, player) => allPlayers.add(player));
    
    // Create player score objects
    const playerScores: CricketPlayerScore[] = [];
    
    for (const moduleName of allPlayers) {
      const batting = battingStats.get(moduleName) || { runs: 0, ballsFaced: 0 };
      const bowling = bowlingStats.get(moduleName) || { wickets: 0, oversBowled: 0, runsConceded: 0 };
      const fielding = fieldingStats.get(moduleName) || { catches: 0, stumpings: 0, runOuts: 0 };
      
      playerScores.push({
        moduleName,
        runs: batting.runs,
        ballsFaced: batting.ballsFaced,
        wickets: bowling.wickets,
        oversBowled: bowling.oversBowled,
        runsConceded: bowling.runsConceded,
        catches: fielding.catches,
        stumpings: fielding.stumpings,
        runOuts: fielding.runOuts
      });
    }
    
    // Log parsed results
    console.log(`✅ Successfully parsed ${playerScores.length} player performances`);
    console.log('\n📊 PARSED PLAYER SCORES:');
    console.log('========================');
    
    playerScores.forEach((player, index) => {
      console.log(`\n${index + 1}. ${player.moduleName}`);
      console.log(`   Batting: ${player.runs} runs (${player.ballsFaced} balls)`);
      console.log(`   Bowling: ${player.wickets} wickets (${player.oversBowled} overs, ${player.runsConceded} runs)`);
      console.log(`   Fielding: ${player.catches} catches, ${player.stumpings} stumpings, ${player.runOuts} run outs`);
    });
    
    return playerScores;
    
  } catch (error) {
    console.error('❌ Error parsing scorecard:', error);
    throw error;
  }
}

/**
 * Fetch and format player scores for a tournament
 */
export async function fetchPlayerScoresForTournament(matchId: number): Promise<{
  tournamentId?: string;
  playerScores: CricketPlayerScore[];
}> {
  try {
    const playerScores = await parseScorecard(matchId);
    
    return {
      playerScores
    };
  } catch (error) {
    console.error('Error fetching player scores for tournament:', error);
    throw error;
  }
}

/**
 * Fetch match info from Cricbuzz API
 */
export async function fetchMatchInfo(matchId: number): Promise<any> {
  try {
    console.log(`📡 Fetching match info for match ID: ${matchId}`);
    
    const options = {
      method: 'GET',
      url: `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${matchId}`,
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST
      }
    };

    const response = await axios.request(options);
    console.log(`✅ Match info fetched successfully`);
    
    return response.data;
  } catch (error) {
    console.error('❌ Error fetching match info:', error);
    throw new Error(`Failed to fetch match info for match ${matchId}: ${error}`);
  }
}

/**
 * Fetch team players from Cricbuzz API
 */
export async function fetchTeamPlayers(matchId: number, teamId: number): Promise<any> {
  try {
    console.log(`📡 Fetching team players for match ID: ${matchId}, team ID: ${teamId}`);
    
    const options = {
      method: 'GET',
      url: `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${matchId}/team/${teamId}`,
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST
      }
    };

    const response = await axios.request(options);
    console.log(`✅ Team players fetched successfully`);
    console.log('Team players:-------------------', response.data);
    
    return response.data;
  } catch (error) {
    console.error('❌ Error fetching team players:', error);
    throw new Error(`Failed to fetch team players for match ${matchId}, team ${teamId}: ${error}`);
  }
}

/**
 * List of available player modules in our smart contract
 * Imported from centralized config - SINGLE SOURCE OF TRUTH
 */
const AVAILABLE_PLAYER_MODULES = getPlayerModuleNames();

/**
 * Get eligible players for a match (players we have modules for)
 */
export async function getEligiblePlayers(matchId: number): Promise<any[]> {
  try {
    console.log(`📡 Fetching eligible players for match ID: ${matchId}`);
    
    // Step 1: Fetch match info to get team IDs
    const matchInfo = await fetchMatchInfo(matchId);

    
    if (!matchInfo ) {
      throw new Error('Invalid match info response');
    }
    
   
    const team1Id = matchInfo.team1?.teamid;
    const team2Id = matchInfo.team2?.teamid;
    const team1Name = matchInfo.team1?.teamname || matchInfo.team1?.teamsname;
    const team2Name = matchInfo.team2?.teamname || matchInfo.team2?.teamsname;
    
    if (!team1Id || !team2Id) {
      throw new Error('Could not find team IDs in match info');
    }
    
    console.log(`📋 Team 1: ${team1Name} (ID: ${team1Id}), Team 2: ${team2Name} (ID: ${team2Id})`);
    
    // Step 2: Fetch both teams' players
    const [team1Data, team2Data] = await Promise.all([
      fetchTeamPlayers(matchId, team1Id),
      fetchTeamPlayers(matchId, team2Id)
    ]);
    
    // Step 3: Extract all players from both teams
    const allPlayers: any[] = [];
    
    // Helper function to extract players from team data
    const extractPlayers = (teamData: any, teamId: number, teamName: string) => {
      if (!teamData || !teamData.player || !Array.isArray(teamData.player)) {
        return;
      }
      
      // Categories to exclude (support staff, coaches, etc.)
      const excludedCategories = ['support staff', 'coaching staff', 'coach'];
      
      // Iterate through the player categories (playing XI, bench, squad, etc.)
      teamData.player.forEach((category: any) => {
        const categoryName = (category.category || '').toLowerCase();
        
        // Skip support staff and coaching categories
        if (!excludedCategories.includes(categoryName)) {
          console.log(`📂 Processing category: "${category.category}" for team ${teamName}`);
          if (Array.isArray(category.player)) {
            console.log(`   Found ${category.player.length} players in this category`);
            category.player.forEach((player: any) => {
              allPlayers.push({
                id: player.id,
                name: player.name,
                fullName: player.name, // API doesn't have fullName, using name
                role: player.role || 'Unknown',
                teamId: teamId,
                teamName: teamName,
                category: category.category
              });
            });
          }
        } else {
          console.log(`⏭️  Skipping category: "${category.category}" (excluded)`);
        }
      });
    };
    
    // Process team 1 players
    extractPlayers(team1Data, team1Id, team1Name);
    
    // Process team 2 players
    extractPlayers(team2Data, team2Id, team2Name);
    
    console.log(`👥 Total players found: ${allPlayers.length}`);
    
    // Log all player names for debugging
    console.log('📋 All player names:', allPlayers.map(p => p.name).join(', '));
    
    // Step 4: Filter to only eligible players (those we have modules for)
    const unmatchedPlayers: string[] = [];
    const eligiblePlayers = allPlayers.filter(player => {
      const moduleName = mapPlayerNameToModuleName(player.name);
      const isEligible = moduleName && AVAILABLE_PLAYER_MODULES.includes(moduleName);
      
      if (isEligible) {
        console.log(`✓ Matched: "${player.name}" → ${moduleName}`);
      } else {
        unmatchedPlayers.push(player.name);
      }
      
      return isEligible;
    });
    
    // Log unmatched players for debugging
    if (unmatchedPlayers.length > 0) {
      console.log(`ℹ️  Unmatched players (${unmatchedPlayers.length}):`, unmatchedPlayers.join(', '));
    }
    
    // Step 5: Enrich eligible players with module name
    const enrichedPlayers = eligiblePlayers.map(player => ({
      ...player,
      moduleName: mapPlayerNameToModuleName(player.name)
    }));
    
    console.log(`✅ Eligible players found: ${enrichedPlayers.length}`);
    if (enrichedPlayers.length === 0) {
      console.log('⚠️  No eligible players matched. Check if player names match the mapping.');
    }
    
    return enrichedPlayers;
  } catch (error) {
    console.error('❌ Error fetching eligible players:', error);
    throw error;
  }
}

