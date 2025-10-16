import express from "express";
import {
  getLiveScores,
  startPollingEndpoint,
  stopPollingEndpoint,
  getPollingStatus,
  getLiveLeaderboard,
  discoverLiveMatches,
  checkMatchStatus,
} from "../controllers/live-scores.controller";

const router = express.Router();

// Live scores routes
router.get("/:tournamentId", getLiveScores);
router.post("/:tournamentId/start-polling", startPollingEndpoint);
router.post("/:tournamentId/stop-polling", stopPollingEndpoint);
router.get("/:tournamentId/leaderboard", getLiveLeaderboard);

// Status route
router.get("/", getPollingStatus);

// Discovery routes
router.get("/discover/live-matches", discoverLiveMatches);
router.get("/discover/match/:matchId", checkMatchStatus);

export default router;
