import express from "express";
import {
  getAllTournaments,
  getTournamentById,
  getEligiblePlayersForTournament,
} from "../controllers/tournaments.controller";

const router = express.Router();

router.get("/", getAllTournaments);
router.get("/:id", getTournamentById);

router.get("/:id/eligible-players", getEligiblePlayersForTournament);

export default router;
