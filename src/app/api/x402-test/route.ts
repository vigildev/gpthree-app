import { NextRequest, NextResponse } from "next/server";
import { X402PaymentHandler } from "@/lib/x402-solana/server";
import type { Network, PaymentRequirements } from "@/lib/x402-solana/types";

// Initialize x402 handler with package
const network = (process.env.NEXT_PUBLIC_NETWORK || "solana-devnet") as Network;
const treasuryAddress = process.env.TREASURY_WALLET_ADDRESS;

if (!treasuryAddress) {
  throw new Error("TREASURY_WALLET_ADDRESS environment variable is required");
}

const x402 = new X402PaymentHandler({
  network,
  treasuryAddress,
  facilitatorUrl: "https://facilitator.payai.network",
  rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_DEVNET,
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    console.log("=== x402 Package Test Route ===");
    
    // 1. Extract payment header
    const paymentHeader: string | null = x402.extractPayment(req.headers);
    console.log("Payment header present:", !!paymentHeader);

    // 2. Create payment requirements (store this!)
    const paymentRequirements: PaymentRequirements = await x402.createPaymentRequirements({
      amount: 1_000_000, // $1 USDC test payment
      description: "x402 Package Test",
      resource: `${process.env.NEXT_PUBLIC_BASE_URL}/api/x402-test`,
    });
    console.log("Payment requirements created:", {
      amount: paymentRequirements.maxAmountRequired,
      payTo: paymentRequirements.payTo,
      network: paymentRequirements.network,
    });

    if (!paymentHeader) {
      // Return 402 with payment requirements
      const response = await x402.create402Response({
        amount: 1_000_000,
        description: "x402 Package Test",
        resource: `${process.env.NEXT_PUBLIC_BASE_URL}/api/x402-test`,
      });
      console.log("Returning 402 Payment Required");
      return NextResponse.json(response.body, { status: response.status });
    }

    // 3. Verify payment
    console.log("Verifying payment with facilitator...");
    const verified: boolean = await x402.verifyPayment(paymentHeader, paymentRequirements);
    console.log("Payment verified:", verified);
    
    if (!verified) {
      return NextResponse.json(
        { error: "Payment verification failed" },
        { status: 402 }
      );
    }

    // 4. Settle payment
    console.log("Settling payment with facilitator...");
    const settled: boolean = await x402.settlePayment(paymentHeader, paymentRequirements);
    console.log("Payment settled:", settled);
    
    if (!settled) {
      return NextResponse.json(
        { error: "Payment settlement failed" },
        { status: 402 }
      );
    }

    // 5. Return success response
    console.log("✅ x402 package test successful!");
    return NextResponse.json({
      success: true,
      message: "x402 package test completed successfully!",
      payment: {
        amount: "$1.00 USDC",
        network: paymentRequirements.network,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("x402 test route error:", error);
    return NextResponse.json(
      {
        error: "Test failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

