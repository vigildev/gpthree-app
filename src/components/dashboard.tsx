"use client";

import { Send, Sparkles, Lock, Zap, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IntegrationCard } from "@/components/integration-card";
import { ModelSelector } from "@/components/model-selector";
import { PrivacyBanner } from "@/components/privacy-banner";
import { useState, useEffect, useRef } from "react";
import { useAction, useQuery } from "convex/react";
import { usePrivy } from "@privy-io/react-auth";
import { api } from "../../convex/_generated/api";
import { usePaidRequest } from "@/hooks/usePaidRequest";
import { QUICK_START_ACTIONS, QuickAction } from "@/constants/quick-actions";
import { WalletDebug } from "@/components/wallet-debug";

interface DashboardProps {
  threadId?: string;
  onThreadChange?: (threadId: string) => void;
}

export function Dashboard({
  threadId: currentThreadId,
  onThreadChange,
}: DashboardProps) {
  const { ready, authenticated, user } = usePrivy();
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(
    "anthropic/claude-3.7-sonnet"
  );
  const [chatMessages, setChatMessages] = useState<
    Array<{
      key: string;
      role: "user" | "assistant";
      content: string;
      status: "complete";
    }>
  >([]);
  const [selectedQuickAction, setSelectedQuickAction] = useState<QuickAction | null>(null);

  console.log({ ready, authenticated, user });

  if (!ready) {
    return (
      <div className="p-12 max-w-5xl mx-auto flex items-center justify-center">
        Initializing...
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <div className="p-12 max-w-5xl mx-auto flex items-center justify-center">
        Please log in to continue.
      </div>
    );
  }

  const { makePaymentRequest } = usePaidRequest();

  // Use regular Convex query to get messages for the current thread
  const messages = useQuery(
    api.agents.listThreadMessages,
    currentThreadId ? { threadId: currentThreadId } : "skip"
  );

  // Convert messages to UI format and ensure proper ordering (newest at bottom)
  const persistedMessages = messages
    ? messages
      .sort((a: any, b: any) => (a._creationTime || 0) - (b._creationTime || 0)) // Sort by creation time
      .map((msg: any, index: number) => ({
        key: `${msg._id || index}`,
        role: msg.author === "user" ? "user" : "assistant",
        content: msg.content || msg.text || "",
        status: "complete" as const,
      }))
    : [];

  // Clear local chat messages when thread changes
  useEffect(() => {
    setChatMessages([]);
  }, [currentThreadId]);

  // Use persisted messages if available, otherwise use local state
  const displayMessages =
    currentThreadId && persistedMessages.length > 0
      ? persistedMessages
      : chatMessages;

  // Handle model change - start new conversation
  const handleModelChange = (newModel: string) => {
    setSelectedModel(newModel);
    // Model changes within the same thread are fine
  };

  const handleSendMessage = async () => {
    if (!message.trim() || isLoading || !user) return;

    const userMessage = message;
    setMessage("");
    setIsLoading(true);

    // Add user message to chat immediately
    const userChatMessage = {
      key: `user-${Date.now()}`,
      role: "user" as const,
      content: userMessage,
      status: "complete" as const,
    };
    setChatMessages((prev) => [...prev, userChatMessage]);

    try {
      // Use paid API endpoint
      const requestBody = {
        prompt: userMessage,
        model: selectedModel,
        userId: user.id,
        systemEnhancement: selectedQuickAction?.systemEnhancement,
        ...(currentThreadId && { threadId: currentThreadId }),
      };

      const response = await makePaymentRequest('/api/chat', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const result = await response.json();
      console.log("Paid API response:", result);

      // Add AI response to chat
      const aiChatMessage = {
        key: `ai-${Date.now()}`,
        role: "assistant" as const,
        content: result.text || result, // Handle both create and continue response formats
        status: "complete" as const,
      };
      setChatMessages((prev) => [...prev, aiChatMessage]);

      // If this was a new thread creation, notify parent component
      if (!currentThreadId && result.threadId) {
        onThreadChange?.(result.threadId);
      }
    } catch (error) {
      console.error("Error sending message:", error);

      // Add error message to chat
      const errorChatMessage = {
        key: `error-${Date.now()}`,
        role: "assistant" as const,
        content:
          "Sorry, there was an error processing your request. Please try again.",
        status: "complete" as const,
      };
      setChatMessages((prev) => [...prev, errorChatMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-12 max-w-5xl mx-auto">
      {/* Debug Component - Remove this after testing */}
      <WalletDebug />
      
      <div className="mb-16">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-accent to-primary flex items-center justify-center shadow-lg">
            <img
              src="/gpthree-logo-white.svg"
              alt="GPThree"
              className="h-8 w-8"
            />
          </div>
          <h1 className="text-5xl font-light text-foreground tracking-tight">
            GPThree
          </h1>
        </div>
        <p className="text-muted-foreground text-lg font-light ml-16">
          Privacy-first AI intelligence
        </p>
      </div>

      {/* Privacy Banner */}
      <PrivacyBanner />

      {/* Chat History */}
      {displayMessages.length > 0 && (
        <div className="mb-12 space-y-6">
          {displayMessages.map((msg) => (
            <div
              key={msg.key}
              className={`${msg.role === "user" ? "ml-12" : "mr-12"}`}
            >
              <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                {msg.role === "user" ? "You" : "GPThree"}
              </div>
              <div
                className={`p-6 rounded-3xl ${msg.role === "user"
                  ? "bg-secondary/10 text-foreground border border-secondary/20"
                  : "bg-card border border-border text-card-foreground shadow-sm"
                  }`}
              >
                {msg.content}
                {msg.status !== "complete" && (
                  <div className="mt-2 flex items-center space-x-2">
                    <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse"></div>
                    <span className="text-xs text-muted-foreground">
                      Loading...
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="mr-12">
              <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                GPThree
              </div>
              <div className="p-6 rounded-3xl bg-card border border-border text-card-foreground shadow-sm">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-primary/40 rounded-full animate-pulse animation-delay-100"></div>
                  <div className="w-2 h-2 bg-primary/20 rounded-full animate-pulse animation-delay-200"></div>
                  <span className="text-sm text-muted-foreground ml-2">
                    Processing...
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Actions */}
      {displayMessages.length === 0 && (
        <div className="mb-12">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-6">
            Quick Start
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {QUICK_START_ACTIONS.map((action, index) => (
              <button
                key={action.text}
                onClick={() => setSelectedQuickAction(action)}
                className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-card/50 to-card border border-border/50 p-6 text-left transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20 hover:scale-[1.02]"
              >
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-2xl">
                      {index === 0 ? "🔍" : index === 1 ? "📊" : index === 2 ? "📚" : "✍️"}
                    </div>
                    <h4 className="font-medium text-foreground group-hover:text-primary transition-colors">
                      {action.text}
                    </h4>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {action.desc}
                  </p>
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message Input */}
      <div className="space-y-6">
        <div className="flex gap-4">
          <div className="flex-1">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask anything..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              className="h-14 px-6 text-base rounded-2xl border-border/50 bg-card/50 backdrop-blur-sm focus:border-primary/50 focus:ring-primary/20"
              disabled={isLoading}
            />
          </div>
          <Button
            onClick={handleSendMessage}
            disabled={!message.trim() || isLoading}
            size="lg"
            className="h-14 px-8 rounded-2xl bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <ModelSelector
              selectedModel={selectedModel}
              onModelSelect={setSelectedModel}
            />
            <div className="text-muted-foreground">
              Choose your preferred AI model
            </div>
          </div>
        </div>
      </div>

      {/* Tools Section */}
      {/* <div className="space-y-8">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Available Tools
          </h3>
          <p className="text-muted-foreground font-light">
            18+ AI models and specialized tools at your disposal
          </p>
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList className="bg-muted border-0 h-auto p-1 rounded-xl">
            {["All", "Coding", "Writing", "Research", "Analysis", "Privacy"].map(
              (tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab.toLowerCase()}
                  className="rounded-lg px-6 py-3 data-[state=active]:bg-card data-[state=active]:text-card-foreground data-[state=active]:shadow-sm transition-all duration-200 font-light"
                >
                  {tab}
                </TabsTrigger>
              )
            )}
          </TabsList>
        </Tabs>

        <div className="grid md:grid-cols-2 gap-6">
          <IntegrationCard
            icon="🧠"
            title="Multi-Model Intelligence"
            description="Compare responses from multiple AI models for any task"
            tag="intelligence"
          />
          <IntegrationCard
            icon="🔐"
            title="Privacy-First Processing"
            description="Your data stays private with end-to-end encryption"
            tag="privacy"
          />
        </div>
      </div> */}
    </div>
  );
}
