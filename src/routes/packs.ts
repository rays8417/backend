import express from 'express';
import {
  getPackTypes,
} from '../controllers/packs.controller';

const router = express.Router();

// Pack information routes
router.get('/types', getPackTypes);

// Note: Pack purchases are triggered automatically by ContractEventService
// when the smart contract emits a pack purchase event.
// No manual endpoints are needed for pack purchases.

export default router;
