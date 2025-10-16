import { Request, Response } from "express";
import { prisma } from "../prisma";
import { formatTournamentResponse, formatPlayerResponse } from "../utils/controllerHelpers";


/**
 * POST /api/admin/tournaments
 * Create a new tournament
 */
export const createTournament = async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      matchDate,
      team1,
      team2,
      venue,
      matchId,
    } = req.body;

    // Validation
    if (!name || !matchDate || !team1 || !team2) {
      return res.status(400).json({ 
        error: "Name, match date, team1, and team2 are required" 
      });
    }

    // Create tournament
    const tournament = await prisma.tournament.create({
      data: {
        name,
        description: description || null,
        matchDate: new Date(matchDate),
        team1,
        team2,
        venue: venue || null,
        status: "UPCOMING",
        matchId: matchId || null,
      },
    });

    res.json({
      success: true,
      tournament: formatTournamentResponse(tournament),
    });
  } catch (error) {
    console.error("Tournament creation error:", error);
    res.status(500).json({ error: "Failed to create tournament" });
  }
};

/**
 * PUT /api/admin/tournaments/:id
 * Update an existing tournament
 */
export const updateTournament = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      matchDate,
      team1,
      team2,
      venue,
      entryFee,
      maxParticipants,
      status,
    } = req.body;

    // Update tournament
    const tournament = await prisma.tournament.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description && { description }),
        ...(matchDate && { matchDate: new Date(matchDate) }),
        ...(team1 && { team1 }),
        ...(team2 && { team2 }),
        ...(venue && { venue }),
        ...(entryFee !== undefined && { entryFee }),
        ...(maxParticipants !== undefined && { maxParticipants }),
        ...(status && { status }),
      },
    });

    res.json({
      success: true,
      tournament: formatTournamentResponse(tournament),
    });
  } catch (error) {
    console.error("Tournament update error:", error);
    res.status(500).json({ error: "Failed to update tournament" });
  }
};

/**
 * DELETE /api/admin/tournaments/:id
 * Delete a tournament
 */
export const deleteTournament = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if tournament exists
    const tournament = await prisma.tournament.findUnique({
      where: { id },
    });

    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    // Delete tournament
    await prisma.tournament.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: "Tournament deleted successfully",
    });
  } catch (error) {
    console.error("Tournament deletion error:", error);
    res.status(500).json({ error: "Failed to delete tournament" });
  }
};



/**
 * GET /api/admin/stats
 * Get admin statistics
 */
export const getStats = async (req: Request, res: Response) => {
  try {
    const [
      totalTournaments,
      totalRewards,
      activeTournaments,
      completedTournaments,
    ] = await Promise.all([
      prisma.tournament.count(),
      prisma.userReward.count(),
      prisma.tournament.count({ where: { status: "ONGOING" } }),
      prisma.tournament.count({ where: { status: "COMPLETED" } }),
    ]);

    res.json({
      success: true,
      stats: {
        tournaments: {
          total: totalTournaments,
          active: activeTournaments,
          completed: completedTournaments,
        },
        rewards: {
          total: totalRewards,
        },
      },
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ error: "Failed to fetch admin stats" });
  }
};
