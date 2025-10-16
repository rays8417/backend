import express from 'express';
import {
  getUserRewards,
  getUserRewardForTournament,
  getLeaderboard,
  getTournamentLeaderboard,
} from '../controllers/user-rewards.controller';

const router = express.Router();

// User reward routes
router.get('/:address', getUserRewards);
router.get('/address/:address/tournament/:tournamentId', getUserRewardForTournament);

// Tournament reward routes

// Leaderboard routes
router.get('/leaderboard/alltime', getLeaderboard);
router.get('/leaderboard/:tournamentId', getTournamentLeaderboard);

export default router;
