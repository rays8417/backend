import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';
import dotenv from 'dotenv';
import { PLAYER_POOL_MAP, BOSON_MINT, PLAYER_TOKEN_MINTS } from '../utils/constants';

dotenv.config();



export interface PlayerPrice {
  playerModule: string;
  priceInBosons: number; // How many bosons needed to buy 1 player token
  poolAddress: string;
}

/**
 * Player Price Service
 * Fetches real-time prices from AMM liquidity pools
 */
export class PlayerPriceService {
  private connection: Connection;
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private CACHE_TTL = 60000; // 1 minute cache

  constructor() {
    const rpcUrl = process.env.SOLANA_RPC_URL;
    if (!rpcUrl) {
      throw new Error('SOLANA_RPC_URL must be set in environment');
    }
    this.connection = new Connection(rpcUrl, 'confirmed');
    console.log('[PRICE_SERVICE] Initialized with Solana RPC');
  }

  /**
   * Get player token price from liquidity pool
   * Price = Boson reserves / Player token reserves
   */
  async getPlayerPrice(playerModule: string): Promise<number> {
    try {
      // Check cache first
      const cached = this.priceCache.get(playerModule);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.price;
      }

      const poolAddress = PLAYER_POOL_MAP[playerModule];
      if (!poolAddress) {
        console.warn(`[PRICE_SERVICE] No pool found for ${playerModule}, using default price 0.01`);
        return 0.01; // Default fallback price
      }

      // Get pool account data
      const poolPubkey = new PublicKey(poolAddress);
      const accountInfo = await this.connection.getAccountInfo(poolPubkey);

      if (!accountInfo || !accountInfo.data) {
        console.warn(`[PRICE_SERVICE] Pool account not found for ${playerModule}, using default price`);
        return 0.01;
      }

      // Parse pool data to get reserves
      // The exact structure depends on your AMM program
      // This is a common pattern for Raydium-style AMMs
      const data = accountInfo.data;
      
      // Try to find token accounts for this pool
      // Most AMMs store references to token vault accounts
      try {
        // Query the pool's token accounts
        const poolTokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
          poolPubkey,
          { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
        );

        if (poolTokenAccounts.value.length < 2) {
          console.warn(`[PRICE_SERVICE] Pool ${playerModule} doesn't have 2 token accounts`);
          return 0.01;
        }

        // Find Boson and Player token reserves
        let bosonReserve = 0n;
        let playerReserve = 0n;

        for (const { account } of poolTokenAccounts.value) {
          const parsedInfo = account.data.parsed?.info;
          if (!parsedInfo) continue;

          const mint = parsedInfo.mint;
          const amount = BigInt(parsedInfo.tokenAmount.amount);

          if (mint === BOSON_MINT) {
            bosonReserve = amount;
          } else if (mint === PLAYER_TOKEN_MINTS[playerModule]) {
            playerReserve = amount;
          }
        }

        if (bosonReserve === 0n || playerReserve === 0n) {
          console.warn(`[PRICE_SERVICE] Missing reserves for ${playerModule}: Boson=${bosonReserve}, Player=${playerReserve}`);
          return 0.01;
        }

        // Calculate price: how many bosons for 1 player token
        // Price = Boson reserves / Player token reserves
        const price = Number(bosonReserve) / Number(playerReserve);

        console.log(`[PRICE_SERVICE] ${playerModule} price: ${price.toFixed(6)} bosons per token (Boson reserve: ${bosonReserve}, Player reserve: ${playerReserve})`);

        // Cache the price
        this.priceCache.set(playerModule, { price, timestamp: Date.now() });

        return price;

      } catch (parseError) {
        console.error(`[PRICE_SERVICE] Error parsing pool data for ${playerModule}:`, parseError);
        return 0.01;
      }

    } catch (error) {
      console.error(`[PRICE_SERVICE] Error fetching price for ${playerModule}:`, error);
      return 0.01; // Fallback to default price
    }
  }

  /**
   * Get prices for multiple players in batch
   */
  async getPlayerPrices(playerModules: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    
    // Fetch all prices in parallel
    const pricePromises = playerModules.map(async (player) => {
      const price = await this.getPlayerPrice(player);
      return { player, price };
    });

    const results = await Promise.all(pricePromises);
    
    for (const { player, price } of results) {
      prices.set(player, price);
    }

    return prices;
  }

  /**
   * Clear price cache
   */
  clearCache() {
    this.priceCache.clear();
  }
}

// Export singleton instance
export const playerPriceService = new PlayerPriceService();

