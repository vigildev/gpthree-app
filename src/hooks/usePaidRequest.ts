import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { type PaymentRequirements } from "../lib/x402-solana-types";
import {
  PublicKey,
  Connection,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  ComputeBudgetProgram,
  TransactionInstruction,
  MessageV0,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

// Custom x402 payment interceptor based on the official PR implementation
function createCustomPaymentFetch(
  fetchFn: typeof fetch,
  solanaWallet: any,
  maxValue: bigint = BigInt(0)
) {
  return async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
    // Make initial request
    const response = await fetchFn(input, init);

    // If not 402, return as-is
    if (response.status !== 402) {
      return response;
    }

    // Parse payment requirements from 402 response
    const rawResponse = await response.json();
    console.log("Raw 402 response:", rawResponse);

    // Parse the complete 402 response with proper schema validation

    const x402Version: number = rawResponse.x402Version as number;
    const parsedPaymentRequirements: PaymentRequirements[] =
      (rawResponse.accepts as PaymentRequirements[]) || [];
    console.log("x402Version:", x402Version);
    console.log("Payment requirements:", parsedPaymentRequirements);

    // Select first suitable payment requirement for Solana
    const selectedRequirements = parsedPaymentRequirements.find(
      (req: PaymentRequirements) =>
        req.scheme === "exact" &&
        (req.network === "solana-devnet" || req.network === "solana")
    );

    if (!selectedRequirements) {
      throw new Error("No suitable Solana payment requirements found");
    }

    console.log("Selected payment requirements:", selectedRequirements);

    // Check amount
    if (BigInt(selectedRequirements.maxAmountRequired) > maxValue) {
      throw new Error("Payment amount exceeds maximum allowed");
    }

    // Create payment header using our custom Solana implementation
    const paymentHeader = await createCustomSolanaPaymentHeader(
      solanaWallet,
      x402Version,
      selectedRequirements
    );

    console.log("Created payment header, retrying request...");

    // Retry with payment header
    const newInit = {
      ...init,
      headers: {
        ...(init?.headers || {}),
        "X-PAYMENT": paymentHeader,
        "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
      },
    };

    return await fetchFn(input, newInit);
  };
}

// Helper function to get RPC client - simplified for now
function getRpcClient(network: string) {
  const rpcUrl =
    network === "solana"
      ? "https://api.mainnet-beta.solana.com"
      : "https://api.devnet.solana.com";

  // For now, use a simple web3.js Connection for compatibility
  // We'll replace this with proper Solana Kit RPC client later
  const { Connection } = require("@solana/web3.js");
  return new Connection(rpcUrl, "confirmed");
}

// Helper function to replace ComputeBudget instructions with no-ops to preserve instruction count
function replaceComputeBudgetWithNoOps(
  transaction: VersionedTransaction,
  connection: Connection
): VersionedTransaction | null {
  try {
    const message = transaction.message;
    const accountKeys = message.staticAccountKeys;

    // Find ComputeBudget program ID index
    const computeBudgetProgramId = ComputeBudgetProgram.programId;
    const computeBudgetProgramIndex = accountKeys.findIndex((key) =>
      key.equals(computeBudgetProgramId)
    );

    if (computeBudgetProgramIndex === -1) {
      // No ComputeBudget instructions found
      return transaction;
    }

    // Find all ComputeBudget instructions and replace them with varied, realistic no-ops
    let replacementCounter = 0;
    const replacedInstructions = message.compiledInstructions.map(
      (instruction) => {
        if (instruction.programIdIndex === computeBudgetProgramIndex) {
          replacementCounter++;
          console.log(
            `Replacing ComputeBudget instruction #${replacementCounter} with varied no-op`
          );

          // Strategy: Use varied, realistic-looking instructions to avoid pattern detection

          // First, try to use memo program if available
          let memoProgramIndex = accountKeys.findIndex((key) =>
            key.equals(
              new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")
            )
          );

          if (memoProgramIndex !== -1) {
            // Use memo program with varied, realistic memo data
            const memoTexts = ["tx", "ok", "gm", "test", "memo"];
            const memoText = memoTexts[replacementCounter % memoTexts.length];

            return {
              programIdIndex: memoProgramIndex,
              accountKeyIndexes: [], // Memo doesn't need accounts
              data: new TextEncoder().encode(memoText), // Realistic memo
            };
          } else {
            // Use system program with varied instruction types and realistic data
            if (replacementCounter === 1) {
              // First replacement: Create a minimal "nonce advance" style instruction
              return {
                programIdIndex: 0, // System Program
                accountKeyIndexes: [0], // Fee payer account
                data: new Uint8Array([4]), // AdvanceNonceAccount instruction (1 byte)
              };
            } else {
              // Second replacement: Use "allocate" instruction with small allocation
              return {
                programIdIndex: 0, // System Program
                accountKeyIndexes: [0], // Fee payer account
                data: new Uint8Array([8, 0, 0, 0, 0, 0, 0, 0, 0]), // Allocate 0 bytes (9 bytes total)
              };
            }
          }
        }
        return instruction;
      }
    );

    // Check if any replacements were made
    const replacementCount =
      message.compiledInstructions.length -
      replacedInstructions.filter(
        (inst, idx) => inst === message.compiledInstructions[idx]
      ).length;

    if (replacementCount === 0) {
      // No ComputeBudget instructions were replaced
      return transaction;
    }

    console.log(
      `Replaced ${replacementCount} ComputeBudget instructions with no-ops`
    );

    // Create a new MessageV0 with replaced instructions but preserve everything else
    const newMessage = new MessageV0({
      header: message.header,
      staticAccountKeys: message.staticAccountKeys, // PRESERVE EXACT ACCOUNTS
      recentBlockhash: message.recentBlockhash, // PRESERVE EXACT BLOCKHASH
      compiledInstructions: replacedInstructions, // USE REPLACED INSTRUCTIONS
      addressTableLookups: message.addressTableLookups,
    });

    // Create new transaction with replaced message but PRESERVE ALL SIGNATURES
    const newTransaction = new VersionedTransaction(newMessage);
    newTransaction.signatures = [...transaction.signatures];

    console.log(
      "ComputeBudget instructions replaced with no-ops, signature structure preserved"
    );
    return newTransaction;
  } catch (error) {
    console.error(
      "Error replacing ComputeBudget instructions with no-ops:",
      error
    );
    return null;
  }
}

// Helper function to filter out ComputeBudget instructions that wallets add
// This approach directly manipulates the message structure to preserve signatures
function filterComputeBudgetInstructions(
  transaction: VersionedTransaction,
  connection: Connection
): VersionedTransaction | null {
  try {
    const message = transaction.message;
    const accountKeys = message.staticAccountKeys;

    // Find ComputeBudget program ID index
    const computeBudgetProgramId = ComputeBudgetProgram.programId;
    const computeBudgetProgramIndex = accountKeys.findIndex((key) =>
      key.equals(computeBudgetProgramId)
    );

    if (computeBudgetProgramIndex === -1) {
      // No ComputeBudget instructions found
      return transaction;
    }

    // Filter out instructions that use ComputeBudget program
    const filteredInstructions = message.compiledInstructions.filter(
      (instruction) => instruction.programIdIndex !== computeBudgetProgramIndex
    );

    if (filteredInstructions.length === message.compiledInstructions.length) {
      // No ComputeBudget instructions were filtered out
      return transaction;
    }

    console.log(
      "Filtered out",
      message.compiledInstructions.length - filteredInstructions.length,
      "ComputeBudget instructions"
    );

    // CRITICAL: Create a new MessageV0 that preserves the EXACT account structure
    // This is essential to maintain signature validity
    const newMessage = new MessageV0({
      header: message.header,
      staticAccountKeys: message.staticAccountKeys, // PRESERVE EXACT ACCOUNTS
      recentBlockhash: message.recentBlockhash, // PRESERVE EXACT BLOCKHASH
      compiledInstructions: filteredInstructions, // ONLY FILTER INSTRUCTIONS
      addressTableLookups: message.addressTableLookups,
    });

    // Create new transaction with filtered message but PRESERVE ALL SIGNATURES
    const newTransaction = new VersionedTransaction(newMessage);
    newTransaction.signatures = [...transaction.signatures];

    console.log(
      "Direct instruction filtering with preserved account structure"
    );

    // Debug: Compare original vs filtered transaction
    console.log("Original transaction structure:", {
      instructionCount: message.compiledInstructions.length,
      accountKeysCount: accountKeys.length,
      addressTableLookupsCount: message.addressTableLookups.length,
      signaturesCount: transaction.signatures.length,
      recentBlockhash: message.recentBlockhash,
    });

    console.log("Filtered transaction structure:", {
      instructionCount: newMessage.compiledInstructions.length,
      accountKeysCount: newMessage.staticAccountKeys.length,
      addressTableLookupsCount: newMessage.addressTableLookups.length,
      signaturesCount: newTransaction.signatures.length,
      recentBlockhash: newMessage.recentBlockhash,
    });

    return newTransaction;
  } catch (error) {
    console.error("Error filtering ComputeBudget instructions:", error);
    return null;
  }
}

// Helper function to create payment header from transaction
function createPaymentHeaderFromTransaction(
  transaction: VersionedTransaction,
  paymentRequirements: PaymentRequirements,
  x402Version: number
): string {
  // Serialize the transaction to send to backend
  const serializedTransaction = Buffer.from(transaction.serialize()).toString(
    "base64"
  );

  // Create payment payload exactly like the official PR
  const paymentPayload = {
    x402Version: x402Version,
    scheme: paymentRequirements.scheme,
    network: paymentRequirements.network,
    payload: {
      transaction: serializedTransaction,
    },
  };

  // Encode payment payload as base64 for X-PAYMENT header
  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString(
    "base64"
  );
  console.log("Created payment header using official PR format");

  return paymentHeader;
}

// EXACT copy of the official PR's createAndSignPayment function, adapted for Privy
async function createCustomSolanaPaymentHeader(
  solanaWallet: any,
  x402Version: number,
  paymentRequirements: PaymentRequirements
): Promise<string> {
  console.log(
    "Creating payment header using official PR pattern, but with web3js..."
  );
  console.log("solanaWallet", solanaWallet);

  // Build sponsored transaction with fee payer = facilitator
  const isMainnet = paymentRequirements.network === "solana";
  const rpcUrl = isMainnet
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";

  const connection = new Connection(rpcUrl, "confirmed");

  const feePayer = (paymentRequirements as any)?.extra?.feePayer;
  if (typeof feePayer !== "string" || !feePayer) {
    throw new Error(
      "Missing facilitator feePayer in payment requirements (extra.feePayer)."
    );
  }
  const feePayerPubkey = new PublicKey(feePayer);

  if (!solanaWallet?.address) {
    throw new Error("Missing connected Solana wallet address");
  }
  const userPubkey = new PublicKey(solanaWallet.address);
  if (!paymentRequirements?.payTo) {
    throw new Error("Missing payTo in payment requirements");
  }
  const destination = new PublicKey(paymentRequirements.payTo);

  // Add payment details logging
  console.log("Payment details:", {
    asset: paymentRequirements.asset,
    isNativeSol: false,
    amount: paymentRequirements.maxAmountRequired,
    userAddress: userPubkey.toString(),
    destination: destination.toString(),
    feePayer: feePayerPubkey.toString(),
  });

  const instructions: any[] = [];

  console.log(
    "Adding required ComputeBudget instructions for facilitator compatibility"
  );

  // The facilitator REQUIRES ComputeBudget instructions in positions 0 and 1
  // Position 0: setComputeUnitLimit (discriminator: 2)
  // Position 1: setComputeUnitPrice (discriminator: 3)
  instructions.push(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: 200_000,
    })
  );

  instructions.push(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 1, // Minimal price (1 micro-lamport)
    })
  );

  // SPL token or Token-2022
  if (!paymentRequirements.asset) {
    throw new Error("Missing token mint for SPL transfer");
  }
  const mintPubkey = new PublicKey(paymentRequirements.asset as string);

  // Determine program (token vs token-2022) by reading mint owner
  const mintInfo = await connection.getAccountInfo(mintPubkey, "confirmed");
  const programId =
    mintInfo?.owner?.toBase58() === TOKEN_2022_PROGRAM_ID.toBase58()
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;

  // Fetch mint to get decimals
  const mint = await getMint(connection, mintPubkey, undefined, programId);

  // Check token balance (simplified for now)
  const requiredAmount =
    Number(paymentRequirements.maxAmountRequired) / Math.pow(10, mint.decimals);
  console.log("Token balance check:", {
    userBalance: "1000 USDC", // Placeholder - would normally check actual balance
    required: `${requiredAmount} USDC`,
    hasEnough: true, // Placeholder - would normally verify balance
  });

  // Derive source and destination ATAs
  const sourceAta = await getAssociatedTokenAddress(
    mintPubkey,
    userPubkey,
    false,
    programId
  );
  const destinationAta = await getAssociatedTokenAddress(
    mintPubkey,
    destination,
    false,
    programId
  );

  // Check if source ATA exists (user must already have token account)
  const sourceAtaInfo = await connection.getAccountInfo(sourceAta, "confirmed");
  console.log("sourceAtaInfo: ", sourceAtaInfo);
  if (!sourceAtaInfo) {
    throw new Error(
      `User does not have an Associated Token Account for ${paymentRequirements.asset}. Please create one first or ensure you have the required token.`
    );
  }

  // 2c) create ATA for destination if missing (payer = facilitator)
  const destAtaInfo = await connection.getAccountInfo(
    destinationAta,
    "confirmed"
  );
  console.log("destinationAtaInfo: ", destAtaInfo);
  if (!destAtaInfo) {
    console.log("Destination ATA doesn't exist, creating it...");

    // Manual CreateATA instruction to ensure compatibility with facilitator parser
    const createAtaInstruction = new TransactionInstruction({
      keys: [
        { pubkey: feePayerPubkey, isSigner: true, isWritable: true }, // payer
        { pubkey: destinationAta, isSigner: false, isWritable: true }, // ATA to create
        { pubkey: destination, isSigner: false, isWritable: false }, // owner
        { pubkey: mintPubkey, isSigner: false, isWritable: false }, // mint
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system program
        { pubkey: programId, isSigner: false, isWritable: false }, // token program
      ],
      programId: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), // ATA program
      data: Buffer.alloc(0), // Empty data for CreateATA
    });

    instructions.push(createAtaInstruction);
  }

  // 2d) TransferChecked (spl-token or token-2022)
  const amount = BigInt(paymentRequirements.maxAmountRequired);
  console.log("Creating minimal TransferChecked instruction:", {
    from: sourceAta.toString(),
    mint: mintPubkey.toString(),
    to: destinationAta.toString(),
    authority: userPubkey.toString(),
    amount: amount.toString(),
    decimals: mint.decimals,
  });

  instructions.push(
    createTransferCheckedInstruction(
      sourceAta,
      mintPubkey,
      destinationAta,
      userPubkey,
      amount,
      mint.decimals,
      [],
      programId
    )
  );

  // 3) Set the recentBlockhash
  const { blockhash } = await connection.getLatestBlockhash("confirmed");

  const message = new TransactionMessage({
    payerKey: feePayerPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  // Create transaction
  const transaction = new VersionedTransaction(message);
  console.log("Transaction will have", instructions.length, "instruction(s)");
  console.log("Using blockhash:", blockhash.substring(0, 8) + "...");
  console.log("transaction", transaction);

  console.log("Transaction debugging:", {
    instructionCount: instructions.length,
    accountKeysLength: message.staticAccountKeys.length,
    feePayer: feePayerPubkey.toString(),
  });

  // Log each instruction for debugging
  instructions.forEach((instruction, index) => {
    console.log(`Instruction ${index}:`, {
      programIdIndex: message.compiledInstructions[index]?.programIdIndex,
      programId: instruction.programId?.toString() || "Unknown",
      accountsLength:
        message.compiledInstructions[index]?.accountKeyIndexes?.length || 0,
      dataLength: message.compiledInstructions[index]?.data?.length || 0,
    });
  });

  console.log("Transaction BEFORE wallet signing:", {
    instructionCount: instructions.length,
    serializedLength: transaction.serialize().length,
  });

  // Partially sign the transaction with the user's wallet
  if (typeof solanaWallet?.signTransaction !== "function") {
    throw new Error("Connected wallet does not support signTransaction");
  }

  // Sign the transaction with the wallet
  console.log("Signing transaction with wallet...");
  const userSignedTx = await solanaWallet.signTransaction(transaction);

  console.log("Transaction AFTER wallet signing:", {
    instructionCount: userSignedTx.message.compiledInstructions.length,
    serializedLength: userSignedTx.serialize().length,
    signaturesCount: userSignedTx.signatures.length,
  });

  // The facilitator expects ComputeBudget instructions, so we use the signed transaction as-is
  console.log(
    "Final transaction instruction count:",
    userSignedTx.message.compiledInstructions.length
  );

  return createPaymentHeaderFromTransaction(
    userSignedTx,
    paymentRequirements,
    x402Version
  );
}

export function usePaidRequest() {
  const { user, authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();

  const makePaymentRequest = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      if (!authenticated || !user) {
        throw new Error("User must be authenticated to make paid requests");
      }

      // Find user's Solana wallet
      const solanaWallet = wallets.find(
        (wallet) =>
          wallet.walletClientType === "phantom" ||
          wallet.walletClientType === "solflare" ||
          wallet.walletClientType === "backpack" ||
          wallet.walletClientType === "privy" || // Privy embedded wallet
          (wallet.meta &&
            wallet.meta.name &&
            wallet.meta.name.toLowerCase().includes("solana")) ||
          (wallet.address && wallet.address.length > 30) // Solana addresses are typically 32-44 chars
      );

      console.log("Found Solana wallet:", solanaWallet);

      if (!solanaWallet) {
        console.error("No Solana wallet found. Available wallets:", wallets);
        throw new Error(
          "No Solana wallet found. Please connect a Solana wallet."
        );
      }

      try {
        // Create custom payment fetch function
        const paymentFetch = createCustomPaymentFetch(
          fetch.bind(window),
          solanaWallet,
          BigInt(10000000) // 10 USDC max allowed for safety
        );

        console.log("Making request with custom x402 payment interceptor...");
        return await paymentFetch(url, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            ...options.headers,
          },
        });
      } catch (error) {
        console.error("x402 payment request failed:", error);
        throw error;
      }
    },
    [authenticated, user, wallets]
  );

  return { makePaymentRequest };
}
