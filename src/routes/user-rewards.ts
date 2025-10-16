import express from 'express';
import {
  getUserRewards,
  getTournamentRewards,
  getUserRewardForTournament,
  getUniversalLeaderboard,
  getTournamentLeaderboard,
} from '../controllers/user-rewards.controller';

const router = express.Router();

// User reward routes
router.get('/:address', getUserRewards);
router.get('/address/:address/tournament/:tournamentId', getUserRewardForTournament);

// Tournament reward routes
router.get('/tournament/:tournamentId', getTournamentRewards);

// Leaderboard routes
router.get('/leaderboard/universal', getUniversalLeaderboard);
router.get('/leaderboard/:tournamentId', getTournamentLeaderboard);

export default router;
