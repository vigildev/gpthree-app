import { useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';
import { Connection, PublicKey } from '@solana/web3.js';

export function usePaidRequest() {
  const { user, authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();

  const makePaymentRequest = useCallback(async (
    url: string, 
    options: RequestInit = {}
  ): Promise<Response> => {
    if (!authenticated || !user) {
      throw new Error('User must be authenticated to make paid requests');
    }

    // Debug: Log available wallets
    console.log('Available wallets:', wallets);
    console.log('Wallet details:', wallets.map(w => ({ 
      type: w.walletClientType, 
      address: w.address,
      meta: w.meta 
    })));

    // Find user's Solana wallet - check for embedded Solana wallets too
    const solanaWallet = wallets.find(wallet => 
      wallet.walletClientType === 'phantom' ||
      wallet.walletClientType === 'solflare' ||
      wallet.walletClientType === 'backpack' ||
      wallet.walletClientType === 'privy' || // Privy embedded wallet
      (wallet.meta && wallet.meta.name && wallet.meta.name.toLowerCase().includes('solana')) ||
      (wallet.address && wallet.address.length > 30) // Solana addresses are typically 32-44 chars
    );
    
    console.log('Found Solana wallet:', solanaWallet);
    
    if (!solanaWallet) {
      console.error('No Solana wallet found. Available wallets:', wallets);
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

      // Parse payment requirements from 402 response body (as per x402 spec)
      const responseBody = await initialResponse.json();
      console.log('402 Response body:', responseBody);
      
      if (!responseBody.accepts || !responseBody.accepts.length) {
        throw new Error('Payment required but no payment requirements provided');
      }

      // Use the first payment requirement from the accepts array
      const paymentRequirements = responseBody.accepts[0];
      console.log('Selected payment requirements:', paymentRequirements);
      
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
async function createSolanaPayment(
  wallet: any,
  paymentRequirements: any
): Promise<string> {
  try {
    // Get wallet address
    const walletAddress = wallet.address;
    
    console.log('Payment requirements received:', paymentRequirements);
    console.log('Wallet address:', walletAddress);
    
    // Create the message to sign based on x402 Solana scheme
    // This should match what the facilitator expects for Solana payments
    const messageToSign = {
      scheme: paymentRequirements.scheme,
      network: paymentRequirements.network, 
      payTo: paymentRequirements.payTo || paymentRequirements.recipient,
      maxAmountRequired: paymentRequirements.maxAmountRequired,
      resource: paymentRequirements.resource,
      sender: walletAddress,
      timestamp: Date.now(),
    };
    
    const messageString = JSON.stringify(messageToSign);
    console.log('Message to sign:', messageToSign);
    console.log('Message string:', messageString);
    
    // Sign the message using the Solana wallet adapter interface on the connected wallet
    // For Solana wallets, signMessage expects a Uint8Array and returns a Uint8Array
    const messageBytes = new TextEncoder().encode(messageString);

    if (typeof wallet.signMessage !== 'function') {
      throw new Error('Connected Solana wallet does not support message signing');
    }

    const signatureUint8Array = await wallet.signMessage(messageBytes);
    
    console.log('Signature received (Uint8Array):', signatureUint8Array);
    
    // Convert signature to base58 format (standard for Solana)
    const bs58 = (await import('bs58')).default;
    const signature = bs58.encode(signatureUint8Array);
    console.log('Signature (base58):', signature);
    
    // Create x402 payment payload structure
    const paymentPayload = {
      x402Version: 1,
      scheme: paymentRequirements.scheme || 'exact',
      network: paymentRequirements.network,
      payload: {
        sender: walletAddress,
        signature: signature,
        message: messageToSign,
      }
    };
    
    console.log('Payment payload:', paymentPayload);
    
    // Return base64 encoded payment header (as per x402 spec)
    const paymentHeader = btoa(JSON.stringify(paymentPayload));
    console.log('Payment header (base64):', paymentHeader);
    
    return paymentHeader;
  } catch (error) {
    console.error('Failed to create Solana payment:', error);
    throw new Error(`Failed to create payment: ${error}`);
  }
}
