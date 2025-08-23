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
            <h1 className="text-5xl font-semibold bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent">GPThree</h1>
            <p className="text-pretty tracking-wide text-muted-foreground">
              A privacy-first AI assistant for everything.
            </p>
            <LoginButton />
          </div>
        )}
      </main>
    </div>
  );
}
