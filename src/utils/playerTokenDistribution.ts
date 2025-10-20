import { getPlayerModuleNames } from '../config/players.config';
import { solanaAdapter } from '../blockchain/adapters/solana.adapter';
import { REWARD_CONFIG } from '../config/reward.config';

export interface TokenDistributionResult {
  player: string;
  amount: number;
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Reusable utility for distributing random player tokens
 * @param address - User wallet address to receive tokens
 * @param totalBosonValue - Total value in bosons to distribute
 * @param adminPrivateKey - Admin private key for transfers
 * @returns Promise<TokenDistributionResult[]> - Results of token transfers
 */
export const distributeRandomPlayerTokens = async (
  address: string,
  totalBosonValue: number,
  adminPrivateKey: string
): Promise<TokenDistributionResult[]> => {
  try {
    console.log(`[PLAYER PACK] Distributing ${totalBosonValue} bosons worth of player tokens to: ${address}`);

    // 1. Generate random number of player tokens (2-5)
    const numPlayers = Math.floor(Math.random() * 4) + 2; // Random between 2-5
    console.log(`[PLAYER PACK] Selected ${numPlayers} random players`);

    // 2. Get all player modules and randomly select
    const allPlayers = getPlayerModuleNames();
    const shuffled = allPlayers.sort(() => Math.random() - 0.5);
    const selectedPlayers = shuffled.slice(0, numPlayers);
    console.log(`[PLAYER PACK] Selected players:`, selectedPlayers);

    // 3. Calculate shares for each player token
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

    console.log(`[PLAYER PACK] Distribution:`);
    selectedPlayers.forEach((player, i) => {
      console.log(`  - ${player}: ${normalizedValues[i].toFixed(3)} bosons`);
    });

    // 4. Send tokens to user
    const transferResults: TokenDistributionResult[] = [];

    for (let i = 0; i < selectedPlayers.length; i++) {
      const playerModule = selectedPlayers[i];
      const bosonAmount = normalizedValues[i];
      const tokenAmount = Math.floor(bosonAmount * multiplier);

      console.log(`[PLAYER PACK] Transferring ${bosonAmount.toFixed(3)} bosons (${tokenAmount} tokens) of ${playerModule} to ${address}`);

      try {
        const result = await solanaAdapter.transferTokens(
          adminPrivateKey,
          address,
          tokenAmount,
          playerModule
        );

        if (result.success) {
          console.log(`[PLAYER PACK] ✅ Successfully sent ${playerModule}: ${result.transactionHash}`);
          transferResults.push({
            player: playerModule,
            amount: bosonAmount,
            success: true,
            txHash: result.transactionHash,
          });
        } else {
          console.error(`[PLAYER PACK] ❌ Failed to send ${playerModule}: ${result.error}`);
          transferResults.push({
            player: playerModule,
            amount: bosonAmount,
            success: false,
            error: result.error,
          });
        }
      } catch (transferError) {
        console.error(`[PLAYER PACK] ❌ Error transferring ${playerModule}:`, transferError);
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
    console.log(`[PLAYER PACK] Transfer complete: ${successCount}/${numPlayers} successful`);

    return transferResults;
  } catch (error) {
    console.error('[PLAYER PACK] Error in distributeRandomPlayerTokens:', error);
    throw error;
  }
};

/**
 * Pack types available for purchase
 */
export enum PackType {
  BASIC = 20,
  PREMIUM = 40,
  ELITE = 60
}

export interface PackInfo {
  type: PackType;
  name: string;
  price: number; // in bosons
  description: string;
}

export const PACK_TYPES: PackInfo[] = [
  {
    type: PackType.BASIC,
    name: 'Basic Pack',
    price: 20,
    description: 'Random 2-5 player tokens worth 20 bosons'
  },
  {
    type: PackType.PREMIUM,
    name: 'Premium Pack',
    price: 40,
    description: 'Random 2-5 player tokens worth 40 bosons'
  },
  {
    type: PackType.ELITE,
    name: 'Elite Pack',
    price: 60,
    description: 'Random 2-5 player tokens worth 60 bosons'
  }
];
