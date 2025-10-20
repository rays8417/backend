/**
 * Reward Distribution Configuration
 * Solana-only configuration for BOSON token rewards
 */

export const REWARD_CONFIG = {
  // Solana private key (base58 or JSON array format)
  ADMIN_PRIVATE_KEY: process.env.SOLANA_ADMIN_PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY,
  ADMIN_ACCOUNT_ADDRESS: process.env.SOLANA_ADMIN_ADDRESS || process.env.ADMIN_ACCOUNT_ADDRESS,
  
  // BOSON decimals for Solana (9 decimals)
  BOSON_DECIMALS: Number(process.env.BOSON_DECIMALS || 9),
  MIN_REWARD_AMOUNT: 0.001, // Minimum reward amount in BOSON to avoid dust
};

/**
 * Parse ignored holder addresses from environment
 */
export const parseIgnoredAddresses = (): Set<string> => {
  const raw = process.env.IGNORED_HOLDER_ADDRESSES;
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map(v => v.trim().toLowerCase())
      .filter(Boolean)
  );
};

