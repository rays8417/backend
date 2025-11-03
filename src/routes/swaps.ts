import express from 'express';
import {
  createSwapTransaction,
  getUserSwapTransactions,
  getSwapTransaction,
  getUserSwapStats
} from '../controllers/swaps.controller';

const router = express.Router();

/**
 * @route POST /api/swaps
 * @desc Create a new swap transaction
 * @access Public
 * @body { 
 *   address: string, 
 *   tokenA: string, 
 *   tokenB: string, 
 *   tokenAmountA: number, 
 *   tokenAmountB: number, 
 *   swapDirection: 'FROM_BOSON_TO_PLAYER' | 'FROM_PLAYER_TO_BOSON',
 *   transactionId?: string 
 * }
 */
router.post('/', createSwapTransaction);

/**
 * @route GET /api/swaps/user/:address
 * @desc Get swap transactions for a user
 * @access Public
 * @query { direction?: 'FROM_BOSON_TO_PLAYER' | 'FROM_PLAYER_TO_BOSON', limit?: number, offset?: number }
 */
router.get('/user/:address', getUserSwapTransactions);

/**
 * @route GET /api/swaps/user/:address/stats
 * @desc Get swap statistics for a user
 * @access Public
 */
router.get('/user/:address/stats', getUserSwapStats);

/**
 * @route GET /api/swaps/:swapId
 * @desc Get specific swap transaction details
 * @access Public
 */
router.get('/:swapId', getSwapTransaction);

export default router;

