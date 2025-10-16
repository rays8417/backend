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
  CONTRACT_ADDRESS: process.env.APTOS_CONTRACT_ADDRESS || '0xaf230e3024e92da6a3a15f5a6a3f201c886891268717bf8a21157bb73a1c027b',
  
  // Player token modules/contracts - imported from single source
  PLAYER_MODULES: getPlayerModuleNames(),
  
  // All modules including game token
  ALL_MODULES: getAllModuleNames(),
  
  // Token decimals (8 for Aptos, 18 for Ethereum, etc.)
  TOKEN_DECIMALS: 8,
  
  // Normalize factor for calculations
  NORMALIZATION_FACTOR: 100000000, // 10^8 for Aptos
};

/**
 * Get normalization factor based on decimals
 */
export const getNormalizationFactor = () => {
  return Math.pow(10, BLOCKCHAIN_CONFIG.TOKEN_DECIMALS);
};

