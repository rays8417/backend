/**
 * Reward Distribution Configuration
 * Centralized configuration for BOSON token rewards and Aptos transactions
 */

export const REWARD_CONFIG = {
  ADMIN_PRIVATE_KEY: process.env.ADMIN_PRIVATE_KEY, // Private key for admin account (comma-separated bytes)
  ADMIN_ACCOUNT_ADDRESS: process.env.ADMIN_ACCOUNT_ADDRESS, // Admin account address that holds rewards
  // BOSON coin type. Allow override via env; default to contract Boson coin type
  BOSON_COIN_TYPE: (process.env.BOSON_COIN_TYPE as string) || `${process.env.APTOS_CONTRACT_ADDRESS || '0xaf230e3024e92da6a3a15f5a6a3f201c886891268717bf8a21157bb73a1c027b'}::Boson::Boson`,
  // BOSON decimals. Allow override via env; default 8 (matches contract)
  BOSON_DECIMALS: Number(process.env.BOSON_DECIMALS || 8),
  MIN_REWARD_AMOUNT: 0.001, // Minimum reward amount in BOSON to avoid dust
  GAS_LIMIT: 100000, // Gas limit for transactions
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

