import { useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Connection, PublicKey } from '@solana/web3.js';

export function usePaidRequest() {
  const { user, authenticated } = usePrivy();
  const { wallets } = useWallets();

  const makePaymentRequest = useCallback(async (
    url: string, 
    options: RequestInit = {}
  ): Promise<Response> => {
    if (!authenticated || !user) {
      throw new Error('User must be authenticated to make paid requests');
    }

    // Find user's Solana wallet
    const solanaWallet = wallets.find(wallet => 
      wallet.walletClientType === 'phantom' ||
      wallet.walletClientType === 'solflare' ||
      wallet.walletClientType === 'backpack'
    );
    
    if (!solanaWallet) {
      throw new Error('No Solana wallet found. Please connect a Solana wallet.');
    }

    try {
      // First, make a request without payment to get the 402 response
      const initialResponse = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      // If not 402, return the response
      if (initialResponse.status !== 402) {
        return initialResponse;
      }

      // Parse payment requirements from 402 response
      const paymentRequiredHeader = initialResponse.headers.get('X-Payment-Required');
      if (!paymentRequiredHeader) {
        throw new Error('Payment required but no payment requirements provided');
      }

      const paymentRequirements = JSON.parse(paymentRequiredHeader);
      
      // Create payment using Privy's Solana wallet
      const paymentHeader = await createSolanaPayment(solanaWallet, paymentRequirements);
      
      // Retry the request with payment
      return await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-Payment': paymentHeader,
          ...options.headers,
        },
      });
    } catch (error) {
      console.error('Payment request failed:', error);
      throw error;
    }
  }, [authenticated, user, wallets]);

  return { makePaymentRequest };
}

// Create x402 payment using Privy's Solana wallet
async function createSolanaPayment(wallet: any, paymentRequirements: any): Promise<string> {
  try {
    // Get wallet address
    const walletAddress = wallet.address;
    
    // Create payment message to sign
    const paymentMessage = {
      scheme: paymentRequirements.scheme,
      amount: paymentRequirements.amount,
      currency: paymentRequirements.currency,
      network: paymentRequirements.network,
      recipient: paymentRequirements.recipient,
      sender: walletAddress,
      resource: paymentRequirements.resource,
      timestamp: Date.now(),
    };
    
    // Convert to string for signing
    const messageString = JSON.stringify(paymentMessage);
    const messageBytes = new TextEncoder().encode(messageString);
    
    // Sign the payment message using Privy's signMessage method
    const signature = await wallet.signMessage(messageBytes);
    
    // Create the x402 payment header
    const payment = {
      ...paymentMessage,
      signature: signature.signature || signature, // Handle different signature formats
      publicKey: walletAddress,
    };
    
    // Return base64 encoded payment header
    return btoa(JSON.stringify(payment));
  } catch (error) {
    console.error('Failed to create Solana payment:', error);
    throw new Error(`Failed to create payment: ${error}`);
  }
}
