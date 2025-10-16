import { Request, Response } from "express";
import { prisma } from "../prisma";
import { parseScorecard, CricketPlayerScore, fetchLiveMatches } from "../services/cricketApiService";
import { calculateFantasyPoints } from "../utils/fantasyPointsCalculator";
import { formatTournamentInfo, validateTournament } from "../utils/controllerHelpers";

/**
 * Live Scores Controller
 * Handles live cricket score fetching, polling, and leaderboard generation
 */

// Types
interface LiveScoreCache {
  tournamentId: string;
  matchId: number;
  lastUpdated: Date;
  scores: PlayerFantasyScore[];
  pollingActive: boolean;
}

interface PlayerFantasyScore {
  moduleName: string;
  runs: number;
  ballsFaced: number;
  wickets: number;
  oversBowled: number;
  runsConceded: number;
  catches: number;
  stumpings: number;
  runOuts: number;
  fantasyPoints: number;
  breakdown: {
    batting: number;
    bowling: number;
    fielding: number;
  };
}

// Cache storage
const liveScoreCache = new Map<string, LiveScoreCache>();
const pollingIntervals = new Map<string, NodeJS.Timeout>();

// Helper Functions

/**
 * Calculate fantasy points for a player
 */
const calculatePlayerFantasyScore = (player: CricketPlayerScore): PlayerFantasyScore => {
  const pointsBreakdown = calculateFantasyPoints({
    runs: player.runs,
    ballsFaced: player.ballsFaced,
    wickets: player.wickets,
    oversBowled: player.oversBowled,
    runsConceded: player.runsConceded,
    catches: player.catches,
    stumpings: player.stumpings,
    runOuts: player.runOuts,
  });

  return {
    moduleName: player.moduleName,
    runs: player.runs,
    ballsFaced: player.ballsFaced,
    wickets: player.wickets,
    oversBowled: player.oversBowled,
    runsConceded: player.runsConceded,
    catches: player.catches,
    stumpings: player.stumpings,
    runOuts: player.runOuts,
    fantasyPoints: pointsBreakdown.total,
    breakdown: {
      batting: pointsBreakdown.batting,
      bowling: pointsBreakdown.bowling,
      fielding: pointsBreakdown.fielding,
    },
  };
};

/**
 * Fetch live scores from API
 */
const fetchLiveScores = async (tournamentId: string, matchId: number): Promise<PlayerFantasyScore[]> => {
  console.log(`📡 Fetching live scores for tournament ${tournamentId}, match ${matchId}`);
  const playerScores = await parseScorecard(matchId);
  const fantasyScores = playerScores.map(calculatePlayerFantasyScore);
  console.log(`✅ Successfully fetched ${fantasyScores.length} player scores`);
  return fantasyScores;
};

/**
 * Start polling for live scores
 */
const startPolling = async (tournamentId: string, matchId: number, intervalMinutes: number = 5) => {
  stopPolling(tournamentId);
  console.log(`🔄 Starting live score polling for tournament ${tournamentId} every ${intervalMinutes} minutes`);
  
  // Initial fetch
  try {
    const scores = await fetchLiveScores(tournamentId, matchId);
    liveScoreCache.set(tournamentId, {
      tournamentId,
      matchId,
      lastUpdated: new Date(),
      scores,
      pollingActive: true,
    });
  } catch (error) {
    console.error('❌ Initial fetch failed:', error);
  }
  
  // Set up polling interval
  const interval = setInterval(async () => {
    try {
      console.log(`🔄 Polling live scores for tournament ${tournamentId}...`);
      const scores = await fetchLiveScores(tournamentId, matchId);
      
      liveScoreCache.set(tournamentId, {
        tournamentId,
        matchId,
        lastUpdated: new Date(),
        scores,
        pollingActive: true,
      });
      
      console.log(`✅ Updated live scores at ${new Date().toISOString()}`);
    } catch (error) {
      console.error('❌ Polling error:', error);
    }
  }, intervalMinutes * 60 * 1000);
  
  pollingIntervals.set(tournamentId, interval);
};

/**
 * Stop polling for a tournament
 */
const stopPolling = (tournamentId: string) => {
  const interval = pollingIntervals.get(tournamentId);
  if (interval) {
    clearInterval(interval);
    pollingIntervals.delete(tournamentId);
    
    const cache = liveScoreCache.get(tournamentId);
    if (cache) {
      cache.pollingActive = false;
      liveScoreCache.set(tournamentId, cache);
    }
    
    console.log(`⏹️  Stopped polling for tournament ${tournamentId}`);
  }
};

/**
 * Validate tournament for live scores - extends shared validation
 */
const validateTournamentForLiveScores = async (tournamentId: string) => {
  const validation = await validateTournament(tournamentId, {
    id: true,
    name: true,
    matchId: true,
    status: true,
    team1: true,
    team2: true,
    matchDate: true,
  });

  if (validation.error) {
    return validation;
  }

  const tournament = validation.tournament!;

  if (!tournament.matchId) {
    return { 
      error: { 
        status: 400, 
        message: "Tournament does not have a match ID",
        details: "Cannot fetch live scores without a valid match ID"
      } 
    };
  }

  if (tournament.status !== 'ONGOING') {
    return { 
      error: { 
        status: 400, 
        message: "Tournament is not ongoing",
        details: `Tournament status is ${tournament.status}. Live scores are only available for ONGOING tournaments.`
      } 
    };
  }

  return { tournament };
};

/**
 * Parse live matches from API response - eliminates duplicate parsing logic
 */
const parseLiveMatchesResponse = (liveMatches: any) => {
  const matches: any = [];
  
  if (!liveMatches?.typeMatches) return matches;

  for (const typeMatch of liveMatches.typeMatches) {
    if (!typeMatch.seriesMatches) continue;
    
    for (const seriesMatch of typeMatch.seriesMatches) {
      if (!seriesMatch.seriesAdWrapper?.matches) continue;
      
      for (const match of seriesMatch.seriesAdWrapper.matches) {
        if (match.matchInfo) {
          matches.push({
            matchId: match.matchInfo.matchId,
            matchDesc: match.matchInfo.matchDesc,
            matchFormat: match.matchInfo.matchFormat,
            team1: match.matchInfo.team1?.teamName || 'TBD',
            team2: match.matchInfo.team2?.teamName || 'TBD',
            seriesName: match.matchInfo.seriesName,
            venue: match.matchInfo.venueInfo?.ground || 'Unknown',
            status: match.matchInfo.status,
            state: match.matchInfo.state,
            isLive: match.matchInfo.state === 'In Progress' || match.matchInfo.state === 'Live',
          });
        }
      }
    }
  }
  
  return matches;
};

/**
 * Colored console log helper
 */
const log = (message: string, color: 'blue' | 'green' | 'yellow' | 'red' = 'blue') => {
  const colors = {
    blue: '\x1b[34m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[color]}${message}${colors.reset}`);
};

// Controller Functions

/**
 * GET /api/live-scores/:tournamentId
 * Get live scores for ongoing tournament
 */
export const getLiveScores = async (req: Request, res: Response) => {
  try {
    const { tournamentId } = req.params;
    const { startPolling: shouldStartPolling, intervalMinutes } = req.query;
    
    // Validate tournament
    const validation = await validateTournamentForLiveScores(tournamentId);
    if (validation.error) {
      return res.status(validation.error.status).json({ 
        success: false,
        error: validation.error.message,
        ...('details' in validation.error && validation.error.details && { message: validation.error.details })
      });
    }

    const tournament = validation.tournament!;
    const matchId = Number(tournament.matchId);
    
    // Start polling if requested
    if (shouldStartPolling === 'true') {
      const interval = intervalMinutes ? Number(intervalMinutes) : 5;
      await startPolling(tournamentId, matchId, interval);
    }
    
    // Check cache
    const cached = liveScoreCache.get(tournamentId);
    if (cached) {
      return res.json({
        success: true,
        tournament: formatTournamentInfo(tournament),
        matchId: cached.matchId,
        lastUpdated: cached.lastUpdated,
        pollingActive: cached.pollingActive,
        note: "Only showing eligible players (those available in our module system)",
        totalEligiblePlayers: cached.scores.length,
        players: cached.scores.sort((a, b) => b.fantasyPoints - a.fantasyPoints),
      });
    }
    
    // Fetch fresh scores
    console.log(`📡 Fetching fresh live scores for tournament ${tournamentId}`);
    const scores = await fetchLiveScores(tournamentId, matchId);
    
    // Cache scores
    liveScoreCache.set(tournamentId, {
      tournamentId,
      matchId,
      lastUpdated: new Date(),
      scores,
      pollingActive: false,
    });
    
    res.json({
      success: true,
      tournament: formatTournamentInfo(tournament),
      matchId,
      lastUpdated: new Date(),
      pollingActive: false,
      note: "Only showing eligible players (those available in our module system)",
      totalEligiblePlayers: scores.length,
      players: scores.sort((a, b) => b.fantasyPoints - a.fantasyPoints),
    });
  } catch (error: any) {
    console.error("Live scores fetch error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch live scores",
      details: error.message
    });
  }
};

/**
 * POST /api/live-scores/:tournamentId/start-polling
 * Start automatic polling for live scores
 */
export const startPollingEndpoint = async (req: Request, res: Response) => {
  try {
    const { tournamentId } = req.params;
    const { intervalMinutes = 5 } = req.body;
    
    // Validate tournament
    const validation = await validateTournamentForLiveScores(tournamentId);
    if (validation.error) {
      return res.status(validation.error.status).json({ 
        success: false,
        error: validation.error.message,
        ...('details' in validation.error && validation.error.details && { message: validation.error.details })
      });
    }

    const tournament = validation.tournament!;
    const matchId = Number(tournament.matchId);
    
    // Start polling
    await startPolling(tournamentId, matchId, intervalMinutes);
    
    res.json({
      success: true,
      message: `Started polling for tournament ${tournament.name}`,
      tournamentId,
      matchId,
      intervalMinutes,
      pollingActive: true,
    });
  } catch (error: any) {
    console.error("Start polling error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to start polling",
      details: error.message
    });
  }
};

/**
 * POST /api/live-scores/:tournamentId/stop-polling
 * Stop automatic polling for live scores
 */
export const stopPollingEndpoint = async (req: Request, res: Response) => {
  try {
    const { tournamentId } = req.params;
    stopPolling(tournamentId);
    
    res.json({
      success: true,
      message: `Stopped polling for tournament ${tournamentId}`,
      tournamentId,
      pollingActive: false,
    });
  } catch (error: any) {
    console.error("Stop polling error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to stop polling",
      details: error.message
    });
  }
};

/**
 * GET /api/live-scores/status
 * Get polling status for all tournaments
 */
export const getPollingStatus = async (req: Request, res: Response) => {
  try {
    const activePolls = Array.from(liveScoreCache.values()).map(cache => ({
      tournamentId: cache.tournamentId,
      matchId: cache.matchId,
      lastUpdated: cache.lastUpdated,
      pollingActive: cache.pollingActive,
      totalPlayers: cache.scores.length,
    }));
    
    res.json({
      success: true,
      totalActivePolls: activePolls.filter(p => p.pollingActive).length,
      totalCached: activePolls.length,
      polls: activePolls,
    });
  } catch (error: any) {
    console.error("Status fetch error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch polling status",
      details: error.message
    });
  }
};

/**
 * GET /api/live-scores/:tournamentId/leaderboard
 * Get live leaderboard with user scores
 */
export const getLiveLeaderboard = async (req: Request, res: Response) => {
  try {
    const { tournamentId } = req.params;
    
    // Check cache
    const cached = liveScoreCache.get(tournamentId);
    if (!cached) {
      return res.status(404).json({ 
        success: false,
        error: "No live scores available. Please fetch live scores first.",
        hint: `Call GET /api/live-scores/${tournamentId} first`
      });
    }
    
    // Get tournament
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        name: true,
        team1: true,
        team2: true,
        status: true,
      },
    });
    
    if (!tournament) {
      return res.status(404).json({ 
        success: false,
        error: "Tournament not found" 
      });
    }
    
    // Import service dynamically to avoid circular dependencies
    const { getTokenHoldersWithBalances } = await import("../services/aptosService");
    const tokenHolders = await getTokenHoldersWithBalances();
    
    // Group by address
    const holdersByAddress = new Map<string, any[]>();
    tokenHolders.forEach(holder => {
      if (!holdersByAddress.has(holder.address)) {
        holdersByAddress.set(holder.address, []);
      }
      holdersByAddress.get(holder.address)!.push(holder);
    });
    
    // Calculate scores
    const leaderboard = [];
    for (const [address, holdings] of holdersByAddress) {
      let totalScore = 0;
      const playerScores = [];
      
      for (const holding of holdings) {
        const playerScore = cached.scores.find(ps => ps.moduleName === holding.moduleName);
        if (playerScore) {
          const tokenRatio = Number(holding.balance) / 100000000;
          const weightedPoints = playerScore.fantasyPoints * tokenRatio;
          
          totalScore += weightedPoints;
          playerScores.push({
            moduleName: holding.moduleName,
            tokens: holding.balance,
            fantasyPoints: playerScore.fantasyPoints,
            weightedPoints: Math.round(weightedPoints * 100) / 100,
          });
        }
      }
      
      if (totalScore > 0) {
        leaderboard.push({
          address,
          totalScore: Math.round(totalScore * 100) / 100,
          totalHoldings: holdings.length,
          playerScores,
        });
      }
    }
    
    // Sort and rank
    leaderboard.sort((a, b) => b.totalScore - a.totalScore);
    const rankedLeaderboard = leaderboard.map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }));
    
    res.json({
      success: true,
      tournament: formatTournamentInfo(tournament),
      lastUpdated: cached.lastUpdated,
      pollingActive: cached.pollingActive,
      totalParticipants: rankedLeaderboard.length,
      leaderboard: rankedLeaderboard,
    });
  } catch (error: any) {
    console.error("Leaderboard fetch error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch leaderboard",
      details: error.message
    });
  }
};

/**
 * GET /api/live-scores/discover/live-matches
 * Discover all currently live matches from Cricbuzz
 */
export const discoverLiveMatches = async (req: Request, res: Response) => {
  try {
    log('📡 Fetching all live matches from Cricbuzz API...', 'blue');
    
    const liveMatches = await fetchLiveMatches();
    const matches = parseLiveMatchesResponse(liveMatches);
    
    log(`✅ Found ${matches.length} live matches`, 'green');
    
    res.json({
      success: true,
      totalMatches: matches.length,
      matches,
      hint: "Use matchId to create or update your tournament"
    });
  } catch (error: any) {
    console.error("Live matches fetch error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch live matches",
      details: error.message,
      hint: "Check your RAPIDAPI_KEY in .env file"
    });
  }
};

/**
 * GET /api/live-scores/discover/match/:matchId
 * Check if a specific match is live
 */
export const checkMatchStatus = async (req: Request, res: Response) => {
  try {
    const { matchId } = req.params;
    
    log(`🔍 Checking if match ${matchId} is live...`, 'blue');
    
    const liveMatches = await fetchLiveMatches();
    const matches = parseLiveMatchesResponse(liveMatches);
    
    // Find specific match
    const foundMatch = matches.find((m: any )=> m.matchId == matchId);
    
    if (foundMatch) {
      log(`✅ Match ${matchId} found - Status: ${foundMatch.state}`, 'green');
      res.json({
        success: true,
        found: true,
        match: foundMatch,
        recommendation: foundMatch.isLive 
          ? "This match is live! You can start polling for scores."
          : `Match status is "${foundMatch.state}". Polling may not return live data.`
      });
    } else {
      log(`⚠️  Match ${matchId} not found in live matches`, 'yellow');
      res.json({
        success: true,
        found: false,
        matchId,
        message: "Match not found in currently live matches",
        hint: "The match may not have started yet, or it might have completed. Check Cricbuzz website for match status."
      });
    }
  } catch (error: any) {
    console.error("Match check error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to check match status",
      details: error.message
    });
  }
};

