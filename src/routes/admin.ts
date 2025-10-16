import express from "express";
import {
  createTournament,
  updateTournament,
  deleteTournament,
  createPlayer,
  updatePlayer,
  getStats,
} from "../controllers/admin.controller";

const router = express.Router();

// Tournament routes
router.post("/tournaments", createTournament);
router.put("/tournaments/:id", updateTournament);
router.delete("/tournaments/:id", deleteTournament);


// Player routes
router.post("/players", createPlayer);
router.put("/players/:id", updatePlayer);

// Statistics routes
router.get("/stats", getStats);

export default router;
