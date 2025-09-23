"use client";

import {
  Shield,
  AlertTriangle,
  Eye,
  UserCheck,
  Loader2,
  Search,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { useState, useEffect, useMemo, useRef } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import {
  fetchOpenRouterModels,
  getFallbackModels,
  type ModelCategory,
  type ProcessedModel,
  type PrivacyLevel,
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
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search query with 300ms delay
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Load models on component mount
  useEffect(() => {
    async function loadModels() {
      try {
        setIsLoading(true);
        const models = await fetchOpenRouterModels();
        setModelCategories(models);
      } catch (err) {
        console.error("Failed to load OpenRouter models, using fallback:", err);
        setModelCategories(getFallbackModels());
      } finally {
        setIsLoading(false);
      }
    }

    loadModels();
  }, []);

  // Clear search when a model is selected
  useEffect(() => {
    if (selectedModel) {
      setSearchQuery("");
    }
  }, [selectedModel]);

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
    const gptThreeNotice =
      "GPThree: No chat logs stored, access logs deleted daily.";

    switch (model.privacyLevel) {
      case "privacy-first":
        return `${gptThreeNotice} Model: Zero data retention, does not train on your data`;
      case "warning":
        return `${gptThreeNotice} Model Warning: ${model.provider} may retain data and train on your prompts. Consider privacy-first alternatives above.`;
      default:
        return `${gptThreeNotice} Model Privacy: Check ${model.provider}'s privacy policy`;
    }
  };

  // Filter models based on debounced search query
  const filteredModelCategories = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return modelCategories;

    const query = debouncedSearchQuery.toLowerCase().trim();
    return modelCategories
      .map((category) => ({
        ...category,
        models: category.models.filter(
          (model) =>
            model.name.toLowerCase().includes(query) ||
            model.provider.toLowerCase().includes(query) ||
            model.description.toLowerCase().includes(query) ||
            model.id.toLowerCase().includes(query)
        ),
      }))
      .filter((category) => category.models.length > 0);
  }, [modelCategories, debouncedSearchQuery]);

  return (
    <TooltipProvider>
      <Select
        value={selectedModel}
        onValueChange={(value) => {
          onModelSelect(value);
          setIsOpen(false);
        }}
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) {
            setSearchQuery("");
          }
        }}
      >
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
          className="w-[420px] max-h-96 bg-popover border border-border rounded-xl shadow-lg overflow-hidden"
          sideOffset={8}
          onKeyDown={(e) => {
            // prevent Select's built-in typeahead when search input is focused
            if (searchInputRef.current === document.activeElement) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          {/* Search Bar */}
          <div
            className="sticky top-0 bg-popover border-b border-border/30 p-3"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <Search
                className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 transition-colors ${
                  searchQuery !== debouncedSearchQuery
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              />
              <Input
                ref={searchInputRef}
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Prevent Select component from handling these keys
                  e.stopPropagation();

                  // Handle Escape to clear search or close dropdown
                  if (e.key === "Escape") {
                    if (searchQuery) {
                      setSearchQuery("");
                    } else {
                      setIsOpen(false);
                    }
                  }

                  // Prevent arrow keys from being handled by Select
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.stopPropagation();
                  }
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
                autoFocus
                className="pl-9 h-9 bg-background/50 border-border/50 focus:border-primary/50 text-sm placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Models List */}
          <div className="overflow-y-auto max-h-80">
            {isLoading ? (
              <div className="flex items-center justify-center p-6">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">
                  Loading models...
                </span>
              </div>
            ) : filteredModelCategories.length === 0 ? (
              <div className="flex items-center justify-center p-6">
                <div className="text-center space-y-2">
                  <span className="text-sm text-muted-foreground">
                    No models found
                  </span>
                  {searchQuery && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSearchQuery("");
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="text-xs text-primary hover:text-primary/80 underline"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              </div>
            ) : (
              filteredModelCategories.map((category) => {
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
                        className={`px-3 py-3 hover:bg-accent/20 focus:bg-accent/20 cursor-pointer ${
                          model.privacyLevel === "warning"
                            ? "border-l-2 border-red-500/30"
                            : model.privacyLevel === "privacy-first"
                            ? "border-l-2 border-green-500/30"
                            : ""
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
          </div>
        </SelectContent>
      </Select>
    </TooltipProvider>
  );
}
