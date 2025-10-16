import express from "express";
import {
  updatePlayerScores,
  calculateUserScores,
  getTournamentScores,
} from "../controllers/scoring.controller";

const router = express.Router();

// Player scoring routes
router.post("/player-scores", updatePlayerScores);
router.post("/calculate-user-scores", calculateUserScores);

// Tournament scores routes
router.get("/tournament/:tournamentId/scores", getTournamentScores);

export default router;
