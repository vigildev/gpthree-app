import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import {
  Connection,
  VersionedTransaction,
  TransactionMessage,
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { PaymentRequirementsSchema } from "x402/types";
import bs58 from "bs58";

// Custom x402 payment interceptor based on the official PR implementation
function createCustomPaymentFetch(
  fetchFn: typeof fetch,
  solanaWallet: any,
  maxValue: bigint = BigInt(0.1 * 10 ** 6)
) {
  return async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
    // Make initial request
    const response = await fetchFn(input, init);

    // If not 402, return as-is
    if (response.status !== 402) {
      return response;
    }

    // Parse payment requirements from 402 response
    const { x402Version, accepts } = (await response.json()) as {
      x402Version: number;
      accepts: unknown[];
    };
    
    console.log('402 Response - x402Version:', x402Version);
    console.log('402 Response - accepts:', accepts);
    
    const parsedPaymentRequirements = accepts.map(x => PaymentRequirementsSchema.parse(x));
    console.log('Parsed payment requirements:', parsedPaymentRequirements);

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

// Custom Solana payment header creation based on the PR implementation
async function createCustomSolanaPaymentHeader(
  solanaWallet: any,
  x402Version: number,
  paymentRequirements: any
): Promise<string> {
  const isMainnet = paymentRequirements.network === 'solana';
  const rpcEndpoint = isMainnet 
    ? 'https://api.mainnet-beta.solana.com' 
    : 'https://api.devnet.solana.com';
  
  const connection = new Connection(rpcEndpoint, 'confirmed');
  console.log(`Connected to Solana ${isMainnet ? 'mainnet' : 'devnet'}`);

  // Parse payment details
  const amountLamports = parseInt(paymentRequirements.maxAmountRequired);
  const recipientAddress = new PublicKey(paymentRequirements.payTo);
  const payerAddress = new PublicKey(solanaWallet.address);
  const feePayerAddress = new PublicKey(paymentRequirements.extra.feePayer);
  
  console.log('Payment details:');
  console.log(`- Amount: ${amountLamports} lamports (${amountLamports / LAMPORTS_PER_SOL} SOL)`);
  console.log(`- From: ${payerAddress.toString()}`);
  console.log(`- To: ${recipientAddress.toString()}`);
  console.log(`- Fee Payer: ${feePayerAddress.toString()}`);

  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash('finalized');
  console.log('Recent blockhash:', blockhash);

  // Create transaction instructions following the PR pattern
  const instructions = [];

  // 1. Set compute unit price (priority fee)
  instructions.push(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 1, // 1 microlamport priority fee like in PR
    })
  );

  // 2. Handle native SOL vs SPL token transfer
  const isNativeSOL = !paymentRequirements.asset || 
                     paymentRequirements.asset === 'native';
  
  if (isNativeSOL) {
    // Native SOL transfer
    console.log('Creating native SOL transfer instruction');
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: payerAddress,
        toPubkey: recipientAddress,
        lamports: amountLamports,
      })
    );
  } else {
    // SPL Token transfer (following PR pattern with ATA creation)
    const mintAddress = new PublicKey(paymentRequirements.asset);
    console.log('Creating SPL token transfer for mint:', mintAddress.toString());
    
    // Get token accounts
    const fromTokenAccount = await getAssociatedTokenAddress(
      mintAddress,
      payerAddress,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    const toTokenAccount = await getAssociatedTokenAddress(
      mintAddress,
      recipientAddress,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Check if recipient's ATA exists
    const toAccountInfo = await connection.getAccountInfo(toTokenAccount);
    if (!toAccountInfo) {
      console.log('Creating associated token account for recipient');
      instructions.push(
        createAssociatedTokenAccountInstruction(
          feePayerAddress, // Fee payer creates the account
          toTokenAccount,
          recipientAddress,
          mintAddress,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    // Add transfer instruction
    instructions.push(
      createTransferCheckedInstruction(
        fromTokenAccount,
        mintAddress,
        toTokenAccount,
        payerAddress,
        BigInt(amountLamports),
        0, // Would need to fetch decimals in production
        [],
        TOKEN_PROGRAM_ID
      )
    );
  }

  // Add compute unit limit after we know the instruction count
  const estimatedUnits = 300_000; // Conservative estimate
  instructions.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: estimatedUnits,
    })
  );

  // Create versioned transaction (following PR pattern)
  const messageV0 = new TransactionMessage({
    payerKey: feePayerAddress, // Facilitator pays fees
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);
  console.log('Created versioned transaction');

  // Sign transaction with user's wallet
  console.log('Signing transaction with user wallet...');
  const signedTransaction = await solanaWallet.signTransaction(transaction);
  console.log('Transaction signed successfully');

  // Serialize and encode
  const serializedTransaction = signedTransaction.serialize();
  const base64Transaction = Buffer.from(serializedTransaction).toString('base64');
  console.log('Transaction serialized and encoded to base64');
  
  // Create payment payload following x402 spec
  const paymentPayload = {
    x402Version,
    scheme: paymentRequirements.scheme,
    network: paymentRequirements.network,
    payload: {
      transaction: base64Transaction
    }
  };
  
  // Encode payment payload as base64 for X-PAYMENT header
  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
  console.log('Created payment header');
  
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
