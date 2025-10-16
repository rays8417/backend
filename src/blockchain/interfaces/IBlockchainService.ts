/**
 * Blockchain Service Interface
 * 
 * This interface defines all blockchain operations needed by the app.
 * Implement this interface for any blockchain (Aptos, Ethereum, Solana, etc.)
 * to make the app chain-agnostic.
 */

export interface TokenHolder {
  address: string;
  balance: bigint;
  formattedBalance: string;
  playerId?: string;
  moduleName?: string;
}

export interface TransferResult {
  success: boolean;
  transactionHash: string;
  explorerUrl: string;
  gasUsed?: string;
  error?: string;
}

export interface AccountInfo {
  address: string;
  balance: string;
  balanceFormatted: string;
  publicKey?: string;
  sequenceNumber?: string;
}

/**
 * Generic blockchain service interface
 */
export interface IBlockchainService {
  /**
   * Get token holders for a specific player/token
   */
  getTokenHolders(playerModule: string): Promise<string[]>;

  /**
   * Get token balance for a specific address and player
   */
  getTokenBalance(address: string, playerModule: string): Promise<bigint>;

  /**
   * Get all token holders with their balances across all players
   */
  getTokenHoldersWithBalances(): Promise<TokenHolder[]>;

  /**
   * Get token holders for a specific player with balances
   */
  getTokenHoldersForPlayer(playerModule: string): Promise<TokenHolder[]>;

  /**
   * Get balance for an address across all player tokens
   */
  getBalanceForAllPlayers(address: string): Promise<TokenHolder[]>;

  /**
   * Transfer tokens from admin to user (reward distribution)
   */
  transferTokens(
    fromPrivateKey: string,
    toAddress: string,
    amount: number,
    tokenType: string
  ): Promise<TransferResult>;

  /**
   * Get account information
   */
  getAccountInfo(address: string): Promise<AccountInfo>;

  /**
   * Get current block number/height
   */
  getCurrentBlockNumber(): Promise<string>;

  /**
   * Get network name
   */
  getNetwork(): string;

  /**
   * Get explorer URL for transaction
   */
  getExplorerUrl(txHash: string): string;
}

