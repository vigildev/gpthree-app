"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { usePaidRequest } from "@/hooks/usePaidRequest";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";

export function PaymentTest() {
  const { makePaymentRequest } = usePaidRequest();
  const { authenticated, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const [result, setResult] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const testPayment = async () => {
    if (!authenticated || !user) {
      setResult("Please authenticate first");
      return;
    }

    // Find user's Solana wallet
    const solanaWallet = wallets.find(
      (wallet) =>
        wallet.walletClientType === "phantom" ||
        wallet.walletClientType === "solflare" ||
        wallet.walletClientType === "backpack" ||
        wallet.walletClientType === "privy" ||
        (wallet.address && wallet.address.length > 30)
    );

    if (!solanaWallet?.address) {
      setResult("❌ No Solana wallet found. Please connect a Solana wallet.");
      return;
    }

    setIsLoading(true);
    setResult("Testing x402 payment handshake with refund support...");

    try {
      // Make a request to the chat API which requires payment
      const response = await makePaymentRequest("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt:
            "Hello, this is a test of the x402 payment system with automatic refunds.",
          model: "anthropic/claude-3.5-sonnet",
          userId: user.id,
          userWalletAddress: solanaWallet.address, // Add wallet address for refunds
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setResult(
          `✅ Payment successful! Response: ${JSON.stringify(data, null, 2)}`
        );
      } else {
        setResult(
          `❌ Payment failed: ${response.status} ${response.statusText}`
        );
      }
    } catch (error) {
      console.error("Payment test error:", error);
      setResult(
        `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="p-6 border border-border rounded-lg bg-card">
        <h3 className="text-lg font-medium mb-4">x402 Payment Test</h3>
        <p className="text-muted-foreground">
          Please authenticate and connect a Solana wallet to test payments.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 border border-border rounded-lg bg-card">
      <h3 className="text-lg font-medium mb-4">x402 Payment System Test</h3>
      <div className="space-y-4">
        <Button onClick={testPayment} disabled={isLoading} className="w-full">
          {isLoading ? "Processing Payment..." : "Test x402 Payment"}
        </Button>

        {result && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <pre className="text-sm whitespace-pre-wrap overflow-x-auto">
              {result}
            </pre>
          </div>
        )}

        <div className="text-sm text-muted-foreground">
          <p>
            <strong>Test Details:</strong>
          </p>
          <ul className="list-disc ml-4 mt-2 space-y-1">
            <li>
              Network: Solana{" "}
              {process.env.NEXT_PUBLIC_NETWORK === "solana"
                ? "Mainnet"
                : "Devnet"}
            </li>
            <li>Payment: $2.50 USDC upfront</li>
            <li>AI Usage: Calculated after response</li>
            <li>Refund: Automatic refund of unused amount</li>
            <li>Facilitator: payai.network</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
