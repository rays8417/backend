/**
 * Fantasy Points Calculator
 * 
 * Shared utility for calculating fantasy points based on cricket performance
 * Used by both scoring routes and live scores polling
 */

export interface PlayerPerformance {
  runs: number;
  ballsFaced: number;
  wickets: number;
  oversBowled: number;
  runsConceded: number;
  catches: number;
  stumpings: number;
  runOuts: number;
}

export interface FantasyPointsBreakdown {
  batting: number;
  bowling: number;
  fielding: number;
  total: number;
}

/**
 * Calculate fantasy points based on cricket scoring system
 * 
 * @param performance - Player's cricket performance stats
 * @returns Fantasy points with detailed breakdown
 */
export function calculateFantasyPoints(performance: PlayerPerformance): FantasyPointsBreakdown {
  let battingPoints = 0;
  let bowlingPoints = 0;
  let fieldingPoints = 0;

  // ===== BATTING POINTS =====
  
  // Base: 1 point per run
  battingPoints += performance.runs * 1;
  
  // Bonus for staying at crease: 1 point per 2 balls faced
  battingPoints += Math.floor(performance.ballsFaced / 2) * 1;
  
  // Milestone bonuses
  if (performance.runs >= 100) {
    battingPoints += 16; // Century bonus
  } else if (performance.runs >= 50) {
    battingPoints += 8; // Half-century bonus
  }
  
  // Strike rate bonus (if faced enough balls)
  if (performance.ballsFaced >= 10) {
    const strikeRate = (performance.runs / performance.ballsFaced) * 100;
    if (strikeRate >= 200) {
      battingPoints += 6;
    } else if (strikeRate >= 150) {
      battingPoints += 4;
    } else if (strikeRate >= 100) {
      battingPoints += 2;
    }
  }

  // ===== BOWLING POINTS =====
  
  // Base: 25 points per wicket
  bowlingPoints += performance.wickets * 25;
  
  // Bonus for bowling: 1 point per 2 balls bowled (6 balls = 1 over)
  bowlingPoints += Math.floor(performance.oversBowled * 2) * 1;
  
  // Wicket haul bonuses
  if (performance.wickets >= 5) {
    bowlingPoints += 16; // 5-wicket haul
  } else if (performance.wickets >= 3) {
    bowlingPoints += 8; // 3+ wickets
  }
  
  // Economy rate bonus (if bowled at least 2 overs)
  if (performance.oversBowled >= 2) {
    const economy = performance.runsConceded / performance.oversBowled;
    if (economy < 4) {
      bowlingPoints += 6;
    } else if (economy < 6) {
      bowlingPoints += 4;
    } else if (economy < 8) {
      bowlingPoints += 2;
    }
  }

  // ===== FIELDING POINTS =====
  
  fieldingPoints += performance.catches * 8;      // 8 points per catch
  fieldingPoints += performance.stumpings * 10;   // 10 points per stumping
  fieldingPoints += performance.runOuts * 6;      // 6 points per run out

  // ===== TOTAL =====
  
  const total = battingPoints + bowlingPoints + fieldingPoints;

  return {
    batting: Math.round(battingPoints * 100) / 100,
    bowling: Math.round(bowlingPoints * 100) / 100,
    fielding: Math.round(fieldingPoints * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

/**
 * Calculate just the total fantasy points without breakdown
 * 
 * @param performance - Player's cricket performance stats
 * @returns Total fantasy points
 */
export function calculateTotalFantasyPoints(performance: PlayerPerformance): number {
  const breakdown = calculateFantasyPoints(performance);
  return breakdown.total;
}

