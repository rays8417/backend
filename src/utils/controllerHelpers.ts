import { prisma } from "../prisma";

/**
 * Controller Helper Functions
 * Shared utilities used across multiple controllers to eliminate code duplication
 */

/**
 * Validate tournament exists
 * Used in: rewards, scoring, user-rewards, tournaments, live-scores controllers
 */
export const validateTournament = async (id: string, select?: any) => {
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    ...(select && { select }),
  });

  if (!tournament) {
    return { error: { status: 404, message: "Tournament not found" } };
  }

  return { tournament };
};

/**
 * Format full tournament response
 * Used in: admin, tournaments controllers
 */
export const formatTournamentResponse = (tournament: any) => ({
  id: tournament.id,
  name: tournament.name,
  description: tournament.description,
  matchDate: tournament.matchDate,
  team1: tournament.team1,
  team2: tournament.team2,
  venue: tournament.venue,
  status: tournament.status,
  entryFee: tournament.entryFee,
  maxParticipants: tournament.maxParticipants,
  currentParticipants: tournament.currentParticipants,
  rewardPools: tournament.rewardPools,
  createdAt: tournament.createdAt,
  updatedAt: tournament.updatedAt,
  ...(tournament.playerScores && { playerScores: tournament.playerScores }),
});

/**
 * Format simplified tournament info (for nested responses)
 * Used in: user-rewards, live-scores controllers
 */
export const formatTournamentInfo = (tournament: any) => ({
  id: tournament.id,
  name: tournament.name,
  team1: tournament.team1,
  team2: tournament.team2,
  matchDate: tournament.matchDate,
  status: tournament.status
});

/**
 * Format player response
 * Used in: admin, tournaments controllers
 */
export const formatPlayerResponse = (player: any) => ({
  id: player.id,
  name: player.name,
  team: player.team,
  role: player.role,
  isActive: player.isActive,
  tokenPrice: player.tokenPrice,
});

/**
 * Calculate total from amount field
 * Used in: user-rewards, rewards controllers
 */
export const calculateTotalAmount = (items: any[]) => {
  return items.reduce((sum, item) => sum + Number(item.amount), 0);
};

/**
 * Group array by key
 * Generic helper for grouping data
 */
export const groupBy = <T>(array: T[], keyGetter: (item: T) => string): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  array.forEach(item => {
    const key = keyGetter(item);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(item);
  });
  return map;
};

