import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import {
  type PaymentRequirements,
} from "../lib/x402-solana-types";
import {
  PublicKey,
  Connection,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  ComputeBudgetProgram,
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

// EXACT copy of the official PR's createAndSignPayment function, adapted for Privy
async function createCustomSolanaPaymentHeader(
  solanaWallet: any,
  x402Version: number,
  paymentRequirements: PaymentRequirements
): Promise<string> {
  console.log("Creating payment header using official PR pattern, but with web3js...");
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

  const instructions: any[] = [];

  // 2a) set compute limit
  instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }));
  // 2b) set compute price
  instructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }));


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

  // Derive source and destination ATAs
  const sourceAta = await getAssociatedTokenAddress(mintPubkey, userPubkey, false, programId);
  const destinationAta = await getAssociatedTokenAddress(mintPubkey, destination, false, programId);

  // 2c) create ATA for destination if missing (payer = facilitator)
  const destAtaInfo = await connection.getAccountInfo(destinationAta, "confirmed");
  if (!destAtaInfo) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        feePayerPubkey,
        destinationAta,
        destination,
        mintPubkey,
        programId
      )
    );
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
  console.log("transaction", transaction);

  // Partially sign the transaction with the user's wallet
  if (typeof solanaWallet?.signTransaction !== "function") {
    throw new Error("Connected wallet does not support signTransaction");
  }
  const userSignedTx = await solanaWallet.signTransaction(transaction);

  // Serialize the transaction to send to backend
  const serializedTransaction = Buffer.from(userSignedTx.serialize()).toString('base64');


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
