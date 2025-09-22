import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { RefundService } from "../../../lib/refund-service";

interface PaymentInfo {
  actualCost: number;
  refundAmount: number;
  transactionHash?: string;
}

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// x402 Payment configuration with fixed upfront amount
const PAYMENT_CONFIG = {
  amount: 2500000, // $2.5 USDC
  currency: "USDC",
  network: process.env.NETWORK,
  asset: process.env.ASSET,
  facilitatorUrl: "https://facilitator.payai.network",
  recipientAddress: process.env.TREASURY_WALLET_ADDRESS,
  description: "AI Chat Request - GPThree Assistant (Pay-per-use with refund)",
};

// Fee structure constants
const SERVICE_FEE_PCT = 0.2; // 20% service fee
const MIN_FEE_USD = 0.002; // $0.002 minimum fee

// Calculate refund amount based on actual OpenRouter usage
function calculateRefund(
  usageData: {
    cost?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null,
  paidUSD: number
): number {
  if (!usageData || typeof usageData.cost !== "number") {
    console.log("Invalid or missing usage data, no refund calculated");
    return 0;
  }

  // OpenRouter cost is in credits (1 credit = $1 USD)
  // convert to USDC by adding 6 zeros for the USDC decimals
  const actualCostUSD = usageData.cost * 1000000;

  // Apply our service fee (20% markup or minimum $0.002)
  const serviceFee = Math.max(actualCostUSD * SERVICE_FEE_PCT, MIN_FEE_USD);
  const totalOwedUSD = actualCostUSD + serviceFee;

  // Calculate refund
  const refundUSD = Math.max(0, paidUSD - totalOwedUSD);

  console.log(`Refund calculation:`);
  console.log(`- OpenRouter usage:`, {
    prompt_tokens: usageData.prompt_tokens,
    completion_tokens: usageData.completion_tokens,
    total_tokens: usageData.total_tokens,
    cost_credits: usageData.cost,
  });
  console.log(`- Actual cost: $${(actualCostUSD / 1000000).toFixed(6)}`);
  console.log(`- Service fee: $${(serviceFee / 1000000).toFixed(6)}`);
  console.log(`- Total owed: $${(totalOwedUSD / 1000000).toFixed(6)}`);
  console.log(`- Paid: $${(paidUSD / 1000000).toFixed(6)}`);
  console.log(`- Refund: $${(refundUSD / 1000000).toFixed(6)}`);

  return refundUSD;
}

// Payment requirements factory function
async function createPaymentRequirements() {
  const feePayer = await getFeePayerFromFacilitator();

  return {
    scheme: "exact",
    network: PAYMENT_CONFIG.network,
    maxAmountRequired: PAYMENT_CONFIG.amount.toString(),
    resource: `${process.env.NEXT_PUBLIC_BASE_URL}/api/chat`, // Full URL as per spec
    description: PAYMENT_CONFIG.description,
    mimeType: "application/json",
    payTo: PAYMENT_CONFIG.recipientAddress,
    maxTimeoutSeconds: 300,
    asset: PAYMENT_CONFIG.asset, // Use USDC based on network
    outputSchema: {},
    extra: {
      feePayer, // Dynamic fee payer from facilitator
    },
  };
}

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

    console.log("preparing payload to send to facilitator");
    const paymentRequirements = await createPaymentRequirements();
    const verifyPayload = {
      x402Version: paymentPayload.x402Version,
      paymentPayload: paymentPayload,
      paymentRequirements,
    };
    console.log("verifyPayload", verifyPayload);
    console.log("Sending verify payload to facilitator verify endpoint");
    console.log(
      "Full payload being sent to facilitator:",
      JSON.stringify(verifyPayload, null, 2)
    );

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
    console.log("Facilitator response body: ", responseText);

    // Parse the JSON response to check isValid field
    let facilitatorResponse;
    try {
      facilitatorResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse facilitator response: ", parseError);
      return false;
    }

    // Check both HTTP status and isValid field
    const isValid = response.ok && facilitatorResponse.isValid === true;

    // If verification fails, log additional debugging info
    if (!isValid) {
      console.log("Payment verification failed!");
      console.log("HTTP Status OK:", response.ok);
      console.log("Facilitator isValid:", facilitatorResponse.isValid);
      console.log("Invalid reason:", facilitatorResponse.invalidReason);
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

    return isValid;
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

    console.log("preparing payload to send to facilitator");
    const paymentRequirements = await createPaymentRequirements();
    const settlePayload = {
      x402Version: paymentPayload.x402Version,
      paymentPayload: paymentPayload,
      paymentRequirements,
    };
    console.log("settlePayload", settlePayload);
    console.log("Sending settle payload to facilitator settle endpoint");
    console.log(
      "Full payload being sent to facilitator:",
      JSON.stringify(settlePayload, null, 2)
    );

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

    // Parse the JSON response to check success field
    let facilitatorResponse;
    try {
      facilitatorResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse facilitator response:", parseError);
      return false;
    }

    // Check both HTTP status and success field
    const isSuccessful = response.ok && facilitatorResponse.success === true;

    // If settlement fails, log additional debugging info
    if (!isSuccessful) {
      console.log("Payment settlement failed!");
      console.log("HTTP Status OK:", response.ok);
      console.log("Facilitator success:", facilitatorResponse.success);
      console.log("Error reason:", facilitatorResponse.errorReason);
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

    return isSuccessful;
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
      (kind: {
        network?: string;
        scheme?: string;
        extra?: { feePayer?: string };
      }) => kind.network === PAYMENT_CONFIG.network && kind.scheme === "exact"
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
  const paymentRequirements = await createPaymentRequirements();
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
      return NextResponse.json(
        {
          error: "Payment verification failed",
          details:
            "The facilitator rejected the payment transaction. Check server logs for details.",
        },
        { status: 402 }
      );
    }

    // Parse request body
    const body = await request.json();
    const {
      prompt,
      model,
      threadId,
      userId,
      systemEnhancement,
      userWalletAddress,
    } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Call your existing Convex functions and capture the result
    let result;
    if (threadId) {
      // Continue existing thread - now returns { text, usage }
      result = await convex.action(api.agents.continueThread, {
        prompt,
        threadId,
        model: model || "anthropic/claude-3.5-sonnet",
        systemEnhancement,
      });
    } else {
      // Create new thread - returns { threadId, text, usage }
      result = await convex.action(api.agents.createThread, {
        prompt,
        model: model || "anthropic/claude-3.5-sonnet",
        userId,
        systemEnhancement,
      });
    }

    // Settle payment with facilitator before processing refunds
    const paymentSettled = await settlePayment(paymentHeader);
    if (!paymentSettled) {
      return NextResponse.json(
        { error: "Payment settlement failed" },
        { status: 402 }
      );
    }

    // Extract usage information from the result
    const usageData =
      (
        result as {
          usage?: {
            cost?: number;
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
          };
        }
      ).usage || null;
    console.log("Raw result from Convex:", result);

    let paymentInfo: PaymentInfo | null = null;

    if (usageData && usageData.cost) {
      console.log("OpenRouter usage data:", usageData);

      // Calculate refund amount using the full usage object
      const refundAmount = calculateRefund(usageData, PAYMENT_CONFIG.amount);

      // Calculate actual cost paid (initial payment - refund)
      const actualCostPaid = PAYMENT_CONFIG.amount - refundAmount;

      // Store payment info to return with response
      paymentInfo = {
        actualCost: actualCostPaid / 1000000, // Convert to USD
        refundAmount: refundAmount / 1000000, // Convert to USD
      };

      if (refundAmount > 0) {
        console.log(
          `Processing refund of ${refundAmount} USDC micro-units to ${userWalletAddress}`
        );

        // Execute refund using RefundService - userWalletAddress comes from request body
        if (!userWalletAddress) {
          console.error("❌ No user wallet address provided for refund");
        } else {
          const refundService = new RefundService();
          try {
            const refundResult = await refundService.executeRefund(
              userWalletAddress,
              refundAmount
            );

            if (refundResult.success) {
              console.log(
                `✅ Refund successful: ${refundResult.transactionHash}`
              );

              // Add transaction hash to payment info
              if (paymentInfo) {
                paymentInfo.transactionHash = refundResult.transactionHash;
              }

              // Optional: Store refund record for audit trail
              // TODO: Add Convex mutation to track successful refunds
            } else {
              console.error(`❌ Refund failed: ${refundResult.error}`);

              // Optional: Store failed refund for manual processing
              // TODO: Add Convex mutation to track failed refunds
            }
          } catch (refundError) {
            console.error("❌ Refund service error:", refundError);

            // Don't fail the entire request if refund fails
            // User got their AI response, refund can be processed manually if needed
          }
        }

        // Handle case where no wallet address was provided
        if (!userWalletAddress) {
          console.log(
            "❌ Cannot process refund: no user wallet address provided"
          );
          console.log("💡 Refund will need to be processed manually:");
          console.log(
            `   - Amount: ${refundAmount} USDC micro-units ($${RefundService.microUsdcToUsd(
              refundAmount
            ).toFixed(6)})`
          );
          console.log(`   - User ID: ${userId}`);
          console.log("   - Consider storing this for manual processing");

          // TODO: Store failed refund attempt in database for manual processing
        }
      }
    } else {
      console.log("No usage data available for refund calculation");
    }

    // Return the AI response in the expected format with payment info
    // For continueThread, we need to normalize the response format
    if (threadId && result && typeof result === "object" && "text" in result) {
      // continueThread now returns { text, usage }, return with payment info
      return NextResponse.json({
        text: result.text,
        paymentInfo,
      });
    }

    // For createThread, include payment info with existing format
    return NextResponse.json({
      ...result,
      paymentInfo,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
