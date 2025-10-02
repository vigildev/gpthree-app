"use client";

import { X402PackageTest } from "@/components/x402-package-test";
import { usePrivy } from "@privy-io/react-auth";
import { LoginButton } from "@/components/login-button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function X402TestPage() {
  const { ready, authenticated } = usePrivy();

  return (
    <div className="min-h-screen bg-background p-4 lg:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold">x402-solana Package Test</h1>
          <p className="text-muted-foreground">
            Testing the reusable x402 payment protocol package
          </p>
        </div>

        {/* Test Component */}
        {ready && !authenticated ? (
          <div className="space-y-6">
            <div className="p-6 border border-border rounded-lg bg-card">
              <p className="text-sm text-muted-foreground mb-4">
                Please authenticate to test the package
              </p>
              <LoginButton />
            </div>
          </div>
        ) : (
          <X402PackageTest />
        )}

        {/* Package Info */}
        <div className="p-6 border border-border rounded-lg bg-card space-y-4 text-sm">
          <h3 className="font-semibold">About the Package</h3>
          <div className="space-y-2 text-muted-foreground">
            <p>
              The <code className="text-xs bg-muted px-1 py-0.5 rounded">x402-solana</code> package is a framework-agnostic implementation of the x402 payment protocol for Solana.
            </p>
            <p><strong>Features:</strong></p>
            <ul className="list-disc ml-4 space-y-1">
              <li>Client-side: Automatic 402 payment handling</li>
              <li>Server-side: Payment verification & settlement</li>
              <li>Works with any wallet provider (Privy, Phantom, etc.)</li>
              <li>Works with any HTTP framework (Next.js, Express, etc.)</li>
              <li>Full TypeScript support</li>
            </ul>
            <p><strong>Location:</strong></p>
            <p className="text-xs bg-muted px-2 py-1 rounded font-mono">
              src/lib/x402-solana/
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

