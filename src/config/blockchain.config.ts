import { getPlayerModuleNames, getAllModuleNames } from './players.config';

/**
 * Blockchain Configuration
 * 
 * Chain-specific configuration settings
 * Update these when switching blockchains
 */

export const BLOCKCHAIN_CONFIG = {
  // Network
  NETWORK: process.env.BLOCKCHAIN_NETWORK || 'testnet',
  
  // Contract/Program address  
  CONTRACT_ADDRESS: process.env.SOLANA_PROGRAM_ADDRESS ,
  
  // Player token modules/contracts - imported from single source
  PLAYER_MODULES: getPlayerModuleNames(),
  
  // All modules including game token
  ALL_MODULES: getAllModuleNames(),
  
  // Token decimals for Solana
  TOKEN_DECIMALS: 9,
  
  // Normalize factor for calculations
  NORMALIZATION_FACTOR: 1000000000, // 10^9 for Solana
};

/**
 * Get normalization factor based on decimals
 */
export const getNormalizationFactor = () => {
  return Math.pow(10, BLOCKCHAIN_CONFIG.TOKEN_DECIMALS);
};

