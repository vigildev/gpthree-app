"use client";

import { Send, Sparkles, Lock, Zap, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IntegrationCard } from "@/components/integration-card";
import { ModelSelector } from "@/components/model-selector";
import { useState, useEffect, useRef } from "react";
import { useAction, useQuery } from "convex/react";
import { usePrivy } from "@privy-io/react-auth";
import { api } from "../../convex/_generated/api";
import { QUICK_START_ACTIONS } from "@/constants/quick-actions";

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

  const createThread = useAction(api.agents.createThread);
  const continueThread = useAction(api.agents.continueThread);

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
      if (currentThreadId) {
        // Continue existing thread
        const response = await continueThread({
          prompt: userMessage,
          threadId: currentThreadId,
          model: selectedModel,
        });
        console.log("Continue thread response:", response);

        // Add AI response to chat
        const aiChatMessage = {
          key: `ai-${Date.now()}`,
          role: "assistant" as const,
          content: response,
          status: "complete" as const,
        };
        setChatMessages((prev) => [...prev, aiChatMessage]);
      } else {
        // Create new thread
        const response = await createThread({
          prompt: userMessage,
          model: selectedModel,
          userId: user.id,
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
                className={`p-6 rounded-3xl ${
                  msg.role === "user"
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
              <div className="p-6 rounded-3xl bg-card border border-border shadow-sm">
                <div className="flex items-center space-x-3">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse"></div>
                    <div
                      className="w-2 h-2 bg-secondary/60 rounded-full animate-pulse"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-accent/60 rounded-full animate-pulse"
                      style={{ animationDelay: "0.4s" }}
                    ></div>
                  </div>
                  <span className="text-muted-foreground font-light">
                    Thinking...
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input Area */}
      <div className="mb-16">
        <div className="mx-auto relative">
          <Input
            placeholder="Ask anything... I'm your privacy-focused AI assistant"
            className="w-full h-12 pl-4 pr-14 bg-card border border-border hover:border-primary/50 focus:border-primary focus:ring-0 text-foreground placeholder:text-muted-foreground rounded-full text-base shadow-sm"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
            disabled={isLoading}
          />
          <Button
            onClick={handleSendMessage}
            disabled={isLoading || !message.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 bg-gradient-to-r from-accent to-primary hover:from-accent/80 hover:to-primary/80 disabled:from-muted disabled:to-muted text-white rounded-full transition-colors flex items-center justify-center"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="flex items-center justify-between mt-9 ml-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Lock className="h-3 w-3 text-primary" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                End-to-end encrypted
              </span>
            </div>
            <span className="w-1 h-1 bg-muted-foreground rounded-full"></span>
            <span className="text-xs text-muted-foreground">
              Using{" "}
              {selectedModel.split("/")[1]?.replace(/-/g, " ") || selectedModel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Brain className="h-3 w-3 text-secondary" />
            <ModelSelector
              selectedModel={selectedModel}
              onModelSelect={handleModelChange}
              className="w-56 h-7 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-20">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-6">
          Quick Start
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {QUICK_START_ACTIONS.map((action) => (
            <button
              key={action.text}
              className="p-6 text-left bg-card border border-border hover:border-primary/50 hover:shadow-md rounded-2xl transition-all duration-200 group"
              onClick={() => setMessage(action.prompt)}
            >
              <div className="font-medium text-card-foreground text-sm mb-1 group-hover:text-primary transition-colors">
                {action.text}
              </div>
              <div className="text-xs text-muted-foreground font-light">
                {action.desc}
              </div>
            </button>
          ))}
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
