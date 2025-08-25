import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// x402 Payment configuration
const PAYMENT_CONFIG = {
  amount: 1000000, // 0.001 SOL in lamports
  currency: "SOL",
  network: "solana-devnet",
  facilitatorUrl: "https://facilitator.payai.network",
  recipientAddress: process.env.TREASURY_WALLET_ADDRESS!,
  description: "AI Chat Request - GPThree Assistant",
};

// Helper function to verify payment with facilitator
async function verifyPayment(paymentHeader: string): Promise<boolean> {
  try {
    console.log("Verifying payment with facilitator...");
    console.log("Payment header:", paymentHeader.substring(0, 100) + "...");

    // Decode the base64 payment payload
    const paymentPayload = JSON.parse(
      Buffer.from(paymentHeader, "base64").toString("utf8")
    );
    console.log(
      "Decoded payment payload:",
      JSON.stringify(paymentPayload, null, 2)
    );

    // According to the official x402 PR #283, send only the payment payload to /verify
    // The facilitator expects the payload structure:
    // {
    //   "x402Version": 1,
    //   "scheme": "exact",
    //   "network": "solana-devnet",
    //   "payload": {
    //     "transaction": "base64 encoded transaction"
    //   }
    // }

    console.log("Sending payment payload to facilitator verify endpoint");
    console.log("Full payload being sent to facilitator:", JSON.stringify(paymentPayload, null, 2));
    
    // Log the exact JSON string being sent
    const payloadString = JSON.stringify(paymentPayload);
    console.log("JSON string length:", payloadString.length);
    console.log("First 500 chars of JSON:", payloadString.substring(0, 500));

    const response = await fetch(`${PAYMENT_CONFIG.facilitatorUrl}/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: payloadString,
    });

    console.log("Facilitator response status:", response.status);
    const responseText = await response.text();
    console.log("Facilitator response body:", responseText);

    // If verification fails, log additional debugging info
    if (!response.ok) {
      console.log("Payment verification failed!");
      console.log("Request URL:", `${PAYMENT_CONFIG.facilitatorUrl}/verify`);
      console.log("Request payload structure:");
      console.log("- x402Version:", paymentPayload.x402Version);
      console.log("- scheme:", paymentPayload.scheme);
      console.log("- network:", paymentPayload.network);
      console.log(
        "- payload.transaction length:",
        paymentPayload.payload?.transaction?.length
      );
      console.log(
        "Response headers:",
        Object.fromEntries(response.headers.entries())
      );
    }

    return response.ok;
  } catch (error) {
    console.error("Payment verification failed:", error);
    return false;
  }
}

// Helper function to get fee payer from facilitator's /supported endpoint
async function getFeePayerFromFacilitator(): Promise<string> {
  try {
    const response = await fetch(`${PAYMENT_CONFIG.facilitatorUrl}/supported`);
    if (!response.ok) {
      throw new Error(`Facilitator /supported returned ${response.status}`);
    }

    const supportedData = await response.json();
    console.log(
      "Facilitator supported data:",
      JSON.stringify(supportedData, null, 2)
    );

    // Look for Solana devnet support and extract fee payer from kinds array
    const solanaSupport = supportedData.kinds?.find(
      (kind: any) =>
        kind.network === PAYMENT_CONFIG.network && kind.scheme === "exact"
    );

    if (solanaSupport && solanaSupport.extra && solanaSupport.extra.feePayer) {
      console.log(
        "Found fee payer from facilitator:",
        solanaSupport.extra.feePayer
      );
      return solanaSupport.extra.feePayer;
    }

    // Fallback to hardcoded fee payer if not found in /supported response
    return "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4";
  } catch (error) {
    console.error("Failed to fetch fee payer from facilitator:", error);
    // Fallback to hardcoded fee payer
    return "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4";
  }
}

// Helper function to create 402 response with payment requirements
async function create402Response(): Promise<NextResponse> {
  const feePayer = await getFeePayerFromFacilitator();

  const paymentRequirements = {
    scheme: "exact",
    network: PAYMENT_CONFIG.network,
    maxAmountRequired: PAYMENT_CONFIG.amount.toString(),
    resource: "http://localhost:3000/api/chat", // Full URL as per spec
    description: PAYMENT_CONFIG.description,
    mimeType: "application/json",
    payTo: PAYMENT_CONFIG.recipientAddress,
    maxTimeoutSeconds: 300,
    asset: "native", // Use native SOL instead of wrapped SOL for simplicity
    outputSchema: null,
    extra: {
      feePayer, // Dynamic fee payer from facilitator
    },
  };

  const responseBody = {
    x402Version: 1,
    accepts: [paymentRequirements],
    error: "Payment required",
  };

  return NextResponse.json(responseBody, {
    status: 402,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Check for payment header - x402 uses 'X-PAYMENT' (uppercase)
    const paymentHeader =
      request.headers.get("X-PAYMENT") || request.headers.get("x-payment");

    if (!paymentHeader) {
      // No payment provided, return 402 Payment Required
      return await create402Response();
    }

    // Verify payment with facilitator
    const paymentValid = await verifyPayment(paymentHeader);
    if (!paymentValid) {
      return NextResponse.json({ error: "Invalid payment" }, { status: 402 });
    }

    // Parse request body
    const body = await request.json();
    const { prompt, model, threadId, userId, systemEnhancement } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Call your existing Convex functions
    let result;
    if (threadId) {
      // Continue existing thread
      result = await convex.action(api.agents.continueThread, {
        prompt,
        threadId,
        model: model || "anthropic/claude-3.5-sonnet",
        systemEnhancement,
      });
    } else {
      // Create new thread
      result = await convex.action(api.agents.createThread, {
        prompt,
        model: model || "anthropic/claude-3.5-sonnet",
        userId,
        systemEnhancement,
      });
    }

    // Return the AI response
    return NextResponse.json(result);
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
