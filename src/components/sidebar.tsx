"use client";

import { useState } from "react";
import Link from "next/link";
import { Moon, Plus, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";

export function Sidebar() {
  const { theme, setTheme } = useTheme();
  const { ready, authenticated, logout } = usePrivy();
  const { wallets } = useSolanaWallets();
  console.log({ wallets });

  const [recentChats] = useState([
    { title: "The greatest Super Bowl halftime...", time: "1 day ago" },
    { title: "Top cookbooks in 2024", time: "2 days ago" },
    { title: "How important is breakfast", time: "3 days ago" },
  ]);

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
      >
        <Plus className="h-4 w-4" />
        New Thread
        <span className="ml-auto text-xs text-muted-foreground">K</span>
      </Button>

      <div className="flex-1">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-foreground">Recent</span>
          <span className="text-xs text-muted-foreground">3 chats</span>
        </div>
        <div className="space-y-2">
          {recentChats.map((chat, i) => (
            <Link
              key={i}
              href="#"
              className="block text-sm p-2 rounded-lg hover:bg-secondary/20 transition-colors"
            >
              <div className="font-medium truncate text-foreground">{chat.title}</div>
              <div className="text-xs text-muted-foreground">{chat.time}</div>
            </Link>
          ))}
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
          <div className="font-thin text-xs text-foreground">Safe and Secure</div>
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
