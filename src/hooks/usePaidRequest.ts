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

// Facilitator configuration from your external context
const FACILITATOR_FEE_PAYER = "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4";

export function usePaidRequest() {
  const { user, authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();

  const makePaymentRequest = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      if (!authenticated || !user) {
        throw new Error("User must be authenticated to make paid requests");
      }

      // Debug: Log available wallets
      console.log("Available wallets:", wallets);
      console.log(
        "Wallet details:",
        wallets.map((w) => ({
          type: w.walletClientType,
          address: w.address,
          meta: w.meta,
        }))
      );

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
        // First, make a request without payment to get the 402 response
        const initialResponse = await fetch(url, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            ...options.headers,
          },
        });

        // If not 402, return the response
        if (initialResponse.status !== 402) {
          return initialResponse;
        }

        // Parse payment requirements from 402 response body (as per x402 spec)
        const responseBody = await initialResponse.json();
        console.log("402 Response body:", responseBody);

        if (!responseBody.accepts || !responseBody.accepts.length) {
          throw new Error(
            "Payment required but no payment requirements provided"
          );
        }

        // Use the first payment requirement from the accepts array
        const paymentRequirements = responseBody.accepts[0];
        console.log('Selected payment requirements:', paymentRequirements);
        console.log('Payment requirements scheme:', paymentRequirements.scheme);
        console.log('Payment requirements network:', paymentRequirements.network);
        console.log('Full payment requirements object:', JSON.stringify(paymentRequirements, null, 2));

        // Check if the payment scheme and network are supported
        if (paymentRequirements.scheme === "exact" && paymentRequirements.network.startsWith("solana")) {
          console.log("Creating Solana transaction for exact scheme payment");

          // Determine the correct RPC endpoint based on network
          const isMainnet = paymentRequirements.network === "solana";
          const rpcEndpoint = isMainnet 
            ? "https://api.mainnet-beta.solana.com" 
            : "https://api.devnet.solana.com";
          
          const connection = new Connection(rpcEndpoint, 'confirmed');
          console.log(`Connected to Solana ${isMainnet ? 'mainnet' : 'devnet'}`);

          // Parse payment details
          const amountLamports = parseInt(paymentRequirements.maxAmountRequired);
          const recipientAddress = new PublicKey(paymentRequirements.payTo);
          const payerAddress = new PublicKey(solanaWallet.address);
          const feePayerAddress = new PublicKey(FACILITATOR_FEE_PAYER);
          
          console.log(`Payment details:`);
          console.log(`- Amount: ${amountLamports} lamports (${amountLamports / LAMPORTS_PER_SOL} SOL)`);
          console.log(`- From: ${payerAddress.toString()}`);
          console.log(`- To: ${recipientAddress.toString()}`);
          console.log(`- Fee Payer: ${feePayerAddress.toString()}`);

          // Get recent blockhash
          const { blockhash } = await connection.getLatestBlockhash('finalized');
          console.log('Recent blockhash:', blockhash);

          // Create transaction instructions
          const instructions = [];

          // 1. Set compute unit limit (to ensure transaction doesn't fail)
          instructions.push(
            ComputeBudgetProgram.setComputeUnitLimit({
              units: 300_000, // Reasonable limit for token transfer
            })
          );

          // 2. Set compute unit price (priority fee)
          instructions.push(
            ComputeBudgetProgram.setComputeUnitPrice({
              microLamports: 1_000, // Small priority fee
            })
          );

          // 3. Check if this is a SOL transfer or SPL token transfer
          const isNativeSOL = !paymentRequirements.asset || 
                             paymentRequirements.asset === "So11111111111111111111111111111111111111112" || // Wrapped SOL
                             paymentRequirements.asset === "native";
          
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
            // SPL Token transfer
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

            // Check if recipient's associated token account exists
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
            // Note: For exact amounts, we need to know the token decimals
            // For simplicity, assuming amount is already in the smallest unit
            instructions.push(
              createTransferCheckedInstruction(
                fromTokenAccount,
                mintAddress,
                toTokenAccount,
                payerAddress,
                amountLamports, // Amount in smallest unit
                0, // Decimals - would need to fetch this from mint account in production
                [],
                TOKEN_PROGRAM_ID
              )
            );
          }

          // Create versioned transaction
          const messageV0 = new TransactionMessage({
            payerKey: feePayerAddress, // Facilitator pays fees
            recentBlockhash: blockhash,
            instructions,
          }).compileToV0Message();

          const transaction = new VersionedTransaction(messageV0);
          console.log('Created versioned transaction');

          // Sign the transaction with user's wallet
          console.log('Signing transaction with user wallet...');
          const signedTransaction = await solanaWallet.signTransaction(transaction);
          
          console.log('Transaction signed successfully');

          // Serialize and encode the transaction
          const serializedTransaction = signedTransaction.serialize();
          const base64Transaction = Buffer.from(serializedTransaction).toString('base64');
          console.log('Transaction serialized and encoded to base64');
          
          // Create the payment payload
          const paymentPayload = {
            x402Version: responseBody.x402Version || 1,
            scheme: paymentRequirements.scheme,
            network: paymentRequirements.network,
            payload: {
              transaction: base64Transaction
            }
          };
          
          // Encode the payment payload as base64 for the X-PAYMENT header
          const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
          console.log('Created transaction-based payment header');

          // Retry the request with payment
          console.log('Retrying request with transaction payment...');
          return await fetch(url, {
            ...options,
            headers: {
              "Content-Type": "application/json",
              "X-PAYMENT": paymentHeader,
              ...options.headers,
            },
          });
        } else {
          throw new Error(`Unsupported payment scheme: ${paymentRequirements.scheme} on network ${paymentRequirements.network}. This client only supports 'exact' scheme on Solana networks.`);
        }
      } catch (error) {
        console.error("x402 transaction payment request failed:", error);
        throw error;
      }
    },
[authenticated, user, wallets]
  );

  return { makePaymentRequest };
}
