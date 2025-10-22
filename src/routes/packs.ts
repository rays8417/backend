import express from 'express';
import {
  getPackTypes,
  openPack,
  getUserPacks,
  getPackDetails
} from '../controllers/packs.controller';

const router = express.Router();

/**
 * @route GET /api/packs/types
 * @desc Get available pack types and their information
 * @access Public
 */
router.get('/types', getPackTypes);

/**
 * @route POST /api/packs/open
 * @desc Open a player pack and transfer tokens to user
 * @access Public
 * @body { packId: string, adminPrivateKey: string }
 */
router.post('/open', openPack);

/**
 * @route GET /api/packs/user/:address
 * @desc Get user's packs (opened and unopened)
 * @access Public
 * @query { opened?: boolean }
 */
router.get('/user/:address', getUserPacks);

/**
 * @route GET /api/packs/:packId
 * @desc Get specific pack details
 * @access Public
 */
router.get('/:packId', getPackDetails);

export default router;