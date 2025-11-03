import { Request, Response } from 'express';
import { SwapDirection } from '@prisma/client';
import { prisma } from '../prisma';

/**
 * Create a new swap transaction
 * POST /api/swaps
 */
export const createSwapTransaction = async (req: Request, res: Response) => {
  try {
    const { address, tokenA, tokenB, tokenAmountA, tokenAmountB, swapDirection, transactionId } = req.body;

    // Validate required fields
    if (!address || !tokenA || !tokenB || !tokenAmountA || !tokenAmountB || !swapDirection) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: address, tokenA, tokenB, tokenAmountA, tokenAmountB, swapDirection'
      });
    }

    // Validate swap direction
    const validDirections = ['FROM_BOSON_TO_PLAYER', 'FROM_PLAYER_TO_BOSON'];
    if (!validDirections.includes(swapDirection)) {
      return res.status(400).json({
        success: false,
        error: `Invalid swapDirection. Must be one of: ${validDirections.join(', ')}`
      });
    }

    // Validate amounts are positive integers
    if (typeof tokenAmountA !== 'number' || tokenAmountA <= 0 || !Number.isInteger(tokenAmountA)) {
      return res.status(400).json({
        success: false,
        error: 'tokenAmountA must be a positive integer'
      });
    }

    if (typeof tokenAmountB !== 'number' || tokenAmountB <= 0 || !Number.isInteger(tokenAmountB)) {
      return res.status(400).json({
        success: false,
        error: 'tokenAmountB must be a positive integer'
      });
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { address }
    });

    if (!user) {
      user = await prisma.user.create({
        data: { address }
      });
    }

    // Create swap transaction
    const swapTransaction = await prisma.swapTransaction.create({
      data: {
        userId: user.id,
        tokenA,
        tokenB,
        tokenAmountA,
        tokenAmountB,
        swapDirection: swapDirection as SwapDirection,
        transactionId: transactionId || null
      },
      include: {
        user: {
          select: {
            id: true,
            address: true
          }
        }
      }
    });

    console.log(`[SWAP] Created swap transaction ${swapTransaction.id} for user ${address}`);

    res.status(201).json({
      success: true,
      data: swapTransaction
    });

  } catch (error) {
    console.error('Error creating swap transaction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create swap transaction'
    });
  }
};

/**
 * Get swap transactions for a user
 * GET /api/swaps/user/:address
 */
export const getUserSwapTransactions = async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { direction, limit, offset } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address is required'
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { address }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Build where clause
    const whereClause: any = { userId: user.id };
    
    if (direction) {
      const validDirections = ['FROM_BOSON_TO_PLAYER', 'FROM_PLAYER_TO_BOSON'];
      if (validDirections.includes(direction as string)) {
        whereClause.swapDirection = direction as SwapDirection;
      }
    }

    // Parse pagination
    const limitNum = limit ? parseInt(limit as string, 10) : 50;
    const offsetNum = offset ? parseInt(offset as string, 10) : 0;

    // Get swap transactions
    const [swapTransactions, total] = await Promise.all([
      prisma.swapTransaction.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limitNum,
        skip: offsetNum,
        include: {
          user: {
            select: {
              id: true,
              address: true
            }
          }
        }
      }),
      prisma.swapTransaction.count({
        where: whereClause
      })
    ]);

    res.json({
      success: true,
      data: swapTransactions,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < total
      }
    });

  } catch (error) {
    console.error('Error getting user swap transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user swap transactions'
    });
  }
};

/**
 * Get specific swap transaction details
 * GET /api/swaps/:swapId
 */
export const getSwapTransaction = async (req: Request, res: Response) => {
  try {
    const { swapId } = req.params;

    const swapTransaction = await prisma.swapTransaction.findUnique({
      where: { id: swapId },
      include: {
        user: {
          select: {
            id: true,
            address: true,
            twitterUsername: true
          }
        }
      }
    });

    if (!swapTransaction) {
      return res.status(404).json({
        success: false,
        error: 'Swap transaction not found'
      });
    }

    res.json({
      success: true,
      data: swapTransaction
    });

  } catch (error) {
    console.error('Error getting swap transaction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get swap transaction'
    });
  }
};

/**
 * Get swap statistics for a user
 * GET /api/swaps/user/:address/stats
 */
export const getUserSwapStats = async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address is required'
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { address }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get all swap transactions for the user
    const swapTransactions = await prisma.swapTransaction.findMany({
      where: { userId: user.id }
    });

    // Calculate statistics
    const totalSwaps = swapTransactions.length;
    const bosonToPlayerSwaps = swapTransactions.filter(
      s => s.swapDirection === 'FROM_BOSON_TO_PLAYER'
    ).length;
    const playerToBosonSwaps = swapTransactions.filter(
      s => s.swapDirection === 'FROM_PLAYER_TO_BOSON'
    ).length;

    // Calculate total amounts swapped
    const totalBosonSwapped = swapTransactions.reduce((sum, swap) => {
      if (swap.swapDirection === 'FROM_BOSON_TO_PLAYER') {
        return sum + swap.tokenAmountA; // tokenA is Boson
      } else {
        return sum + swap.tokenAmountB; // tokenB is Boson
      }
    }, 0);

    const totalPlayerTokensSwapped = swapTransactions.reduce((sum, swap) => {
      if (swap.swapDirection === 'FROM_BOSON_TO_PLAYER') {
        return sum + swap.tokenAmountB; // tokenB is Player token
      } else {
        return sum + swap.tokenAmountA; // tokenA is Player token
      }
    }, 0);

    // Get unique tokens swapped
    const uniqueTokens = new Set<string>();
    swapTransactions.forEach(swap => {
      uniqueTokens.add(swap.tokenA);
      uniqueTokens.add(swap.tokenB);
    });

    res.json({
      success: true,
      data: {
        totalSwaps,
        bosonToPlayerSwaps,
        playerToBosonSwaps,
        totalBosonSwapped,
        totalPlayerTokensSwapped,
        uniqueTokensSwapped: uniqueTokens.size,
        uniqueTokenAddresses: Array.from(uniqueTokens)
      }
    });

  } catch (error) {
    console.error('Error getting user swap stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user swap stats'
    });
  }
};

