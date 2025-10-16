# 🏗️ Blockchain Architecture

## Overview
The backend is designed to be **blockchain-agnostic**, making it easy to port from Aptos to any other blockchain (Ethereum, Solana, Sui, etc.) with minimal code changes.

---

## 📁 Architecture

```
src/
├── blockchain/                    # Blockchain abstraction layer
│   ├── index.ts                   # 🎯 SINGLE FILE TO CHANGE FOR CHAIN SWITCH
│   ├── interfaces/
│   │   └── IBlockchainService.ts  # Interface defining all blockchain operations
│   └── adapters/
│       ├── aptos.adapter.ts       # ✅ Current: Aptos implementation
│       ├── ethereum.adapter.ts    # 🔮 Future: Add when needed
│       └── solana.adapter.ts      # 🔮 Future: Add when needed
│
├── config/
│   ├── blockchain.config.ts       # Chain-specific configuration
│   └── reward.config.ts           # Reward distribution config
│
├── controllers/                   # Use blockchain abstraction
├── services/                      # Use blockchain abstraction
└── scripts/                       # Use blockchain abstraction
```

---

## 🔌 How It Works

### **1. Interface Definition** (`IBlockchainService`)

Defines all blockchain operations needed by the app:

```typescript
interface IBlockchainService {
  getTokenHolders(playerModule: string): Promise<string[]>;
  getTokenBalance(address: string, playerModule: string): Promise<bigint>;
  getTokenHoldersWithBalances(): Promise<TokenHolder[]>;
  transferTokens(from, to, amount, tokenType): Promise<TransferResult>;
  getAccountInfo(address: string): Promise<AccountInfo>;
  getCurrentBlockNumber(): Promise<string>;
  getNetwork(): string;
  getExplorerUrl(txHash: string): string;
}
```

### **2. Aptos Adapter** (`aptos.adapter.ts`)

Implements the interface using Aptos SDK:

```typescript
export class AptosAdapter implements IBlockchainService {
  async getTokenHolders(playerModule: string) {
    // Aptos-specific implementation
    const response = await aptos.view({ 
      function: `${contract}::${playerModule}::get_token_holders`
    });
    return response[0];
  }
  
  async transferTokens(...) {
    // Aptos-specific transfer logic
    const tx = await aptos.transferCoinTransaction({...});
    return { success, txHash, explorerUrl };
  }
  
  // ... other methods
}
```

### **3. Usage in App** (Chain-Agnostic!)

```typescript
// Controllers/Services use generic interface
import { blockchain } from '../blockchain';

// Works with ANY blockchain that implements the interface!
const holders = await blockchain.getTokenHoldersWithBalances();
const balance = await blockchain.getTokenBalance(address, player);
const result = await blockchain.transferTokens(from, to, amount, token);
```

---

## 🔄 How to Switch Blockchains

### **Example: Aptos → Ethereum**

#### **Step 1: Create Ethereum Adapter**

```typescript
// src/blockchain/adapters/ethereum.adapter.ts
import { ethers } from 'ethers';
import { IBlockchainService, TokenHolder } from '../interfaces/IBlockchainService';

export class EthereumAdapter implements IBlockchainService {
  private provider: ethers.Provider;
  private contractAddresses: Map<string, string>;

  async getTokenHolders(playerModule: string): Promise<string[]> {
    // Ethereum ERC-20 implementation
    const contract = new ethers.Contract(address, abi, this.provider);
    const events = await contract.queryFilter(contract.filters.Transfer());
    // ... extract holders from events
    return holders;
  }

  async getTokenBalance(address: string, playerModule: string): Promise<bigint> {
    // Ethereum ERC-20 balanceOf
    const contract = new ethers.Contract(playerAddress, abi, this.provider);
    const balance = await contract.balanceOf(address);
    return BigInt(balance.toString());
  }

  async transferTokens(...): Promise<TransferResult> {
    // Ethereum transfer logic
    const tx = await contract.transfer(to, amount);
    const receipt = await tx.wait();
    return {
      success: receipt.status === 1,
      transactionHash: receipt.hash,
      explorerUrl: `https://etherscan.io/tx/${receipt.hash}`
    };
  }

  getNetwork(): string {
    return 'Ethereum Mainnet';
  }

  // ... implement all other interface methods
}

export const ethereumAdapter = new EthereumAdapter();
```

#### **Step 2: Update Configuration**

```typescript
// src/config/blockchain.config.ts
export const BLOCKCHAIN_CONFIG = {
  CONTRACT_ADDRESS: process.env.ETH_CONTRACT_ADDRESS, // ← Change
  TOKEN_DECIMALS: 18, // ← Ethereum uses 18 decimals
  NORMALIZATION_FACTOR: 1000000000000000000, // ← 10^18
  // ... other Ethereum-specific config
};
```

#### **Step 3: Switch Active Blockchain**

```typescript
// src/blockchain/index.ts
import { ethereumAdapter } from './adapters/ethereum.adapter'; // ← Add

// Change THIS ONE LINE:
export const blockchain: IBlockchainService = ethereumAdapter; // ← Was: aptosAdapter
```

#### **Step 4: Update Environment**

```env
# .env
BLOCKCHAIN_NETWORK=mainnet
ETH_CONTRACT_ADDRESS=0x...
ETH_RPC_URL=https://mainnet.infura.io/v3/...
ADMIN_PRIVATE_KEY=0x...  # Ethereum private key format
```

**That's it! No other code changes needed!** ✅

---

## 🎯 Benefits

### **1. Easy Chain Migration**
- Create new adapter
- Update 1 line in `blockchain/index.ts`
- Done!

### **2. No Code Changes Needed**
- Controllers don't change
- Services don't change
- Scripts don't change
- Only blockchain adapter changes

### **3. Test Different Chains**
```typescript
// Easy to switch for testing
export const blockchain = 
  process.env.CHAIN === 'ethereum' ? ethereumAdapter :
  process.env.CHAIN === 'solana' ? solanaAdapter :
  aptosAdapter; // default
```

### **4. Multi-Chain Support**
```typescript
// Can even support multiple chains simultaneously
export const chains = {
  aptos: aptosAdapter,
  ethereum: ethereumAdapter,
  solana: solanaAdapter
};

// Use different chains for different features
const mainChain = chains.aptos;
const rewardChain = chains.ethereum;
```

---

## 📋 Current Implementation

### **Active Blockchain:** Aptos ✅
- Adapter: `blockchain/adapters/aptos.adapter.ts`
- Network: Testnet
- Token Standard: Custom Aptos modules
- Decimals: 8

### **Abstracted Operations:**
✅ Get token holders  
✅ Get balances  
✅ Transfer tokens  
✅ Get account info  
✅ Get block number  
✅ Explorer URLs  

### **Usage Example:**
```typescript
// Before (Aptos-specific):
import { getTokenHoldersWithBalances } from '../services/aptosService';
const holders = await getTokenHoldersWithBalances();

// After (Chain-agnostic):
import { blockchain } from '../blockchain';
const holders = await blockchain.getTokenHoldersWithBalances();
```

---

## 🚀 Future Chains (Ready to Add)

### **Ethereum**
- Standard: ERC-20
- Decimals: 18
- SDK: ethers.js or viem
- Effort: ~2-3 hours to implement adapter

### **Solana**
- Standard: SPL Token
- Decimals: 9
- SDK: @solana/web3.js
- Effort: ~2-3 hours to implement adapter

### **Sui**
- Standard: Sui Coin
- Decimals: 9
- SDK: @mysten/sui.js
- Effort: ~2-3 hours to implement adapter

---

## ✅ Summary

Your backend is now **blockchain-agnostic**! 

**To switch chains:**
1. Create new adapter (~200 lines)
2. Update 1 line in `blockchain/index.ts`
3. Update `.env` with new chain credentials

**Zero changes needed in:**
- ✅ Controllers
- ✅ Routes
- ✅ Services
- ✅ Scripts
- ✅ Database schema

**The entire app works with any blockchain!** 🎉

