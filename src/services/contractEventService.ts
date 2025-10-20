import { Connection, PublicKey, Logs, Context } from '@solana/web3.js';
import { REWARD_CONFIG } from '../config/reward.config';
import { PackType } from '../utils/playerTokenDistribution';
import dotenv from 'dotenv';

dotenv.config();

export interface ContractEvent {
  signature: string;
  fromAddress: string;
  amount: number;
  blockTime: number;
  slot: number;
}

export class ContractEventService {
  private connection: Connection;
  private contractAddress: string;
  private isListening: boolean = false;
  private processedSignatures: Set<string> = new Set();
  private subscriptionId: number | null = null;

  constructor(contractAddress: string) {
    const rpcUrl = process.env.SOLANA_RPC_URL;
    if (!rpcUrl) {
      throw new Error('SOLANA_RPC_URL must be set in environment');
    }

    this.connection = new Connection(rpcUrl, 'confirmed');
    this.contractAddress = contractAddress;
    
    console.log(`[CONTRACT_EVENT] Initialized for contract: ${contractAddress}`);
  }

  /**
   * Start listening to contract events/logs
   */
  async startListening(): Promise<void> {
    if (this.isListening) {
      console.log('[CONTRACT_EVENT] Already listening');
      return;
    }

    try {
      const programId = new PublicKey(this.contractAddress);
      
      console.log(`[CONTRACT_EVENT] Starting to listen to program logs...`);
      
      // Subscribe to program logs using the correct method
      this.subscriptionId = this.connection.onLogs(
        programId,
        (logs: Logs, context: Context) => {
          this.handleProgramLogs(logs, context.slot)
            .catch(error => {
              console.error('[CONTRACT_EVENT] Error handling program logs:', error);
            });
        },
        'confirmed'
      );

      this.isListening = true;
      console.log(`[CONTRACT_EVENT] ✅ Listening to contract events for program: ${this.contractAddress}`);

    } catch (error) {
      console.error('[CONTRACT_EVENT] Failed to start listening:', error);
      throw error;
    }
  }

  /**
   * Stop listening to contract events
   */
  stopListening(): void {
    if (this.subscriptionId !== null) {
      this.connection.removeOnLogsListener(this.subscriptionId);
      this.subscriptionId = null;
    }
    this.isListening = false;
    console.log('[CONTRACT_EVENT] Stopped listening to contract events');
  }

  /**
   * Handle incoming program logs
   */
  private async handleProgramLogs(logs: Logs, slot: number): Promise<void> {
    try {
      const signature = logs.signature;
      
      // Skip if we've already processed this signature
      if (this.processedSignatures.has(signature)) {
        return;
      }

      console.log(`[CONTRACT_EVENT] Received logs for signature: ${signature}`);

      // Parse the logs to extract event data
      const event = this.parseContractEvent(logs, slot);
      
      if (event) {
        console.log(`[CONTRACT_EVENT] Parsed event:`, {
          signature: event.signature,
          fromAddress: event.fromAddress.substring(0, 12) + '...',
          amount: event.amount
        });

        await this.processPackPurchase(event);
      }

      // Mark as processed
      this.processedSignatures.add(signature);

    } catch (error) {
      console.error('[CONTRACT_EVENT] Error handling program logs:', error);
    }
  }

  /**
   * Parse contract event from program logs
   * This needs to be customized based on your contract's log format
   */
  private parseContractEvent(logs: Logs, slot: number): ContractEvent | null {
    try {
      // Validate amount matches pack prices
      const validAmounts = Object.values(PackType).filter(v => typeof v === 'number') as number[];

      // Your contract should emit logs like:
      // "Program log: PackPurchase|{fromAddress}|{amount}"
      // or similar format that you can parse

      const logMessages = logs.logs || [];
      
      for (const message of logMessages) {
        // Example parsing - customize this based on your contract's actual log format
        if (typeof message === 'string' && message.includes('PackPurchase')) {
          console.log(`[CONTRACT_EVENT] Found pack purchase log: ${message}`);
          
          // Parse the log message - customize this based on your contract format
          const parts = message.split('|');
          if (parts.length >= 3) {
            const fromAddress = parts[1];
            const amount = parseFloat(parts[2]);
            
            // Validate amount matches pack prices (validAmounts is declared above)
            if (validAmounts.includes(amount)) {
              return {
                signature: logs.signature,
                fromAddress,
                amount,
                blockTime: Date.now() / 1000, // Will be updated if we can get real block time
                slot
              };
            } else {
              console.log(`[CONTRACT_EVENT] Invalid amount ${amount}, expected: ${validAmounts.join(', ')}`);
            }
          }
        }

        // Alternative parsing methods if your contract uses different log formats:
        
        // If your contract emits JSON logs:
        try {
          const jsonMatch = message.match(/\{.*\}/);
          if (jsonMatch) {
            const eventData = JSON.parse(jsonMatch[0]);
            if (eventData.type === 'PackPurchase' && validAmounts.includes(eventData.amount)) {
              return {
                signature: logs.signature,
                fromAddress: eventData.fromAddress,
                amount: eventData.amount,
                blockTime: Date.now() / 1000,
                slot
              };
            }
          }
        } catch (jsonError) {
          // Not JSON, continue with other parsing methods
        }

        // If your contract emits base64 encoded data:
        // You can decode and parse binary data here if needed
      }

      return null;

    } catch (error) {
      console.error('[CONTRACT_EVENT] Error parsing contract event:', error);
      return null;
    }
  }

  /**
   * Process pack purchase based on contract event
   */
  private async processPackPurchase(event: ContractEvent): Promise<void> {
    try {
      console.log(`[CONTRACT_EVENT] Processing pack purchase:`, {
        fromAddress: event.fromAddress.substring(0, 12) + '...',
        amount: event.amount,
        signature: event.signature.substring(0, 12) + '...'
      });

      // Import the purchasePack function dynamically to avoid circular dependencies
      const { purchasePack } = await import('../controllers/packs.controller');
      
      // Create a mock request/response for the purchasePack function
      const mockReq = {
        body: {
          userAddress: event.fromAddress,
          packType: event.amount as PackType,
          bosonAmount: event.amount,
          transactionHash: event.signature
        }
      } as any;

      const mockRes = {
        json: (data: any) => {
          if (data.success) {
            console.log(`[CONTRACT_EVENT] ✅ Pack purchase processed successfully`);
            console.log(`[CONTRACT_EVENT] Summary:`, data.packPurchase?.summary);
          } else {
            console.error(`[CONTRACT_EVENT] ❌ Pack purchase failed:`, data.error);
          }
        },
        status: (code: number) => ({
          json: (data: any) => {
            console.error(`[CONTRACT_EVENT] ❌ Pack purchase failed (${code}):`, data);
          }
        })
      } as any;

      await purchasePack(mockReq, mockRes);

    } catch (error) {
      console.error('[CONTRACT_EVENT] Error processing pack purchase:', error);
    }
  }

  /**
   * Get the contract address
   */
  getContractAddress(): string {
    return this.contractAddress;
  }

  /**
   * Check if currently listening
   */
  isActive(): boolean {
    return this.isListening;
  }
}

// Factory function to create the service with contract address from config
export const createContractEventService = (): ContractEventService => {
  const contractAddress = process.env.PACK_PURCHASE_CONTRACT_ADDRESS;
  
  if (!contractAddress) {
    throw new Error('PACK_PURCHASE_CONTRACT_ADDRESS must be set in environment variables');
  }

  return new ContractEventService(contractAddress);
};
