"use client";

import { Shield, Eye, Clock, Trash2, X, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface PrivacyBannerProps {
  className?: string;
}

export function PrivacyBanner({ className }: PrivacyBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsDismissed(false)}
        className="fixed bottom-4 right-4 z-50 bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 text-green-600"
      >
        <Shield className="h-4 w-4 mr-2" />
        Privacy Info
      </Button>
    );
  }

  return (
    <div
      className={`bg-green-500/5 border border-green-500/20 rounded-xl p-4 mb-6 ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-green-600">
              Privacy Protected
            </span>
          </div>
          <div className="text-xs sm:text-sm text-muted-foreground">
            No chat logs • Daily log deletion
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-green-600 hover:text-green-700 hover:bg-green-500/10"
          >
            <Info className="h-4 w-4 mr-1" />
            {isExpanded ? "Less" : "Details"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDismissed(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-green-500/10">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-1">
                <Trash2 className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <div className="text-sm font-medium text-foreground mb-1">
                  Zero Chat Retention
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  GPThree does not store or log any chat conversations. All
                  messages are processed in real-time and immediately discarded.
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1">
                <Clock className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <div className="text-sm font-medium text-foreground mb-1">
                  Daily Log Purge
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  All server access logs are automatically deleted every 24
                  hours. No long-term tracking or analytics.
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1">
                <Eye className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <div className="text-sm font-medium text-foreground mb-1">
                  Privacy-First Models
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  We prioritize AI models with zero data retention and highlight
                  privacy policies for every model.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-green-500/10">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Technical Details:</span> Chat
              processing is ephemeral, wallet authentication via Privy
              (non-custodial), and we recommend privacy-first AI models like
              Claude and privacy-enabled providers by default.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
