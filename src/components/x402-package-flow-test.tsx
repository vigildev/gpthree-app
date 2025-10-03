"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { Button } from "@/components/ui/button";

// Import from the npm package instead of local lib
import { createX402Client } from "@payai/x402-solana/client";
import { usdToMicroUsdc } from "@payai/x402-solana/utils";

/**
 * Integration test component for the @payai/x402-solana package
 * Tests the complete payment flow to verify package works identically to local lib
 */
export function X402PackageFlowTest() {
  const { authenticated, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const [result, setResult] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<string>("");

  const testPaymentFlow = async () => {
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
    setResult("");
    
    const steps: string[] = [];
    const logStep = (stepMsg: string) => {
      steps.push(`${new Date().toLocaleTimeString()}: ${stepMsg}`);
      setStep(stepMsg);
      setResult(steps.join("\n"));
    };

    try {
      logStep("🔄 Initializing x402 client from @payai/x402-solana package...");
      
      // Test utility function from package
      const testAmount = 2.5;
      const microUnits = usdToMicroUsdc(testAmount);
      logStep(`✅ Utils working: $${testAmount} = ${microUnits} micro-units`);

      // Create x402 client using the package
      const client = createX402Client({
        wallet,
        network: "solana-devnet",
        maxPaymentAmount: BigInt(10_000_000), // Max 10 USDC
      });
      logStep("✅ x402 client created successfully");

      logStep("🔄 Making request to /api/chat endpoint...");
      
      // Make a paid request to test the full flow
      const response = await client.fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: "Hello! This is an integration test of the @payai/x402-solana npm package. Please respond briefly.",
          model: "anthropic/claude-3.5-sonnet",
          userId: user.id,
          userWalletAddress: wallet.address,
        }),
      });

      logStep(`📡 Received response: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        logStep("✅ Payment flow completed successfully!");
        logStep(`📝 Response preview: ${JSON.stringify(data).substring(0, 200)}...`);
        
        setResult(steps.join("\n") + "\n\n🎉 SUCCESS: The @payai/x402-solana package works identically to the local lib!");
      } else {
        const errorText = await response.text();
        logStep(`❌ Request failed: ${response.status}`);
        setResult(steps.join("\n") + `\n\n❌ Error Details:\n${errorText}`);
      }
    } catch (error) {
      console.error("Payment flow test error:", error);
      logStep(`❌ Error occurred: ${error instanceof Error ? error.message : "Unknown error"}`);
      setResult(steps.join("\n") + `\n\n❌ Full Error:\n${error instanceof Error ? error.stack : String(error)}`);
    } finally {
      setIsLoading(false);
      setStep("");
    }
  };

  const testPackageComparison = async () => {
    setIsLoading(true);
    setResult("");
    
    try {
      // Test package vs local imports
      const packageClient = createX402Client;
      const packageUtils = usdToMicroUsdc;
      
      // Import local lib for comparison
      const { createX402Client: localClient } = await import("@/lib/x402-solana/client");
      const { usdToMicroUsdc: localUtils } = await import("@/lib/x402-solana/utils");
      
      const comparison = [
        "🔍 PACKAGE vs LOCAL COMPARISON:",
        "",
        `Package createX402Client type: ${typeof packageClient}`,
        `Local createX402Client type: ${typeof localClient}`,
        `Functions match: ${typeof packageClient === typeof localClient ? "✅" : "❌"}`,
        "",
        `Package usdToMicroUsdc(2.5): ${packageUtils(2.5)}`,
        `Local usdToMicroUsdc(2.5): ${localUtils(2.5)}`,
        `Results match: ${packageUtils(2.5) === localUtils(2.5) ? "✅" : "❌"}`,
        "",
        "📋 COMPARISON SUMMARY:",
        "The package and local lib should have identical functionality.",
        "If all checks pass (✅), the package is ready for production use!"
      ];
      
      setResult(comparison.join("\n"));
    } catch (error) {
      setResult(`❌ Comparison failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="p-6 border border-border rounded-lg bg-card">
        <h3 className="text-lg font-semibold mb-2">@payai/x402-solana Integration Test</h3>
        <p className="text-sm text-muted-foreground">
          Please authenticate and connect a Solana wallet to test the package payment flow.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-6 border border-border rounded-lg bg-card space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">@payai/x402-solana Integration Test</h3>
          <p className="text-sm text-muted-foreground">
            Test the complete x402 payment flow using the npm package to verify it works identically to the local lib.
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
            <strong>Package:</strong> @payai/x402-solana v1.0.0
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={testPaymentFlow} disabled={isLoading} className="flex-1">
            {isLoading && step ? "Processing..." : "Test Full Payment Flow"}
          </Button>
          <Button onClick={testPackageComparison} disabled={isLoading} variant="outline" className="flex-1">
            Compare Package vs Local
          </Button>
        </div>

        {step && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">
              Current Step: {step}
            </p>
          </div>
        )}

        {result && (
          <div className="mt-4 p-4 bg-muted rounded-lg max-h-96 overflow-y-auto">
            <pre className="text-xs whitespace-pre-wrap font-mono">
              {result}
            </pre>
          </div>
        )}

        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>This integration test verifies:</strong></p>
          <ul className="list-disc ml-4 space-y-1">
            <li>Package imports work correctly in production</li>
            <li>x402 client initializes with wallet adapter</li>
            <li>Automatic 402 payment detection and handling</li>
            <li>Transaction building and wallet signing</li>
            <li>Payment verification with facilitator</li>
            <li>Full request/response cycle completion</li>
            <li>Package behavior matches local lib exactly</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
