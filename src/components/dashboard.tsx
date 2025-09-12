"use client";

import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModelSelector } from "@/components/model-selector";
import { PrivacyBanner } from "@/components/privacy-banner";
import { useState, useEffect } from "react";
import { useAction, useQuery } from "convex/react";
import { usePrivy } from "@privy-io/react-auth";
import { api } from "../../convex/_generated/api";
import { QUICK_START_ACTIONS, QuickAction } from "@/constants/quick-actions";
import { PaymentTest } from "@/components/payment-test";

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
    "anthropic/claude-3.5-sonnet"
  );
  const [chatMessages, setChatMessages] = useState<
    Array<{
      key: string;
      role: "user" | "assistant";
      content: string;
      status: "complete";
    }>
  >([]);
  const [selectedQuickAction, setSelectedQuickAction] =
    useState<QuickAction | null>(null);

  // All hooks must be at the top level
  const createThread = useAction(api.agents.createThread);
  const continueThread = useAction(api.agents.continueThread);

  // Use regular Convex query to get messages for the current thread
  const messages = useQuery(
    api.agents.listThreadMessages,
    currentThreadId ? { threadId: currentThreadId } : "skip"
  );

  // Clear local chat messages when thread changes
  useEffect(() => {
    setChatMessages([]);
  }, [currentThreadId]);

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

  // Convert messages to UI format and ensure proper ordering (newest at bottom)
  const persistedMessages = messages
    ? messages
        .sort(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (a: any, b: any) => (a._creationTime || 0) - (b._creationTime || 0)
        ) // Sort by creation time
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((msg: any, index: number) => {
          // Debug: Log the message structure to understand the author field
          console.log("Message structure:", msg);

          // Role detection based on actual Convex Agent structure
          const isUserMessage =
            // Check the nested message.role field (this is the definitive field!)
            msg.message?.role === "user" ||
            // Fallback checks for other possible structures
            msg.author === "user" ||
            msg.role === "user" ||
            msg.type === "user" ||
            msg.sender === "user" ||
            msg.from === "user" ||
            msg.authorRole === "user" ||
            msg.role === "human" ||
            msg.author === "human";

          // Get content from the actual structure
          const messageContent =
            msg.text || // Direct text field
            msg.message?.content?.[0]?.text || // Nested content structure
            msg.content ||
            msg.message ||
            "";

          return {
            key: `${msg._id || index}`,
            role: isUserMessage ? "user" : "assistant",
            content: messageContent,
            status: "complete" as const,
          };
        })
    : [];

  // Use persisted messages if available, otherwise use local state
  const displayMessages =
    currentThreadId && persistedMessages.length > 0
      ? persistedMessages
      : chatMessages;

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
      if (currentThreadId) {
        // Continue existing thread
        const response = await continueThread({
          prompt: userMessage,
          threadId: currentThreadId,
          model: selectedModel,
          systemEnhancement: selectedQuickAction?.systemEnhancement,
        });
        console.log("Continue thread response:", response);

        // Add AI response to chat
        const aiChatMessage = {
          key: `ai-${Date.now()}`,
          role: "assistant" as const,
          content:
            typeof response === "string"
              ? response
              : response.text || "No response",
          status: "complete" as const,
        };
        setChatMessages((prev) => [...prev, aiChatMessage]);
      } else {
        // Create new thread
        const response = await createThread({
          prompt: userMessage,
          model: selectedModel,
          userId: user.id,
          systemEnhancement: selectedQuickAction?.systemEnhancement,
        });
        console.log("Create thread response:", response);

        // Add AI response to chat
        const aiChatMessage = {
          key: `ai-${Date.now()}`,
          role: "assistant" as const,
          content: response.text,
          status: "complete" as const,
        };
        setChatMessages((prev) => [...prev, aiChatMessage]);

        // Notify parent component about the new thread
        onThreadChange?.(response.threadId);
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

      {/* x402 Payment Test - Development Only */}
      <div className="mb-8">
        <PaymentTest />
      </div>

      {/* Chat History */}
      {displayMessages.length > 0 && (
        <div className="mb-12 space-y-6">
          {displayMessages.map((msg) => (
            <div
              key={msg.key}
              className={`${msg.role === "user" ? "ml-12" : "mr-12"}`}
            >
              <div
                className={`text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide ${
                  msg.role === "user" ? "text-right" : "text-left"
                }`}
              >
                {msg.role === "user" ? "You" : "GPThree"}
              </div>
              <div
                className={`p-6 rounded-3xl ${
                  msg.role === "user"
                    ? "bg-primary/10 text-foreground border border-primary/20 ml-auto"
                    : "bg-card border border-border text-card-foreground shadow-sm mr-auto"
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
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="mb-12 mr-12">
          <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            GPThree
          </div>
          <div className="p-6 rounded-3xl bg-card border border-border text-card-foreground shadow-sm mr-auto">
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

        <div className="flex items-center gap-x-3 justify-end text-sm">
          <div className="text-muted-foreground">Select Model</div>
          <ModelSelector
            selectedModel={selectedModel}
            onModelSelect={setSelectedModel}
            className="w-34"
          />
        </div>
      </div>

      {/* Quick Actions */}
      {displayMessages.length === 0 && (
        <div className="mt-12 mb-12">
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
                      {index === 0
                        ? "🔍"
                        : index === 1
                        ? "📊"
                        : index === 2
                        ? "📚"
                        : "✍️"}
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

      {/* Tools Section */}
      {/* <div className="mt-24 space-y-8">
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
                    <IntegrationCard
                        icon="⚡"
                        title="Real-time Analysis"
                        description="Instant insights and analysis across all your data"
                        tag="speed"
                    />
                    <IntegrationCard
                        icon="🎯"
                        title="Specialized Agents"
                        description="Expert AI agents for specific domains and use cases"
                        tag="expertise"
                    />
                </div>
            </div> */}
    </div>
  );
}
