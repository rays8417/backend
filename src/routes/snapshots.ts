import express from 'express';
import {
  createSnapshot,
  getSnapshotsForTournament,
  getSnapshotById,
  getUserHoldingsHistory,
  getUserHoldingsFromSnapshotEndpoint,
  validateEligibility,
  getTokenHoldersByModule,
} from '../controllers/snapshots.controller';

const router = express.Router();

// Snapshot creation and retrieval routes
router.post('/create', createSnapshot);
router.get('/tournament/:tournamentId', getSnapshotsForTournament);
router.get('/:id', getSnapshotById);

// User holdings routes
router.get('/user/:userId/holdings', getUserHoldingsHistory);
router.get('/user/:address/holdings/:tournamentId', getUserHoldingsFromSnapshotEndpoint);

// Eligibility routes
router.post('/validate-eligibility', validateEligibility);

router.get('/token-holders/:moduleName', getTokenHoldersByModule);

export default router;
