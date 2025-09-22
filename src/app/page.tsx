"use client";

import { Sidebar } from "@/components/sidebar";
import { Dashboard } from "@/components/dashboard";
import { usePrivy } from "@privy-io/react-auth";
import { LoginButton } from "@/components/login-button";
import { Shield, Trash2, Clock } from "lucide-react";
import { useState } from "react";

export default function Home() {
  const { ready, authenticated } = usePrivy();
  const [currentThreadId, setCurrentThreadId] = useState<string | undefined>();

  const handleThreadSelect = (threadId: string) => {
    setCurrentThreadId(threadId);
  };

  const handleThreadChange = (threadId: string | undefined) => {
    setCurrentThreadId(threadId);
  };

  const handleThreadDeleted = (deletedThreadId: string) => {
    // If the deleted thread is currently active, clear the selection
    if (currentThreadId === deletedThreadId) {
      setCurrentThreadId(undefined);
    }
  };

  const handleNewBlankThread = () => {
    // Clear current thread to show blank thread view
    setCurrentThreadId(undefined);
  };

  return (
    <div className="flex h-screen bg-background">
      {ready && authenticated && (
        <Sidebar
          currentThreadId={currentThreadId}
          onThreadSelect={handleThreadSelect}
          onThreadDeleted={handleThreadDeleted}
          onNewBlankThread={handleNewBlankThread}
        />
      )}
      <main className="flex-1 overflow-auto">
        {ready && authenticated ? (
          <Dashboard
            threadId={currentThreadId}
            onThreadChange={handleThreadChange}
            onNewBlankThread={handleNewBlankThread}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-start pt-24 gap-8">
            <div className="text-center">
              <h1 className="text-5xl font-semibold bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent mb-3">
                GPThree
              </h1>
              <p className="text-pretty tracking-wide text-muted-foreground text-lg">
                A privacy-first AI assistant for everything.
              </p>
            </div>

            {/* Privacy Features Highlight */}
            <div className="max-w-md mx-auto">
              <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-6 mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="h-5 w-5 text-green-500" />
                  <span className="text-sm font-medium text-green-600">
                    Privacy Protected
                  </span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Trash2 className="h-4 w-4 text-green-500 mt-0.5" />
                    <div className="text-sm">
                      <div className="font-medium text-foreground">
                        No Chat Logs
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Conversations are never stored or logged
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="h-4 w-4 text-green-500 mt-0.5" />
                    <div className="text-sm">
                      <div className="font-medium text-foreground">
                        Daily Log Deletion
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Server access logs deleted every 24 hours
                      </div>
                    </div>
                  </div>
                  {/* <div className="flex items-start gap-3">
                    <Shield className="h-4 w-4 text-green-500 mt-0.5" />
                    <div className="text-sm">
                      <div className="font-medium text-foreground">Wallet-Only Auth</div>
                      <div className="text-muted-foreground text-xs">
                        No email required, just your Solana wallet
                      </div>
                    </div>
                  </div> */}
                </div>
              </div>
            </div>

            <LoginButton />

            <div className="text-center text-xs text-muted-foreground max-w-sm">
              Connect with your Solana wallet for the most private experience,
              or use email for quick access.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
