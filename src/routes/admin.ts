import express from "express";
import {
  createTournament,
  updateTournament,
  deleteTournament,
  getStats,
} from "../controllers/admin.controller";

const router = express.Router();

// Tournament routes
router.post("/tournaments", createTournament);
router.put("/tournaments/:id", updateTournament);
router.delete("/tournaments/:id", deleteTournament);



// Statistics routes
router.get("/stats", getStats);

export default router;
