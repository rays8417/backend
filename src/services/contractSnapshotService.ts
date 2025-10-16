import { blockchain, TokenHolder } from '../blockchain';
import { prisma } from '../prisma';
import { parseIgnoredAddresses } from '../config/reward.config';
import dotenv from 'dotenv';

dotenv.config();

// Type alias for backward compatibility
type TokenHolderBalance = TokenHolder;

// New simplified interfaces for contract-only approach
export interface ContractHolder {
  address: string;
  holdings: {
    moduleName: string;
    balance: string;
    playerId?: string;
  }[];
}

export interface ContractSnapshotData {
  tournamentId: string;
  snapshotType: 'PRE_MATCH' | 'POST_MATCH';
  timestamp: string;
  blockNumber: string;
  contractAddress: string;
  
  // Pure contract data
  holders: ContractHolder[];
  
  // Computed statistics
  totalHolders: number;
  totalTokens: string;
  uniqueAddresses: number;
}

export interface ContractSnapshotResult {
  snapshotId: string;
  tournamentId: string;
  snapshotType: string;
  blockNumber: string;
  contractAddress: string;
  timestamp: string;
  totalHolders: number;
  totalTokens: string;
  uniqueAddresses: number;
}

/**
 * Group token holders by address
 * This creates a clean structure where each address has all their holdings
 */
function groupHoldersByAddress(aptosHolders: TokenHolderBalance[]): ContractHolder[] {
  
  const holdersMap = new Map<string, ContractHolder>();
  
  for (const holder of aptosHolders) {
    const address = holder.address;
    
    if (!holdersMap.has(address)) {
      holdersMap.set(address, {
        address,
        holdings: []
      });
    }
    
    holdersMap.get(address)!.holdings.push({
      moduleName: holder.moduleName || 'Unknown',
      balance: holder.balance.toString(),
      playerId: holder.playerId
    });
  }
  
  const groupedHolders = Array.from(holdersMap.values());
  
  return groupedHolders;
}


/**
 * Calculate statistics from grouped holders
 */
function calculateStatistics(holders: ContractHolder[]): {
  totalHolders: number;
  totalTokens: string;
  uniqueAddresses: number;
} {
  const totalHolders = holders.reduce((sum, holder) => sum + holder.holdings.length, 0);
  const totalTokens = holders.reduce((sum, holder) => {
    return sum + holder.holdings.reduce((holderSum, holding) => {
      return holderSum + BigInt(holding.balance);
    }, BigInt(0));
  }, BigInt(0)).toString();
  const uniqueAddresses = holders.length;
  
  return {
    totalHolders,
    totalTokens,
    uniqueAddresses
  };
}

/**
 * Create a contract-only snapshot
 * This is the simplified approach that uses only Aptos contract data
 */
export async function createContractSnapshot(
  tournamentId: string,
  snapshotType: 'PRE_MATCH' | 'POST_MATCH',
  contractAddress?: string
): Promise<ContractSnapshotResult> {
  try {
    console.log(`[CONTRACT_SNAPSHOT] Creating ${snapshotType} snapshot for tournament ${tournamentId}...`);
    
    // Validate tournament exists
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId }
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    // Step 1: Get Aptos contract data
    console.log('[CONTRACT_SNAPSHOT] Fetching data from Aptos contract...');
    const aptosHolders = await blockchain.getTokenHoldersWithBalances();
    const ignored = parseIgnoredAddresses();
    const filteredAptosHolders = aptosHolders.filter(h => !ignored.has(h.address.toLowerCase()));
    const currentBlockNumber = await blockchain.getCurrentBlockNumber();

    console.log(`[CONTRACT_SNAPSHOT] Found ${aptosHolders.length} token holders from contract`);
    if (ignored.size > 0) {
      console.log(`[CONTRACT_SNAPSHOT] Ignoring ${ignored.size} address(es) via IGNORED_HOLDER_ADDRESSES`);
      console.log(`[CONTRACT_SNAPSHOT] Holders after ignore filter: ${filteredAptosHolders.length}`);
    }

    // Step 2: Group holders by address
    console.log('[CONTRACT_SNAPSHOT] Grouping holders by address...');
    const groupedHolders = groupHoldersByAddress(filteredAptosHolders);

    // Step 3: Calculate statistics
    const statistics = calculateStatistics(groupedHolders);

    // Step 4: Create snapshot data
    const snapshotData: ContractSnapshotData = {
      tournamentId,
      snapshotType,
      timestamp: new Date().toISOString(),
      blockNumber: currentBlockNumber.toString(),
      contractAddress: contractAddress || process.env.APTOS_CONTRACT_ADDRESS || '0xaf230e3024e92da6a3a15f5a6a3f201c886891268717bf8a21157bb73a1c027b',
      
      // Pure contract data
      holders: groupedHolders,
      
      // Computed statistics
      totalHolders: statistics.totalHolders,
      totalTokens: statistics.totalTokens,
      uniqueAddresses: statistics.uniqueAddresses
    };

    console.log(`[CONTRACT_SNAPSHOT] Snapshot data created:`, {
      totalHolders: statistics.totalHolders,
      totalTokens: statistics.totalTokens,
      uniqueAddresses: statistics.uniqueAddresses
    });

    // Enhanced logging: Show detailed holdings breakdown
    console.log(`\n📊 DETAILED SNAPSHOT BREAKDOWN - ${snapshotType}`);
    console.log('='.repeat(80));
    console.log(`Tournament ID: ${tournamentId}`);
    console.log(`Block Number: ${currentBlockNumber}`);
    console.log(`Contract Address: ${snapshotData.contractAddress}`);
    console.log(`Timestamp: ${snapshotData.timestamp}`);
    console.log(`Total Unique Addresses: ${statistics.uniqueAddresses}`);
    console.log(`Total Holdings: ${statistics.totalHolders}`);
    console.log(`Total Tokens: ${statistics.totalTokens}`);
    console.log('='.repeat(80));

    // Group and display holdings by address
    console.log('\n🏠 ADDRESS HOLDINGS BREAKDOWN:');
    console.log('-'.repeat(80));
    
    // Sort holders by total token count (descending)
    const sortedHolders = groupedHolders.sort((a, b) => {
      const aTotal = a.holdings.reduce((sum, h) => sum + BigInt(h.balance), BigInt(0));
      const bTotal = b.holdings.reduce((sum, h) => sum + BigInt(h.balance), BigInt(0));
      return Number(bTotal - aTotal);
    });

    // Display top 20 holders with detailed breakdown
    const topHolders = sortedHolders.slice(0, 20);
    
    topHolders.forEach((holder, index) => {
      const totalTokens = holder.holdings.reduce((sum, h) => sum + BigInt(h.balance), BigInt(0));
      const formattedTotal = (Number(totalTokens) / 100000000).toFixed(2); // Convert to readable format
      
      console.log(`\n${index + 1}. Address: ${holder.address}`);
      console.log(`   Total Tokens: ${formattedTotal} (${totalTokens.toString()})`);
      console.log(`   Holdings Count: ${holder.holdings.length}`);
      
      // Show individual holdings
      holder.holdings.forEach((holding, hIndex) => {
        const formattedBalance = (Number(holding.balance) / 100000000).toFixed(2);
        console.log(`   ${hIndex + 1}. ${holding.moduleName}: ${formattedBalance} tokens (${holding.balance})`);
      });
    });

    // Show summary statistics
    if (sortedHolders.length > 20) {
      console.log(`\n... and ${sortedHolders.length - 20} more addresses`);
    }

    // Show holdings distribution by player/module
    console.log('\n🎯 HOLDINGS BY PLAYER/MODULE:');
    console.log('-'.repeat(80));
    
    const moduleStats = new Map<string, { holders: number; totalTokens: bigint }>();
    
    groupedHolders.forEach(holder => {
      holder.holdings.forEach(holding => {
        const moduleName = holding.moduleName;
        if (!moduleStats.has(moduleName)) {
          moduleStats.set(moduleName, { holders: 0, totalTokens: BigInt(0) });
        }
        const stats = moduleStats.get(moduleName)!;
        stats.holders++;
        stats.totalTokens += BigInt(holding.balance);
      });
    });

    // Sort modules by total tokens
    const sortedModules = Array.from(moduleStats.entries())
      .sort((a, b) => Number(b[1].totalTokens - a[1].totalTokens));

    sortedModules.forEach(([moduleName, stats]) => {
      const formattedTokens = (Number(stats.totalTokens) / 100000000).toFixed(2);
      console.log(`   ${moduleName}: ${stats.holders} holders, ${formattedTokens} total tokens`);
    });

    console.log('\n' + '='.repeat(80));

    // Step 5: Store snapshot in database
    const snapshot = await prisma.contractSnapshot.create({
      data: {
        contractType: snapshotType,
        contractAddress: snapshotData.contractAddress,
        blockNumber: BigInt(currentBlockNumber || '0'),
        data: snapshotData as any // Type assertion for Prisma JSON field
      }
    });

    console.log(`[CONTRACT_SNAPSHOT] Snapshot created successfully: ${snapshot.id}`);

    return {
      snapshotId: snapshot.id,
      tournamentId,
      snapshotType,
      blockNumber: currentBlockNumber.toString(),
      contractAddress: snapshotData.contractAddress,
      timestamp: snapshotData.timestamp,
      totalHolders: statistics.totalHolders,
      totalTokens: statistics.totalTokens,
      uniqueAddresses: statistics.uniqueAddresses
    };

  } catch (error) {
    console.error('[CONTRACT_SNAPSHOT] Error creating contract snapshot:', error);
    throw new Error(`Failed to create contract snapshot: ${error}`);
  }
}

/**
 * Get snapshot by tournament and type
 */
export async function getContractSnapshot(
  tournamentId: string,
  snapshotType: 'PRE_MATCH' | 'POST_MATCH'
): Promise<ContractSnapshotData | null> {
  try {
    const snapshot = await prisma.contractSnapshot.findFirst({
      where: {
        data: {
          path: ['tournamentId'],
          equals: tournamentId
        },
        contractType: snapshotType
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!snapshot) {
      return null;
    }

    const snapshotData = snapshot.data as any;
    return snapshotData as unknown as ContractSnapshotData;
  } catch (error) {
    console.error('[CONTRACT_SNAPSHOT] Error getting contract snapshot:', error);
    throw new Error(`Failed to get contract snapshot: ${error}`);
  }
}

/**
 * Get all snapshots for a tournament
 */
export async function getTournamentSnapshots(tournamentId: string): Promise<ContractSnapshotData[]> {
  try {
    const snapshots = await prisma.contractSnapshot.findMany({
      where: {
        data: {
          path: ['tournamentId'],
          equals: tournamentId
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    return snapshots.map(snapshot => snapshot.data as unknown as ContractSnapshotData);
  } catch (error) {
    console.error('[CONTRACT_SNAPSHOT] Error getting tournament snapshots:', error);
    throw new Error(`Failed to get tournament snapshots: ${error}`);
  }
}

/**
 * Compare pre and post match snapshots
 */
export async function comparePrePostMatchSnapshots(tournamentId: string): Promise<{
  preMatch: ContractSnapshotData | null;
  postMatch: ContractSnapshotData | null;
  comparison: {
    totalHoldersChange: number;
    totalTokensChange: string;
    uniqueAddressesChange: number;
    newHolders: string[];
    holdersWhoLeft: string[];
  } | null;
}> {
  try {
    console.log(`[CONTRACT_SNAPSHOT] Comparing snapshots for tournament ${tournamentId}...`);
    
    const preMatch = await getContractSnapshot(tournamentId, 'PRE_MATCH');
    console.log(`[CONTRACT_SNAPSHOT] Pre-match snapshot:`, preMatch);
    const postMatch = await getContractSnapshot(tournamentId, 'POST_MATCH');

    if (!preMatch || !postMatch) {
      return {
        preMatch,
        postMatch,
        comparison: null
      };
    }

    // Compare snapshots
    const preAddresses = new Set(preMatch.holders.map(h => h.address));
    const postAddresses = new Set(postMatch.holders.map(h => h.address));

    const newHolders = Array.from(postAddresses).filter(addr => !preAddresses.has(addr));
    const holdersWhoLeft = Array.from(preAddresses).filter(addr => !postAddresses.has(addr));

    const comparison = {
      totalHoldersChange: postMatch.totalHolders - preMatch.totalHolders,
      totalTokensChange: (BigInt(postMatch.totalTokens) - BigInt(preMatch.totalTokens)).toString(),
      uniqueAddressesChange: postMatch.uniqueAddresses - preMatch.uniqueAddresses,
      newHolders,
      holdersWhoLeft
    };

    console.log(`[CONTRACT_SNAPSHOT] Comparison completed:`, comparison);

    // Enhanced logging for snapshot comparison
    console.log(`\n📈 SNAPSHOT COMPARISON RESULTS`);
    console.log('='.repeat(80));
    console.log(`Tournament ID: ${tournamentId}`);
    console.log(`Pre-Match Block: ${preMatch.blockNumber}`);
    console.log(`Post-Match Block: ${postMatch.blockNumber}`);
    console.log('='.repeat(80));
    
    console.log('\n📊 SUMMARY CHANGES:');
    console.log(`   Total Holders: ${preMatch.totalHolders} → ${postMatch.totalHolders} (${comparison.totalHoldersChange >= 0 ? '+' : ''}${comparison.totalHoldersChange})`);
    console.log(`   Total Tokens: ${preMatch.totalTokens} → ${postMatch.totalTokens} (${comparison.totalTokensChange})`);
    console.log(`   Unique Addresses: ${preMatch.uniqueAddresses} → ${postMatch.uniqueAddresses} (${comparison.uniqueAddressesChange >= 0 ? '+' : ''}${comparison.uniqueAddressesChange})`);
    
    if (comparison.newHolders.length > 0) {
      console.log(`\n🆕 NEW ADDRESSES (${comparison.newHolders.length}):`);
      comparison.newHolders.slice(0, 10).forEach((address, index) => {
        console.log(`   ${index + 1}. ${address}`);
      });
      if (comparison.newHolders.length > 10) {
        console.log(`   ... and ${comparison.newHolders.length - 10} more`);
      }
    }
    
    if (comparison.holdersWhoLeft.length > 0) {
      console.log(`\n👋 ADDRESSES WHO LEFT (${comparison.holdersWhoLeft.length}):`);
      comparison.holdersWhoLeft.slice(0, 10).forEach((address, index) => {
        console.log(`   ${index + 1}. ${address}`);
      });
      if (comparison.holdersWhoLeft.length > 10) {
        console.log(`   ... and ${comparison.holdersWhoLeft.length - 10} more`);
      }
    }
    
    console.log('\n' + '='.repeat(80));

    return {
      preMatch,
      postMatch,
      comparison
    };
  } catch (error) {
    console.error('[CONTRACT_SNAPSHOT] Error comparing snapshots:', error);
    throw new Error(`Failed to compare snapshots: ${error}`);
  }
}

/**
 * Get user holdings from snapshot
 */
export async function getUserHoldingsFromSnapshot(
  tournamentId: string,
  snapshotType: 'PRE_MATCH' | 'POST_MATCH',
  address: string
): Promise<ContractHolder | null> {
  try {
    const snapshot = await getContractSnapshot(tournamentId, snapshotType);
    
    if (!snapshot) {
      return null;
    }

    const userHolder = snapshot.holders.find(h => h.address === address);
    return userHolder || null;
  } catch (error) {
    console.error('[CONTRACT_SNAPSHOT] Error getting user holdings:', error);
    throw new Error(`Failed to get user holdings: ${error}`);
  }
}

/**
 * Create a readable summary of snapshot data
 */
export function createSnapshotSummary(snapshotData: ContractSnapshotData): string {
  const lines: string[] = [];
  
  lines.push(`📊 SNAPSHOT SUMMARY - ${snapshotData.snapshotType}`);
  lines.push('='.repeat(60));
  lines.push(`Tournament: ${snapshotData.tournamentId}`);
  lines.push(`Block: ${snapshotData.blockNumber}`);
  lines.push(`Addresses: ${snapshotData.uniqueAddresses}`);
  lines.push(`Total Holdings: ${snapshotData.totalHolders}`);
  lines.push(`Total Tokens: ${snapshotData.totalTokens}`);
  lines.push('='.repeat(60));
  
  // Top 5 holders
  const sortedHolders = snapshotData.holders.sort((a, b) => {
    const aTotal = a.holdings.reduce((sum, h) => sum + BigInt(h.balance), BigInt(0));
    const bTotal = b.holdings.reduce((sum, h) => sum + BigInt(h.balance), BigInt(0));
    return Number(bTotal - aTotal);
  });
  
  lines.push('\n🏆 TOP 5 HOLDERS:');
  sortedHolders.slice(0, 5).forEach((holder, index) => {
    const totalTokens = holder.holdings.reduce((sum, h) => sum + BigInt(h.balance), BigInt(0));
    const formattedTotal = (Number(totalTokens) / 100000000).toFixed(2);
    lines.push(`${index + 1}. ${holder.address}: ${formattedTotal} tokens`);
  });
  
  // Module distribution
  const moduleStats = new Map<string, { holders: number; totalTokens: bigint }>();
  snapshotData.holders.forEach(holder => {
    holder.holdings.forEach(holding => {
      const moduleName = holding.moduleName;
      if (!moduleStats.has(moduleName)) {
        moduleStats.set(moduleName, { holders: 0, totalTokens: BigInt(0) });
      }
      const stats = moduleStats.get(moduleName)!;
      stats.holders++;
      stats.totalTokens += BigInt(holding.balance);
    });
  });
  
  lines.push('\n🎯 BY PLAYER/MODULE:');
  Array.from(moduleStats.entries())
    .sort((a, b) => Number(b[1].totalTokens - a[1].totalTokens))
    .forEach(([moduleName, stats]) => {
      const formattedTokens = (Number(stats.totalTokens) / 100000000).toFixed(2);
      lines.push(`   ${moduleName}: ${stats.holders} holders, ${formattedTokens} tokens`);
    });
  
  return lines.join('\n');
}

/**
 * Calculate reward eligibility based on snapshots
 */
export async function calculateRewardEligibility(
  tournamentId: string,
  address: string
): Promise<{
  eligible: boolean;
  preMatchHoldings: ContractHolder | null;
  postMatchHoldings: ContractHolder | null;
  maintainedHoldings: number;
  totalHoldings: number;
  eligibilityPercentage: number;
}> {
  try {
    const preMatch = await getUserHoldingsFromSnapshot(tournamentId, 'PRE_MATCH', address);
    const postMatch = await getUserHoldingsFromSnapshot(tournamentId, 'POST_MATCH', address);

    if (!preMatch || !postMatch) {
      return {
        eligible: false,
        preMatchHoldings: preMatch,
        postMatchHoldings: postMatch,
        maintainedHoldings: 0,
        totalHoldings: 0,
        eligibilityPercentage: 0
      };
    }

    // Calculate maintained holdings
    const preHoldings = new Map(preMatch.holdings.map(h => [h.moduleName, h.balance]));
    const postHoldings = new Map(postMatch.holdings.map(h => [h.moduleName, h.balance]));

    let maintainedHoldings = 0;
    let totalHoldings = preMatch.holdings.length;

    for (const [moduleName, preBalance] of preHoldings) {
      const postBalance = postHoldings.get(moduleName);
      if (postBalance && BigInt(postBalance) >= BigInt(preBalance)) {
        maintainedHoldings++;
      }
    }

    const eligibilityPercentage = totalHoldings > 0 ? (maintainedHoldings / totalHoldings) * 100 : 0;
    
    // Eligible if user was in pre-match snapshot (had any holdings before match)
    // Rewards are automatically proportional to maintained holdings via MIN(pre, post) calculation
    const eligible = preMatch !== null && totalHoldings > 0;

    return {
      eligible,
      preMatchHoldings: preMatch,
      postMatchHoldings: postMatch,
      maintainedHoldings,
      totalHoldings,
      eligibilityPercentage
    };
  } catch (error) {
    console.error('[CONTRACT_SNAPSHOT] Error calculating reward eligibility:', error);
    throw new Error(`Failed to calculate reward eligibility: ${error}`);
  }
}
