import express from "express";
import {
  getAllTournaments,
  getTournamentById,
  getTournamentPlayers,
  getEligiblePlayersForTournament,
} from "../controllers/tournaments.controller";

const router = express.Router();

// Tournament routes
router.get("/", getAllTournaments);
router.get("/:id", getTournamentById);

// Player routes
router.get("/:id/players", getTournamentPlayers);
router.get("/:id/eligible-players", getEligiblePlayersForTournament);

export default router;
