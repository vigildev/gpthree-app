"use client";

import { Sidebar } from "@/components/sidebar";
import { Dashboard } from "@/components/dashboard";
import { usePrivy } from "@privy-io/react-auth";
import { LoginButton } from "@/components/login-button";

export default function Home() {
  const { ready, authenticated } = usePrivy();

  return (
    <div className="flex h-screen bg-background">
      {ready && authenticated && <Sidebar />}
      <main className="flex-1 overflow-auto">
        {ready && authenticated ? (
          <Dashboard />
        ) : (
          <div className="h-full flex flex-col items-center justify-start pt-24 gap-6">
            <h1 className="text-purple-500 text-5xl font-semibold">GPThree</h1>
            <p className="text-pretty tracking-wide">
              A privacy-first crypto-native LLM aggregator.
            </p>
            <LoginButton />
          </div>
        )}
      </main>
    </div>
  );
}
