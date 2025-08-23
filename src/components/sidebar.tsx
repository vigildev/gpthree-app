"use client";

import { useState } from "react";
import Link from "next/link";
import { Moon, Plus, Sun, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";

interface SidebarProps {
  currentThreadId?: string;
  onThreadSelect?: (threadId: string) => void;
  onThreadDeleted?: (threadId: string) => void;
}

export function Sidebar({ currentThreadId, onThreadSelect }: SidebarProps) {
  const { theme, setTheme } = useTheme();
  const { ready, authenticated, logout, user } = usePrivy();
  const { wallets } = useSolanaWallets();

  // Fetch user's threads
  const threads =
    useQuery(
      api.agents.listUserThreads,
      ready && authenticated && user ? { userId: user.id } : "skip"
    ) || [];
  const createNewThread = useAction(api.agents.createNewThread);
  const deleteThread = useAction(api.agents.deleteThread);

  const handleNewThread = async () => {
    if (!user) {
      console.error("User not authenticated");
      return;
    }
    
    try {
      const { threadId } = await createNewThread({ 
        title: "New Conversation",
        userId: user.id 
      });
      onThreadSelect?.(threadId);
    } catch (error) {
      console.error("Failed to create new thread:", error);
    }
  };

  const handleDeleteThread = async (threadId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!user) {
      console.error("User not authenticated");
      return;
    }
    
    try {
      await deleteThread({ threadId, userId: user.id });
      console.log("Thread deleted successfully:", threadId);
    } catch (error) {
      console.error("Failed to delete thread:", error);
    }
  };

  // Helper function to format relative time
  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    } else {
      return "Just now";
    }
  };

  return (
    <div className="w-64 border-r border-border bg-background p-4 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/" className="flex items-center gap-2">
          <img src="/gpthree-logo.svg" alt="GPThree" className="h-8 w-8" />
          <span className="self-center text-2xl font-semibold whitespace-nowrap text-foreground">
            GPThree
          </span>
        </Link>
      </div>

      <Button
        variant="outline"
        className="w-full justify-start gap-2 mb-6 bg-card hover:bg-muted"
        onClick={handleNewThread}
      >
        <Plus className="h-4 w-4" />
        New Thread
        <span className="ml-auto text-xs text-muted-foreground">⌘K</span>
      </Button>

      <div className="flex-1">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-foreground">Recent</span>
          <span className="text-xs text-muted-foreground">
            {threads.length} threads
          </span>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {threads.map((thread) => (
            <div
              key={thread._id}
              className={`group relative block text-sm p-2 rounded-lg hover:bg-secondary/20 transition-colors cursor-pointer ${
                currentThreadId === thread._id ? "bg-secondary/30" : ""
              }`}
              onClick={() => onThreadSelect?.(thread._id)}
            >
              <div className="font-medium truncate text-foreground pr-6">
                {thread.title}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatRelativeTime(thread._creationTime)}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 h-6 w-6 p-0 hover:bg-destructive/20"
                onClick={(e) => handleDeleteThread(thread._id, e)}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
          {threads.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">
              No conversations yet.
              <br />
              Start by creating a new thread.
            </div>
          )}
        </div>
      </div>

      {ready && authenticated && (
        <Button
          onClick={logout}
          className="mb-3 bg-gradient-to-r from-accent to-primary hover:from-accent/80 hover:to-primary/80 text-white"
        >
          Logout
        </Button>
      )}
      <div className="flex items-center gap-2 pt-4 border-t border-border mt-3">
        <div className="flex-1 self-center">
          <div className="font-thin text-xs text-foreground">
            Safe and Secure
          </div>
          <div className="text-xs text-muted-foreground">Pro</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="hover:bg-secondary/50"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </div>
    </div>
  );
}
