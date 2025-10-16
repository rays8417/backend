import { Aptos, AptosConfig, Network, Ed25519PrivateKey, Ed25519Account } from '@aptos-labs/ts-sdk';
import { IBlockchainService, TokenHolder, TransferResult, AccountInfo } from '../interfaces/IBlockchainService';
import { parseIgnoredAddresses } from '../../config/reward.config';
import { parsePrivateKey } from '../../utils/crypto';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Aptos Blockchain Adapter
 * Implements IBlockchainService for Aptos blockchain
 * 
 * To switch to another blockchain:
 * 1. Create a new adapter (e.g., ethereum.adapter.ts)
 * 2. Implement IBlockchainService interface
 * 3. Update blockchain/index.ts to use new adapter
 */

// Aptos configuration
const aptosConfig = new AptosConfig({
  network: Network.TESTNET,
  clientConfig:{
    API_KEY: process.env.APTOS_API_KEY,
  }
});

const aptos = new Aptos(aptosConfig);

import { getPlayerModuleNames, GAME_TOKEN_MODULE } from '../../config/players.config';

// Contract configuration
const CONTRACT_ADDRESS = process.env.APTOS_CONTRACT_ADDRESS || '0xaf230e3024e92da6a3a15f5a6a3f201c886891268717bf8a21157bb73a1c027b';

// Player modules only (excludes game token)
const PLAYER_MODULE_NAMES = getPlayerModuleNames();

const IGNORED_ADDRESS_SET = parseIgnoredAddresses();

export class AptosAdapter implements IBlockchainService {
  private aptos: Aptos;
  private contractAddress: string;
  private moduleNames: string[];

  constructor() {
    this.aptos = aptos;
    this.contractAddress = CONTRACT_ADDRESS;
    // Use player modules only (excludes Boson game token for snapshots/rewards)
    this.moduleNames = PLAYER_MODULE_NAMES;
  }

  /**
   * Get token holders for a specific player module
   */
  async getTokenHolders(playerModule: string): Promise<string[]> {
    try {
      const payload = {
        function: `${this.contractAddress}::${playerModule}::get_token_holders` as `${string}::${string}::${string}`,
        functionArguments: [],
        typeArguments: [],
      };

      const response = await this.aptos.view({ payload });
      const holders = (response[0] as string[]) || [];
      
      // Filter ignored addresses
      return holders.filter(addr => addr && !IGNORED_ADDRESS_SET.has(addr.toLowerCase()));
    } catch (error) {
      console.error(`Error getting token holders for ${playerModule}:`, error);
      return [];
    }
  }

  /**
   * Get token balance for specific address and player
   */
  async getTokenBalance(address: string, playerModule: string): Promise<bigint> {
    try {
      const payload = {
        function: `${this.contractAddress}::${playerModule}::balance` as `${string}::${string}::${string}`,
        functionArguments: [address],
        typeArguments: [],
      };

      const response = await this.aptos.view({ payload });
      return BigInt(response[0] as string);
    } catch (error) {
      console.error(`Error getting balance for ${address} in ${playerModule}:`, error);
      return BigInt(0);
    }
  }

  /**
   * Get all token holders with balances across all players
   * Strategy: Get Boson token holders first (unified holder list), then check their balances across all modules
   */
  async getTokenHoldersWithBalances(): Promise<TokenHolder[]> {
    try {
      if (this.moduleNames.length === 0) {
        return [];
      }

      // Step 1: Build the unified holder universe from Boson token
      const bosonHolders = await this.getBosonTokenHolders();
      if (bosonHolders.length === 0) {
        console.log('[ADAPTER] No Boson token holders found');
        return [];
      }

      console.log(`[ADAPTER] Found ${bosonHolders.length} Boson token holders`);

      // Step 2: For each holder, fetch balances across all modules
      const balanceTasks: Promise<{
        address: string;
        moduleName: string;
        playerId: string;
        balance: bigint;
      } | null>[] = [];

      for (const address of bosonHolders) {
        this.moduleNames.forEach((moduleName, index) => {
          balanceTasks.push((async () => {
            try {
              const balance = await this.getTokenBalance(address, moduleName);
              if (balance > 0n) {
                return { address, moduleName, playerId: (index + 1).toString(), balance };
              }
              return null;
            } catch (error) {
              console.error(`[ADAPTER] Balance fetch failed for ${address} in ${moduleName}:`, error);
              return null;
            }
          })());
        });
      }

      const results = await Promise.allSettled(balanceTasks);

      const balances: TokenHolder[] = results
        .filter((r): r is PromiseFulfilledResult<{ address: string; moduleName: string; playerId: string; balance: bigint } | null> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter((v): v is { address: string; moduleName: string; playerId: string; balance: bigint } => !!v)
        .map(v => ({
          address: v.address,
          balance: v.balance,
          formattedBalance: v.balance.toString(),
          playerId: v.playerId,
          moduleName: v.moduleName,
        }));

      console.log(`[ADAPTER] Found ${balances.length} total token holdings across all modules`);
      return balances;
    } catch (error) {
      console.error('[ADAPTER] Error in getTokenHoldersWithBalances:', error);
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
      // Deduplicate in case contract returns duplicates
      const unique = Array.from(new Set(holders.filter(Boolean)));
      return unique;
    } catch (error) {
      console.error('[ADAPTER] Error fetching Boson token holders:', error);
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
          formattedBalance: (Number(balance) / 100000000).toFixed(8),
          playerId: playerModule,
          moduleName: playerModule,
        });
      }
    }

    return holdersWithBalances;
  }

  /**
   * Get balance for address across all player tokens
   */
  async getBalanceForAllPlayers(address: string): Promise<TokenHolder[]> {
    const balances: TokenHolder[] = [];

    for (const moduleName of this.moduleNames) {
      const balance = await this.getTokenBalance(address, moduleName);

      if (balance > BigInt(0)) {
        balances.push({
          address,
          balance,
          formattedBalance: (Number(balance) / 100000000).toFixed(8),
          moduleName,
        });
      }
    }

    return balances;
  }

  /**
   * Transfer tokens (for reward distribution)
   */
  async transferTokens(
    privateKeyString: string,
    toAddress: string,
    amount: number,
    tokenType: string
  ): Promise<TransferResult> {
    try {
      // Create account from private key - support both hex and comma-separated formats
      const privateKeyBytes = parsePrivateKey(privateKeyString);
      const privateKey = new Ed25519PrivateKey(privateKeyBytes);
      const account = new Ed25519Account({ privateKey });
      const fromAddress = privateKey.publicKey().authKey().derivedAddress();

      // Create transfer transaction
      const transferTx = await this.aptos.transferCoinTransaction({
        sender: fromAddress.toString(),
        recipient: toAddress,
        amount,
        coinType: tokenType as `${string}::${string}::${string}`,
      });

      // Sign and submit
      const committed = await this.aptos.signAndSubmitTransaction({
        signer: account,
        transaction: transferTx,
      });

      // Wait for confirmation
      const result = await this.aptos.waitForTransaction({
        transactionHash: committed.hash
      });

      return {
        success: result.success,
        transactionHash: committed.hash,
        explorerUrl: this.getExplorerUrl(committed.hash),
        gasUsed: result.gas_used,
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
   */
  async getAccountInfo(address: string): Promise<AccountInfo> {
    const balance = await this.aptos.getAccountAPTAmount({
      accountAddress: address
    });

    const accountData = await this.aptos.getAccountInfo({
      accountAddress: address
    });

    return {
      address,
      balance: balance.toString(),
      balanceFormatted: (Number(balance) / 100000000).toFixed(8),
      sequenceNumber: accountData.sequence_number,
    };
  }

  /**
   * Get current block number
   */
  async getCurrentBlockNumber(): Promise<string> {
    try {
      const ledgerInfo = await this.aptos.getLedgerInfo();
      return ledgerInfo.block_height;
    } catch (error) {
      console.error('Error getting block number:', error);
      return '0';
    }
  }

  /**
   * Get network name
   */
  getNetwork(): string {
    return 'Aptos Testnet';
  }

  /**
   * Get explorer URL for transaction
   */
  getExplorerUrl(txHash: string): string {
    return `https://explorer.aptoslabs.com/txn/${txHash}?network=testnet`;
  }
}

// Export singleton instance
export const aptosAdapter = new AptosAdapter();

// Export aptos instance for backward compatibility (can be removed later)
export { aptos };

