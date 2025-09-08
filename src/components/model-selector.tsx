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
  const [error, setError] = useState<string | null>(null);

  // Load models on component mount
  useEffect(() => {
    async function loadModels() {
      try {
        setIsLoading(true);
        setError(null);
        const models = await fetchOpenRouterModels();
        setModelCategories(models);
      } catch (err) {
        console.error('Failed to load OpenRouter models, using fallback:', err);
        setError('Using cached models');
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
    switch (model.privacyLevel) {
      case "privacy-first":
        return `Privacy Protected: Zero data retention, does not train on your data`;
      case "warning":
        return `Privacy Warning: ${model.provider} may retain data and train on your prompts. Consider using privacy-first alternatives above.`;
      default:
        return `Privacy Unknown: Check ${model.provider}'s privacy policy`;
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
        <SelectContent className="bg-popover border border-border rounded-xl shadow-lg max-w-sm">
          {isLoading ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">Loading models...</span>
            </div>
          ) : modelCategories.length === 0 ? (
            <div className="flex items-center justify-center p-6">
              <span className="text-sm text-muted-foreground">No models available</span>
            </div>
          ) : (
            modelCategories.map((category) => {
              // Map icon string to icon component
              const IconComponent = 
                category.icon === "shield" ? Shield :
                category.icon === "user-check" ? UserCheck :
                category.icon === "alert-triangle" ? AlertTriangle :
                Eye;
              
              return (
                <SelectGroup key={category.label}>
                  <SelectLabel className={`flex items-center gap-2 px-3 py-2 text-xs font-medium uppercase tracking-wide border-b border-border ${
                    category.label.includes("Warning") 
                      ? "text-red-400 bg-red-50/10" 
                      : category.label.includes("Privacy First") 
                      ? "text-green-400 bg-green-50/10" 
                      : "text-blue-400 bg-blue-50/10"
                  }`}>
                    <IconComponent className="h-3 w-3" />
                    {category.label}
                  </SelectLabel>
              {category.models.map((model) => (
                <SelectItem
                  key={model.id}
                  value={model.id}
                  className={`px-3 py-3 hover:bg-accent/20 focus:bg-accent/20 cursor-pointer ${
                    model.privacyLevel === "warning" ? "border-l-2 border-red-500/30" : 
                    model.privacyLevel === "privacy-first" ? "border-l-2 border-green-500/30" : ""
                  }`}
                >
                  <div className="flex flex-col gap-1.5 w-full">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-popover-foreground">
                          {model.name}
                        </span>
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
                      </div>
                      {model.badge && (
                        <span className="text-xs bg-secondary/20 text-secondary px-2 py-0.5 rounded-full font-light">
                          {model.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-light">
                      {model.provider} • {model.pricing} per 1M tokens
                    </div>
                    <div className="text-xs text-muted-foreground/80 font-light leading-relaxed max-w-[300px]">
                      {model.description}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        model.dataRetention === "zero" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
                        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                      }`}>
                        {model.dataRetention === "zero" ? "Zero Retention" : "Data Retained"}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        !model.trainsOnData ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
                        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                      }`}>
                        {!model.trainsOnData ? "No Training" : "May Train"}
                      </span>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </TooltipProvider>
  );
}
