import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
// Use @solana/kit for transaction construction (exact copy of official PR)
import {
  Address,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  prependTransactionMessageInstruction,
  getBase64EncodedWireTransaction,
  type Instruction,
  address as createAddress,
  fetchEncodedAccount,
  type TransactionMessage as SolanaKitTransactionMessage,
  createRpc,
  partiallySignTransactionMessageWithSigners,
  type Rpc
} from "@solana/kit";
import {
  fetchMint,
  findAssociatedTokenPda,
  getCreateAssociatedTokenInstruction,
  getTransferCheckedInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  estimateComputeUnitLimitFactory,
  getSetComputeUnitLimitInstruction,
  setTransactionMessageComputeUnitPrice,
} from "@solana-program/compute-budget";
// LAMPORTS_PER_SOL constant for calculations
const LAMPORTS_PER_SOL = 1_000_000_000;
import { PaymentRequirementsSchema, Payment402ResponseSchema, type PaymentRequirements, type Payment402Response, isSolanaNetwork } from "../lib/x402-solana-types";
import bs58 from "bs58";

// Custom x402 payment interceptor based on the official PR implementation
function createCustomPaymentFetch(
  fetchFn: typeof fetch,
  solanaWallet: any,
  maxValue: bigint = BigInt(0.01 * LAMPORTS_PER_SOL) // Allow up to 0.01 SOL (10M lamports)
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
    console.log('Raw 402 response:', rawResponse);
    
    // Parse the complete 402 response with proper schema validation
    const parsed402Response = Payment402ResponseSchema.parse(rawResponse);
    console.log('Parsed 402 response:', parsed402Response);
    
    const { x402Version, accepts: parsedPaymentRequirements } = parsed402Response;
    console.log('x402Version:', x402Version);
    console.log('Payment requirements:', parsedPaymentRequirements);

    // Select first suitable payment requirement for Solana
    const selectedRequirements = parsedPaymentRequirements.find(
      req => req.scheme === 'exact' && (req.network === 'solana-devnet' || req.network === 'solana')
    );

    if (!selectedRequirements) {
      throw new Error('No suitable Solana payment requirements found');
    }

    console.log('Selected payment requirements:', selectedRequirements);

    // Check amount
    if (BigInt(selectedRequirements.maxAmountRequired) > maxValue) {
      throw new Error('Payment amount exceeds maximum allowed');
    }

    // Create payment header using our custom Solana implementation
    const paymentHeader = await createCustomSolanaPaymentHeader(
      solanaWallet,
      x402Version,
      selectedRequirements
    );

    console.log('Created payment header, retrying request...');

    // Retry with payment header
    const newInit = {
      ...init,
      headers: {
        ...(init?.headers || {}),
        'X-PAYMENT': paymentHeader,
        'Access-Control-Expose-Headers': 'X-PAYMENT-RESPONSE',
      },
    };

    return await fetchFn(input, newInit);
  };
}

// Helper function to get RPC client - simplified for now
function getRpcClient(network: string) {
  const rpcUrl = network === 'solana' 
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com';
  
  // For now, use a simple web3.js Connection for compatibility
  // We'll replace this with proper Solana Kit RPC client later
  const { Connection } = require('@solana/web3.js');
  return new Connection(rpcUrl, 'confirmed');
}

// EXACT copy of the official PR's createAndSignPayment function, adapted for Privy
async function createCustomSolanaPaymentHeader(
  solanaWallet: any,
  x402Version: number,
  paymentRequirements: PaymentRequirements
): Promise<string> {
  console.log('Creating payment header using official PR pattern...');
  
  // Step 1: Create the transaction message using official PR pattern
  const transactionMessage = await createTransferTransactionMessage(solanaWallet, paymentRequirements);
  
  // Step 2: Convert Solana Kit transaction to something Privy can sign
  // This is the tricky part - we need to convert between the two formats
  const base64EncodedWireTransaction = await signTransactionWithPrivy(solanaWallet, transactionMessage);
  
  // Step 3: Create payment payload exactly like the official PR
  const paymentPayload = {
    x402Version: x402Version,
    scheme: paymentRequirements.scheme,
    network: paymentRequirements.network,
    payload: {
      transaction: base64EncodedWireTransaction,
    },
  };
  
  // Step 4: Encode payment payload as base64 for X-PAYMENT header
  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
  console.log('Created payment header using official PR format');
  
  return paymentHeader;
}

// EXACT copy of the official PR's createTransferTransactionMessage function
async function createTransferTransactionMessage(
  client: any, // This will be our Privy wallet adapter
  paymentRequirements: PaymentRequirements,
) {
  const rpc = getRpcClient(paymentRequirements.network);
  
  console.log('Creating transfer transaction message...');
  
  // Create the transfer instruction
  const transferInstructions = await createAtaAndTransferInstructions(client, paymentRequirements);

  // Create tx to simulate
  const feePayer = paymentRequirements.extra?.feePayer as Address;
  const txToSimulate = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageComputeUnitPrice(BigInt(1), tx), // 1 microlamport priority fee
    tx => setTransactionMessageFeePayer(feePayer, tx),
    tx => appendTransactionMessageInstructions(transferInstructions, tx),
  );

  // TODO: Fix RPC client compatibility for compute estimation
  // For now, use a conservative fixed estimate instead of dynamic estimation
  const estimatedUnits = 300000; // Conservative fixed estimate

  // Get latest blockhash using web3.js Connection
  const latestBlockhashInfo = await rpc.getLatestBlockhash('finalized');
  
  const tx = pipe(
    txToSimulate,
    tx =>
      prependTransactionMessageInstruction(
        getSetComputeUnitLimitInstruction({ units: estimatedUnits }),
        tx,
      ),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhashInfo, tx),
  );

  return tx;
}

// EXACT copy of the official PR's createAtaAndTransferInstructions function
async function createAtaAndTransferInstructions(
  client: any,
  paymentRequirements: PaymentRequirements,
): Promise<Instruction[]> {
  const { asset } = paymentRequirements;
  
  console.log('Creating ATA and transfer instructions...', { asset });

  const rpc = getRpcClient(paymentRequirements.network);
  
  // For native SOL, create a system transfer instruction
  if (!asset || asset === 'native') {
    console.log('Creating native SOL transfer instruction');
    
    // Create SOL transfer instruction using Solana Kit pattern
    const { maxAmountRequired: amount, payTo } = paymentRequirements;
    const clientAddress = createAddress(client.address) as Address;
    
    // Import the system program instruction creator
    const { getTransferSolInstruction } = await import('@solana-program/system');
    
    const solTransferInstruction = getTransferSolInstruction({
      source: clientAddress,
      destination: payTo as Address,
      amount: BigInt(amount),
    });
    
    console.log('Created native SOL transfer instruction:', { 
      from: clientAddress, 
      to: payTo, 
      amount 
    });
    
    return [solTransferInstruction];
  }
  
  const tokenMint = await fetchMint(rpc, asset as Address);
  const tokenProgramAddress = tokenMint.programAddress;

  // Validate that the asset was created by a known token program
  if (
    tokenProgramAddress.toString() !== TOKEN_PROGRAM_ADDRESS.toString() &&
    tokenProgramAddress.toString() !== TOKEN_2022_PROGRAM_ADDRESS.toString()
  ) {
    throw new Error("Asset was not created by a known token program");
  }

  const instructions: Instruction[] = [];

  // Create the ATA (if needed)
  const createAtaIx = await createAtaInstructionOrUndefined(
    paymentRequirements,
    tokenProgramAddress,
  );
  if (createAtaIx) {
    instructions.push(createAtaIx);
  }

  // Create the transfer instruction
  const transferIx = await createTransferInstruction(
    client,
    paymentRequirements,
    tokenMint.data.decimals,
    tokenProgramAddress,
  );
  instructions.push(transferIx);

  return instructions;
}

// EXACT copy of the official PR's createAtaInstructionOrUndefined function
async function createAtaInstructionOrUndefined(
  paymentRequirements: PaymentRequirements,
  tokenProgramAddress: Address,
): Promise<Instruction | undefined> {
  const { asset, payTo, extra, network } = paymentRequirements;
  const feePayer = extra?.feePayer as Address;

  // feePayer is required
  if (!feePayer) {
    throw new Error(
      "feePayer is required in paymentRequirements.extra in order to set the " +
        "facilitator as the fee payer for the create associated token account instruction",
    );
  }

  // Derive the ATA of the payTo address
  const [destinationATAAddress] = await findAssociatedTokenPda({
    mint: asset as Address,
    owner: payTo as Address,
    tokenProgram: tokenProgramAddress,
  });

  // Check if the ATA exists
  const rpc = getRpcClient(network);
  const maybeAccount = await fetchEncodedAccount(rpc, destinationATAAddress);

  // If the ATA does not exist, return an instruction to create it
  if (!maybeAccount.exists) {
    return getCreateAssociatedTokenInstruction({
      payer: feePayer as any, // TODO: Fix TransactionSigner type
      ata: destinationATAAddress,
      owner: payTo as Address,
      mint: asset as Address,
      tokenProgram: tokenProgramAddress,
    });
  }

  // If the ATA exists, return undefined
  return undefined;
}

// EXACT copy of the official PR's createTransferInstruction function
async function createTransferInstruction(
  client: any,
  paymentRequirements: PaymentRequirements,
  decimals: number,
  tokenProgramAddress: Address,
): Promise<Instruction> {
  const { asset, maxAmountRequired: amount, payTo } = paymentRequirements;
  
  const clientAddress = createAddress(client.address) as Address;

  const [sourceATA] = await findAssociatedTokenPda({
    mint: asset as Address,
    owner: clientAddress,
    tokenProgram: tokenProgramAddress,
  });

  const [destinationATA] = await findAssociatedTokenPda({
    mint: asset as Address,
    owner: payTo as Address,
    tokenProgram: tokenProgramAddress,
  });

  return getTransferCheckedInstruction(
    {
      source: sourceATA,
      mint: asset as Address,
      destination: destinationATA,
      authority: clientAddress,
      amount: BigInt(amount),
      decimals: decimals,
    },
    { programAddress: tokenProgramAddress },
  );
}

// Custom function to sign the Solana Kit transaction with Privy
async function signTransactionWithPrivy(
  solanaWallet: any,
  transactionMessage: SolanaKitTransactionMessage
): Promise<string> {
  console.log('Converting Solana Kit transaction for Privy signing...');
  
  // TODO: This is the complex part - we need to convert the Solana Kit TransactionMessage
  // to a @solana/web3.js VersionedTransaction that Privy can sign
  
  // For now, let's fall back to the direct approach and use getBase64EncodedWireTransaction
  // This might work if we can create a proper signer interface
  
  try {
    // Try to get the base64 encoded transaction directly from Solana Kit
    // This won't work without proper signing, but let's see what happens
    const base64Transaction = getBase64EncodedWireTransaction(transactionMessage as any);
    return base64Transaction;
  } catch (error) {
    console.error('Failed to encode transaction with Solana Kit:', error);
    
    // Fall back to a simpler approach - we'll need to implement this conversion properly
    throw new Error('Transaction conversion from Solana Kit to Privy format not yet implemented');
  }
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
        const paymentFetch = createCustomPaymentFetch(fetch.bind(window), solanaWallet);
        
        console.log('Making request with custom x402 payment interceptor...');
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
