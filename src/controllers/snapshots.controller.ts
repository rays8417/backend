import { Request, Response } from "express";
import { prisma } from "../prisma";
import { 
  createContractSnapshot, 
  getTournamentSnapshots,
  comparePrePostMatchSnapshots,
  getUserHoldingsFromSnapshot,
  calculateRewardEligibility
} from '../services/contractSnapshotService';
import { blockchain } from '../blockchain';

/**
 * Snapshots Controller
 * Handles contract snapshots, comparisons, and holder data
 */

// Helper Functions

/**
 * Format snapshot response - eliminates redundancy
 */
const formatSnapshotResponse = (snapshot: any) => ({
  tournamentId: snapshot.tournamentId,
  snapshotType: snapshot.snapshotType,
  timestamp: snapshot.timestamp,
  blockNumber: snapshot.blockNumber,
  contractAddress: snapshot.contractAddress,
  totalHolders: snapshot.totalHolders,
  totalTokens: snapshot.totalTokens,
  uniqueAddresses: snapshot.uniqueAddresses
});

/**
 * Format holder response - eliminates redundancy
 */
const formatHolderResponse = (holder: any) => ({
  address: holder.address,
  balance: holder.formattedBalance,
  balanceBigInt: holder.balance.toString(),
  playerId: holder.playerId,
  moduleName: holder.moduleName
});

// Controller Functions

/**
 * POST /api/snapshots/create
 * Create snapshot for tournament (Admin only)
 */
export const createSnapshot = async (req: Request, res: Response) => {
  try {
    const { tournamentId, snapshotType, contractAddress } = req.body;

    if (!tournamentId || !snapshotType) {
      return res.status(400).json({ error: 'Tournament ID and snapshot type are required' });
    }

    // Validate snapshot type
    if (!['PRE_MATCH', 'POST_MATCH'].includes(snapshotType)) {
      return res.status(400).json({ error: 'Snapshot type must be PRE_MATCH or POST_MATCH' });
    }

    // Create contract snapshot
    const result = await createContractSnapshot(
      tournamentId,
      snapshotType as 'PRE_MATCH' | 'POST_MATCH',
      contractAddress
    );

    res.json({
      success: true,
      message: `${snapshotType} snapshot created successfully`,
      snapshot: result
    });
  } catch (error) {
    console.error('Snapshot creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create snapshot',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * GET /api/snapshots/tournament/:tournamentId
 * Get snapshots for tournament
 */
export const getSnapshotsForTournament = async (req: Request, res: Response) => {
  try {
    const { tournamentId } = req.params;

    const snapshots = await getTournamentSnapshots(tournamentId);

    res.json({
      success: true,
      snapshots: snapshots.map(formatSnapshotResponse)
    });
  } catch (error) {
    console.error('Snapshots fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch snapshots' });
  }
};

/**
 * GET /api/snapshots/:id
 * Get specific snapshot details
 */
export const getSnapshotById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const snapshot = await prisma.snapshot.findUnique({
      where: { id }
    });

    if (!snapshot) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }

    res.json({
      success: true,
      snapshot: {
        id: snapshot.id,
        tournamentId: snapshot.tournamentId,
        snapshotType: snapshot.snapshotType,
        contractAddress: snapshot.contractAddress,
        blockNumber: snapshot.blockNumber.toString(),
        data: snapshot.data,
        createdAt: snapshot.createdAt
      }
    });
  } catch (error) {
    console.error('Snapshot fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch snapshot' });
  }
};

/**
 * GET /api/snapshots/user/:userId/holdings
 * Get user holdings across all snapshots
 */
export const getUserHoldingsHistory = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { tournamentId } = req.query;

    const whereClause: any = {
      data: {
        path: ['holdings'],
        array_contains: [{ userId }]
      }
    };

    if (tournamentId) {
      whereClause.tournamentId = tournamentId;
    }

    const snapshots = await prisma.snapshot.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' }
    });

    const userHoldingsHistory = snapshots.map((snapshot: any) => {
      const userHoldings = snapshot.data.holdings.filter((h: any) => h.userId === userId);
      return {
        snapshotId: snapshot.id,
        tournamentId: snapshot.data.tournamentId,
        snapshotType: snapshot.data.snapshotType,
        timestamp: snapshot.data.timestamp,
        holdings: userHoldings,
        totalValue: userHoldings.reduce((sum: number, h: any) => sum + h.currentValue, 0),
        totalTokens: userHoldings.reduce((sum: number, h: any) => sum + Number(h.tokenAmount), 0)
      };
    });

    res.json({
      success: true,
      userHoldingsHistory
    });
  } catch (error) {
    console.error('User holdings history error:', error);
    res.status(500).json({ error: 'Failed to fetch user holdings history' });
  }
};

/**
 * GET /api/snapshots/user/:address/holdings/:tournamentId
 * Get user holdings from snapshot
 */
export const getUserHoldingsFromSnapshotEndpoint = async (req: Request, res: Response) => {
  try {
    const { address, tournamentId } = req.params;
    const { snapshotType = 'PRE_MATCH' } = req.query;

    const holdings = await getUserHoldingsFromSnapshot(
      tournamentId,
      snapshotType as 'PRE_MATCH' | 'POST_MATCH',
      address
    );

    res.json({
      success: true,
      holdings
    });
  } catch (error) {
    console.error('User holdings error:', error);
    res.status(500).json({ error: 'Failed to fetch user holdings' });
  }
};

/**
 * POST /api/snapshots/validate-eligibility
 * Validate reward eligibility
 */
export const validateEligibility = async (req: Request, res: Response) => {
  try {
    const { tournamentId, address } = req.body;

    if (!tournamentId || !address) {
      return res.status(400).json({ error: 'Tournament ID and address are required' });
    }

    const eligibility = await calculateRewardEligibility(tournamentId, address);

    res.json({
      success: true,
      eligibility
    });
  } catch (error) {
    console.error('Eligibility validation error:', error);
    res.status(500).json({ error: 'Failed to validate eligibility' });
  }
};

/**
 * GET /api/snapshots/token-holders/:moduleName
 * Get Token holders for specific player module (blockchain-agnostic)
 */
export const getTokenHoldersByModule = async (req: Request, res: Response) => {
  try {
    const { moduleName } = req.params;
    
    // Use blockchain abstraction layer
    const holders = await blockchain.getTokenHoldersForPlayer(moduleName);
    
    res.json({
      success: true,
      moduleName,
      holders: holders.map(holder => ({
        address: holder.address,
        balance: holder.formattedBalance,
        balanceBigInt: holder.balance.toString(),
        playerId: holder.playerId
      })),
      totalHolders: holders.length,
      totalTokens: holders.reduce((sum, holder) => sum + holder.balance, BigInt(0)).toString()
    });
  } catch (error) {
    console.error(`Error fetching token holders for ${req.params.moduleName}:`, error);
    res.status(500).json({ 
      error: `Failed to fetch token holders for ${req.params.moduleName}`,
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

