import express from 'express';
import {
  getPackTypes,
  openPack,
  getUserPacks,
  getPackDetails,
  getLatestUnopenedPack,
  buyPackWithXP
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
 * @route GET /api/packs/latest/:address
 * @desc Get latest unopened pack for user by pack type
 * @access Public
 * @query { packType: string } - Pack type (BASE, PRIME, ULTRA)
 */
router.get('/latest/:address', getLatestUnopenedPack);

/**
 * @route POST /api/packs/buy-with-xp
 * @desc Buy a player pack using XP
 * @access Public
 * @body { address: string, packType: 'BASE' | 'PRIME' | 'ULTRA' }
 */
router.post('/buy-with-xp', buyPackWithXP);

/**
 * @route GET /api/packs/:packId
 * @desc Get specific pack details
 * @access Public
 */
router.get('/:packId', getPackDetails);

export default router;