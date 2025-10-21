import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Player Pool Mapping
 * Maps player module names to their liquidity pool addresses
 */
const PLAYER_POOL_MAP: Record<string, string> = {
  'BenStokes': 'JDD9WuLPq234fFRSPZqmUySaF8ie3PDFDQNgJg2Y9J7T',
  'TravisHead': 'C8mafYpr8jonN5chS9pxix3cMWBEfgJ2YQxgGssiXoP5',
  'GlenMaxwell': '4NjCSE89Pyq1cdWfygtXoj1YukDu8kPRXr31cB8Pud8e',
  'ShubhamDube': 'BwrRH1WZsSH1MdHzpAeErGCp8bkXtp3GQWCwwRhzuBwe',
  'HardikPandya': 'Cb7dSXQE7ZnzhGR7t3u4fGfM9jHL67XXnpgukMB4ZVuS',
  'ShubhmanGill': 'DKyPdCj9whq8MduqiNUcM9xVAsoWR89jAsdUFhRUsetJ',
  'KaneWilliamson': '8R8yWsHRP3CXLDNf633hBrw2PyFoNJz2Q8SrT24JXxor',
  'AbhishekSharma': 'BhCEGn2mpaBGU3sD6Ma5rPfFuoHeJC2554JCpLtg9H3u',
  'JaspreetBumhrah': '9eMF3Bzq4dJ5teoo5GBYM45xrKZ26MkMhiuzWrUdJWpc',
  'SuryakumarYadav': 'EnEyhg12Cm6NPvr4jbVtYCpv5snGZCF4bWmRdaC7rvNJ',
  'ViratKohli': 'DdkpLNQ1S2SwoWgvajHvQHkraYBLk6q8sfSBrguckFxz',
  'JoeRoot': '3B2UiTvsxQDF3t96UHhS9upHQ4WtjbzkHH26vGDLd7hg',
  'HarryBrook': '9UWymQ4XLaCuyZpuxjup36z2FmZ1dsRSfXYNvLwSqAcG',
  'YashasviJaiswal': 'Bxdq1cGXVj9NNzbak3vVDYqAu3cjjzPuKEVhVNzA3WRi',
  'RishabhPant': 'EaZ9m6p2wa8ZKkkq7SaBpCz4uaAS4SdsrqgUgeJYcyKW',
  'RohitSharma': 'CFeJ9t2cMkUW7WNEyeQyriFjjd4xvpV6z36rw6YRepcF',
  'KLRahul': '6exJH9dLUXTVBLMrZ9hoAvynbBNYhreSNKMMLHhrbesW',
  'JosButtler': '4YgXZzaWJohMaZ8dJJaWVBibEG3J5txX9A5YJ4Q49W1E',
  'JoshInglis': 'Dmbi9NfSAXMEmTdBvmCkX5UAUa5kSE6wWseEPpUCD15E',
  'WashingtonSundar': 'AxkmS9mFsf1dEN3fENWQW1UYEuPcQ1BG2tUd1qqLG3bj',
  'ShaiHope': '26K4GTuhGEFFmwwXpNfiwxc6b8xSmgSkAB6XpWYkpYzH',
  'JohnCampbell': 'BCvQHZDNCZUojZuszFy8kumkg1W3Hjnfs5eXJtqL9nRR',
  'KharyPierre': 'BrMpcXBEGs4CStAQLC1QegkkWuyduQKDLFq5VsKtCPZL',
  'MohammedSiraj': 'GBN2YumWRGAPAwZbywd2Q5txpRgwpLn7MB5FqLD86rCP',
  'AlickAthanaze': '3skaq6tdwJsF8k4Q7yHeCyUZ75wR7K9DsqoHHLoBiDeL',
};

/**
 * Token mint addresses
 */
const BOSON_MINT = 'HtnUp4FXaKC7MvpWP2N8W25rea75XspMiiw3XEixE8Jd';

const PLAYER_TOKEN_MINTS: Record<string, string> = {
  'ShubhmanGill': 'E4ixLqAcjioCVTBhW9VQxpCFHhJFnwyMVYTZJyzWQaar',
  'BenStokes': '5qBqQyobhK9rMYcK5PnwmWUY2GYpuVeqHfPpu4mAJ3rD',
  'TravisHead': '2yqdx8tQukCHHJiCUsNKGq1mXA9BEmkxSGiouE3u9SSV',
  'GlenMaxwell': '6mWJRGNUnjbvoqVmP5UoPRYUK7t4zrBiUY4pHBKrbuK8',
  'ShubhamDube': 'By8cEkVw6wNw4uJWb5PFNS6PyYma2wXZz49ZB6jeJhKo',
  'HardikPandya': '7o6rdp5eabo3xhAq9Roqh46aaGDygevrttmMiNgDHcgJ',
  'KaneWilliamson': 'A8VE2H3X862wRA2YbZKto3STPXx8hcWAg6pbe41UbGCo',
  'AbhishekSharma': '2v49DpyAKD8mxebQ2jes4RvidoybZzfDVRg29vL5yZNL',
  'JaspreetBumhrah': '9CLC1mmqKxqYSaN7ywgKKwDdxWqUJFqr8KWeuDikW2TN',
  'SuryakumarYadav': '6AgRnebp5spiBr4VXxJRcYMrjozturT1feLPSTx79kpT',
  'ViratKohli': '5FhMPnCjrTT56gZfGb7TAupCnRVPpkRZAhG8xkrLfGos',
  'JoeRoot': '3oDpdwng8fvWFhCUpDzvvt6xeee4WHsDozqb2QJLiLGX',
  'HarryBrook': '4gfPzmZSneYdN1UwTTNJA4jKLyf4DQ5mcxcsPSoUy9b2',
  'YashasviJaiswal': '7VTyZcWcdeWZBPEcLzEodsGRWruvSWzTS8cT6HQKoBK9',
  'RishabhPant': 'CuBFQd57LgfHikAdTVnQrgnFdrsseF78xnrnKVjDoX4z',
  'RohitSharma': '4pc1TzZM2o5yxATMbQPuzBRVMqf8VtMh3kugPai1iVGm',
  'KLRahul': 'CiYbhHcUcFn14EJLJzFj1jnbjaw3e5MZQoVfBPdFH4Tr',
  'JosButtler': '3g57ThxyBLzekz6wYZDpx93Kp96R8bbkmbKX3JQah1L4',
  'JoshInglis': '9e3A3uPRxjVtdy8i3J3vF84rRURS4mj9JipkRRrxRvya',
  'WashingtonSundar': 'FUFyqx1DBK9TkMtmuwkcQqetvrb3nx67YtVbgBi9MzGB',
  'ShaiHope': '21pYFJLWdStBa9qB2QhgDD49iJXNqSxgnN19qduuR1GK',
  'JohnCampbell': '8cpq5bWEoMYghki8D7DyJ25NaD6cjuSnJtbR3tWCeCfh',
  'KharyPierre': '7uQQwoYigCfvh18rdbSqixbJ8imQV2b6ou3MTwrzmH5a',
  'MohammedSiraj': '253unST1UwE1Ykg3BWF68iGajhzAkajzQKNQU4QueR2P',
  'AlickAthanaze': '9LS4Prb6wS8TpjjztkWVRG2k81NPbpuhwZEXcv1qff43',
};

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

