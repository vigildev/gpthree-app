import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { type PaymentRequirements } from "../lib/x402-solana-types";
import { env } from "@/env.mjs";
import {
  PublicKey,
  Connection,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  ComputeBudgetProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferCheckedInstruction,
  getMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

// Custom x402 payment interceptor based on the official PR implementation
function createCustomPaymentFetch(
  fetchFn: typeof fetch,
  solanaWallet: { signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>; address: string },
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

    // Parse the complete 402 response with proper schema validation

    const x402Version: number = rawResponse.x402Version as number;
    const parsedPaymentRequirements: PaymentRequirements[] =
      (rawResponse.accepts as PaymentRequirements[]) || [];

    // Select first suitable payment requirement for Solana
    const selectedRequirements = parsedPaymentRequirements.find(
      (req: PaymentRequirements) =>
        req.scheme === "exact" &&
        (req.network === "solana-devnet" || req.network === "solana")
    );

    if (!selectedRequirements) {
      throw new Error("No suitable Solana payment requirements found");
    }

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


// Helper function to create payment header from transaction
function createPaymentHeaderFromTransaction(
  transaction: VersionedTransaction,
  paymentRequirements: PaymentRequirements,
  x402Version: number
): string {
  // Serialize the signed transaction for the facilitator

  // Serialize the transaction
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

  return paymentHeader;
}

// EXACT copy of the official PR's createAndSignPayment function, adapted for Privy
async function createCustomSolanaPaymentHeader(
  solanaWallet: { signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>; address: string },
  x402Version: number,
  paymentRequirements: PaymentRequirements
): Promise<string> {
  // Build sponsored transaction with fee payer = facilitator
  const isMainnet = paymentRequirements.network === "solana";

  // "https://api.mainnet-beta.solana.com"

  // Use custom RPC URLs from environment if available, fallback to public RPCs
  const rpcUrl = isMainnet
    ? env.NEXT_PUBLIC_SOLANA_RPC_MAINNET ||
      "https://api.mainnet-beta.solana.com"
    : env.NEXT_PUBLIC_SOLANA_RPC_DEVNET || "https://api.devnet.solana.com";

  const connection = new Connection(rpcUrl, "confirmed");

  const feePayer = (paymentRequirements as { extra?: { feePayer?: string } })?.extra?.feePayer;
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

  const instructions: TransactionInstruction[] = [];

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

  // Token amount calculation moved to usage point below

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
  if (!destAtaInfo) {
    // Instead of using @solana-program/token-2022 which forces TOKEN_2022_PROGRAM_ID,
    // create the instruction manually to match the detected program
    const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    );

    const createAtaInstruction = new TransactionInstruction({
      keys: [
        { pubkey: feePayerPubkey, isSigner: true, isWritable: true }, // payer
        { pubkey: destinationAta, isSigner: false, isWritable: true }, // ATA
        { pubkey: destination, isSigner: false, isWritable: false }, // owner
        { pubkey: mintPubkey, isSigner: false, isWritable: false }, // mint
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system program
        { pubkey: programId, isSigner: false, isWritable: false }, // use DETECTED program (not forced TOKEN_2022)
      ],
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      data: Buffer.from([0]), // CreateATA discriminator
    });

    instructions.push(createAtaInstruction);
  }

  // 2d) TransferChecked (spl-token or token-2022)
  const amount = BigInt(paymentRequirements.maxAmountRequired);

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

  // Partially sign the transaction with the user's wallet
  if (typeof solanaWallet?.signTransaction !== "function") {
    throw new Error("Connected wallet does not support signTransaction");
  }

  // Sign the transaction with the wallet
  const userSignedTx = await solanaWallet.signTransaction(transaction);

  // The facilitator expects exactly the transaction structure we built
  // AND it expects ComputeBudget instructions in positions 0 and 1
  // The wallet signing process is correct - we just need to use the signed transaction as-is

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

      // Find user's Solana wallet (wallets are already filtered to Solana)
      const solanaWallet = wallets[0]; // Just use the first available Solana wallet

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
