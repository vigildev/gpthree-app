"use client";

import { Shield, AlertTriangle, Eye, UserCheck, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import {
  fetchOpenRouterModels,
  getFallbackModels,
  type ModelCategory,
  type ProcessedModel,
  type PrivacyLevel
} from "@/lib/openrouter-models";

interface ModelSelectorProps {
  selectedModel?: string;
  onModelSelect: (modelId: string) => void;
  className?: string;
}

export function ModelSelector({
  selectedModel,
  onModelSelect,
  className,
}: ModelSelectorProps) {
  const [modelCategories, setModelCategories] = useState<ModelCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load models on component mount
  useEffect(() => {
    async function loadModels() {
      try {
        setIsLoading(true);
        const models = await fetchOpenRouterModels();
        setModelCategories(models);
      } catch (err) {
        console.error('Failed to load OpenRouter models, using fallback:', err);
        setModelCategories(getFallbackModels());
      } finally {
        setIsLoading(false);
      }
    }

    loadModels();
  }, []);

  // Find selected model details for display
  const getSelectedModelDisplay = () => {
    for (const category of modelCategories) {
      const model = category.models.find((m) => m.id === selectedModel);
      if (model) {
        return model.name;
      }
    }
    return "Select Model";
  };

  const getPrivacyIcon = (privacyLevel: PrivacyLevel) => {
    switch (privacyLevel) {
      case "privacy-first":
        return <Shield className="h-3 w-3 text-green-500" />;
      case "warning":
        return <AlertTriangle className="h-3 w-3 text-red-500" />;
      default:
        return <Eye className="h-3 w-3 text-yellow-500" />;
    }
  };

  const getPrivacyTooltip = (model: ProcessedModel) => {
    const gptThreeNotice = "GPThree: No chat logs stored, access logs deleted daily.";

    switch (model.privacyLevel) {
      case "privacy-first":
        return `${gptThreeNotice} Model: Zero data retention, does not train on your data`;
      case "warning":
        return `${gptThreeNotice} Model Warning: ${model.provider} may retain data and train on your prompts. Consider privacy-first alternatives above.`;
      default:
        return `${gptThreeNotice} Model Privacy: Check ${model.provider}'s privacy policy`;
    }
  };

  return (
    <TooltipProvider>
      <Select value={selectedModel} onValueChange={onModelSelect}>
        <SelectTrigger
          className={`${className} bg-card hover:bg-muted border border-border hover:border-primary/50 rounded-lg text-xs font-light text-card-foreground shadow-none focus:ring-0 focus:border-primary transition-colors`}
        >
          <SelectValue placeholder="Select Model">
            <span className="text-card-foreground font-light">
              {getSelectedModelDisplay()}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          className="max-h-96 overflow-y-auto bg-popover border border-border rounded-xl shadow-lg"
          sideOffset={8}
        >
          {isLoading ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">Loading models...</span>
            </div>
          ) : (
            modelCategories.map((category) => {
              // Map icon string to icon component
              const IconComponent =
                category.icon === "shield"
                  ? Shield
                  : category.icon === "user-check"
                    ? UserCheck
                    : Eye;

              return (
                <SelectGroup key={category.label}>
                  <SelectLabel className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border/30 bg-muted/30">
                    <IconComponent className="h-3 w-3" />
                    {category.label}
                  </SelectLabel>
                  {category.models.map((model) => (
                    <SelectItem
                      key={model.id}
                      value={model.id}
                      className={`px-3 py-3 hover:bg-accent/20 focus:bg-accent/20 cursor-pointer ${model.privacyLevel === "warning" ? "border-l-2 border-red-500/30" :
                        model.privacyLevel === "privacy-first" ? "border-l-2 border-green-500/30" : ""
                        }`}
                    >
                      <div className="flex flex-col gap-2 w-full">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-popover-foreground truncate flex-1 min-w-0">
                            {model.name}
                          </span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="cursor-help">
                                  {getPrivacyIcon(model.privacyLevel)}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p>{getPrivacyTooltip(model)}</p>
                              </TooltipContent>
                            </Tooltip>
                            {model.badge && (
                              <span className="text-xs text-muted-foreground font-light whitespace-nowrap">
                                {model.badge}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground font-light">
                          {model.provider} • {model.pricing} per 1M tokens
                        </div>
                        <div className="text-xs text-muted-foreground/80 font-light leading-relaxed max-w-[300px]">
                          {model.description}
                        </div>
                        <div className="flex items-center gap-2">
                          {model.contextLength && (
                            <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-md">
                              {model.contextLength.toLocaleString()} tokens
                            </span>
                          )}
                          {model.dataRetention === "zero" && (
                            <span className="text-xs bg-green-500/10 text-green-600 px-2 py-1 rounded-md">
                              Zero Retention
                            </span>
                          )}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              );
            })
          )}
        </SelectContent>
      </Select>
    </TooltipProvider>
  );
}
