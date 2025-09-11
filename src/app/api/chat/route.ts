import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// x402 Payment configuration with fixed upfront amount
const PAYMENT_CONFIG = {
  amount: 12500000, // 0.0125 SOL in lamports (~$2.50 at $200/SOL) - covers most expensive requests
  currency: "SOL",
  network: "solana-devnet",
  facilitatorUrl: "https://facilitator.payai.network",
  recipientAddress: process.env.TREASURY_WALLET_ADDRESS || "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4",
  description: "AI Chat Request - GPThree Assistant (Pay-per-use with refund)",
};

// Fee structure constants
const SERVICE_FEE_PCT = 0.20; // 20% service fee
const MIN_FEE_USD = 0.002; // $0.002 minimum fee
const SOL_PRICE_USD = 200; // Approximate SOL price (could be made dynamic)
const LAMPORTS_PER_SOL = 1_000_000_000;

// Calculate refund amount based on actual usage
function calculateRefund(actualCostCredits: number, paidLamports: number): number {
  // Convert OpenRouter credits to USD (1 credit = $1)
  const actualCostUSD = actualCostCredits;
  
  // Apply our service fee
  const serviceFee = Math.max(actualCostUSD * SERVICE_FEE_PCT, MIN_FEE_USD);
  const totalOwedUSD = actualCostUSD + serviceFee;
  
  // Convert amounts to SOL
  const paidSOL = paidLamports / LAMPORTS_PER_SOL;
  const paidUSD = paidSOL * SOL_PRICE_USD;
  
  // Calculate refund
  const refundUSD = Math.max(0, paidUSD - totalOwedUSD);
  const refundSOL = refundUSD / SOL_PRICE_USD;
  const refundLamports = Math.floor(refundSOL * LAMPORTS_PER_SOL);
  
  console.log(`Refund calculation:`);
  console.log(`- Actual cost: $${actualCostUSD.toFixed(6)}`);
  console.log(`- Service fee: $${serviceFee.toFixed(6)}`);
  console.log(`- Total owed: $${totalOwedUSD.toFixed(6)}`);
  console.log(`- Paid: $${paidUSD.toFixed(6)}`);
  console.log(`- Refund: $${refundUSD.toFixed(6)} (${refundLamports} lamports)`);
  
  return refundLamports;
}

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
  asset: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // Use native SOL instead of wrapped SOL for simplicity
  outputSchema: {},
  extra: {
    feePayer, // Dynamic fee payer from facilitator
  },
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

    console.log("preparing payload to send to facilitator")
    const verifyPayload = {
      x402Version: paymentPayload.x402Version,
      paymentPayload: paymentPayload,
      paymentRequirements,
    }
    console.log("verifyPayload", verifyPayload)
    console.log("Sending verify payload to facilitator verify endpoint");
    console.log("Full payload being sent to facilitator:", JSON.stringify(verifyPayload, null, 2));
    
    // Log the exact JSON string being sent
    const payloadString = JSON.stringify(verifyPayload);

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

// Helper function to settle payment with facilitator
async function settlePayment(paymentHeader: string): Promise<boolean> {
  try {
    console.log("Settling payment with facilitator...");
    console.log("Payment header:", paymentHeader.substring(0, 100) + "...");

    // Decode the base64 payment payload
    const paymentPayload = JSON.parse(
      Buffer.from(paymentHeader, "base64").toString("utf8")
    );
    console.log(
      "Decoded payment payload:",
      JSON.stringify(paymentPayload, null, 2)
    );

    console.log("preparing payload to send to facilitator")
    const settlePayload = {
      x402Version: paymentPayload.x402Version,
      paymentPayload: paymentPayload,
      paymentRequirements,
    }
    console.log("settlePayload", settlePayload)
    console.log("Sending settle payload to facilitator settle endpoint");
    console.log("Full payload being sent to facilitator:", JSON.stringify(settlePayload, null, 2));
    
    // Log the exact JSON string being sent
    const payloadString = JSON.stringify(settlePayload);

    const response = await fetch(`${PAYMENT_CONFIG.facilitatorUrl}/settle`, {
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
      console.log("Payment settlement failed!");
      console.log("Request URL:", `${PAYMENT_CONFIG.facilitatorUrl}/settle`);
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

    console.log("Payment header:", paymentHeader);

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

  // settle payment with facilitator
  const paymentSettled = await settlePayment(paymentHeader);
  if (!paymentSettled) {
    return NextResponse.json({ error: "Payment settlement failed" }, { status: 402 });
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
