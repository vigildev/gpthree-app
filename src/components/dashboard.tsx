"use client";

import { Send, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModelSelector } from "@/components/model-selector";
import { PrivacyBanner } from "@/components/privacy-banner";
import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { api } from "../../convex/_generated/api";
import { usePaidRequest } from "@/hooks/usePaidRequest";
import { useWalletBalance } from "@/hooks/useWalletBalance";
import { useToast } from "@/hooks/use-toast";
import { QUICK_START_ACTIONS, QuickAction } from "@/constants/quick-actions";
// Debug components - imports commented out
// import { PaymentTest } from "./payment-test";
// import { WalletDebug } from "./wallet-debug";

interface PaymentInfo {
  actualCost: number; // in USD
  refundAmount: number; // in USD
  transactionHash?: string;
}

interface ChatMessage {
  key: string;
  role: "user" | "assistant";
  content: string;
  status: "complete";
  paymentInfo?: PaymentInfo;
}

interface DashboardProps {
  threadId?: string;
  onThreadChange?: (threadId: string | undefined) => void;
  onNewBlankThread?: () => void;
}

export function Dashboard({
  threadId: currentThreadId,
  onThreadChange,
  onNewBlankThread,
}: DashboardProps) {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(
    "anthropic/claude-3.5-sonnet"
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [selectedQuickAction, setSelectedQuickAction] =
    useState<QuickAction | null>(null);

  // All hooks must be at the top level
  const { makePaymentRequest } = usePaidRequest();
  const {
    balance,
    hasInsufficientFunds,
    isLoading: isCheckingBalance,
    checkBalance,
    tokenSymbol,
  } = useWalletBalance(); // Uses USDC by default

  const { toast } = useToast();

  // Use regular Convex query to get messages for the current thread
  const messages = useQuery(
    api.agents.listThreadMessages,
    currentThreadId ? { threadId: currentThreadId } : "skip"
  );

  // Handle case where thread was deleted - messages will be null/undefined after loading
  // Only consider a thread deleted if we have a threadId but query explicitly returns null
  const isThreadDeleted = currentThreadId && messages === null;

  // Clear local chat messages when thread changes
  useEffect(() => {
    setChatMessages([]);
  }, [currentThreadId]);

  // Handle deleted thread - clear the current thread if it was deleted
  useEffect(() => {
    if (isThreadDeleted) {
      onThreadChange?.(undefined); // Clear the thread selection
    }
  }, [isThreadDeleted, currentThreadId, onThreadChange]);

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
  const persistedMessages: ChatMessage[] =
    messages && Array.isArray(messages) && messages.length > 0
      ? messages
          .sort(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (a: any, b: any) => (a._creationTime || 0) - (b._creationTime || 0)
          ) // Sort by creation time
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((msg: any, index: number) => {
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
              role: isUserMessage ? ("user" as const) : ("assistant" as const),
              content: messageContent,
              status: "complete" as const,
              // Add generic payment info for all AI messages from database
              paymentInfo: !isUserMessage
                ? {
                    actualCost: 0.005, // Generic cost estimate
                    refundAmount: 2.495, // Generic refund estimate
                    transactionHash: undefined, // No transaction hash for old messages
                  }
                : undefined,
            } as ChatMessage;
          })
      : [];

  // Use persisted messages if a thread is selected, otherwise use local state
  const displayMessages: ChatMessage[] = currentThreadId
    ? persistedMessages // Show thread messages (now with payment info)
    : chatMessages; // Show local messages when no thread selected

  const handleSendMessage = async () => {
    if (!message.trim() || isLoading || !user) return;

    // Check wallet balance before making the API call
    if (hasInsufficientFunds) {
      toast({
        title: "💰 Insufficient Funds",
        description: `You need at least 2.5 ${tokenSymbol.toUpperCase()} to send a message. Your current balance is ${balance.toFixed(
          2
        )} ${tokenSymbol.toUpperCase()}. Please add more funds to your wallet.`,
        variant: "destructive",
      });
      return;
    }

    // If balance is still loading, wait a moment and check again
    if (isCheckingBalance) {
      toast({
        title: "🔍 Checking Balance",
        description: "Please wait while we verify your wallet balance...",
      });

      // Refresh balance and try again
      await checkBalance();

      // Check again after refresh
      if (hasInsufficientFunds) {
        toast({
          title: "💰 Insufficient Funds",
          description: `You need at least 2.5 ${tokenSymbol.toUpperCase()} to send a message. Your current balance is ${balance.toFixed(
            2
          )} ${tokenSymbol.toUpperCase()}. Please add more funds to your wallet.`,
          variant: "destructive",
        });
        return;
      }
    }

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
      // Find user's Solana wallet for refunds
      const solanaWallet = wallets.find(
        (wallet) =>
          wallet.walletClientType === "phantom" ||
          wallet.walletClientType === "solflare" ||
          wallet.walletClientType === "backpack" ||
          wallet.walletClientType === "privy" ||
          (wallet.address && wallet.address.length > 30)
      );

      // Safety check: ensure we have a wallet address for refunds
      if (!solanaWallet?.address) {
        toast({
          title: "🔗 Wallet Required",
          description:
            "Please connect a Solana wallet to use paid features with refunds. Your payment will be processed securely.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // Show payment processing toast
      toast({
        title: "💳 Processing Payment",
        description:
          "Initializing secure payment... This may take a few moments.",
      });

      // Use x402 payment system via API route instead of direct Convex calls
      const requestBody = {
        prompt: userMessage,
        model: selectedModel,
        userId: user.id,
        systemEnhancement: selectedQuickAction?.systemEnhancement,
        userWalletAddress: solanaWallet.address, // Always include for refunds
        ...(currentThreadId && { threadId: currentThreadId }),
      };

      const response = await makePaymentRequest("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      // Handle the response based on whether it's a new thread or continuation
      let aiResponseText: string;
      let newThreadId: string | undefined;
      let paymentInfo = null;

      if (currentThreadId) {
        // Continue existing thread - API now returns { text, paymentInfo }
        if (typeof result === "string") {
          aiResponseText = result;
        } else {
          aiResponseText = result.text || "No response";
          paymentInfo = result.paymentInfo;
        }
      } else {
        // Create new thread - API returns { threadId, text, paymentInfo }
        aiResponseText = result.text || "No response";
        newThreadId = result.threadId;
        paymentInfo = result.paymentInfo;

        // Notify parent component about the new thread
        if (newThreadId) {
          onThreadChange?.(newThreadId);
        }
      }

      // Add AI response to chat
      const aiChatMessage = {
        key: `ai-${Date.now()}`,
        role: "assistant" as const,
        content: aiResponseText,
        status: "complete" as const,
        ...(paymentInfo && { paymentInfo }),
      };

      setChatMessages((prev) => [...prev, aiChatMessage]);

      // Show success toast with payment info
      if (paymentInfo) {
        toast({
          title: "✅ Message Sent Successfully",
          description: `Payment processed! Cost: $${
            paymentInfo.actualCost?.toFixed(4) || "N/A"
          }, Refund: $${paymentInfo.refundAmount?.toFixed(4) || "N/A"}`,
          variant: "success",
        });
      } else {
        toast({
          title: "✅ Message Sent",
          description: "Your message was sent successfully!",
          variant: "success",
        });
      }

      // Clear selected quick action after successful message
      setSelectedQuickAction(null);
    } catch (error) {
      console.error("Error sending message:", error);

      // Determine error type and show appropriate toast
      let errorTitle = "❌ Request Failed";
      let errorDescription = "Something went wrong. Please try again.";

      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();

        if (errorMessage.includes("payment") || errorMessage.includes("x402")) {
          errorTitle = "💳 Payment Error";
          errorDescription =
            "Payment processing failed. Please check your wallet and try again.";
        } else if (
          errorMessage.includes("network") ||
          errorMessage.includes("connection")
        ) {
          errorTitle = "🌐 Connection Error";
          errorDescription =
            "Network connection issue. Please check your internet and try again.";
        } else if (errorMessage.includes("insufficient")) {
          errorTitle = "💰 Insufficient Funds";
          errorDescription =
            "Not enough funds for this transaction. Please add more tokens to your wallet.";
        } else if (errorMessage.includes("wallet")) {
          errorTitle = "🔗 Wallet Error";
          errorDescription =
            "Wallet connection issue. Please reconnect your wallet and try again.";
        } else if (errorMessage.includes("timeout")) {
          errorTitle = "⏱️ Request Timeout";
          errorDescription =
            "Request took too long. Please try again with a shorter message.";
        } else if (errorMessage.includes("http 402")) {
          errorTitle = "💳 Payment Required";
          errorDescription = "Payment authorization failed. Please try again.";
        } else if (errorMessage.includes("http 500")) {
          errorTitle = "🔧 Server Error";
          errorDescription =
            "Our servers are experiencing issues. Please try again in a moment.";
        } else if (errorMessage.includes("http")) {
          errorTitle = "🌐 Request Error";
          errorDescription = `Request failed (${error.message}). Please try again.`;
        }
      }

      toast({
        title: errorTitle,
        description: errorDescription,
        variant: "destructive",
      });

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
    <div className="p-4 sm:p-6 lg:p-12 max-w-5xl mx-auto">
      <div className="mb-8 lg:mb-16">
        <button
          onClick={onNewBlankThread}
          className="flex items-center gap-3 lg:gap-4 mb-4 hover:opacity-80 transition-opacity cursor-pointer"
        >
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl bg-gradient-to-r from-accent to-primary flex items-center justify-center shadow-lg">
            <img
              src="/gpthree-logo-white.svg"
              alt="GPThree"
              className="h-6 w-6 lg:h-8 lg:w-8"
            />
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-5xl font-light text-foreground tracking-tight">
            GPThree
          </h1>
        </button>
        <p className="text-muted-foreground text-base lg:text-lg font-light ml-12 lg:ml-16">
          Privacy-first AI intelligence
        </p>
      </div>

      {/* Privacy Banner */}
      <PrivacyBanner />

      {/* Debug components - commented out for production */}
      {/* <WalletDebug /> */}

      {/* x402 Payment Test - Development Only */}
      {/* <div className="mb-8">
        <PaymentTest />
      </div> */}

      {/* Chat History */}
      {displayMessages.length > 0 && (
        <div className="mb-8 lg:mb-12 space-y-4 lg:space-y-6">
          {displayMessages.map((msg) => (
            <div
              key={msg.key}
              className={`${
                msg.role === "user"
                  ? "ml-4 sm:ml-8 lg:ml-12"
                  : "mr-4 sm:mr-8 lg:mr-12"
              }`}
            >
              <div
                className={`text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide ${
                  msg.role === "user" ? "text-right" : "text-left"
                }`}
              >
                {msg.role === "user" ? "You" : "GPThree"}
              </div>
              <div
                className={`p-4 lg:p-6 rounded-2xl lg:rounded-3xl ${
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

                {/* Payment info bubble - for all AI messages */}
                {msg.role === "assistant" && (
                  <div className="mt-3 flex items-center gap-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full text-xs text-green-600">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="font-medium">
                        {msg.paymentInfo
                          ? `Paid with USDC $${
                              msg.paymentInfo.actualCost < 0.01
                                ? msg.paymentInfo.actualCost.toFixed(6)
                                : msg.paymentInfo.actualCost.toFixed(4)
                            }`
                          : "Paid with USDC"}
                      </span>
                      {msg.paymentInfo?.transactionHash && (
                        <a
                          href={`https://explorer.solana.com/tx/${
                            msg.paymentInfo.transactionHash
                          }${
                            process.env.NEXT_PUBLIC_NETWORK === "solana-devnet"
                              ? "?cluster=devnet"
                              : ""
                          }`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-500 hover:text-green-400 transition-colors"
                          title="View transaction on Solana Explorer"
                        >
                          ↗️
                        </a>
                      )}
                    </div>
                    {msg.paymentInfo && msg.paymentInfo.refundAmount > 0 && (
                      <div className="text-xs text-muted-foreground">
                        ($
                        {msg.paymentInfo.refundAmount < 0.01
                          ? msg.paymentInfo.refundAmount.toFixed(6)
                          : msg.paymentInfo.refundAmount.toFixed(3)}{" "}
                        refunded)
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="mb-8 lg:mb-12 mr-4 sm:mr-8 lg:mr-12">
          <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            GPThree
          </div>
          <div className="p-4 lg:p-6 rounded-2xl lg:rounded-3xl bg-card border border-border text-card-foreground shadow-sm mr-auto">
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
      <div className="space-y-4 lg:space-y-6">
        <div className="flex gap-2 lg:gap-4">
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
              className="h-12 lg:h-14 px-4 lg:px-6 text-sm lg:text-base rounded-xl lg:rounded-2xl border-border/50 bg-card/50 backdrop-blur-sm focus:border-primary/50 focus:ring-primary/20"
              disabled={isLoading}
            />
          </div>
          <Button
            onClick={handleSendMessage}
            disabled={!message.trim() || isLoading || hasInsufficientFunds}
            size="lg"
            className="h-12 lg:h-14 px-4 lg:px-8 rounded-xl lg:rounded-2xl bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50"
            title={
              hasInsufficientFunds
                ? `Insufficient ${tokenSymbol.toUpperCase()} balance`
                : undefined
            }
          >
            <Send className="h-4 w-4 lg:h-5 lg:w-5" />
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-4">
            {selectedQuickAction && (
              <div className="flex items-center gap-2 text-primary">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                <span className="text-xs">
                  {selectedQuickAction.text} mode active
                </span>
                <button
                  onClick={() => {
                    setSelectedQuickAction(null);
                    setMessage("");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground ml-2 underline"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Balance indicator */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isCheckingBalance
                      ? "bg-yellow-500 animate-pulse"
                      : hasInsufficientFunds
                      ? "bg-red-500"
                      : "bg-green-500"
                  }`}
                ></div>
                <span
                  className={`text-xs ${
                    hasInsufficientFunds ? "text-red-400" : "text-green-400"
                  }`}
                >
                  {isCheckingBalance
                    ? "Checking..."
                    : `${balance.toFixed(2)} ${tokenSymbol.toUpperCase()}`}
                </span>
                {/* Refresh balance button */}
                <button
                  onClick={async () => {
                    await checkBalance();
                    if (!isCheckingBalance) {
                      toast({
                        title: "💰 Balance Updated",
                        description: `Current balance: ${balance.toFixed(
                          2
                        )} ${tokenSymbol.toUpperCase()}`,
                        variant: "success",
                      });
                    }
                  }}
                  disabled={isCheckingBalance}
                  className={`ml-1 p-1 rounded-full hover:bg-muted/50 transition-colors ${
                    isCheckingBalance
                      ? "cursor-not-allowed"
                      : "hover:text-primary"
                  }`}
                  title="Refresh balance"
                >
                  <RefreshCw
                    className={`h-3 w-3 ${
                      isCheckingBalance
                        ? "animate-spin text-muted-foreground"
                        : ""
                    }`}
                  />
                </button>
              </div>
              {hasInsufficientFunds && !isCheckingBalance && (
                <p className="text-xs text-red-400">
                  (Minimum 2.5 {tokenSymbol.toUpperCase()} balance required.)
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-x-2 lg:gap-x-3 w-full sm:w-auto justify-end">
            <div className="text-muted-foreground text-xs lg:text-sm">
              Select Model
            </div>
            <ModelSelector
              selectedModel={selectedModel}
              onModelSelect={setSelectedModel}
              className="w-40 lg:w-48"
            />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      {displayMessages.length === 0 && (
        <div className="mt-8 lg:mt-12 mb-8 lg:mb-12">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 lg:mb-6">
            Quick Start
          </h3>
          <div className="grid sm:grid-cols-2 gap-3 lg:gap-4">
            {QUICK_START_ACTIONS.map((action, index) => (
              <button
                key={action.text}
                onClick={() => {
                  setSelectedQuickAction(action);
                }}
                className={`group relative overflow-hidden rounded-xl lg:rounded-2xl bg-gradient-to-br p-4 lg:p-6 text-left transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:scale-[1.02] ${
                  selectedQuickAction?.text === action.text
                    ? "from-primary/20 to-primary/10 border-primary/40 shadow-lg shadow-primary/10"
                    : "from-card/50 to-card border border-border/50 hover:border-primary/20"
                }`}
              >
                <div className="relative z-10">
                  <div className="flex items-center gap-2 lg:gap-3 mb-2 lg:mb-3">
                    <div className="text-xl lg:text-2xl">
                      {index === 0
                        ? "🔍"
                        : index === 1
                        ? "📊"
                        : index === 2
                        ? "📚"
                        : "✍️"}
                    </div>
                    <h4
                      className={`font-medium text-sm lg:text-base transition-colors ${
                        selectedQuickAction?.text === action.text
                          ? "text-primary"
                          : "text-foreground group-hover:text-primary"
                      }`}
                    >
                      {action.text}
                      {selectedQuickAction?.text === action.text && (
                        <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-1 rounded-full">
                          Active
                        </span>
                      )}
                    </h4>
                  </div>
                  <p className="text-xs lg:text-sm text-muted-foreground leading-relaxed">
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
