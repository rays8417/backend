

import { solanaAdapter } from './adapters/solana.adapter';
import { IBlockchainService } from './interfaces/IBlockchainService';

/**
 * Active blockchain service (Solana only)
 */
export const blockchain: IBlockchainService = solanaAdapter;

// Re-export interface for type checking
export type { IBlockchainService, TokenHolder, TransferResult, AccountInfo } from './interfaces/IBlockchainService';

/**
 * Example usage in controllers:
 * 
 * import { blockchain } from '../blockchain';
 * const holders = await blockchain.getTokenHoldersWithBalances();
 */

