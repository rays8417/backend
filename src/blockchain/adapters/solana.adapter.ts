import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { 
  getAccount, 
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { IBlockchainService, TokenHolder, TransferResult, AccountInfo } from '../interfaces/IBlockchainService';
import { parseIgnoredAddresses, REWARD_CONFIG } from '../../config/reward.config';
import { PLAYER_TOKEN_MINTS, PLAYER_POOL_MAP } from '../../utils/constants';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Solana Blockchain Adapter
 * Implements IBlockchainService for Solana blockchain
 * 
 * Key features:
 * - Uses SPL Token standard for Solana tokens
 * - Token accounts are Associated Token Accounts (ATAs)
 * - 3 decimals for Solana tokens (configurable)
 * - Direct RPC account queries for token holders
 */

// Player token mints configuration - imported from constants.ts (single source of truth)
// PLAYER_TOKEN_MINTS is now imported from '../../utils/constants'

// Pool addresses for each player token (liquidity pools for trading)
// These should be ignored when counting token holders since they're protocol-owned
// Convert PLAYER_POOL_MAP to array for compatibility with existing code
const PLAYER_POOL_ADDRESSES = Object.values(PLAYER_POOL_MAP);

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
    const rpcUrl = process.env.SOLANA_RPC_URL;
    if (!rpcUrl) {
      throw new Error('SOLANA_RPC_URL must be set in environment');
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
   */
  async getTokenHolders(playerModule: string): Promise<string[]> {
    try {
      const mintAddress = this.playerMints.get(playerModule);
      if (!mintAddress) {
        console.error(`[SOLANA] Mint not found for player: ${playerModule}`);
        return [];
      }
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
          
            // Validate address format (must be 32-44 characters for base58)
            if (!owner || owner.length < 32 || owner.length > 44) {
              console.error(`[SOLANA] Invalid address length: ${owner} (${owner?.length} chars)`);
              continue;
            }
            
            try {
              new PublicKey(owner);
            } catch (err) {
              console.error(`[SOLANA] Invalid address format: ${owner} - ${err instanceof Error ? err.message : 'Unknown error'}`);
              continue;
            }
            
            holders.push(owner);
          }
        }
      }

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
      
      // Instead of calculating ATA, query all token accounts owned by this address for this mint
      try {
        const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
          ownerPublicKey,
          { mint: mintAddress }
        );

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
          }
        }

        return totalBalance;
      } catch (error) {
        return BigInt(0);
      }
    } catch (error) {
      return BigInt(0);
    }
  }

  /**
   * Get all token holders with balances across all players
   * 
   * OPTIMIZED Strategy: Query each player token mint directly for ALL holders
   * This makes exactly 25 RPC calls (one per player token) regardless of user count!
   * Excludes Boson game token - only includes actual player tokens.
   * 
   * Previous approach: N users × 26 tokens = 26N calls
   * New approach: 25 player tokens = 25 calls (fixed!)
   */
  async getTokenHoldersWithBalances(eligiblePlayers?: string[]): Promise<TokenHolder[]> {
    try {
      console.log('[SOLANA] Fetching token holders using optimized approach...');
      
      // Determine which players to process
      let playerModules: string[];
      if (eligiblePlayers && eligiblePlayers.length > 0) {
        // Filter to only eligible players and exclude Boson
        playerModules = eligiblePlayers.filter(m => m !== 'Boson' && this.playerMints.has(m));
        console.log(`[SOLANA] Querying ${playerModules.length} eligible player tokens (filtered from ${eligiblePlayers.length} eligible players)...`);
      } else {
        // Exclude Boson token - only get player tokens for snapshots
        playerModules = Array.from(this.playerMints.keys()).filter(m => m !== 'Boson');
        console.log(`[SOLANA] Querying ${playerModules.length} player tokens (excludes Boson game token)...`);
      }
      
      const allHolders: TokenHolder[] = [];
      
      // For each player token, get ALL holders with balances in ONE call
      for (let i = 0; i < playerModules.length; i++) {
        const moduleName = playerModules[i];
        const playerId = (i + 1).toString();
        
        console.log(`[SOLANA] [${i + 1}/${playerModules.length}] Fetching holders for ${moduleName}...`);
        
        try {
          const holders = await this.getTokenHoldersForPlayer(moduleName, playerId);
          
          if (holders.length > 0) {
            console.log(`[SOLANA] ✅ ${moduleName}: Found ${holders.length} holder(s)`);
            allHolders.push(...holders);
          }
            } catch (error) {
          console.error(`[SOLANA] ❌ Error fetching holders for ${moduleName}:`, error);
          // Continue with other tokens even if one fails
        }
      }

      console.log(`[SOLANA] ✅ Total: Found ${allHolders.length} token holdings across ${playerModules.length} tokens`);
      console.log(`[SOLANA] RPC calls made: ${playerModules.length} (fixed cost, regardless of user count)`);
      
      return allHolders;
    } catch (error) {
      console.error('[SOLANA] Error in getTokenHoldersWithBalances:', error);
      throw new Error(`Failed to get token holders with balances: ${error}`);
    }
  }

  /**
   * Get token holders with balances for specific eligible players only
   * 
   * This method filters the snapshot to only include eligible players for a tournament,
   * providing a more focused snapshot that only includes relevant player tokens.
   */
  async getTokenHoldersWithBalancesForEligiblePlayers(eligiblePlayers: string[]): Promise<TokenHolder[]> {
    try {
      console.log(`[SOLANA] Fetching token holders for eligible players only: ${eligiblePlayers.join(', ')}`);
      
      // Validate that all eligible players exist in our player mints
      const validEligiblePlayers = eligiblePlayers.filter(player => this.playerMints.has(player));
      const invalidPlayers = eligiblePlayers.filter(player => !this.playerMints.has(player));
      
      if (invalidPlayers.length > 0) {
        console.warn(`[SOLANA] ⚠️  Invalid eligible players found: ${invalidPlayers.join(', ')}`);
        console.warn(`[SOLANA] ⚠️  Available players: ${Array.from(this.playerMints.keys()).join(', ')}`);
      }
      
      if (validEligiblePlayers.length === 0) {
        console.log(`[SOLANA] ⚠️  No valid eligible players found, returning empty result`);
        return [];
      }
      
      console.log(`[SOLANA] Querying ${validEligiblePlayers.length} eligible player tokens...`);
      
      const allHolders: TokenHolder[] = [];
      
      // For each eligible player token, get ALL holders with balances in ONE call
      for (let i = 0; i < validEligiblePlayers.length; i++) {
        const moduleName = validEligiblePlayers[i];
        const playerId = (i + 1).toString();
        
        console.log(`[SOLANA] [${i + 1}/${validEligiblePlayers.length}] Fetching holders for ${moduleName}...`);
        
        try {
          const holders = await this.getTokenHoldersForPlayer(moduleName, playerId);
          
          if (holders.length > 0) {
            console.log(`[SOLANA] ✅ ${moduleName}: Found ${holders.length} holder(s)`);
            allHolders.push(...holders);
          }
        } catch (error) {
          console.error(`[SOLANA] ❌ Error fetching holders for ${moduleName}:`, error);
          // Continue with other tokens even if one fails
        }
      }

      console.log(`[SOLANA] ✅ Total: Found ${allHolders.length} token holdings across ${validEligiblePlayers.length} eligible tokens`);
      console.log(`[SOLANA] RPC calls made: ${validEligiblePlayers.length} (optimized for eligible players only)`);
      
      return allHolders;
    } catch (error) {
      console.error('[SOLANA] Error in getTokenHoldersWithBalancesForEligiblePlayers:', error);
      throw new Error(`Failed to get token holders for eligible players: ${error}`);
    }
  }

  /**
   * Get unified holder list sourced from Boson token module
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
   * OPTIMIZED: Gets holders and balances in a SINGLE RPC call
   */
  async getTokenHoldersForPlayer(playerModule: string, playerId?: string): Promise<TokenHolder[]> {
    try {
      const mintAddress = this.playerMints.get(playerModule);
      if (!mintAddress) {
        console.error(`[SOLANA] Mint not found for player: ${playerModule}`);
        return [];
      }

      // Get all token accounts for this mint - this returns holders WITH balances!
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

    const holdersWithBalances: TokenHolder[] = [];

      for (const { account } of tokenAccounts) {
        const parsedInfo = (account.data as any).parsed?.info;
        
        if (parsedInfo) {
          const hasBalance = parsedInfo.tokenAmount.uiAmount > 0 || parsedInfo.tokenAmount.amount > 0;
          
          if (hasBalance) {
            const owner = parsedInfo.owner;
            
            // Filter out ignored addresses (pool, AMM, etc.)
            if (IGNORED_ADDRESS_SET.has(owner.toLowerCase())) {
              continue;
            }
            
            // Validate address format (must be 32-44 characters for base58)
            if (!owner || owner.length < 32 || owner.length > 44) {
              console.error(`[SOLANA] Invalid address length: ${owner} (${owner?.length} chars)`);
              continue;
            }
            
            try {
              new PublicKey(owner);
            } catch (err) {
              console.error(`[SOLANA] Invalid address format: ${owner} - ${err instanceof Error ? err.message : 'Unknown error'}`);
              continue;
            }
            
            // Extract balance (already in the data!)
            const balance = BigInt(parsedInfo.tokenAmount.amount);
            
        holdersWithBalances.push({
              address: owner,
          balance,
          formattedBalance: this.formatBalance(balance),
              playerId: playerId || playerModule,
          moduleName: playerModule,
        });
          }
      }
    }

    return holdersWithBalances;
    } catch (error) {
      console.error(`[SOLANA] Error getting holders for ${playerModule}:`, error);
      return [];
    }
  }

  /**
   * Get balance for address across all player tokens (excludes Boson game token)
   */
  async getBalanceForAllPlayers(address: string): Promise<TokenHolder[]> {
    const balances: TokenHolder[] = [];
    const playerModules = Array.from(this.playerMints.keys()).filter(m => m !== 'Boson');

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
      } catch (base58Error) {
        try {
        // Try JSON array format as fallback
          if (privateKeyString.startsWith('[') && privateKeyString.endsWith(']')) {
        const secretKey = new Uint8Array(JSON.parse(privateKeyString));
        keypair = Keypair.fromSecretKey(secretKey);
          } else {
            throw new Error(`Invalid private key format. Expected base58 or JSON array. Base58 error: ${base58Error instanceof Error ? base58Error.message : 'Unknown error'}`);
          }
        } catch (jsonError) {
          throw new Error(`Failed to parse private key. Base58 error: ${base58Error instanceof Error ? base58Error.message : 'Unknown'}. JSON error: ${jsonError instanceof Error ? jsonError.message : 'Unknown'}`);
        }
      }

      // Get mint address from token type
      // tokenType can be either a player module name or a full mint address
      let mintAddress: PublicKey;
      if (this.playerMints.has(tokenType)) {
        mintAddress = this.playerMints.get(tokenType)!;
      } else {
        mintAddress = new PublicKey(tokenType);
      }

      // Validate address before attempting to create PublicKey
      if (!toAddress || typeof toAddress !== 'string') {
        throw new Error(`Invalid address: address is ${toAddress === null ? 'null' : typeof toAddress}`);
      }
      
      if (toAddress.length < 32 || toAddress.length > 44) {
        throw new Error(`Invalid address length: ${toAddress.length} chars. Expected 32-44 chars for valid Solana address. Address: ${toAddress}`);
      }
      
      const toPublicKey = new PublicKey(toAddress);

      // Prevent self-transfers
      if (toPublicKey.equals(keypair.publicKey)) {
        throw new Error(`Cannot transfer tokens to self. Admin wallet (${keypair.publicKey.toBase58()}) cannot receive rewards as it's the distributor.`);
      }

      // Get source ATA (sender's token account)
      // Allow off-curve addresses for Token-2022 support
      const sourceATA = await getAssociatedTokenAddress(
        mintAddress,
        keypair.publicKey,
        false, // allowOwnerOffCurve for owner (usually false for source)
        TOKEN_PROGRAM_ID // Will be updated if Token-2022 is detected
      );

      // Get destination ATA (receiver's token account)
      // Allow off-curve addresses for Token-2022 support
      const destATA = await getAssociatedTokenAddress(
        mintAddress,
        toPublicKey,
        true, // allowOwnerOffCurve - CRITICAL for Token-2022 support
        TOKEN_PROGRAM_ID // Will be updated if Token-2022 is detected
      );

      // Ensure amount is a valid bigint for the transfer instruction
      const transferAmount = BigInt(Math.floor(amount));
      
      if (transferAmount <= 0n) {
        throw new Error(`Invalid transfer amount: ${amount}. Must be greater than 0.`);
      }

      // Check SOL balance for transaction fees
      const solBalance = await this.connection.getBalance(keypair.publicKey);
      const solBalanceFormatted = solBalance / 1e9;
      
      if (solBalance < 5000) { // Less than 0.000005 SOL - very low threshold
        console.warn(`[SOLANA] Warning: Very low SOL balance (${solBalanceFormatted.toFixed(6)} SOL). May cause transaction failures.`);
      }
      
      // Check if source token account exists and has sufficient balance
      let sourceAccountInfo;
      
      try {
        // Try to get account with default TOKEN_PROGRAM_ID first
        sourceAccountInfo = await getAccount(this.connection, sourceATA);
        const currentBalance = sourceAccountInfo.amount;
        
        // Verify mint addresses match
        if (!sourceAccountInfo.mint.equals(mintAddress)) {
          throw new Error(`Mint mismatch! Source account mint: ${sourceAccountInfo.mint.toBase58()}, Expected: ${mintAddress.toBase58()}`);
        }
        
        if (currentBalance < transferAmount) {
          throw new Error(`Insufficient balance. Source has ${currentBalance.toString()}, trying to transfer ${transferAmount.toString()}`);
        }
      } catch (accountError) {
        console.error(`[SOLANA] Error checking source account with TOKEN_PROGRAM_ID:`, accountError);
        
        // Try to get account info directly to see if it exists but with different program
        try {
          const accountInfo = await this.connection.getAccountInfo(sourceATA);
          
          if (!accountInfo) {
            throw new Error(`Source token account ${sourceATA.toBase58()} does not exist. This means the admin wallet does not have any ${tokenType} tokens. Please ensure the admin wallet has sufficient tokens for distribution.`);
          }
          
          if (!accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
            throw new Error(`Source account ${sourceATA.toBase58()} has unexpected owner: ${accountInfo.owner.toBase58()}`);
          }
        } catch (fallbackError) {
          if (accountError instanceof Error) {
            const errorMsg = accountError.message;
            
            if (errorMsg.includes('could not find account') || errorMsg.includes('Account does not exist')) {
              throw new Error(`Source token account ${sourceATA.toBase58()} does not exist. This means the admin wallet does not have any ${tokenType} tokens. Please ensure the admin wallet has sufficient tokens for distribution.`);
            } else if (errorMsg.includes('Invalid account')) {
              throw new Error(`Invalid source token account ${sourceATA.toBase58()}. This might not be a valid token account.`);
            } else {
              throw new Error(`Failed to check source account balance: ${errorMsg}`);
            }
          } else {
            console.error(`[SOLANA] Unknown error type:`, typeof accountError, accountError);
            throw new Error(`Failed to check source account balance: Unknown error type`);
          }
        }
      }

      // Check if destination token account exists, create if needed
      let destinationAccountExists = false;
      
      // Use getAccountInfo instead of getAccount to get better error handling
      try {
        const accountInfo = await this.connection.getAccountInfo(destATA);
        destinationAccountExists = !!accountInfo;
      } catch (destAccountError) {
        destinationAccountExists = false;
      }

      // Create transaction instructions
      const transaction = new Transaction();
      
      // Determine which token program to use based on the source account's owner
      let tokenProgram = TOKEN_PROGRAM_ID;
      
      // If we have sourceAccountInfo, use that to determine the program
      if (sourceAccountInfo && sourceAccountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
        tokenProgram = TOKEN_2022_PROGRAM_ID;
      } else if (!sourceAccountInfo) {
        // If sourceAccountInfo is undefined, we need to check the account info directly
        try {
          const accountInfo = await this.connection.getAccountInfo(sourceATA);
          if (accountInfo && accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
            tokenProgram = TOKEN_2022_PROGRAM_ID;
          }
        } catch (err) {
          // Default to TOKEN_PROGRAM_ID
        }
      }

      // Add account creation instruction if needed (using the same token program)
      if (!destinationAccountExists) {
        const createInstruction = createAssociatedTokenAccountInstruction(
          keypair.publicKey, // payer
          destATA,          // associated token account
          toPublicKey,      // owner
          mintAddress,      // mint
          tokenProgram      // token program (match the source account)
        );
        transaction.add(createInstruction);
      }

      // Create transfer instruction with appropriate token program
      const transferInstruction = createTransferInstruction(
        sourceATA,
        destATA,
        keypair.publicKey,
        transferAmount,
        [],
        tokenProgram
      );
      
      transaction.add(transferInstruction);
      
      // First try to simulate the transaction to catch issues early
      try {
        const simulationResult = await this.connection.simulateTransaction(transaction, [keypair]);
        if (simulationResult.value.err) {
          throw new Error(`Transaction simulation failed: ${JSON.stringify(simulationResult.value.err)}`);
        }
      } catch (simError) {
        console.error(`[SOLANA] Simulation error:`, simError);
        throw new Error(`Transaction simulation failed: ${simError instanceof Error ? simError.message : 'Unknown simulation error'}`);
      }
      
      let signature;
      try {
        signature = await this.connection.sendTransaction(
          transaction,
          [keypair],
          { 
            skipPreflight: false,
            maxRetries: 3
          }
        );
        console.log(`[SOLANA] Transaction sent: ${signature}`);
      } catch (sendError) {
        console.error(`[SOLANA] Send transaction error:`, sendError);
        throw new Error(`Failed to send transaction: ${sendError instanceof Error ? sendError.message : 'Unknown send error'}`);
      }

      // Confirm transaction using HTTP polling (avoids unreliable WebSocket issues)
      let confirmation;
      const maxAttempts = 30; // 30 attempts * 2s = 60s total
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const status = await this.connection.getSignatureStatus(signature);
          
          if (status?.value) {
            const confirmationStatus = status.value.confirmationStatus;
            
            if (confirmationStatus === 'confirmed' || confirmationStatus === 'finalized') {
              confirmation = { value: { err: status.value.err } };
              break;
            }
          }
          
          // Wait 2 seconds before next check
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (statusError) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      if (!confirmation) {
        throw new Error(`Transaction confirmation timeout after ${maxAttempts * 2}s. Transaction may still succeed - check signature: ${signature}`);
      }

      const success = !confirmation.value.err;
      
      if (!success) {
        console.error(`[SOLANA] Transaction failed with error:`, confirmation.value.err);
        console.error(`[SOLANA] Full confirmation result:`, JSON.stringify(confirmation.value, null, 2));
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      return {
        success: true,
        transactionHash: signature,
        explorerUrl: this.getExplorerUrl(signature),
      };
    } catch (error) {
      console.error(`[SOLANA] Transfer failed for ${toAddress} (${amount} tokens):`, error);
      
      // Provide detailed error information
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
        console.error(`[SOLANA] Error details: ${error.stack || 'No stack trace'}`);
      } else {
        console.error(`[SOLANA] Non-Error type caught:`, typeof error, error);
      }
      
      return {
        success: false,
        transactionHash: '',
        explorerUrl: '',
        error: errorMessage,
      };
    }
  }

  /**
   * Batch transfer tokens to multiple recipients
   * More efficient than sequential transfers - processes multiple transfers in parallel
   * 
   * @param privateKeyString - Admin private key
   * @param transfers - Array of {address, amount} objects
   * @param moduleName - Token module name (e.g., 'Boson')
   * @param batchSize - Number of parallel transfers (default: 5)
   */
  async batchTransferTokens(
    privateKeyString: string,
    transfers: Array<{ address: string; amount: number }>,
    moduleName: string,
    batchSize: number = 5
  ): Promise<Array<TransferResult & { address: string }>> {
    console.log(`🚀 Processing ${transfers.length} transfers in batches of ${batchSize}...`);
    
    const results: Array<TransferResult & { address: string }> = [];
    
    // Process in batches to avoid overwhelming the RPC
    for (let i = 0; i < transfers.length; i += batchSize) {
      const batch = transfers.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(transfers.length / batchSize);
      
      // Execute transfers in parallel within the batch
      const batchPromises = batch.map(async (transfer) => {
        try {
          const result = await this.transferTokens(
            privateKeyString,
            transfer.address,
            transfer.amount,
            moduleName
          );
          return { ...result, address: transfer.address };
        } catch (error) {
          return {
            success: false,
            transactionHash: '',
            explorerUrl: '',
            error: error instanceof Error ? error.message : 'Unknown error',
            address: transfer.address
          };
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Extract results from settled promises
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            success: false,
            transactionHash: '',
            explorerUrl: '',
            error: result.reason instanceof Error ? result.reason.message : 'Promise rejected',
            address: 'unknown'
          });
        }
      }
      
      // Show progress for each batch
      const batchSuccess = batchResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const batchFailed = batchResults.length - batchSuccess;
      
      if (batchFailed > 0) {
        console.log(`   Batch ${batchNumber}/${totalBatches}: ${batchSuccess} ✅, ${batchFailed} ❌`);
      } else {
        console.log(`   Batch ${batchNumber}/${totalBatches}: ${batchSuccess} ✅`);
      }
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < transfers.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    console.log(`\n📊 Batch Transfer Complete: ${successCount} succeeded, ${failCount} failed`);
    
    // Only show details for failed transfers
    if (failCount > 0) {
      console.log('\n❌ Failed Transfers:');
      results.filter(r => !r.success).forEach((result, index) => {
        console.log(`   ${index + 1}. ${result.address.slice(0, 12)}... - ${result.error}`);
      });
    }
    
    return results;
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
    const rpcUrl = process.env.SOLANA_RPC_URL || '';
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
   * Format balance with proper decimals (3 for Solana SPL tokens)
   */
  private formatBalance(balance: bigint): string {
    const decimals = REWARD_CONFIG.BOSON_DECIMALS;
    const divisor = Math.pow(10, decimals);
    return (Number(balance) / divisor).toFixed(decimals);
  }
}

// Export singleton instance
export const solanaAdapter = new SolanaAdapter();

