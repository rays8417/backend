import express from "express";
import {
  getAllTournaments,
  getTournamentById,
  getEligiblePlayersForTournament,
  storeEligiblePlayersForTournament,
} from "../controllers/tournaments.controller";

const router = express.Router();

router.get("/", getAllTournaments);
router.get("/:id", getTournamentById);

router.get("/:id/eligible-players", getEligiblePlayersForTournament);
router.post("/:id/store-eligible-players", storeEligiblePlayersForTournament);

export default router;
