/**
 * Crypto utility functions for handling private keys and blockchain operations
 */

/**
 * Parse private key from hex or comma-separated format to byte array
 * Supports:
 * - Hex format: "0x1234abcd..." or "1234abcd..." (64 hex chars = 32 bytes)
 * - Comma-separated: "123,45,67,..." (32 numbers)
 * 
 * @param privateKeyString - Private key in hex or comma-separated format
 * @returns Uint8Array of 32 bytes
 * @throws Error if format is invalid or length is not 32 bytes
 */
export function parsePrivateKey(privateKeyString: string): Uint8Array {
  let privateKeyBytes: number[];
  
  if (privateKeyString.includes(',')) {
    // Comma-separated format: "123,45,67,..."
    privateKeyBytes = privateKeyString.split(',').map(num => {
      const parsed = Number(num.trim());
      if (isNaN(parsed) || parsed < 0 || parsed > 255) {
        throw new Error(`Invalid byte value: ${num}. Must be 0-255.`);
      }
      return parsed;
    });
  } else {
    // Hex format: "0x..." or without prefix
    const hexString = privateKeyString.replace(/^0x/, '').trim();
    
    if (!/^[0-9a-fA-F]+$/.test(hexString)) {
      throw new Error('Invalid private key format. Expected hex string (0-9, a-f, A-F) or comma-separated bytes.');
    }
    
    if (hexString.length % 2 !== 0) {
      throw new Error(`Invalid hex string length: ${hexString.length}. Must be even number of characters.`);
    }
    
    privateKeyBytes = [];
    for (let i = 0; i < hexString.length; i += 2) {
      privateKeyBytes.push(parseInt(hexString.substr(i, 2), 16));
    }
  }
  
  // Validate private key length
  if (privateKeyBytes.length !== 32) {
    throw new Error(
      `Invalid private key length: Expected 32 bytes, got ${privateKeyBytes.length} bytes.\n` +
      `Supported formats:\n` +
      `  - Hex: 64 hex characters (with or without 0x prefix)\n` +
      `    Example: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef\n` +
      `  - Comma-separated: 32 numbers (0-255)\n` +
      `    Example: 18,52,86,120,144,171,205,239,...`
    );
  }
  
  return new Uint8Array(privateKeyBytes);
}

