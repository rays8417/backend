/**
 * Blockchain Service Entry Point
 * 
 * This is the ONLY file you need to change to switch blockchains!
 * 
 * To switch from Aptos to another chain:
 * 1. Create new adapter (e.g., ethereum.adapter.ts)
 * 2. Implement IBlockchainService interface
 * 3. Change the import below
 * 4. Done! All controllers/services will use new chain
 */

import { aptosAdapter } from './adapters/aptos.adapter';
import { IBlockchainService } from './interfaces/IBlockchainService';

/**
 * Active blockchain service
 * 
 * To switch chains, just change this line:
 * export const blockchain: IBlockchainService = aptosAdapter;     // Current
 * export const blockchain: IBlockchainService = ethereumAdapter;  // Future
 * export const blockchain: IBlockchainService = solanaAdapter;    // Future
 */
export const blockchain: IBlockchainService = aptosAdapter;

// Re-export interface for type checking
export type { IBlockchainService, TokenHolder, TransferResult, AccountInfo } from './interfaces/IBlockchainService';

/**
 * Example usage in controllers:
 * 
 * Before (Aptos-specific):
 * import { aptos } from '../services/aptosService';
 * const holders = await getTokenHoldersWithBalances();
 * 
 * After (Chain-agnostic):
 * import { blockchain } from '../blockchain';
 * const holders = await blockchain.getTokenHoldersWithBalances();
 * 
 * To switch to Ethereum:
 * 1. Create ethereum.adapter.ts implementing IBlockchainService
 * 2. Change line 24 above to: export const blockchain = ethereumAdapter;
 * 3. Done! No other code changes needed!
 */

