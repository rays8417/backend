import { Request, Response } from "express";
import { prisma } from "../prisma";
import { getEligiblePlayers } from "../services/cricketApiService";
import { getTokenBalanceFromAllModules } from "../services/aptosService";
import { formatTournamentResponse, formatPlayerResponse, validateTournament } from "../utils/controllerHelpers";

/**
 * Tournaments Controller
 * Handles tournament retrieval, player listings, and eligible player fetching
 */

// Helper Functions

/**
 * Format eligible player response - specific to this controller
 */
const formatEligiblePlayerResponse = (player: any) => ({
  id: player.id,
  name: player.name,
  moduleName: player.moduleName,
  role: player.role,
  teamName: player.teamName,
  teamId: player.teamId,
  holdings: player.holdings ? player.holdings.toString() : undefined,
  formattedHoldings: player.formattedHoldings || undefined
});

// Controller Functions

/**
 * GET /api/tournaments
 * Get all tournaments
 */
export const getAllTournaments = async (req: Request, res: Response) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;

    const tournaments = await prisma.tournament.findMany({
      where: status ? { status: status as any } : {},
      include: {
        rewardPools: {
          select: {
            id: true,
            name: true,
            totalAmount: true,
            distributedAmount: true,
          },
        },
      },
      orderBy: { matchDate: "desc" },
      take: Number(limit),
      skip: Number(offset),
    });

    res.json({
      success: true,
      tournaments: tournaments.map(formatTournamentResponse),
    });
  } catch (error) {
    console.error("Tournaments fetch error:", error);
    res.status(500).json({ error: "Failed to fetch tournaments" });
  }
};

/**
 * GET /api/tournaments/:id
 * Get tournament details
 */
export const getTournamentById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        rewardPools: {
          include: {
            rewards: true,
          },
        },
        playerScores: true,
      },
    });

    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    res.json({
      success: true,
      tournament: formatTournamentResponse(tournament),
    });
  } catch (error) {
    console.error("Tournament fetch error:", error);
    res.status(500).json({ error: "Failed to fetch tournament" });
  }
};

/**
 * GET /api/tournaments/:id/players
 * Get available players for tournament
 */
export const getTournamentPlayers = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const validation = await validateTournament(id, { team1: true, team2: true });
    if (validation.error) {
      return res.status(validation.error.status).json({ error: validation.error.message });
    }

    const tournament = validation.tournament!;

    const players = await prisma.player.findMany({
      where: {
        team: {
          in: [tournament.team1, tournament.team2],
        },
        isActive: true,
      },
      orderBy: [{ team: "asc" }, { role: "asc" }, { tokenPrice: "desc" }],
    });

    res.json({
      success: true,
      players: players.map(formatPlayerResponse),
    });
  } catch (error) {
    console.error("Players fetch error:", error);
    res.status(500).json({ error: "Failed to fetch players" });
  }
};

/**
 * GET /api/tournaments/:id/eligible-players
 * Get eligible players for tournament from Cricbuzz
 */
export const getEligiblePlayersForTournament = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { address } = req.query;

    // Get tournament details including matchId
    const validation = await validateTournament(id, {
      matchId: true,
      name: true,
      team1: true,
      team2: true,
      status: true
    });

    if (validation.error) {
      return res.status(validation.error.status).json({ error: validation.error.message });
    }

    const tournament = validation.tournament!;

    if (!tournament.matchId) {
      return res.status(400).json({ 
        error: "Tournament does not have a match ID",
        message: "Cannot fetch players without a valid match ID"
      });
    }

    // Fetch eligible players from Cricbuzz API
    const eligiblePlayers = await getEligiblePlayers(Number(tournament.matchId));

    // If address is provided, fetch holdings for each eligible player
    let playersWithHoldings = eligiblePlayers;
    
    if (address && typeof address === 'string') {
      console.log(`🔍 Fetching holdings for address: ${address}`);
      
      try {
        // Fetch all holdings for this address
        const holdings = await getTokenBalanceFromAllModules(address);
        console.log(`📊 Found ${holdings.length} holdings for address`);
        
        // Create a map of moduleName to balance for quick lookup
        const holdingsMap = new Map(
          holdings.map(h => [h.moduleName, h.balance])
        );
        
        // Add holdings to each eligible player
        playersWithHoldings = eligiblePlayers.map(player => ({
          ...player,
          holdings: holdingsMap.get(player.moduleName) || BigInt(0),
          formattedHoldings: ((Number(holdingsMap.get(player.moduleName) || BigInt(0))) / 100000000).toFixed(2)
        }));
        
        console.log(`✅ Added holdings data to ${playersWithHoldings.length} players`);
      } catch (holdingsError) {
        console.error("Error fetching holdings:", holdingsError);
        // Continue without holdings data if there's an error
      }
    }

    res.json({
      success: true,
      tournament: {
        id,
        name: tournament.name,
        team1: tournament.team1,
        team2: tournament.team2,
        status: tournament.status
      },
      address: address || null,
      totalPlayers: playersWithHoldings.length,
      players: playersWithHoldings.map(formatEligiblePlayerResponse)
    });
  } catch (error: any) {
    console.error("Eligible players fetch error:", error);
    res.status(500).json({ 
      error: "Failed to fetch eligible players",
      details: error.message
    });
  }
};

