"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { Button } from "@/components/ui/button";
import { createX402Client } from "@/lib/x402-solana/client";

/**
 * Test component for the x402-solana package
 * Verifies the package works independently of existing app code
 */
export function X402PackageTest() {
  const { authenticated, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const [result, setResult] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const testPayment = async () => {
    if (!authenticated || !user) {
      setResult("❌ Please authenticate first");
      return;
    }

    const wallet = wallets[0];
    if (!wallet) {
      setResult("❌ No Solana wallet found");
      return;
    }

    setIsLoading(true);
    setResult("🔄 Testing x402 payment package...");

    try {
      // Create x402 client using the package
      const client = createX402Client({
        wallet,
        network: "solana-devnet",
        maxPaymentAmount: BigInt(10_000_000), // Max 10 USDC
      });

      // Make a paid request to the chat API
      const response = await client.fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: "Hello! This is a test of the x402-solana package.",
          model: "anthropic/claude-3.5-sonnet",
          userId: user.id,
          userWalletAddress: wallet.address,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setResult(
          `✅ Payment successful!\n\n${JSON.stringify(data, null, 2)}`
        );
      } else {
        const errorText = await response.text();
        setResult(
          `❌ Payment failed: ${response.status} ${response.statusText}\n\n${errorText}`
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
        <h3 className="text-lg font-semibold mb-2">x402-solana Package Test</h3>
        <p className="text-sm text-muted-foreground">
          Please authenticate and connect a Solana wallet to test the package.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 border border-border rounded-lg bg-card space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">x402-solana Package Test</h3>
        <p className="text-sm text-muted-foreground">
          Testing the reusable x402 payment package
        </p>
      </div>

      <div className="space-y-2 text-sm">
        <p>
          <strong>Wallet:</strong> {wallets[0]?.address?.slice(0, 8)}...
          {wallets[0]?.address?.slice(-6)}
        </p>
        <p>
          <strong>Network:</strong> Solana Devnet
        </p>
        <p>
          <strong>Max Payment:</strong> 10 USDC
        </p>
      </div>

      <Button onClick={testPayment} disabled={isLoading} className="w-full">
        {isLoading ? "Processing..." : "Test x402 Payment"}
      </Button>

      {result && (
        <div className="mt-4 p-4 bg-muted rounded-lg">
          <pre className="text-xs whitespace-pre-wrap overflow-x-auto font-mono">
            {result}
          </pre>
        </div>
      )}

      <div className="text-xs text-muted-foreground space-y-1">
        <p><strong>This test verifies:</strong></p>
        <ul className="list-disc ml-4 space-y-1">
          <li>Package imports work correctly</li>
          <li>Client can be created with wallet adapter</li>
          <li>Automatic 402 payment handling works</li>
          <li>Transaction signing and submission succeed</li>
          <li>Payment verification and settlement complete</li>
        </ul>
      </div>
    </div>
  );
}

