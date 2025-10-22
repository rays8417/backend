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
  async getTokenHoldersWithBalances(): Promise<TokenHolder[]> {
    try {
      console.log('[SOLANA] Fetching token holders using optimized approach...');
      
      // Exclude Boson token - only get player tokens for snapshots
      const playerModules = Array.from(this.playerMints.keys()).filter(m => m !== 'Boson');
      console.log(`[SOLANA] Querying ${playerModules.length} player tokens (excludes Boson game token)...`);
      
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
            
            // Validate address format
            try {
              new PublicKey(owner);
            } catch (err) {
              console.error(`[SOLANA] Invalid address format: ${owner}`);
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

      console.log(`[SOLANA] Transfer amount: ${transferAmount} (original: ${amount})`);
      console.log(`[SOLANA] Source ATA: ${sourceATA.toBase58()}`);
      console.log(`[SOLANA] Destination ATA: ${destATA.toBase58()}`);

      // DIAGNOSTIC: Show admin wallet info and what tokens they have
      console.log(`[SOLANA] Admin wallet address: ${keypair.publicKey.toBase58()}`);
      
      // Check SOL balance for transaction fees
      const solBalance = await this.connection.getBalance(keypair.publicKey);
      const solBalanceFormatted = solBalance / 1e9;
      console.log(`[SOLANA] Admin SOL balance: ${solBalanceFormatted.toFixed(4)} SOL (${solBalance} lamports)`);
      
      if (solBalance < 5000) { // Less than 0.000005 SOL - very low threshold
        console.warn(`[SOLANA] Warning: Very low SOL balance (${solBalanceFormatted.toFixed(6)} SOL). May cause transaction failures.`);
      }
      
      console.log(`[SOLANA] Looking for Boson token account...`);
      
      try {
        const adminTokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
          keypair.publicKey,
          { programId: TOKEN_PROGRAM_ID }
        );
        
        console.log(`[SOLANA] Admin wallet has ${adminTokenAccounts.value.length} token accounts:`);
        for (const { pubkey, account } of adminTokenAccounts.value) {
          const accountInfo = (account.data as any).parsed?.info;
          if (accountInfo) {
            console.log(`  - ${pubkey.toBase58()}: ${accountInfo.tokenAmount.amount} tokens (mint: ${accountInfo.mint})`);
          }
        }
        
        // Check if any token account matches the Boson mint
        const bosonMint = mintAddress.toBase58();
        const hasBosonTokens = adminTokenAccounts.value.some(({ account }) => {
          const info = (account.data as any).parsed?.info;
          return info && info.mint === bosonMint && BigInt(info.tokenAmount.amount) > 0n;
        });
        
        if (!hasBosonTokens) {
          console.log(`[SOLANA] ❌ Admin wallet has NO ${tokenType} tokens!`);
          console.log(`[SOLANA] Expected Boson mint: ${bosonMint}`);
          console.log(`[SOLANA] Admin needs to receive some ${tokenType} tokens before rewards can be distributed.`);
        }
      } catch (diagError) {
        console.log(`[SOLANA] Could not check admin wallet tokens: ${diagError}`);
      }

      // Check if source token account exists and has sufficient balance
      let sourceAccountInfo;
      console.log(`[SOLANA] Checking source token account: ${sourceATA.toBase58()}`);
      console.log(`[SOLANA] Expected mint: ${mintAddress.toBase58()}`);
      console.log(`[SOLANA] Token type: ${tokenType}`);
      
      try {
        // Try to get account with default TOKEN_PROGRAM_ID first
        sourceAccountInfo = await getAccount(this.connection, sourceATA);
        console.log(`[SOLANA] Found source account using TOKEN_PROGRAM_ID`);
        const currentBalance = sourceAccountInfo.amount;
        
        console.log(`[SOLANA] Source account details:`);
        console.log(`  - Address: ${sourceATA.toBase58()}`);
        console.log(`  - Owner: ${sourceAccountInfo.owner.toBase58()}`);
        console.log(`  - Mint: ${sourceAccountInfo.mint.toBase58()}`);
        console.log(`  - Amount: ${currentBalance.toString()}`);
        console.log(`  - Required: ${transferAmount.toString()}`);
        console.log(`  - Expected Mint: ${mintAddress.toBase58()}`);
        console.log(`  - Token Program: ${sourceAccountInfo.owner.toBase58()}`);
        
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
          console.log(`[SOLANA] Checking if account exists with different program...`);
          const accountInfo = await this.connection.getAccountInfo(sourceATA);
          
          if (!accountInfo) {
            throw new Error(`Source token account ${sourceATA.toBase58()} does not exist. This means the admin wallet does not have any ${tokenType} tokens. Please ensure the admin wallet has sufficient tokens for distribution.`);
          }
          
          console.log(`[SOLANA] Account exists but owner is: ${accountInfo.owner.toBase58()}`);
          console.log(`[SOLANA] Expected TOKEN_PROGRAM_ID: ${TOKEN_PROGRAM_ID.toBase58()}`);
          console.log(`[SOLANA] Expected TOKEN_2022_PROGRAM_ID: ${TOKEN_2022_PROGRAM_ID.toBase58()}`);
          
          if (accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
            console.log(`[SOLANA] Account uses TOKEN_2022_PROGRAM_ID - will handle this in token program detection below`);
            // Continue processing, we'll detect this below
          } else {
            throw new Error(`Source account ${sourceATA.toBase58()} has unexpected owner: ${accountInfo.owner.toBase58()}`);
          }
        } catch (fallbackError) {
          console.error(`[SOLANA] Fallback check failed:`, fallbackError);
          
          if (accountError instanceof Error) {
            const errorMsg = accountError.message;
            console.error(`[SOLANA] Original error message: ${errorMsg}`);
            
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
        if (accountInfo) {
          destinationAccountExists = true;
          console.log(`[SOLANA] Destination ATA exists: ${destATA.toBase58()}`);
        } else {
          console.log(`[SOLANA] Destination ATA does not exist, will create it: ${destATA.toBase58()}`);
          destinationAccountExists = false;
        }
      } catch (destAccountError) {
        const errorMessage = destAccountError instanceof Error ? destAccountError.message : String(destAccountError);
        console.log(`[SOLANA] Error checking destination account: ${errorMessage}`);
        console.log(`[SOLANA] Assuming destination ATA does not exist, will create it: ${destATA.toBase58()}`);
        destinationAccountExists = false;
      }

      // Create transaction instructions
      const transaction = new Transaction();
      
      // Determine which token program to use based on the source account's owner
      let tokenProgram = TOKEN_PROGRAM_ID;
      
      // If we have sourceAccountInfo, use that to determine the program
      if (sourceAccountInfo && sourceAccountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
        tokenProgram = TOKEN_2022_PROGRAM_ID;
        console.log(`[SOLANA] Source account uses TOKEN_2022_PROGRAM_ID (from sourceAccountInfo)`);
      } else if (sourceAccountInfo) {
        console.log(`[SOLANA] Source account uses TOKEN_PROGRAM_ID (from sourceAccountInfo)`);
      } else {
        // If sourceAccountInfo is undefined, we need to check the account info directly
        try {
          const accountInfo = await this.connection.getAccountInfo(sourceATA);
          if (accountInfo && accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
            tokenProgram = TOKEN_2022_PROGRAM_ID;
            console.log(`[SOLANA] Source account uses TOKEN_2022_PROGRAM_ID (from getAccountInfo)`);
          } else {
            console.log(`[SOLANA] Source account uses TOKEN_PROGRAM_ID (from getAccountInfo)`);
          }
        } catch (err) {
          console.log(`[SOLANA] Could not determine token program, defaulting to TOKEN_PROGRAM_ID`);
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
        console.log(`[SOLANA] Added account creation instruction for ${destATA.toBase58()} using ${tokenProgram.toBase58()}`);
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
      
      console.log(`[SOLANA] Using token program: ${tokenProgram.toBase58()}`);
      transaction.add(transferInstruction);
      
      console.log(`[SOLANA] Sending transaction to ${toAddress} for ${amount} tokens...`);
      
      // First try to simulate the transaction to catch issues early
      try {
        const simulationResult = await this.connection.simulateTransaction(transaction, [keypair]);
        if (simulationResult.value.err) {
          throw new Error(`Transaction simulation failed: ${JSON.stringify(simulationResult.value.err)}`);
        }
        console.log(`[SOLANA] Transaction simulation successful`);
        if (simulationResult.value.logs) {
          console.log(`[SOLANA] Simulation logs:`, simulationResult.value.logs);
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

      // Confirm transaction with retry logic and status checking
      let confirmation;
      let retries = 0;
      const maxRetries = 3;
      
      while (retries < maxRetries) {
        try {
          // Use finalized commitment for more reliable confirmation, but with timeout
          const confirmPromise = this.connection.confirmTransaction(signature, 'confirmed');
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Confirmation timeout')), 60000) // 60s timeout
          );
          
          confirmation = await Promise.race([confirmPromise, timeoutPromise]) as any;
          console.log(`[SOLANA] Transaction confirmed: ${JSON.stringify(confirmation.value)}`);
          break;
        } catch (confirmError) {
          console.error(`[SOLANA] Confirmation attempt ${retries + 1} error:`, confirmError);
          
          // Check if transaction actually succeeded by fetching it
          try {
            const status = await this.connection.getSignatureStatus(signature);
            if (status?.value?.confirmationStatus === 'confirmed' || status?.value?.confirmationStatus === 'finalized') {
              console.log(`[SOLANA] Transaction found on-chain with status: ${status.value.confirmationStatus}`);
              confirmation = { value: { err: status.value.err } };
              break;
            }
          } catch (statusError) {
            console.error(`[SOLANA] Error checking transaction status:`, statusError);
          }
          
          retries++;
          if (retries >= maxRetries) {
            // Last resort: check one more time if transaction is on-chain
            try {
              const finalStatus = await this.connection.getSignatureStatus(signature);
              if (finalStatus?.value) {
                console.log(`[SOLANA] Transaction found after retries:`, finalStatus.value);
                confirmation = { value: { err: finalStatus.value.err } };
                break;
              }
            } catch (e) {
              // Transaction truly failed or wasn't included
            }
            throw new Error(`Transaction confirmation failed after ${maxRetries} retries: ${confirmError instanceof Error ? confirmError.message : 'Unknown confirmation error'}`);
          }
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
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
    console.log(`\n[SOLANA] Starting batch transfer of ${transfers.length} transfers in batches of ${batchSize}`);
    
    const results: Array<TransferResult & { address: string }> = [];
    
    // Process in batches to avoid overwhelming the RPC
    for (let i = 0; i < transfers.length; i += batchSize) {
      const batch = transfers.slice(i, i + batchSize);
      console.log(`\n[SOLANA] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(transfers.length / batchSize)} (${batch.length} transfers)`);
      
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
          console.error(`[SOLANA] Batch transfer failed for ${transfer.address}:`, error);
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
          console.error(`[SOLANA] Batch promise rejected:`, result.reason);
          results.push({
            success: false,
            transactionHash: '',
            explorerUrl: '',
            error: result.reason instanceof Error ? result.reason.message : 'Promise rejected',
            address: 'unknown'
          });
        }
      }
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < transfers.length) {
        console.log(`[SOLANA] Waiting 2s before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    console.log(`\n[SOLANA] Batch transfer complete: ${successCount} succeeded, ${failCount} failed`);
    
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

