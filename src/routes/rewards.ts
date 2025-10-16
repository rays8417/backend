import express from "express";
import {
  distributeSnapshotBasedRewards,
  getAdminInfo,
  getAdminBalance,
  createRewardPool,
  processReward,
  updateRewardStatus,
  getUserRewards,
  calculateSnapshotBasedRewards,
  checkRewardEligibility,
  getRewardSummaryForTournament,
} from "../controllers/rewards.controller";

const router = express.Router();

router.post("/distribute-snapshot-based", distributeSnapshotBasedRewards);
router.post("/calculate-snapshot-based", calculateSnapshotBasedRewards);

router.get("/admin-info", getAdminInfo);
router.get("/admin-balance", getAdminBalance);

router.post("/create-pool", createRewardPool);

// Reward management routes
router.post("/process/:rewardId", processReward);
router.put("/:rewardId/status", updateRewardStatus);

// User reward routes
router.get("/user/:walletAddress", getUserRewards);

// Eligibility and summary routes
router.get("/eligibility/:tournamentId/:address", checkRewardEligibility);
router.get("/summary/:tournamentId", getRewardSummaryForTournament);

export default router;
