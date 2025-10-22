import { Request, Response } from 'express';
import { PrismaClient, PackType } from '@prisma/client';
import { distributeRandomPlayerTokens, generatePackData, PackType as PackTypeEnum, PACK_TYPES } from '../utils/playerTokenDistribution';
import { solanaAdapter } from '../blockchain/adapters/solana.adapter';

const prisma = new PrismaClient();

export interface PackPlayer {
  player: string;
  amount: number;
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface PackInfo {
  id: string;
  packType: PackType;
  isOpened: boolean;
  players: PackPlayer[];
  totalValue: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get available pack types and their information
 */
export const getPackTypes = async (req: Request, res: Response) => {
  try {
    const packTypes = PACK_TYPES.map(pack => ({
      type: pack.type,
      name: pack.name,
      price: pack.price,
      description: pack.description
    }));

    res.json({
      success: true,
      data: packTypes
    });
  } catch (error) {
    console.error('Error getting pack types:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pack types'
    });
  }
};


/**
 * Open a player pack and transfer tokens to user
 */
export const openPack = async (req: Request, res: Response) => {
  try {
    const { packId } = req.body;
    const adminPrivateKey = process.env.SOLANA_ADMIN_PRIVATE_KEY;

    if (!packId || !adminPrivateKey) {
      return res.status(400).json({
        success: false,
        error: 'PackId and adminPrivateKey are required'
      });
    }

    // Find the pack
    const playerPack = await prisma.playerPack.findUnique({
      where: { id: packId },
      include: { user: true }
    });

    if (!playerPack) {
      return res.status(404).json({
        success: false,
        error: 'Pack not found'
      });
    }

    if (playerPack.isOpened) {
      return res.status(400).json({
        success: false,
        error: 'Pack has already been opened'
      });
    }

    console.log(`[OPEN PACK] Opening pack ${packId} for user ${playerPack.user.address}`);

    // Transfer tokens to user
    const transferResults = await distributeRandomPlayerTokens(
      playerPack.user.address,
      Number(playerPack.totalValue),
      adminPrivateKey
    );

    // Update pack as opened
    await prisma.playerPack.update({
      where: { id: packId },
      data: { 
        isOpened: true,
        players: transferResults as any // Cast to any for JSON storage
      }
    });

    console.log(`[OPEN PACK] Pack ${packId} opened successfully`);

    res.json({
      success: true,
      data: {
        packId: playerPack.id,
        packType: playerPack.packType,
        players: transferResults,
        totalValue: playerPack.totalValue,
        message: 'Pack opened successfully! Player tokens have been transferred to your wallet.'
      }
    });

  } catch (error) {
    console.error('Error opening pack:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to open pack'
    });
  }
};

/**
 * Get user's packs (opened and unopened)
 */
export const getUserPacks = async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { opened } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address is required'
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { address }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Build where clause
    const whereClause: any = { userId: user.id };
    
    if (opened !== undefined) {
      whereClause.isOpened = opened === 'true';
    }

    // Get packs
    const packs = await prisma.playerPack.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: packs
    });

  } catch (error) {
    console.error('Error getting user packs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user packs'
    });
  }
};

/**
 * Get specific pack details
 */
export const getPackDetails = async (req: Request, res: Response) => {
  try {
    const { packId } = req.params;

    const pack = await prisma.playerPack.findUnique({
      where: { id: packId },
      include: { user: true }
    });

    if (!pack) {
      return res.status(404).json({
        success: false,
        error: 'Pack not found'
      });
    }

    res.json({
      success: true,
      data: pack
    });

  } catch (error) {
    console.error('Error getting pack details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pack details'
    });
  }
};

/**
 * Get latest unopened pack for user by pack type
 */
export const getLatestUnopenedPack = async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { packType } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address is required'
      });
    }

    if (!packType) {
      return res.status(400).json({
        success: false,
        error: 'Pack type is required'
      });
    }

    // Validate pack type
    const validPackTypes = ['BASE', 'PRIME', 'ULTRA'];
    if (!validPackTypes.includes(packType as string)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pack type. Must be BASE, PRIME, or ULTRA'
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { address }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get latest unopened pack of the specified type
    const pack = await prisma.playerPack.findFirst({
      where: {
        userId: user.id,
        packType: packType as PackType,
        isOpened: false
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!pack) {
      return res.status(404).json({
        success: false,
        error: `No unopened ${packType} pack found for this user`
      });
    }

    res.json({
      success: true,
      data: {
        id: pack.id,
        packType: pack.packType,
        isOpened: pack.isOpened,
        totalValue: pack.totalValue,
        createdAt: pack.createdAt,
        updatedAt: pack.updatedAt
      }
    });

  } catch (error) {
    console.error('Error getting latest unopened pack:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get latest unopened pack'
    });
  }
};

/**
 * Purchase pack function for contract event service
 * This is a simplified version that doesn't require request/response objects
 */
export const purchasePack = async (userAddress: string, packType: number, transactionHash: string) => {
  try {
    console.log(`📦 Creating ${packType} boson pack for ${userAddress.substring(0, 8)}...`);

    // Validate pack type
    const validPackTypes = Object.values(PackTypeEnum);
    if (!validPackTypes.includes(packType)) {
      throw new Error('Invalid pack type');
    }

    // Get pack info
    const packInfo = PACK_TYPES.find(p => p.type === packType);
    if (!packInfo) {
      throw new Error('Pack type not found');
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { address: userAddress }
    });

    if (!user) {
      user = await prisma.user.create({
        data: { address: userAddress }
      });
    }

    // Generate pack data
    const packData = await generatePackData(packInfo.price);

    // Convert pack type number to enum
    const packTypeEnum = packType === 20 ? 'BASE' : packType === 50 ? 'PRIME' : 'ULTRA';

    // Create the pack in database
    const playerPack = await prisma.playerPack.create({
      data: {
        userId: user.id,
        packType: packTypeEnum as PackType,
        isOpened: false,
        players: packData.players as any,
        totalValue: packData.totalValue
      }
    });

    console.log(`✅ Pack created: ${playerPack.id} (${packData.players.length} players)`);

    return {
      success: true,
      packId: playerPack.id,
      packType: playerPack.packType,
      totalValue: playerPack.totalValue,
      transactionHash
    };

  } catch (error) {
    console.error('❌ Pack creation failed:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
};
