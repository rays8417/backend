import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { REWARD_CONFIG } from '../config/reward.config';
import { 
  distributeRandomPlayerTokens, 
  PACK_TYPES, 
  PackType, 
  TokenDistributionResult 
} from '../utils/playerTokenDistribution';
import { solanaAdapter } from '../blockchain/adapters/solana.adapter';

/**
 * Packs Controller
 * Handles player pack purchases with boson tokens
 */

/**
 * GET /api/packs/types
 * Get available pack types and their information
 */
export const getPackTypes = async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      packs: PACK_TYPES.map(pack => ({
        type: pack.type,
        name: pack.name,
        price: pack.price,
        description: pack.description,
        playerCount: '4-7 random players',
        valueInBosons: pack.price
      }))
    });
  } catch (error) {
    console.error('Error fetching pack types:', error);
    res.status(500).json({ error: 'Failed to fetch pack types' });
  }
};

/**
 * Internal function to handle pack purchase
 * Called by ContractEventService when contract emits pack purchase event
 * Note: This is not exposed as a direct API endpoint
 */
export const purchasePack = async (req: Request, res: Response) => {
  try {
    const { userAddress, packType, bosonAmount, transactionHash } = req.body;

    if (!userAddress || !packType || !bosonAmount) {
      return res.status(400).json({ 
        error: 'Missing required fields: userAddress, packType, and bosonAmount are required' 
      });
    }

    // Validate pack type
    const validPackTypes = Object.values(PackType).filter(v => typeof v === 'number') as number[];
    if (!validPackTypes.includes(packType)) {
      return res.status(400).json({ 
        error: `Invalid pack type. Valid types: ${validPackTypes.join(', ')}` 
      });
    }

    // Find pack info
    const packInfo = PACK_TYPES.find(p => p.type === packType);
    if (!packInfo) {
      return res.status(400).json({ error: 'Pack type not found' });
    }

    // Verify the amount matches the pack price
    if (bosonAmount !== packInfo.price) {
      return res.status(400).json({ 
        error: `Amount ${bosonAmount} does not match pack price ${packInfo.price} bosons` 
      });
    }

    console.log(`[PACK PURCHASE] Processing ${packInfo.name} purchase for ${userAddress}`);
    console.log(`[PACK PURCHASE] Amount: ${bosonAmount} bosons`);

    // Get admin private key
    const adminPrivateKey = REWARD_CONFIG.ADMIN_PRIVATE_KEY;
    if (!adminPrivateKey) {
      return res.status(500).json({ 
        error: 'Server configuration error: Admin private key not configured' 
      });
    }

    // Distribute random player tokens worth the pack value
    const distributionResults = await distributeRandomPlayerTokens(
      userAddress,
      bosonAmount,
      adminPrivateKey
    );

    // Count successful transfers
    const successfulTransfers = distributionResults.filter(r => r.success);
    const failedTransfers = distributionResults.filter(r => !r.success);

    // Save pack purchase record to database (optional - for tracking)
    try {
      await prisma.user.upsert({
        where: { address: userAddress },
        update: {
          updatedAt: new Date(),
        },
        create: {
          address: userAddress,
        },
      });
    } catch (dbError) {
      console.warn('[PACK PURCHASE] Failed to update user record:', dbError);
    }

    // Calculate total value of successfully distributed tokens
    const totalDistributedValue = successfulTransfers.reduce((sum, result) => sum + result.amount, 0);

    res.json({
      success: true,
      packPurchase: {
        packType: packInfo.type,
        packName: packInfo.name,
        price: packInfo.price,
        userAddress,
        transactionHash,
        distributions: distributionResults,
        summary: {
          totalTransfers: distributionResults.length,
          successfulTransfers: successfulTransfers.length,
          failedTransfers: failedTransfers.length,
          totalDistributedValue: Number(totalDistributedValue.toFixed(3))
        }
      }
    });

  } catch (error) {
    console.error('[PACK PURCHASE] Error processing pack purchase:', error);
    res.status(500).json({ 
      error: 'Failed to process pack purchase',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

