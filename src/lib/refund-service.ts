import { PrivyClient } from '@privy-io/server-auth';
import { Transaction, PublicKey, Connection } from '@solana/web3.js';
import { 
  createTransferCheckedInstruction, 
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getMint
} from '@solana/spl-token';
import { env } from '../env.mjs';

export interface RefundResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

export class RefundService {
  private privy: PrivyClient;
  private treasuryWalletId: string;
  private usdcMint: PublicKey;
  private connection: Connection;

  constructor() {
    this.privy = new PrivyClient(
      env.NEXT_PUBLIC_PRIVY_APP_ID,
      env.PRIVY_APP_SECRET
    );
    
    // Treasury wallet ID (set after importing wallet via script)
    this.treasuryWalletId = process.env.TREASURY_WALLET_ID!;
    
    // USDC mint address
    this.usdcMint = new PublicKey(process.env.ASSET || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    
    // Solana connection for building transactions
    const network = process.env.NETWORK || 'solana-devnet';
    const rpcUrl = network === 'solana' 
      ? env.NEXT_PUBLIC_SOLANA_RPC_MAINNET || 'https://api.mainnet-beta.solana.com'
      : env.NEXT_PUBLIC_SOLANA_RPC_DEVNET || 'https://api.devnet.solana.com';
    
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  /**
   * Execute a USDC refund from treasury to user wallet
   * @param userWalletAddress - User's Solana wallet address (base58)
   * @param refundAmountUsdc - Refund amount in USDC micro-units (1 USDC = 1,000,000 micro-units)
   * @returns Promise<RefundResult>
   */
  async executeRefund(userWalletAddress: string, refundAmountUsdc: number): Promise<RefundResult> {
    try {
      console.log(`🔄 Processing refund: ${refundAmountUsdc} USDC micro-units to ${userWalletAddress}`);
      
      // Validate inputs
      if (!userWalletAddress || !this.isValidSolanaAddress(userWalletAddress)) {
        throw new Error(`Invalid user wallet address: ${userWalletAddress}`);
      }
      
      if (refundAmountUsdc <= 0) {
        throw new Error(`Invalid refund amount: ${refundAmountUsdc}`);
      }
      
      if (!this.treasuryWalletId) {
        throw new Error('Treasury wallet ID not configured. Run import script first.');
      }

      // Build the USDC transfer transaction
      const transaction = await this.buildRefundTransaction(userWalletAddress, refundAmountUsdc);
      
      console.log(`📤 Sending refund transaction via Privy...`);
      
      // Send transaction using Privy's Solana RPC API
      // Privy expects the Transaction object, not serialized string
      const caip2 = this.getSolanaCaip2ChainId();
      const result = await this.privy.walletApi.solana.signAndSendTransaction({
        walletId: this.treasuryWalletId,
        transaction: transaction,
        caip2: caip2,
      });
      
      console.log(`✅ Refund transaction completed: ${result.hash}`);
      
      return {
        success: true,
        transactionHash: result.hash,
      };
      
    } catch (error) {
      console.error('❌ Refund transaction failed:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Build a USDC transfer transaction from treasury to user
   */
  private async buildRefundTransaction(userAddress: string, refundAmount: number): Promise<Transaction> {
    const userPubkey = new PublicKey(userAddress);
    const treasuryPubkey = new PublicKey(process.env.TREASURY_WALLET_ADDRESS!);
    
    console.log(`🏗️ Building refund transaction:`);
    console.log(`   From: ${treasuryPubkey.toBase58()}`);
    console.log(`   To: ${userPubkey.toBase58()}`);
    console.log(`   Amount: ${refundAmount} USDC micro-units`);
    
    // Determine which token program to use
    const mintInfo = await this.connection.getAccountInfo(this.usdcMint, 'confirmed');
    const programId = mintInfo?.owner?.equals(TOKEN_2022_PROGRAM_ID) 
      ? TOKEN_2022_PROGRAM_ID 
      : TOKEN_PROGRAM_ID;
    
    // Get mint info for decimals
    const mint = await getMint(this.connection, this.usdcMint, undefined, programId);
    
    console.log(`💰 USDC mint: ${this.usdcMint.toBase58()}`);
    console.log(`🔧 Token program: ${programId.toBase58()}`);
    console.log(`📊 Decimals: ${mint.decimals}`);
    
    // Get associated token addresses
    const treasuryAta = await getAssociatedTokenAddress(
      this.usdcMint,
      treasuryPubkey,
      false, // allowOwnerOffCurve
      programId
    );
    
    const userAta = await getAssociatedTokenAddress(
      this.usdcMint,
      userPubkey,
      false, // allowOwnerOffCurve  
      programId
    );
    
    console.log(`🏦 Treasury ATA: ${treasuryAta.toBase58()}`);
    console.log(`👤 User ATA: ${userAta.toBase58()}`);
    
    // Check if user's ATA exists
    const userAtaInfo = await this.connection.getAccountInfo(userAta, 'confirmed');
    if (!userAtaInfo) {
      throw new Error(
        `User's USDC token account does not exist: ${userAta.toBase58()}. ` +
        `User must have received USDC before to have this account created.`
      );
    }
    
    // Create transfer instruction
    const transferInstruction = createTransferCheckedInstruction(
      treasuryAta,           // source
      this.usdcMint,         // mint
      userAta,               // destination
      treasuryPubkey,        // owner (treasury)
      BigInt(refundAmount),  // amount in micro-units
      mint.decimals,         // decimals (should be 6 for USDC)
      [],                    // multiSigners (none)
      programId              // program ID
    );
    
    // Build transaction
    const transaction = new Transaction();
    transaction.add(transferInstruction);
    
    // Set recent blockhash (Privy will handle this, but good practice)
    const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = treasuryPubkey;
    
    return transaction;
  }

  /**
   * Validate Solana address format
   */
  private isValidSolanaAddress(address: string): boolean {
    try {
      if (typeof address !== 'string') return false;
      if (address.length < 32 || address.length > 44) return false;
      
      // Check if it's valid base58
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
      if (!base58Regex.test(address)) return false;
      
      // Try to create PublicKey (will throw if invalid)
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get treasury wallet info from Privy
   */
  async getTreasuryInfo(): Promise<{ address: string; id: string }> {
    const wallet = await this.privy.walletApi.getWallet({ id: this.treasuryWalletId });
    return {
      address: wallet.address,
      id: wallet.id,
    };
  }

  /**
   * Convert USDC amount from dollars to micro-units
   * @param usdAmount - Amount in USD (e.g., 2.5 for $2.50)
   * @returns Amount in USDC micro-units
   */
  static usdToMicroUsdc(usdAmount: number): number {
    return Math.floor(usdAmount * 1_000_000); // 6 decimals
  }

  /**
   * Convert USDC micro-units to dollar amount
   * @param microUsdc - Amount in USDC micro-units
   * @returns Amount in USD
   */
  static microUsdcToUsd(microUsdc: number): number {
    return microUsdc / 1_000_000; // 6 decimals
  }

  /**
   * Get the correct CAIP-2 chain ID for the current Solana network
   */
  private getSolanaCaip2ChainId(): 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' | 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' {
    const network = process.env.NETWORK || 'solana-devnet';
    
    if (network === 'solana') {
      return 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'; // Mainnet
    } else {
      return 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'; // Devnet
    }
  }
}
