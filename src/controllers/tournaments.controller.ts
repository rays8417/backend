import { Request, Response } from "express";
import { prisma } from "../prisma";
import { getEligiblePlayers } from "../services/cricketApiService";
import { blockchain } from "../blockchain";
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
 * GET /api/tournaments/:id/eligible-players
 * Get eligible players for tournament from database
 */
export const getEligiblePlayersForTournament = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { address } = req.query;

    // Get tournament details including eligiblePlayers
    const validation = await validateTournament(id, {
      matchId: true,
      name: true,
      team1: true,
      team2: true,
      status: true,
      eligiblePlayers: true
    });

    if (validation.error) {
      return res.status(validation.error.status).json({ error: validation.error.message });
    }

    const tournament = validation.tournament!;

    // Check if eligible players are stored in database
    if (!tournament.eligiblePlayers || tournament.eligiblePlayers.length === 0) {
      return res.status(404).json({
        error: "No eligible players found",
        message: "Eligible players have not been stored for this tournament yet. Please call the store-eligible-players endpoint first.",
        suggestion: `POST /api/tournaments/${id}/store-eligible-players`
      });
    }

    console.log(`📋 Found ${tournament.eligiblePlayers.length} eligible players in database for tournament: ${tournament.name}`);

    // Create player objects from stored module names
    // Note: We only have module names stored, so we'll create basic player objects
    const eligiblePlayers = tournament.eligiblePlayers.map((moduleName, index) => ({
      id: `stored-${index}`,
      name: moduleName, // Using moduleName as name since we don't store the original name
      moduleName: moduleName,
      role: 'Unknown', // We don't store role in the current schema
      teamName: 'Unknown', // We don't store team info in the current schema
      teamId: 0 // We don't store team ID in the current schema
    }));

    // If address is provided, fetch holdings for each eligible player
    let playersWithHoldings = eligiblePlayers;
    
    if (address && typeof address === 'string') {
      console.log(`🔍 Fetching holdings for address: ${address}`);
      
      try {
        // Fetch all holdings for this address (blockchain-agnostic)
        const holdings = await blockchain.getBalanceForAllPlayers(address);
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
      players: playersWithHoldings.map(formatEligiblePlayerResponse),
      note: "Players fetched from database. For detailed player info, use the store-eligible-players endpoint."
    });
  } catch (error: any) {
    console.error("Eligible players fetch error:", error);
    res.status(500).json({ 
      error: "Failed to fetch eligible players",
      details: error.message
    });
  }
};

/**
 * POST /api/tournaments/:id/store-eligible-players
 * Fetch eligible players from Cricbuzz API and store them in the database
 */
export const storeEligiblePlayersForTournament = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

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

    console.log(`🔄 Fetching eligible players for tournament: ${tournament.name} (Match ID: ${tournament.matchId})`);

    // Fetch eligible players from Cricbuzz API
    const eligiblePlayers = await getEligiblePlayers(Number(tournament.matchId));

    if (!eligiblePlayers || eligiblePlayers.length === 0) {
      return res.status(404).json({
        error: "No eligible players found",
        message: "No players were found for this match or no players matched our module system"
      });
    }

    // Extract module names for storage
    const moduleNames = eligiblePlayers.map(player => player.moduleName).filter(Boolean);

    // Update tournament with eligible players
    const updatedTournament = await prisma.tournament.update({
      where: { id },
      data: {
        eligiblePlayers: moduleNames
      },
      select: {
        id: true,
        name: true,
        team1: true,
        team2: true,
        status: true,
        eligiblePlayers: true,
        updatedAt: true
      }
    });

    console.log(`✅ Stored ${moduleNames.length} eligible players for tournament ${tournament.name}`);

    res.json({
      success: true,
      message: `Successfully stored ${moduleNames.length} eligible players`,
      tournament: {
        id: updatedTournament.id,
        name: updatedTournament.name,
        team1: updatedTournament.team1,
        team2: updatedTournament.team2,
        status: updatedTournament.status,
        eligiblePlayersCount: moduleNames.length,
        lastUpdated: updatedTournament.updatedAt
      },
      players: eligiblePlayers.map(formatEligiblePlayerResponse)
    });

  } catch (error: any) {
    console.error("Store eligible players error:", error);
    res.status(500).json({ 
      error: "Failed to store eligible players",
      details: error.message
    });
  }
};

