import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { solanaAdapter } from '../blockchain/adapters/solana.adapter';
import { getPlayerModuleNames } from '../config/players.config';
import { REWARD_CONFIG } from '../config/reward.config';

/**
 * Send starter tokens to new users
 * Randomly selects 2-5 player tokens and distributes them such that total value = 20 bosons
 */
const sendStarterTokens = async (address: string): Promise<void> => {
  try {
    console.log(`[STARTER TOKENS] Sending starter tokens to new user: ${address}`);
    
    // Get admin private key
    const adminPrivateKey = REWARD_CONFIG.ADMIN_PRIVATE_KEY;
    if (!adminPrivateKey) {
      console.error('[STARTER TOKENS] Admin private key not configured. Cannot send starter tokens.');
      return;
    }

    // 1. Generate random number of player tokens (2-5)
    const numPlayers = Math.floor(Math.random() * 4) + 2; // Random between 2-5
    console.log(`[STARTER TOKENS] Selected ${numPlayers} random players`);
    
    // 2. Get all player modules and randomly select
    const allPlayers = getPlayerModuleNames();
    const shuffled = allPlayers.sort(() => Math.random() - 0.5);
    const selectedPlayers = shuffled.slice(0, numPlayers);
    console.log(`[STARTER TOKENS] Selected players:`, selectedPlayers);
    
    // 3. Calculate shares for each player token
    // Total value should equal 20 bosons
    const totalBosonValue = 20;
    const bosonDecimals = REWARD_CONFIG.BOSON_DECIMALS;
    const multiplier = Math.pow(10, bosonDecimals);
    
    // Generate random weights for each player
    const weights: number[] = [];
    let totalWeight = 0;
    
    for (let i = 0; i < numPlayers; i++) {
      // Generate random weight between 0.5 and 2.0 for variety
      const weight = Math.random() * 1.5 + 0.5;
      weights.push(weight);
      totalWeight += weight;
    }
    
    // Normalize weights so they sum to totalBosonValue
    const normalizedValues = weights.map(w => (w / totalWeight) * totalBosonValue);
    
    console.log(`[STARTER TOKENS] Distribution:`);
    selectedPlayers.forEach((player, i) => {
      console.log(`  - ${player}: ${normalizedValues[i].toFixed(3)} bosons`);
    });
    
    // 4. Send tokens to user
    const transferResults = [];
    
    for (let i = 0; i < selectedPlayers.length; i++) {
      const playerModule = selectedPlayers[i];
      const bosonAmount = normalizedValues[i];
      const tokenAmount = Math.floor(bosonAmount * multiplier);
      
      console.log(`[STARTER TOKENS] Transferring ${bosonAmount.toFixed(3)} bosons (${tokenAmount} tokens) of ${playerModule} to ${address}`);
      
      try {
        const result = await solanaAdapter.transferTokens(
          adminPrivateKey,
          address,
          tokenAmount,
          playerModule
        );
        
        if (result.success) {
          console.log(`[STARTER TOKENS] ✅ Successfully sent ${playerModule}: ${result.transactionHash}`);
          transferResults.push({
            player: playerModule,
            amount: bosonAmount,
            success: true,
            txHash: result.transactionHash,
          });
        } else {
          console.error(`[STARTER TOKENS] ❌ Failed to send ${playerModule}: ${result.error}`);
          transferResults.push({
            player: playerModule,
            amount: bosonAmount,
            success: false,
            error: result.error,
          });
        }
      } catch (transferError) {
        console.error(`[STARTER TOKENS] ❌ Error transferring ${playerModule}:`, transferError);
        transferResults.push({
          player: playerModule,
          amount: bosonAmount,
          success: false,
          error: transferError instanceof Error ? transferError.message : 'Unknown error',
        });
      }
    }
    
    // Log summary
    const successCount = transferResults.filter(r => r.success).length;
    console.log(`[STARTER TOKENS] Transfer complete: ${successCount}/${numPlayers} successful`);
    
  } catch (error) {
    console.error('[STARTER TOKENS] Error in sendStarterTokens:', error);
    // Don't throw - we don't want to fail user tracking if starter tokens fail
  }
};

export const trackUser = async (req: Request, res: Response) => {
  try {
    const { address } = req.body;

    if (!address || typeof address !== 'string') {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { address },
    });

    const isNewUser = !existingUser;

    // Create or update user
    const user = await prisma.user.upsert({
      where: { address },
      update: {
        updatedAt: new Date(), // Update timestamp on reconnection
      },
      create: {
        address,
      },
    });

    // If this is a new user, send starter tokens (async, don't wait)
    if (isNewUser) {
      console.log(`[TRACKER] New user detected: ${address}. Sending starter tokens...`);
      // Fire and forget - don't await
      sendStarterTokens(address).catch(error => {
        console.error('[TRACKER] Failed to send starter tokens:', error);
      });
    }

    res.json({ 
      success: true, 
      user: {
        id: user.id,
        address: user.address,
        createdAt: user.createdAt,
        isNewUser,
      }
    });
  } catch (error) {
    console.error('Error tracking user:', error);
    res.status(500).json({ error: 'Failed to track user' });
  }
};

/**
 * GET /api/users/count
 * Get total unique users count (for admin/metrics)
 */
export const getUserCount = async (req: Request, res: Response) => {
  try {
    const count = await prisma.user.count();
    res.json({ success: true, count });
  } catch (error) {
    console.error('Error getting user count:', error);
    res.status(500).json({ error: 'Failed to get user count' });
  }
};

