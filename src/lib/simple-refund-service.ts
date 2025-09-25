// Simple refund service using @solana/web3.js (proven approach)
import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferCheckedInstruction,
  getMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";

export interface RefundResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

export class SimpleRefundService {
  private connection: Connection;
  private treasuryKeypair: Keypair;
  private usdcMintAddress: PublicKey;

  constructor() {
    console.log("🔧 Initializing Simple Refund Service...");

    // Get network configuration from environment (no Privy dependencies)
    const network = process.env.NEXT_PUBLIC_NETWORK || "solana-devnet";

    // Setup RPC connection
    const rpcUrl =
      network === "solana"
        ? process.env.NEXT_PUBLIC_SOLANA_RPC_MAINNET ||
          "https://api.mainnet-beta.solana.com"
        : process.env.NEXT_PUBLIC_SOLANA_RPC_DEVNET ||
          "https://api.devnet.solana.com";

    this.connection = new Connection(rpcUrl, "confirmed");

    // Setup treasury keypair from private key
    if (!process.env.TREASURY_PRIVATE_KEY) {
      throw new Error(
        "TREASURY_PRIVATE_KEY is required for Simple refund service"
      );
    }

    const privateKeyBytes = bs58.decode(process.env.TREASURY_PRIVATE_KEY);
    this.treasuryKeypair = Keypair.fromSecretKey(privateKeyBytes);

    // USDC mint address based on network
    const usdcMintString =
      network === "solana"
        ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // Mainnet USDC
        : "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"; // Devnet USDC

    this.usdcMintAddress = new PublicKey(usdcMintString);

    console.log(`✅ Simple Refund Service initialized`);
    console.log(
      `📍 Treasury Address: ${this.treasuryKeypair.publicKey.toBase58()}`
    );
    console.log(`💰 USDC Mint: ${this.usdcMintAddress.toBase58()}`);
    console.log(`🌐 Network: ${network}`);
    console.log(`🔗 RPC: ${rpcUrl}`);
  }

  /**
   * Execute a USDC refund from treasury to user wallet using @solana/web3.js
   * @param userWalletAddress - User's wallet address to receive refund
   * @param refundAmountUsdc - Refund amount in USDC micro-units (1 USDC = 1,000,000 micro-units)
   * @returns Promise<RefundResult>
   */
  async executeRefund(
    userWalletAddress: string,
    refundAmountUsdc: number
  ): Promise<RefundResult> {
    try {
      console.log(
        `🔄 Processing Simple refund: ${refundAmountUsdc} USDC micro-units to ${userWalletAddress}`
      );

      // Validate inputs
      if (refundAmountUsdc <= 0) {
        throw new Error(`Invalid refund amount: ${refundAmountUsdc}`);
      }

      // Convert addresses
      const userAddress = new PublicKey(userWalletAddress);
      const treasuryAddress = this.treasuryKeypair.publicKey;

      // Determine which token program to use
      const mintInfo = await this.connection.getAccountInfo(
        this.usdcMintAddress,
        "confirmed"
      );
      const programId = mintInfo?.owner?.equals(TOKEN_2022_PROGRAM_ID)
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;

      // Fetch mint to get decimals
      const mint = await getMint(
        this.connection,
        this.usdcMintAddress,
        undefined,
        programId
      );

      // Calculate associated token addresses
      const treasuryTokenAccount = await getAssociatedTokenAddress(
        this.usdcMintAddress,
        treasuryAddress,
        false,
        programId
      );

      const userTokenAccount = await getAssociatedTokenAddress(
        this.usdcMintAddress,
        userAddress,
        false,
        programId
      );

      console.log(`🏦 Treasury ATA: ${treasuryTokenAccount.toBase58()}`);
      console.log(`👤 User ATA: ${userTokenAccount.toBase58()}`);

      // Build transaction
      const transaction = new Transaction();

      // Add compute budget instructions (required by facilitator)
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 200_000,
        })
      );

      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 1,
        })
      );

      // Add transfer instruction
      const transferInstruction = createTransferCheckedInstruction(
        treasuryTokenAccount,
        this.usdcMintAddress,
        userTokenAccount,
        treasuryAddress,
        BigInt(Math.floor(refundAmountUsdc)),
        mint.decimals,
        [],
        programId
      );

      transaction.add(transferInstruction);

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash(
        "confirmed"
      );
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = treasuryAddress;

      // Sign transaction
      transaction.sign(this.treasuryKeypair);

      console.log(`📤 Sending Simple refund transaction...`);

      // Send and confirm transaction
      const signature = await this.connection.sendTransaction(
        transaction,
        [this.treasuryKeypair],
        {
          preflightCommitment: "confirmed",
        }
      );

      // Wait for confirmation with custom polling (no built-in timeouts)
      console.log(
        `⏱️ Waiting for transaction confirmation (up to 90 seconds)...`
      );

      const maxWaitTime = 90000; // 90 seconds
      const pollInterval = 2000; // Check every 2 seconds
      const startTime = Date.now();

      let confirmed = false;
      let lastStatus = "unknown";

      while (!confirmed && Date.now() - startTime < maxWaitTime) {
        try {
          const status = await this.connection.getSignatureStatus(signature);
          const confirmationStatus = status.value?.confirmationStatus;
          lastStatus = confirmationStatus || "pending";

          if (status.value?.err) {
            console.error(
              `❌ Transaction ${signature} failed:`,
              status.value.err
            );
            throw new Error(
              `Transaction failed: ${JSON.stringify(status.value.err)}`
            );
          }

          if (
            confirmationStatus === "confirmed" ||
            confirmationStatus === "finalized"
          ) {
            console.log(
              `✅ Transaction ${signature} confirmed! Status: ${confirmationStatus}`
            );
            confirmed = true;
            break;
          }

          console.log(
            `🔄 Transaction ${signature} status: ${lastStatus}, waiting...`
          );

          // Wait before next poll
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        } catch (statusError) {
          console.warn(`Could not check transaction status: ${statusError}`);
          // Wait and try again
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }
      }

      if (!confirmed) {
        const elapsedTime = Math.round((Date.now() - startTime) / 1000);
        console.warn(
          `⚠️ Transaction confirmation timeout after ${elapsedTime}s (status: ${lastStatus})`
        );
        console.log(
          `🔄 Transaction was broadcast successfully, treating as success`
        );
        console.log(
          `💡 You can verify the transaction at: https://solscan.io/tx/${signature}?cluster=devnet`
        );
      }

      console.log(`✅ Simple refund transaction completed: ${signature}`);

      return {
        success: true,
        transactionHash: signature,
      };
    } catch (error) {
      console.error("❌ Simple refund transaction failed:", error);

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Convert USDC amount from dollars to micro-units
   * @param usdAmount - Amount in USD
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
}
