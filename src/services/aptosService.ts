import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import dotenv from 'dotenv';

// Ensure environment variables are loaded for both server and scripts
dotenv.config();

// Aptos SDK configuration
const aptosConfig = new AptosConfig({
  network: Network.TESTNET, // Using testnet for development
  clientConfig:{
    API_KEY: process.env.APTOS_API_KEY,
  }
});

export const aptos = new Aptos(aptosConfig);



import { getPlayerModuleNames } from '../config/players.config';

// Contract configuration - Update these with your actual contract details
export const CONTRACT_CONFIG = {
  // Update this with your actual contract address
  CONTRACT_ADDRESS: process.env.APTOS_CONTRACT_ADDRESS || '0xaf230e3024e92da6a3a15f5a6a3f201c886891268717bf8a21157bb73a1c027b',
  
  // Update these with your actual function names
  GET_TOKEN_HOLDERS_FUNCTION: 'get_token_holders',
  BALANCE_FUNCTION: 'balance',
  
  // Array of module names - imported from single source
  MODULE_NAMES: getPlayerModuleNames(),
  
  // Default module name (can be overridden per player)
  DEFAULT_MODULE_NAME: 'AbhishekSharma',
};

import { parseIgnoredAddresses } from '../config/reward.config';

const IGNORED_ADDRESS_SET = parseIgnoredAddresses();

export interface TokenHolder {
  address: string;
  balance: string;
}

export interface TokenHolderBalance {
  address: string;
  balance: bigint;
  formattedBalance: string;
  playerId?: string; // Track which player this balance belongs to
  moduleName?: string; // Track which module this came from
}

/**
 * Get all token holders from the smart contract for a specific module
 * This calls the get_token_holders function in your contract
 */
export async function getTokenHolders(moduleName: string): Promise<string[]> {
  try {

    
    const payload = {
      function: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::${moduleName}::${CONTRACT_CONFIG.GET_TOKEN_HOLDERS_FUNCTION}` as const,
      arguments: [], // Add any required arguments here
      type_arguments: [],
      testnet: true,
    };


    const response = await aptos.view({
      payload,
    });


    // The response format depends on your contract's return type
    // Assuming it returns an array of addresses
    const holders = (response[0] as string[]) || [];
    // Filter ignored addresses (case-insensitive)
    const filtered = holders.filter(addr => {
      if (!addr) return false;
      return !IGNORED_ADDRESS_SET.has(addr.toLowerCase());
    });
    return filtered;
  } catch (error) {
    console.error(`[ERROR] Error fetching token holders from ${moduleName}:`, error);
    throw new Error(`Failed to fetch token holders from ${moduleName}: ${error}`);
  }
}

/**
 * Get all token holders from all modules
 * This maps through CONTRACT_CONFIG.MODULE_NAMES and fetches data from each module
 */
export async function getAllTokenHolders(): Promise<{ moduleName: string; holders: string[] }[]> {
  try {
   
    
    const results = await Promise.allSettled(
      CONTRACT_CONFIG.MODULE_NAMES.map(async (moduleName) => {
        try {
          const holders = await getTokenHolders(moduleName);
          return { moduleName, holders };
        } catch (error) {
          console.error(`[ERROR] Failed to fetch holders for module ${moduleName}:`, error);
          return { moduleName, holders: [] };
        }
      })
    );

    const successfulResults = results
      .filter((result): result is PromiseFulfilledResult<{ moduleName: string; holders: string[] }> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value);

    successfulResults.forEach(result => {
    });

    return successfulResults;
  } catch (error) {
    console.error(`[ERROR] Error in getAllTokenHolders:`, error);
    throw new Error(`Failed to get all token holders: ${error}`);
  }
}

/**
 * Get unified holder list sourced from Boson token module
 */
export async function getBosonTokenHolders(): Promise<string[]> {
  try {
    const bosonModule = 'Boson';
    const holders = await getTokenHolders(bosonModule);
    // Deduplicate in case contract returns duplicates
    const unique = Array.from(new Set(holders.filter(Boolean)));
    return unique;
  } catch (error) {
    console.error('[ERROR] Error fetching Boson token holders:', error);
    return [];
  }
}

/**
 * Get balance for a specific address from a specific player module
 * This calls the balance function in your contract
 */
export async function getTokenBalance(address: string, moduleName: string): Promise<bigint> {
  try {
   
    
    // Validate address format
    if (!address || address.length === 0) {
      console.error(`[ERROR] Invalid address provided: "${address}"`);
      return BigInt(0);
    }
    
    // Try using the REST API directly
    const functionName = `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::${moduleName}::${CONTRACT_CONFIG.BALANCE_FUNCTION}`;
   

    // First, let's check if the module exists
    try {
      const accountResources = await aptos.getAccountResources({
        accountAddress: CONTRACT_CONFIG.CONTRACT_ADDRESS,
      });
      
      const moduleResource = accountResources.find(resource => 
        resource.type.includes(`::${moduleName}::`)
      );
    } catch (error) {
      if (error instanceof Error) {
        console.log(`[DEBUG] Error checking account resources: ${error.message}`);
      } else {
        console.log(`[DEBUG] Error checking account resources:`, error);
      }
    }

    const response = await aptos.view({
      payload: {
        function: functionName as `${string}::${string}::${string}`,
        functionArguments: [address],
        typeArguments: [],
      },
    });


    // Assuming the balance is returned as a string or number
    const balance = response[0];
    
    if (balance === null || balance === undefined) {
      console.log(`[DEBUG] Balance is null/undefined for ${address} in ${moduleName}, returning 0`);
      return BigInt(0);
    }
    
    // Convert to bigint for consistency
    let bigintBalance: bigint;
    if (typeof balance === 'string') {
      bigintBalance = BigInt(balance);
    } else if (typeof balance === 'number') {
      bigintBalance = BigInt(balance);
    } else {
      bigintBalance = BigInt(balance.toString());
    }
    
    return bigintBalance;
  } catch (error) {
    console.error(`[ERROR] Error fetching balance for ${address} from ${moduleName}:`, error);
    // Return 0 balance for addresses that might not be in the system
    return BigInt(0);
  }
}

/**
 * Get balance for a specific address from all modules
 * This maps through CONTRACT_CONFIG.MODULE_NAMES and fetches balance from each module
 */
export async function getTokenBalanceFromAllModules(address: string): Promise<{ moduleName: string; balance: bigint }[]> {
  try {
    const results = await Promise.allSettled(
      CONTRACT_CONFIG.MODULE_NAMES.map(async (moduleName) => {
        try {
          const balance = await getTokenBalance(address, moduleName);
          return { moduleName, balance };
        } catch (error) {
          console.error(`[ERROR] Failed to fetch balance for ${address} in module ${moduleName}:`, error);
          return { moduleName, balance: BigInt(0) };
        }
      })
    );

    const successfulResults = results
      .filter((result): result is PromiseFulfilledResult<{ moduleName: string; balance: bigint }> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value);

    successfulResults.forEach(result => {
      console.log(`[DEBUG] Module ${result.moduleName}: balance ${result.balance.toString()}`);
    });

    return successfulResults;
  } catch (error) {
    console.error(`[ERROR] Error in getTokenBalanceFromAllModules for ${address}:`, error);
    throw new Error(`Failed to get balance from all modules for ${address}: ${error}`);
  }
}

/**
 * Get balances for a specific player module
 */
export async function getTokenHoldersWithBalancesForPlayer(moduleName: string, playerId?: string): Promise<TokenHolderBalance[]> {
  try {
   
    
    // Step 1: Get all token holders for this player module
    const holders = await getTokenHolders(moduleName);
    
    if (holders.length === 0) {
      return [];
    }


    
    // Step 2: Get balances for each holder
    const balancePromises = holders.map(async (address, index) => {
      try {
        const balance = await getTokenBalance(address, moduleName);
        const result = {
          address,
          balance,
          formattedBalance: balance.toString(),
          playerId,
          moduleName,
        } as TokenHolderBalance;
        return result;
      } catch (error) {
        console.error(`[ERROR] Failed to get balance for ${address} in ${moduleName}:`, error);
        return {
          address,
          balance: BigInt(0),
          formattedBalance: '0',
          playerId,
          moduleName,
        } as TokenHolderBalance;
      }
    });

    const results = await Promise.allSettled(balancePromises);
    
    
    // Filter out failed requests and zero balances
    const validHolders = results
      .filter((result): result is PromiseFulfilledResult<TokenHolderBalance> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value)
      .filter(holder => holder.balance > 0); // Only include holders with actual balance


    
    return validHolders;
  } catch (error) {
    console.error(`[ERROR] Error in getTokenHoldersWithBalancesForPlayer for ${moduleName}:`, error);
    throw new Error(`Failed to get token holders with balances for ${moduleName}: ${error}`);
  }
}

/**
 * Get balances for all player modules
 * This fetches data from all player modules and combines them
 */
export async function getTokenHoldersWithBalances(): Promise<TokenHolderBalance[]> {
  try {
    const moduleNames = CONTRACT_CONFIG.MODULE_NAMES;
    if (moduleNames.length === 0) {
      return [];
    }

    // Step 1: Build the unified holder universe from Boson token
    const bosonHolders = await getBosonTokenHolders();
    if (bosonHolders.length === 0) {
      return [];
    }

    // Step 2: For each holder, fetch balances across all modules
    const balanceTasks: Promise<{
      address: string;
      moduleName: string;
      playerId: string;
      balance: bigint;
    } | null>[] = [];

    for (const address of bosonHolders) {
      moduleNames.forEach((moduleName, index) => {
        balanceTasks.push((async () => {
          try {
            const balance = await getTokenBalance(address, moduleName);
            if (balance > 0n) {
              return { address, moduleName, playerId: (index + 1).toString(), balance };
            }
            return null;
          } catch (error) {
            console.error(`[ERROR] Balance fetch failed for ${address} in ${moduleName}:`, error);
            return null;
          }
        })());
      });
    }

    const results = await Promise.allSettled(balanceTasks);

    const balances: TokenHolderBalance[] = results
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

    return balances;
  } catch (error) {
    console.error('[ERROR] Error in getTokenHoldersWithBalances:', error);
    throw new Error(`Failed to get token holders with balances: ${error}`);
  }
}

/**
 * Get all players with their Aptos module names from database
 */
export async function getPlayersWithModules() {
  try {
    // Import prisma singleton
    const { prisma } = await import('../prisma');
    
    const players = await prisma.player.findMany({
      where: {
        aptosTokenAddress: {
          not: null
        }
      },
      select: {
        id: true,
        name: true,
        aptosTokenAddress: true
      }
    });

    // Map aptosTokenAddress to module name
    // Assuming aptosTokenAddress contains the module name or can be derived from it
    const playersWithModules = players.map(player => ({
      id: player.id,
      name: player.name,
      moduleName: player.aptosTokenAddress || player.name.replace(/\s+/g, '') // Fallback to player name
    }));

    await prisma.$disconnect();
    return playersWithModules;
  } catch (error) {
    console.error('Error fetching players with modules:', error);
    throw new Error(`Failed to get players with modules: ${error}`);
  }
}

/**
 * Test function to debug balance fetching with a single module
 * This helps isolate issues with specific modules
 */
export async function testSingleModuleBalance(moduleName: string, testAddress?: string): Promise<void> {
  try {
    console.log(`[TEST] Testing balance function for module: ${moduleName}`);
    console.log(`[TEST] Contract address: ${CONTRACT_CONFIG.CONTRACT_ADDRESS}`);
    
    // First, try to get token holders
    console.log(`[TEST] Step 1: Getting token holders for ${moduleName}`);
    const holders = await getTokenHolders(moduleName);
    console.log(`[TEST] Found ${holders.length} holders:`, holders);
    
    if (holders.length === 0) {
      console.log(`[TEST] No holders found for ${moduleName}, skipping balance test`);
      return;
    }
    
    // Use provided test address or first holder
    const addressToTest = testAddress || holders[0];
    console.log(`[TEST] Step 2: Testing balance for address: ${addressToTest}`);
    
    const balance = await getTokenBalance(addressToTest, moduleName);
    console.log(`[TEST] Balance result: ${balance.toString()}`);
    
    console.log(`[TEST] Test completed successfully for ${moduleName}`);
  } catch (error) {
    console.error(`[TEST] Error testing module ${moduleName}:`, error);
    throw error;
  }
}

/**
 * Get current block number for snapshot reference
 */
export async function getCurrentBlockNumber(): Promise<bigint> {
  try {
    const ledgerInfo = await aptos.getLedgerInfo();
    return BigInt(ledgerInfo.block_height);
  } catch (error) {
    console.error('Error fetching block number:', error);
    throw new Error(`Failed to get current block number: ${error}`);
  }
}
