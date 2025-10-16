import express from "express";
import {
  distributeContractBasedRewards,
  getAdminInfo,
  getAdminBalance,
  createRewardPool,
  getTournamentRewardPools,
  processReward,
  updateRewardStatus,
  getUserRewards,
  calculateSnapshotBasedRewards,
  checkRewardEligibility,
  getRewardSummaryForTournament,
  calculateSimpleRewards,
} from "../controllers/rewards.controller";

const router = express.Router();

// Reward distribution routes
router.post("/distribute-contract-based", distributeContractBasedRewards);
router.post("/calculate-snapshot-based", calculateSnapshotBasedRewards);
router.post("/calculate-simple", calculateSimpleRewards);

// Admin routes
router.get("/admin-info", getAdminInfo);
router.get("/admin-balance", getAdminBalance);

// Reward pool routes
router.post("/create-pool", createRewardPool);
router.get("/tournament/:tournamentId", getTournamentRewardPools);

// Reward management routes
router.post("/process/:rewardId", processReward);
router.put("/:rewardId/status", updateRewardStatus);

// User reward routes
router.get("/user/:walletAddress", getUserRewards);

// Eligibility and summary routes
router.get("/eligibility/:tournamentId/:address", checkRewardEligibility);
router.get("/summary/:tournamentId", getRewardSummaryForTournament);

export default router;
