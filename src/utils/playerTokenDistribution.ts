import { getPlayerModuleNames } from '../config/players.config';
import { solanaAdapter } from '../blockchain/adapters/solana.adapter';
import { REWARD_CONFIG } from '../config/reward.config';
import { playerPriceService } from '../services/playerPriceService';

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

    // 1. Generate random number of player tokens (4-7)
    const numPlayers = Math.floor(Math.random() * 4) + 4; // Random between 4-7
    console.log(`[PLAYER PACK] Selected ${numPlayers} random players`);

    // 2. Get all player modules and randomly select
    const allPlayers = getPlayerModuleNames();
    const shuffled = allPlayers.sort(() => Math.random() - 0.5);
    const selectedPlayers = shuffled.slice(0, numPlayers);
    console.log(`[PLAYER PACK] Selected players:`, selectedPlayers);

    // 3. Fetch real-time prices from liquidity pools
    console.log(`[PLAYER PACK] Fetching real-time prices from AMM pools...`);
    const playerPrices = await playerPriceService.getPlayerPrices(selectedPlayers);
    
    console.log(`[PLAYER PACK] Player prices (in bosons per token):`);
    selectedPlayers.forEach(player => {
      const price = playerPrices.get(player) || 0.01;
      console.log(`  - ${player}: ${price.toFixed(6)} bosons/token`);
    });

    // 4. Randomly allocate boson value to each player
    const bosonAllocations: number[] = [];
    let remainingBosons = totalBosonValue;
    
    for (let i = 0; i < numPlayers; i++) {
      if (i === numPlayers - 1) {
        // Last player gets remaining bosons
        bosonAllocations.push(remainingBosons);
      } else {
        // Random allocation between 10% and 40% of remaining bosons
        const minAlloc = remainingBosons * 0.1;
        const maxAlloc = remainingBosons * 0.4;
        const randomAlloc = Math.random() * (maxAlloc - minAlloc) + minAlloc;
        bosonAllocations.push(randomAlloc);
        remainingBosons -= randomAlloc;
      }
    }

    // 5. Calculate whole token amounts based on price and allocation
    const bosonDecimals = REWARD_CONFIG.BOSON_DECIMALS;
    const multiplier = Math.pow(10, bosonDecimals);
    
    const tokenAmounts: number[] = [];
    let totalActualValue = 0;

    console.log(`[PLAYER PACK] Calculating token amounts based on market prices:`);
    
    for (let i = 0; i < selectedPlayers.length; i++) {
      const player = selectedPlayers[i];
      const bosonAlloc = bosonAllocations[i];
      const pricePerToken = playerPrices.get(player) || 0.01;
      
      // Calculate how many tokens can be bought with this allocation
      // tokenAmount = bosonAlloc / pricePerToken
      const tokensFloat = bosonAlloc / pricePerToken;
      
      // Convert to raw token units and ensure whole number
      const rawTokens = Math.floor(tokensFloat * multiplier);
      tokenAmounts.push(rawTokens);
      
      // Calculate actual value in bosons
      const actualValue = (rawTokens / multiplier) * pricePerToken;
      totalActualValue += actualValue;
      
      console.log(`  - ${player}: ${bosonAlloc.toFixed(3)} bosons → ${rawTokens} raw tokens (${(rawTokens/multiplier).toFixed(3)} tokens) @ ${pricePerToken.toFixed(6)} bosons/token = ${actualValue.toFixed(3)} boson value`);
    }

    console.log(`[PLAYER PACK] Total pack value: ${totalBosonValue} bosons`);
    console.log(`[PLAYER PACK] Total distributed value: ${totalActualValue.toFixed(3)} bosons`);
    console.log(`[PLAYER PACK] Difference: ${(totalBosonValue - totalActualValue).toFixed(3)} bosons (due to rounding)`);

    // 6. Send tokens to user
    const transferResults: TokenDistributionResult[] = [];

    for (let i = 0; i < selectedPlayers.length; i++) {
      const playerModule = selectedPlayers[i];
      const tokenAmount = tokenAmounts[i];
      const bosonAmount = tokenAmount / multiplier;

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
  BASE = 20,
  PRIME = 50,
  ULTRA = 100
}

export interface PackInfo {
  type: PackType;
  name: string;
  price: number; // in bosons
  description: string;
}

export const PACK_TYPES: PackInfo[] = [
  {
    type: PackType.BASE,
    name: 'BASE Pack',
    price: 20,
    description: 'Random 4-7 player tokens worth 20 bosons'
  },
  {
    type: PackType.PRIME,
    name: 'PRIME Pack',
    price: 50,
    description: 'Random 4-7 player tokens worth 50 bosons'
  },
  {
    type: PackType.ULTRA,
    name: 'ULTRA Pack',
    price: 100,
    description: 'Random 4-7 player tokens worth 100 bosons'
  }
];

export interface PackPlayerData {
  player: string;
  amount: number;
  price: number;
}

export interface PackGenerationResult {
  players: PackPlayerData[];
  totalValue: number;
}

/**
 * Generate pack data without transferring tokens
 * This is used when creating a pack that will be opened later
 * @param totalBosonValue - Total value in bosons for the pack
 * @returns Promise<PackGenerationResult> - Pack data without transfers
 */
export const generatePackData = async (
  totalBosonValue: number
): Promise<PackGenerationResult> => {
  try {
    // 1. Generate random number of player tokens (4-7)
    const numPlayers = Math.floor(Math.random() * 4) + 4; // Random between 4-7

    // 2. Get all player modules and randomly select
    const allPlayers = getPlayerModuleNames();
    const shuffled = allPlayers.sort(() => Math.random() - 0.5);
    const selectedPlayers = shuffled.slice(0, numPlayers);

    // 3. Fetch real-time prices from liquidity pools
    const playerPrices = await playerPriceService.getPlayerPrices(selectedPlayers);

    // 4. Randomly allocate boson value to each player
    const bosonAllocations: number[] = [];
    let remainingBosons = totalBosonValue;
    
    for (let i = 0; i < numPlayers; i++) {
      if (i === numPlayers - 1) {
        // Last player gets remaining bosons
        bosonAllocations.push(remainingBosons);
      } else {
        // Random allocation between 10% and 40% of remaining bosons
        const minAlloc = remainingBosons * 0.1;
        const maxAlloc = remainingBosons * 0.4;
        const randomAlloc = Math.random() * (maxAlloc - minAlloc) + minAlloc;
        bosonAllocations.push(randomAlloc);
        remainingBosons -= randomAlloc;
      }
    }

    // 5. Calculate whole token amounts based on price and allocation
    const bosonDecimals = REWARD_CONFIG.BOSON_DECIMALS;
    const multiplier = Math.pow(10, bosonDecimals);
    
    const packPlayers: PackPlayerData[] = [];
    let totalActualValue = 0;
    
    for (let i = 0; i < selectedPlayers.length; i++) {
      const player = selectedPlayers[i];
      const bosonAlloc = bosonAllocations[i];
      const pricePerToken = playerPrices.get(player) || 0.01;
      
      // Calculate how many tokens can be bought with this allocation
      const tokensFloat = bosonAlloc / pricePerToken;
      
      // Convert to raw token units and ensure whole number
      const rawTokens = Math.floor(tokensFloat * multiplier);
      
      // Calculate actual value in bosons
      const actualValue = (rawTokens / multiplier) * pricePerToken;
      totalActualValue += actualValue;
      
      packPlayers.push({
        player: player,
        amount: rawTokens,
        price: pricePerToken
      });
    }

    return {
      players: packPlayers,
      totalValue: totalActualValue
    };

  } catch (error) {
    console.error('[PACK GENERATION] Error in generatePackData:', error);
    throw error;
  }
};
