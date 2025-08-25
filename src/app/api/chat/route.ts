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
    const response = await fetch(`${PAYMENT_CONFIG.facilitatorUrl}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payment': paymentHeader,
      },
    });
    return response.ok;
  } catch (error) {
    console.error('Payment verification failed:', error);
    return false;
  }
}

// Helper function to create 402 response with payment requirements
function create402Response(): NextResponse {
  const paymentRequired = {
    scheme: 'exact',
    amount: PAYMENT_CONFIG.amount.toString(),
    currency: PAYMENT_CONFIG.currency,
    network: PAYMENT_CONFIG.network,
    facilitator: PAYMENT_CONFIG.facilitatorUrl,
    recipient: PAYMENT_CONFIG.recipientAddress,
    resource: {
      url: '/api/chat',
      description: PAYMENT_CONFIG.description,
      mimeType: 'application/json',
    },
  };

  return NextResponse.json(
    { error: 'Payment required' },
    {
      status: 402,
      headers: {
        'X-Payment-Required': JSON.stringify(paymentRequired),
      },
    }
  );
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
