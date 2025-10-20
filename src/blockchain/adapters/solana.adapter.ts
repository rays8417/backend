import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { 
  getAccount, 
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { IBlockchainService, TokenHolder, TransferResult, AccountInfo } from '../interfaces/IBlockchainService';
import { parseIgnoredAddresses } from '../../config/reward.config';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Solana Blockchain Adapter
 * Implements IBlockchainService for Solana blockchain
 * 
 * Key differences from Aptos:
 * - Uses SPL Token standard instead of custom modules
 * - Token accounts are Associated Token Accounts (ATAs)
 * - 9 decimals instead of 8
 * - Direct account queries instead of view functions
 */

// Player token mints configuration - maps player module names to Solana mint addresses
const PLAYER_TOKEN_MINTS: Record<string, string> = {
  'Boson': 'GgbSCKBofx3M93prUJxpYtZqYziLBbpY7QDrmyXdPqUa',
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

// Pool addresses for each player token (liquidity pools for trading)
// These should be ignored when counting token holders since they're protocol-owned
const PLAYER_POOL_ADDRESSES = [
  'JDD9WuLPq234fFRSPZqmUySaF8ie3PDFDQNgJg2Y9J7T', // Ben Stokes pool
  'C8mafYpr8jonN5chS9pxix3cMWBEfgJ2YQxgGssiXoP5', // Travis Head pool
  '4NjCSE89Pyq1cdWfygtXoj1YukDu8kPRXr31cB8Pud8e', // Glenn Maxwell pool
  'BwrRH1WZsSH1MdHzpAeErGCp8bkXtp3GQWCwwRhzuBwe', // Shubham Dube pool
  'Cb7dSXQE7ZnzhGR7t3u4fGfM9jHL67XXnpgukMB4ZVuS', // Hardik Pandya pool
  'DKyPdCj9whq8MduqiNUcM9xVAsoWR89jAsdUFhRUsetJ', // Shubman Gill pool
  '8R8yWsHRP3CXLDNf633hBrw2PyFoNJz2Q8SrT24JXxor', // Kane Williamson pool
  'BhCEGn2mpaBGU3sD6Ma5rPfFuoHeJC2554JCpLtg9H3u', // Abhishek Sharma pool
  '9eMF3Bzq4dJ5teoo5GBYM45xrKZ26MkMhiuzWrUdJWpc', // Jasprit Bumrah pool
  'EnEyhg12Cm6NPvr4jbVtYCpv5snGZCF4bWmRdaC7rvNJ', // Suryakumar Yadav pool
  'DdkpLNQ1S2SwoWgvajHvQHkraYBLk6q8sfSBrguckFxz', // Virat Kohli pool
  '3B2UiTvsxQDF3t96UHhS9upHQ4WtjbzkHH26vGDLd7hg', // Joe Root pool
  '9UWymQ4XLaCuyZpuxjup36z2FmZ1dsRSfXYNvLwSqAcG', // Harry Brook pool
  'Bxdq1cGXVj9NNzbak3vVDYqAu3cjjzPuKEVhVNzA3WRi', // Yashasvi Jaiswal pool
  'EaZ9m6p2wa8ZKkkq7SaBpCz4uaAS4SdsrqgUgeJYcyKW', // Rishabh Pant pool
  'CFeJ9t2cMkUW7WNEyeQyriFjjd4xvpV6z36rw6YRepcF', // Rohit Sharma pool
  '6exJH9dLUXTVBLMrZ9hoAvynbBNYhreSNKMMLHhrbesW', // KL Rahul pool
  '4YgXZzaWJohMaZ8dJJaWVBibEG3J5txX9A5YJ4Q49W1E', // Jos Buttler pool
  'Dmbi9NfSAXMEmTdBvmCkX5UAUa5kSE6wWseEPpUCD15E', // Josh Inglis pool
  'AxkmS9mFsf1dEN3fENWQW1UYEuPcQ1BG2tUd1qqLG3bj', // Washington Sundar pool
  '26K4GTuhGEFFmwwXpNfiwxc6b8xSmgSkAB6XpWYkpYzH', // Shai Hope pool
  'BCvQHZDNCZUojZuszFy8kumkg1W3Hjnfs5eXJtqL9nRR', // John Campbell pool
  'BrMpcXBEGs4CStAQLC1QegkkWuyduQKDLFq5VsKtCPZL', // Khary Pierre pool
  'GBN2YumWRGAPAwZbywd2Q5txpRgwpLn7MB5FqLD86rCP', // Mohammed Siraj pool
  '3skaq6tdwJsF8k4Q7yHeCyUZ75wR7K9DsqoHHLoBiDeL', // Alick Athanaze pool
];

// AMM PDA (protocol-level address)
const AMM_PDA = '4ZnuhoWp9csaEm8LZeeNgbgXQ6tHoz4yTw3feA6DiH1e';

// Get ignored addresses from config and add Solana-specific addresses
const IGNORED_ADDRESS_SET = new Set([
  ...Array.from(parseIgnoredAddresses()),
  AMM_PDA.toLowerCase(),
  // Add all player pool addresses to ignore list
  ...PLAYER_POOL_ADDRESSES.map(addr => addr.toLowerCase()),
]);

export class SolanaAdapter implements IBlockchainService {
  private connection: Connection;
  private playerMints: Map<string, PublicKey>;

  constructor() {
    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.QUICKNODE_API_URL;
    if (!rpcUrl) {
      throw new Error('SOLANA_RPC_URL or QUICKNODE_API_URL must be set in environment');
    }
    
    this.connection = new Connection(rpcUrl, 'confirmed');
    
    // Initialize player mints map from configuration with validation
    this.playerMints = new Map();
    Object.entries(PLAYER_TOKEN_MINTS).forEach(([player, mint]) => {
      try {
        // Validate and create PublicKey
        const publicKey = new PublicKey(mint);
        this.playerMints.set(player, publicKey);
      } catch (error) {
        console.error(`[SOLANA] Invalid mint address for ${player}: ${mint}`);
        console.error(`[SOLANA] Skipping ${player} - please check the address`);
      }
    });

    console.log(`[SOLANA] Initialized with ${this.playerMints.size} player tokens (out of ${Object.keys(PLAYER_TOKEN_MINTS).length} configured)`);
  }

  /**
   * Get token holders for a specific player
   * 
   * Solana approach: Query all token accounts for a specific mint address
   * This is different from Aptos where we call a view function
   */
  async getTokenHolders(playerModule: string): Promise<string[]> {
    try {
      const mintAddress = this.playerMints.get(playerModule);
      if (!mintAddress) {
        console.error(`[SOLANA] Mint not found for player: ${playerModule}`);
        return [];
      }
      console.log(`${playerModule} :  mintAddress--------------`, mintAddress);


      // Get all token accounts for this mint using getParsedProgramAccounts
      const tokenAccounts = await this.connection.getParsedProgramAccounts(
        TOKEN_PROGRAM_ID,
        {
          filters: [
            {
              dataSize: 165, // Size of SPL Token account
            },
            {
              memcmp: {
                offset: 0, // Mint address is at offset 0
                bytes: mintAddress.toBase58(),
              },
            },
          ],
        }
      );

console.log(`${playerModule} : all tokenAccounts for the mint address --------------`, tokenAccounts);


      const holders: string[] = [];
      for (const { account } of tokenAccounts) {
        const parsedInfo = (account.data as any).parsed?.info;
        
        if (parsedInfo) {
          // Check if balance > 0 using both uiAmount and amount for safety
          const hasBalance = parsedInfo.tokenAmount.uiAmount > 0 || parsedInfo.tokenAmount.amount > 0;
          
          if (hasBalance) {
            const owner = parsedInfo.owner;
            
            // Filter out ignored addresses (pool, AMM, etc.)
            if (IGNORED_ADDRESS_SET.has(owner.toLowerCase())) {
              continue;
            }
            
            // Validate address format
            try {
              new PublicKey(owner);
            } catch (err) {
              console.error(`[SOLANA] Invalid address format: ${owner}`);
              continue;
            }
            
            holders.push(owner);
          }
        }
      }

      console.log(`${playerModule} : all holders --------------`, holders);


      // Deduplicate (each owner should have only one ATA per mint, but just in case)
      return Array.from(new Set(holders));
    } catch (error) {
      console.error(`[SOLANA] Error getting token holders for ${playerModule}:`, error);
      return [];
    }
  }

  /**
   * Get token balance for specific address and player
   * 
   * Solana approach: Calculate Associated Token Account (ATA) and read balance
   * This is different from Aptos where we call a balance view function
   */
  async getTokenBalance(address: string, playerModule: string): Promise<bigint> {
    try {
      const mintAddress = this.playerMints.get(playerModule);
      if (!mintAddress) {
        return BigInt(0);
      }

      // Validate address format
      let ownerPublicKey: PublicKey;
      try {
        ownerPublicKey = new PublicKey(address);
      } catch (err) {
        return BigInt(0);
      }
      
      if (playerModule === 'ShubhmanGill') {
        console.log(`[SOLANA] 🔍 ShubhmanGill balance check:`);
        console.log(`  - Owner: ${address}`);
        console.log(`  - Mint: ${mintAddress.toBase58()}`);
      }

      // Instead of calculating ATA, query all token accounts owned by this address for this mint
      try {
        const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
          ownerPublicKey,
          { mint: mintAddress }
        );

        if (playerModule === 'ShubhmanGill') {
          console.log(`  - Found ${tokenAccounts.value.length} token account(s) for this mint`);
        }

        if (tokenAccounts.value.length === 0) {
          return BigInt(0);
        }

        // Sum up balances from all token accounts (usually just one)
        let totalBalance = BigInt(0);
        for (const { account } of tokenAccounts.value) {
          const parsedInfo = account.data.parsed?.info;
          if (parsedInfo && parsedInfo.tokenAmount) {
            const balance = BigInt(parsedInfo.tokenAmount.amount);
            totalBalance += balance;
            
            if (playerModule === 'ShubhmanGill') {
              console.log(`  - Account balance: ${balance}`);
              console.log(`  - Account address: ${parsedInfo.address || 'unknown'}`);
            }
          }
        }

        if (playerModule === 'ShubhmanGill') {
          console.log(`  - ✅ Total balance: ${totalBalance}`);
        }

        return totalBalance;
      } catch (error) {
        if (playerModule === 'ShubhmanGill') {
          console.log(`  - ❌ Error querying token accounts:`, error);
        }
        return BigInt(0);
      }
    } catch (error) {
      return BigInt(0);
    }
  }

  /**
   * Get all token holders with balances across all players
   * 
   * Strategy: Same as Aptos - use Boson holders as the unified holder universe,
   * then check their balances across all player tokens
   */
  async getTokenHoldersWithBalances(): Promise<TokenHolder[]> {
    try {
      // Step 1: Get Boson token holders (unified holder universe)
      const bosonHolders = await this.getBosonTokenHolders();

      console.log('bosonHolders--------------', bosonHolders);
      if (bosonHolders.length === 0) {
        console.log('[SOLANA] No Boson token holders found');
        return [];
      }

      console.log(`[SOLANA] Found ${bosonHolders.length} Boson token holders`);

      // Step 2: Get all player modules (including Boson for testing)
      const playerModules = Array.from(this.playerMints.keys());
      
      console.log(`[SOLANA] Checking balances for ${bosonHolders.length} holder(s) across ${playerModules.length} tokens (including Boson)...`);
      
      const balanceTasks: Promise<{
        address: string;
        moduleName: string;
        playerId: string;
        balance: bigint;
      } | null>[] = [];

      // Step 3: For each holder, check balances across all player tokens
      // Add delay to avoid rate limiting
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      
      for (const address of bosonHolders) {
        for (let i = 0; i < playerModules.length; i++) {
          const moduleName = playerModules[i];
          const index = i;
          
          balanceTasks.push((async () => {
            try {
              // Add small delay between requests to avoid rate limiting (100ms per request)
              await delay(i * 100);
              
              const balance = await this.getTokenBalance(address, moduleName);
              
              // Debug logging for all modules
              if (balance > 0n) {
                console.log(`[SOLANA] ✅ Found: ${moduleName} balance ${balance} for ${address}`);
              } else if (moduleName === 'ShubhmanGill') {
                console.log(`[SOLANA] ❌ ShubhmanGill: balance is 0 for ${address}`);
              }
              
              if (balance > 0n) {
                return { 
                  address, 
                  moduleName, 
                  playerId: (index + 1).toString(), 
                  balance 
                };
              }
              return null;
            } catch (error) {
              console.error(`[SOLANA] Balance fetch failed for ${address} in ${moduleName}:`, error);
              return null;
            }
          })());
        }
      }

      const results = await Promise.allSettled(balanceTasks);
      
      const balances: TokenHolder[] = results
        .filter((r): r is PromiseFulfilledResult<{ address: string; moduleName: string; playerId: string; balance: bigint } | null> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter((v): v is { address: string; moduleName: string; playerId: string; balance: bigint } => v !== null)
        .map(v => ({
          address: v.address,
          balance: v.balance,
          formattedBalance: this.formatBalance(v.balance),
          playerId: v.playerId,
          moduleName: v.moduleName,
        }));

      console.log(`[SOLANA] Found ${balances.length} total token holdings across all modules`);
      return balances;
    } catch (error) {
      console.error('[SOLANA] Error in getTokenHoldersWithBalances:', error);
      throw new Error(`Failed to get token holders with balances: ${error}`);
    }
  }

  /**
   * Get unified holder list sourced from Boson token module
   * Same strategy as Aptos adapter
   */
  async getBosonTokenHolders(): Promise<string[]> {
    try {
      const bosonModule = 'Boson';
      const holders = await this.getTokenHolders(bosonModule);
      // Deduplicate in case there are duplicates
      const unique = Array.from(new Set(holders.filter(Boolean)));
      return unique;
    } catch (error) {
      console.error('[SOLANA] Error fetching Boson token holders:', error);
      return [];
    }
  }

  /**
   * Get token holders for specific player with balances
   */
  async getTokenHoldersForPlayer(playerModule: string): Promise<TokenHolder[]> {
    const holders = await this.getTokenHolders(playerModule);
    const holdersWithBalances: TokenHolder[] = [];

    for (const holderAddress of holders) {
      const balance = await this.getTokenBalance(holderAddress, playerModule);

      if (balance > BigInt(0)) {
        holdersWithBalances.push({
          address: holderAddress,
          balance,
          formattedBalance: this.formatBalance(balance),
          playerId: playerModule,
          moduleName: playerModule,
        });
      }
    }

    return holdersWithBalances;
  }

  /**
   * Get balance for address across all player tokens (including Boson for testing)
   */
  async getBalanceForAllPlayers(address: string): Promise<TokenHolder[]> {
    const balances: TokenHolder[] = [];
    const playerModules = Array.from(this.playerMints.keys());

    for (const moduleName of playerModules) {
      const balance = await this.getTokenBalance(address, moduleName);

      if (balance > BigInt(0)) {
        balances.push({
          address,
          balance,
          formattedBalance: this.formatBalance(balance),
          moduleName,
        });
      }
    }

    return balances;
  }

  /**
   * Transfer tokens (for reward distribution)
   * 
   * Solana approach: Create SPL token transfer instruction
   * Uses Associated Token Accounts (ATAs) for both source and destination
   */
  async transferTokens(
    privateKeyString: string,
    toAddress: string,
    amount: number,
    tokenType: string
  ): Promise<TransferResult> {
    try {
      // Parse private key - support both base58 and JSON array formats
      let keypair: Keypair;
      try {
        // Try base58 format first (most common for Solana)
        const secretKey = bs58.decode(privateKeyString);
        keypair = Keypair.fromSecretKey(secretKey);
      } catch {
        // Try JSON array format as fallback
        const secretKey = new Uint8Array(JSON.parse(privateKeyString));
        keypair = Keypair.fromSecretKey(secretKey);
      }

      // Get mint address from token type
      // tokenType can be either a player module name or a full mint address
      let mintAddress: PublicKey;
      if (this.playerMints.has(tokenType)) {
        mintAddress = this.playerMints.get(tokenType)!;
      } else {
        mintAddress = new PublicKey(tokenType);
      }

      const toPublicKey = new PublicKey(toAddress);

      // Get source ATA (sender's token account)
      const sourceATA = await getAssociatedTokenAddress(
        mintAddress,
        keypair.publicKey
      );

      // Get destination ATA (receiver's token account)
      const destATA = await getAssociatedTokenAddress(
        mintAddress,
        toPublicKey
      );

      // Create transfer instruction
      const instruction = createTransferInstruction(
        sourceATA,
        destATA,
        keypair.publicKey,
        amount,
        [],
        TOKEN_PROGRAM_ID
      );

      // Create and send transaction
      const transaction = new Transaction().add(instruction);
      const signature = await this.connection.sendTransaction(
        transaction,
        [keypair],
        { skipPreflight: false }
      );

      // Confirm transaction
      const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');

      return {
        success: !confirmation.value.err,
        transactionHash: signature,
        explorerUrl: this.getExplorerUrl(signature),
      };
    } catch (error) {
      return {
        success: false,
        transactionHash: '',
        explorerUrl: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get account information
   * Returns SOL balance and account details
   */
  async getAccountInfo(address: string): Promise<AccountInfo> {
    try {
      const publicKey = new PublicKey(address);
      const balance = await this.connection.getBalance(publicKey);

      return {
        address,
        balance: balance.toString(),
        balanceFormatted: (balance / 1e9).toFixed(9), // SOL has 9 decimals
        publicKey: publicKey.toBase58(),
      };
    } catch (error) {
      throw new Error(`Failed to get account info: ${error}`);
    }
  }

  /**
   * Get current block number (slot in Solana terminology)
   */
  async getCurrentBlockNumber(): Promise<string> {
    try {
      const slot = await this.connection.getSlot();
      return slot.toString();
    } catch (error) {
      console.error('[SOLANA] Error getting block number:', error);
      return '0';
    }
  }

  /**
   * Get network name based on RPC URL
   */
  getNetwork(): string {
    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.QUICKNODE_API_URL || '';
    if (rpcUrl.includes('devnet')) return 'Solana Devnet';
    if (rpcUrl.includes('testnet')) return 'Solana Testnet';
    return 'Solana Mainnet';
  }

  /**
   * Get explorer URL for transaction
   */
  getExplorerUrl(txHash: string): string {
    const network = this.getNetwork().toLowerCase();
    const cluster = network.includes('devnet') ? '?cluster=devnet' : 
                   network.includes('testnet') ? '?cluster=testnet' : '';
    return `https://explorer.solana.com/tx/${txHash}${cluster}`;
  }

  /**
   * Format balance with proper decimals (9 for Solana SPL tokens)
   */
  private formatBalance(balance: bigint): string {
    return (Number(balance) / 1e9).toFixed(9);
  }
}

// Export singleton instance
export const solanaAdapter = new SolanaAdapter();

