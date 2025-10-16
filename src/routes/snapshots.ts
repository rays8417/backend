import express from 'express';
import {
  createSnapshot,
  getSnapshotsForTournament,
  getSnapshotById,
  getUserHoldingsHistory,
  comparePrePostSnapshots,
  getUserHoldingsFromSnapshotEndpoint,
  validateEligibility,
  compareTwoSnapshots,
  compareAptos,
  getAptosHolders,
  getAptosHoldersByModule,
} from '../controllers/snapshots.controller';

const router = express.Router();

// Snapshot creation and retrieval routes
router.post('/create', createSnapshot);
router.get('/tournament/:tournamentId', getSnapshotsForTournament);
router.get('/:id', getSnapshotById);

// User holdings routes
router.get('/user/:userId/holdings', getUserHoldingsHistory);
router.get('/user/:address/holdings/:tournamentId', getUserHoldingsFromSnapshotEndpoint);

// Comparison routes
router.post('/compare-pre-post', comparePrePostSnapshots);
router.post('/compare', compareTwoSnapshots);
router.post('/compare-aptos', compareAptos);

// Eligibility routes
router.post('/validate-eligibility', validateEligibility);

// Aptos holder routes
router.get('/aptos-holders', getAptosHolders);
router.get('/aptos-holders/:moduleName', getAptosHoldersByModule);

export default router;
