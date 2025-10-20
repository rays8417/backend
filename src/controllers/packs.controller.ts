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
        playerCount: '2-5 random players',
        valueInBosons: pack.price
      }))
    });
  } catch (error) {
    console.error('Error fetching pack types:', error);
    res.status(500).json({ error: 'Failed to fetch pack types' });
  }
};

/**
 * POST /api/packs/purchase
 * Handle pack purchase when user transfers bosons
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

/**
 * POST /api/packs/detect-transfer
 * Endpoint to detect boson transfers and automatically process pack purchases
 * This would typically be called by a webhook or monitoring service
 */
export const detectBosonTransfer = async (req: Request, res: Response) => {
  try {
    const { 
      fromAddress, 
      toAddress, 
      amount, 
      transactionHash, 
      tokenType = 'Boson' 
    } = req.body;

    if (!fromAddress || !toAddress || !amount || !transactionHash) {
      return res.status(400).json({ 
        error: 'Missing required fields: fromAddress, toAddress, amount, transactionHash' 
      });
    }

    // Only process if it's a Boson token transfer to admin address
    const adminAddress = REWARD_CONFIG.ADMIN_ACCOUNT_ADDRESS;
    if (tokenType !== 'Boson' || toAddress.toLowerCase() !== adminAddress?.toLowerCase()) {
      return res.status(200).json({ 
        message: 'Transfer not for pack purchase - ignoring',
        processed: false 
      });
    }

    // Check if amount matches any pack price
    const validPackAmounts = Object.values(PackType).filter(v => typeof v === 'number') as number[];
    if (!validPackAmounts.includes(amount)) {
      return res.status(400).json({ 
        error: `Amount ${amount} does not match any pack price. Valid amounts: ${validPackAmounts.join(', ')} bosons` 
      });
    }

    console.log(`[BOSON TRANSFER] Detected ${amount} boson transfer from ${fromAddress} to admin`);
    console.log(`[BOSON TRANSFER] Processing as pack purchase...`);

    // Process as pack purchase
    const packType = amount as PackType;
    const result = await purchasePack({
      body: {
        userAddress: fromAddress,
        packType,
        bosonAmount: amount,
        transactionHash
      }
    } as Request, res);

    return result;

  } catch (error) {
    console.error('[BOSON TRANSFER] Error detecting boson transfer:', error);
    res.status(500).json({ 
      error: 'Failed to detect and process boson transfer',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * POST /api/packs/trigger-from-event
 * Manually trigger pack purchase from contract event data
 */
export const triggerFromEvent = async (req: Request, res: Response) => {
  try {
    const { fromAddress, amount, transactionSignature } = req.body;

    if (!fromAddress || !amount || !transactionSignature) {
      return res.status(400).json({ 
        error: 'Missing required fields: fromAddress, amount, transactionSignature' 
      });
    }

    // Validate amount
    const validPackAmounts = Object.values(PackType).filter(v => typeof v === 'number') as number[];
    if (!validPackAmounts.includes(amount)) {
      return res.status(400).json({ 
        error: `Amount ${amount} does not match any pack price. Valid amounts: ${validPackAmounts.join(', ')} bosons` 
      });
    }

    console.log(`[TRIGGER_EVENT] Manually triggering pack purchase from event:`, {
      fromAddress,
      amount,
      transactionSignature
    });

    // Create request object for purchasePack
    const mockReq = {
      body: {
        userAddress: fromAddress,
        packType: amount as PackType,
        bosonAmount: amount,
        transactionHash: transactionSignature
      }
    } as Request;

    // Create response handler
    let responseData: any = null;
    const mockRes = {
      json: (data: any) => {
        responseData = data;
        return mockRes;
      },
      status: (code: number) => ({
        json: (data: any) => {
          responseData = { ...data, statusCode: code };
          return mockRes;
        }
      })
    } as Response;

    await purchasePack(mockReq, mockRes);

    res.json({
      success: true,
      message: 'Pack purchase triggered from contract event',
      eventData: { fromAddress, amount, transactionSignature },
      result: responseData
    });

  } catch (error) {
    console.error('[TRIGGER_EVENT] Error triggering pack purchase from event:', error);
    res.status(500).json({ 
      error: 'Failed to trigger pack purchase from event',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
