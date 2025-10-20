import express from 'express';
import {
  getPackTypes,
  purchasePack,
  detectBosonTransfer,
  triggerFromEvent,
} from '../controllers/packs.controller';

const router = express.Router();

// Pack information routes
router.get('/types', getPackTypes);

// Pack purchase routes
router.post('/purchase', purchasePack);

// Boson transfer detection (for webhooks or monitoring)
router.post('/detect-transfer', detectBosonTransfer);

// Trigger pack purchase from contract event
router.post('/trigger-from-event', triggerFromEvent);

export default router;
