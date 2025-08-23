"use client";

import { Brain, Zap, DollarSign, Crown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Model {
  id: string;
  name: string;
  provider: string;
  pricing: string;
  description: string;
  badge?: string;
}

interface ModelCategory {
  label: string;
  icon: any;
  models: Model[];
}

// Model categories based on OpenRouter trending data and capabilities
const modelCategories: ModelCategory[] = [
  {
    label: "🏆 Most Popular",
    icon: Crown,
    models: [
      {
        id: "anthropic/claude-3.7-sonnet",
        name: "Claude 3.7 Sonnet",
        provider: "Anthropic",
        pricing: "$3.00 / $15.00",
        description:
          "Latest Claude with enhanced reasoning - top choice for complex tasks",
        badge: "🔥 Trending",
      },
      {
        id: "google/gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        provider: "Google",
        pricing: "$0.50 / $2.00",
        description: "Google's powerful model with large context window",
        badge: "📈 Rising",
      },
      {
        id: "deepseek/deepseek-chat-v3-0324",
        name: "DeepSeek V3",
        provider: "DeepSeek",
        pricing: "$0.15 / $0.60",
        description: "Excellent reasoning at competitive price point",
        badge: "💎 Value",
      },
    ],
  },
  {
    label: "⚡ High Performance",
    icon: Brain,
    models: [
      {
        id: "anthropic/claude-3.5-sonnet",
        name: "Claude 3.5 Sonnet",
        provider: "Anthropic",
        pricing: "$3.00 / $15.00",
        description: "Proven reliability for complex analytical tasks",
      },
      {
        id: "openai/gpt-4o",
        name: "GPT-4o",
        provider: "OpenAI",
        pricing: "$2.50 / $10.00",
        description: "OpenAI's multimodal flagship model",
      },
      {
        id: "qwen/qwen3-32b",
        name: "Qwen3 32B",
        provider: "Qwen",
        pricing: "$0.27 / $0.27",
        description: "Dense model with thinking mode capabilities",
      },
    ],
  },
  {
    label: "💰 Cost Effective",
    icon: DollarSign,
    models: [
      {
        id: "openai/gpt-4o-mini",
        name: "GPT-4o Mini",
        provider: "OpenAI",
        pricing: "$0.15 / $0.60",
        description: "Great balance of capability and cost",
      },
      {
        id: "qwen/qwen3-14b",
        name: "Qwen3 14B",
        provider: "Qwen",
        pricing: "$0.06 / $0.24",
        description: "Efficient model for general purpose tasks",
      },
      {
        id: "meta-llama/llama-3.3-70b",
        name: "Llama 3.3 70B",
        provider: "Meta",
        pricing: "$0.27 / $0.27",
        description: "Open source powerhouse",
      },
    ],
  },
  {
    label: "🚀 Specialized",
    icon: Zap,
    models: [
      {
        id: "anthropic/claude-3.7-sonnet:thinking",
        name: "Claude 3.7 Sonnet (Thinking)",
        provider: "Anthropic",
        pricing: "$3.00 / $15.00",
        description: "Extended reasoning mode for complex analysis",
      },
      {
        id: "qwen/qwen3-30b-a3b",
        name: "Qwen3 30B A3B",
        provider: "Qwen",
        pricing: "$0.08 / $0.29",
        description: "MoE architecture with dual reasoning modes",
      },
      {
        id: "openai/gpt-4o-search-preview",
        name: "GPT-4o Search",
        provider: "OpenAI",
        pricing: "$2.50 / $10.00",
        description: "Specialized for web search and real-time data",
      },
    ],
  },
];

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

  return (
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
        {modelCategories.map((category) => (
          <SelectGroup key={category.label}>
            <SelectLabel className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border">
              <category.icon className="h-3 w-3" />
              {category.label}
            </SelectLabel>
            {category.models.map((model) => (
              <SelectItem
                key={model.id}
                value={model.id}
                className="px-3 py-3 hover:bg-accent/20 focus:bg-accent/20 cursor-pointer"
              >
                <div className="flex flex-col gap-1.5 w-full">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-popover-foreground">
                      {model.name}
                    </span>
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
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
