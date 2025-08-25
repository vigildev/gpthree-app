import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// x402 Payment configuration
const PAYMENT_CONFIG = {
  amount: 1000000, // 0.001 SOL in lamports
  currency: 'SOL',
  network: 'solana-devnet',
  facilitatorUrl: 'https://facilitator.payai.network',
  recipientAddress: process.env.TREASURY_WALLET_ADDRESS!,
  description: 'AI Chat Request - GPThree Assistant',
};

// Helper function to verify payment with facilitator
async function verifyPayment(paymentHeader: string): Promise<boolean> {
  try {
    console.log('Verifying payment with facilitator...');
    console.log('Payment header:', paymentHeader.substring(0, 100) + '...');
    
    const response = await fetch(`${PAYMENT_CONFIG.facilitatorUrl}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payment': paymentHeader,
      },
    });
    
    console.log('Facilitator response status:', response.status);
    const responseText = await response.text();
    console.log('Facilitator response body:', responseText);
    
    return response.ok;
  } catch (error) {
    console.error('Payment verification failed:', error);
    return false;
  }
}

// Helper function to create 402 response with payment requirements
function create402Response(): NextResponse {
  const paymentRequirements = {
    scheme: 'exact',
    network: PAYMENT_CONFIG.network,
    maxAmountRequired: PAYMENT_CONFIG.amount.toString(),
    resource: 'http://localhost:3000/api/chat', // Full URL as per spec
    description: PAYMENT_CONFIG.description,
    mimeType: 'application/json',
    payTo: PAYMENT_CONFIG.recipientAddress,
    maxTimeoutSeconds: 300,
    asset: 'So11111111111111111111111111111111111111112', // SOL mint address for devnet
    outputSchema: null,
    extra: {
      feePayer: PAYMENT_CONFIG.recipientAddress, // Using recipient as fee payer for now
    },
  };

  const responseBody = {
    x402Version: 1,
    accepts: [paymentRequirements],
    error: 'Payment required'
  };

  return NextResponse.json(responseBody, {
    status: 402,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Check for payment header
    const paymentHeader = request.headers.get('X-Payment');
    
    if (!paymentHeader) {
      // No payment provided, return 402 Payment Required
      return create402Response();
    }

    // Verify payment with facilitator
    const paymentValid = await verifyPayment(paymentHeader);
    if (!paymentValid) {
      return NextResponse.json({ error: 'Invalid payment' }, { status: 402 });
    }

    // Parse request body
    const body = await request.json();
    const { prompt, model, threadId, userId, systemEnhancement } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Call your existing Convex functions
    let result;
    if (threadId) {
      // Continue existing thread
      result = await convex.action(api.agents.continueThread, {
        prompt,
        threadId,
        model: model || 'anthropic/claude-3.5-sonnet',
        systemEnhancement,
      });
    } else {
      // Create new thread
      result = await convex.action(api.agents.createThread, {
        prompt,
        model: model || 'anthropic/claude-3.5-sonnet',
        userId,
        systemEnhancement,
      });
    }

    // Return the AI response
    return NextResponse.json(result);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
