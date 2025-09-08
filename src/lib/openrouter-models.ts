/**
 * OpenRouter API service for fetching dynamic model data
 */

export interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  architecture: {
    tokenizer?: string;
    instruct_type?: string;
    modality?: string;
  };
  pricing: {
    prompt: string;
    completion: string;
    image?: string;
    request?: string;
  };
  top_provider?: {
    max_completion_tokens?: number;
    is_moderated: boolean;
  };
  per_request_limits?: {
    prompt_tokens?: string;
    completion_tokens?: string;
  };
}

export interface OpenRouterApiResponse {
  data: OpenRouterModel[];
}

export interface ZDRApiResponse {
  data: Array<{ 
    name: string; // Format: "Provider | model/id"
    model_name: string;
    context_length: number;
    pricing: any;
    provider_name: string;
    [key: string]: any;
  }>;
}

export type PrivacyLevel = "privacy-first" | "standard" | "warning";
export type DataRetention = "zero" | "limited" | "standard" | "unknown";

export interface ProcessedModel {
  id: string;
  name: string;
  provider: string;
  pricing: string;
  description: string;
  badge?: string;
  privacyLevel: PrivacyLevel;
  dataRetention: DataRetention;
  trainsOnData: boolean;
  contextLength: number;
  originalData: OpenRouterModel;
}

export interface ModelCategory {
  label: string;
  icon: string;
  models: ProcessedModel[];
}

/**
 * Privacy classification logic using OpenRouter's ZDR API data
 */
function classifyModelPrivacy(model: OpenRouterModel, zdrModels: string[]): {
  privacyLevel: PrivacyLevel;
  dataRetention: DataRetention;
  trainsOnData: boolean;
} {
  const modelId = model.id;
  const provider = modelId.split('/')[0].toLowerCase();
  
  // Use ZDR API data as the authoritative source
  const isZDRVerified = zdrModels.includes(modelId);
  
  if (isZDRVerified) {
    return {
      privacyLevel: "privacy-first",
      dataRetention: "zero",
      trainsOnData: false
    };
  }
  
  // Known providers that may train on data (even if not ZDR)
  const knownTrainingProviders = [
    'openai',
    'google',
    'cohere'
  ];
  
  if (knownTrainingProviders.includes(provider)) {
    return {
      privacyLevel: "warning",
      dataRetention: "standard",
      trainsOnData: true
    };
  }
  
  // Default for providers not in ZDR list and not known training providers
  return {
    privacyLevel: "standard",
    dataRetention: "unknown",
    trainsOnData: false
  };
}

/**
 * Generate pricing display string from OpenRouter pricing data
 */
function formatPricing(pricing: OpenRouterModel['pricing']): string {
  const prompt = parseFloat(pricing.prompt);
  const completion = parseFloat(pricing.completion);

  // Convert from per-token to per-1M-token pricing
  const promptPer1M = (prompt * 1000000).toFixed(2);
  const completionPer1M = (completion * 1000000).toFixed(2);

  return `$${promptPer1M} / $${completionPer1M}`;
}

/**
 * Generate model description based on provider and characteristics
 */
function generateDescription(model: OpenRouterModel): string {
  const provider = model.id.split('/')[0];
  const modelName = model.name.toLowerCase();

  // Custom descriptions for popular models
  if (modelName.includes('claude') && modelName.includes('3.5')) {
    return "Proven reliability for complex analytical tasks";
  }
  if (modelName.includes('claude') && modelName.includes('thinking')) {
    return "Extended reasoning mode for complex analysis";
  }
  if (modelName.includes('gpt-4o') && !modelName.includes('mini')) {
    return "OpenAI's multimodal flagship model";
  }
  if (modelName.includes('gpt-4o-mini')) {
    return "Great balance of capability and cost";
  }
  if (modelName.includes('deepseek')) {
    return "Excellent reasoning at competitive price point";
  }
  if (modelName.includes('llama')) {
    return "Open source powerhouse";
  }
  if (modelName.includes('gemini')) {
    return "Google's powerful model with large context window";
  }

  // Default description based on provider
  const providerDescriptions: Record<string, string> = {
    'anthropic': 'Advanced reasoning and analysis capabilities',
    'openai': 'Versatile general-purpose model',
    'google': 'Multimodal capabilities with large context window',
    'deepseek': 'Cost-effective model with strong reasoning',
    'meta-llama': 'Open source model with broad capabilities',
    'mistralai': 'Efficient European AI model',
    'qwen': 'Advanced Chinese language model with global capabilities'
  };

  return providerDescriptions[provider] || `${provider} model with ${model.context_length?.toLocaleString() || 'unknown'} token context`;
}

/**
 * Assign trending/value badges based on model characteristics
 */
function assignBadge(model: OpenRouterModel): string | undefined {
  const modelName = model.name.toLowerCase();
  const pricing = parseFloat(model.pricing.prompt) * 1000000; // Convert to per-1M pricing

  // Trending models
  if (modelName.includes('3.7') || modelName.includes('gpt-4o') || modelName.includes('gemini-2')) {
    return "🔥 Trending";
  }

  // Value models (under $1 per 1M prompt tokens)
  if (pricing < 1) {
    return "💎 Value";
  }

  // Rising models
  if (modelName.includes('qwen3') || modelName.includes('deepseek-v3')) {
    return "📈 Rising";
  }

  return undefined;
}

/**
 * Process OpenRouter model data into our app format
 */
function processModels(openRouterModels: OpenRouterModel[], zdrModels: string[]): ProcessedModel[] {
  return openRouterModels.map(model => {
    const privacy = classifyModelPrivacy(model, zdrModels);
    const provider = model.id.split('/')[0];
    const displayProvider = provider.charAt(0).toUpperCase() + provider.slice(1);

    return {
      id: model.id,
      name: model.name,
      provider: displayProvider,
      pricing: formatPricing(model.pricing),
      description: generateDescription(model),
      badge: assignBadge(model),
      privacyLevel: privacy.privacyLevel,
      dataRetention: privacy.dataRetention,
      trainsOnData: privacy.trainsOnData,
      contextLength: model.context_length || 0,
      originalData: model
    };
  });
}

/**
 * Group processed models into privacy-based categories
 */
function categorizeModels(models: ProcessedModel[]): ModelCategory[] {
  const privacyFirst = models
    .filter(m => m.privacyLevel === "privacy-first")
    .sort((a, b) => {
      // Sort by provider preference, then by pricing
      const providerOrder = ['Anthropic', 'Deepseek', 'Meta-llama', 'Qwen', 'Mistralai'];
      const aProviderIndex = providerOrder.indexOf(a.provider);
      const bProviderIndex = providerOrder.indexOf(b.provider);

      if (aProviderIndex !== bProviderIndex) {
        return (aProviderIndex === -1 ? 999 : aProviderIndex) - (bProviderIndex === -1 ? 999 : bProviderIndex);
      }

      // Sort by price within same provider
      const aPricing = parseFloat(a.pricing.split(' / ')[0].replace('$', ''));
      const bPricing = parseFloat(b.pricing.split(' / ')[0].replace('$', ''));
      return bPricing - aPricing; // Higher price first (premium models)
    });

  const openSource = privacyFirst.filter(m =>
    m.provider === 'Meta-llama' ||
    m.provider === 'Qwen' ||
    m.provider === 'Mistralai'
  );

  const proprietaryPrivacy = privacyFirst.filter(m =>
    !openSource.some(os => os.id === m.id)
  );

  const warnings = models
    .filter(m => m.privacyLevel === "warning")
    .sort((a, b) => {
      // Sort warnings by popularity/capability
      if (a.provider === 'Openai' && b.provider !== 'Openai') return -1;
      if (b.provider === 'Openai' && a.provider !== 'Openai') return 1;
      return a.name.localeCompare(b.name);
    });

  const categories: ModelCategory[] = [];

  if (proprietaryPrivacy.length > 0) {
    categories.push({
      label: "🛡️ Privacy First (Zero Retention)",
      icon: "shield",
      models: proprietaryPrivacy
    });
  }

  if (openSource.length > 0) {
    categories.push({
      label: "🔐 Open Source Privacy",
      icon: "user-check",
      models: openSource
    });
  }

  if (warnings.length > 0) {
    categories.push({
      label: "⚠️ Privacy Warning (May Train on Data)",
      icon: "alert-triangle",
      models: warnings
    });
  }

  return categories;
}

/**
 * Cache for OpenRouter models data
 */
let modelsCache: {
  data: ModelCategory[];
  timestamp: number;
} | null = null;

const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

/**
 * Fetch Zero Data Retention models from OpenRouter API
 */
async function fetchZDRModels(): Promise<string[]> {
  try {
    console.log('Fetching ZDR models from OpenRouter...');
    const response = await fetch('https://openrouter.ai/api/v1/endpoints/zdr', {
      headers: {
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || ''}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('ZDR API Response Status:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.warn('ZDR API unavailable:', response.status, errorText);
      return [];
    }

    const zdrData: ZDRApiResponse = await response.json();
    console.log('ZDR API Response:', {
      status: response.status,
      dataCount: zdrData.data?.length || 0,
      firstFewModels: zdrData.data?.slice(0, 3) || [],
    });
    
    // Debug the structure of the first few objects
    if (zdrData.data && zdrData.data.length > 0) {
      const firstObj = zdrData.data[0];
      console.log('ZDR Object Structure:', {
        firstObject: firstObj,
        allKeys: Object.keys(firstObj || {}),
        keyValuePairs: Object.entries(firstObj || {})
      });
    }
    
    // Extract model IDs from the response objects
    // The 'name' field format is: "Provider | model/id"
    const zdrModelIds = (zdrData.data || [])
      .map(item => {
        if (!item.name) return null;
        // Split on ' | ' and take the second part (the actual model ID)
        const parts = item.name.split(' | ');
        return parts.length > 1 ? parts[1] : null;
      })
      .filter(Boolean);
      
    console.log('ZDR Model IDs extracted:', zdrModelIds.slice(0, 10));
    
    return zdrModelIds;
  } catch (error) {
    console.warn('Failed to fetch ZDR models:', error);
    return []; // Return empty array on error, will fallback to heuristic classification
  }
}

/**
 * Fetch models from OpenRouter API with ZDR privacy data
 */
export async function fetchOpenRouterModels(): Promise<ModelCategory[]> {
  // Return cached data if still fresh
  if (modelsCache && Date.now() - modelsCache.timestamp < CACHE_DURATION) {
    return modelsCache.data;
  }

  try {
    // Fetch both models and ZDR data in parallel
    const [modelsResponse, zdrModels] = await Promise.all([
      fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || ''}`,
          'Content-Type': 'application/json',
        },
      }),
      fetchZDRModels()
    ]);

    if (!modelsResponse.ok) {
      throw new Error(`OpenRouter API error: ${modelsResponse.status}`);
    }

    const apiData: OpenRouterApiResponse = await modelsResponse.json();
    
    // Filter to only include actively supported models
    const activeModels = apiData.data.filter(model => {
      // Filter out models that are likely deprecated or unsupported
      const modelId = model.id.toLowerCase();
      
      // Skip very old models or beta versions we don't want to expose
      if (modelId.includes('preview') && !modelId.includes('search-preview')) return false;
      if (modelId.includes('deprecated')) return false;
      if (modelId.includes('beta') && !modelId.includes('claude')) return false;
      
      // Only include models with reasonable pricing (not free or extremely expensive)
      const prompt = parseFloat(model.pricing.prompt);
      if (prompt <= 0 || prompt > 0.1) return false; // Filter out free models and very expensive ones
      
      return true;
    });

    console.log('Debug - ZDR Models:', zdrModels.length, 'models');
    console.log('Debug - First 10 ZDR Model IDs:', zdrModels.slice(0, 10));
    console.log('Debug - Active Models:', activeModels.length, 'models');
    console.log('Debug - First 10 Active Model IDs:', activeModels.slice(0, 10).map(m => m.id));
    
    // Check overlap
    const matchingModels = activeModels.filter(model => zdrModels.includes(model.id));
    console.log('Debug - Matching ZDR Models:', matchingModels.length, 'models');
    if (matchingModels.length > 0) {
      console.log('Debug - Example matching models:', matchingModels.slice(0, 3).map(m => m.id));
    }
    
    const processedModels = processModels(activeModels, zdrModels);
    
    console.log('Debug - Processed Models by Privacy Level:', {
      privacyFirst: processedModels.filter(m => m.privacyLevel === 'privacy-first').length,
      warning: processedModels.filter(m => m.privacyLevel === 'warning').length,
      standard: processedModels.filter(m => m.privacyLevel === 'standard').length
    });
    
    const categorizedModels = categorizeModels(processedModels);
    
    console.log('Debug - Final Categories:', categorizedModels.map(cat => ({
      label: cat.label,
      modelCount: cat.models.length
    })));

    // Update cache
    modelsCache = {
      data: categorizedModels,
      timestamp: Date.now()
    };

    return categorizedModels;
  } catch (error) {
    console.error('Failed to fetch OpenRouter models:', error);

    // Return cached data if available, even if stale
    if (modelsCache) {
      return modelsCache.data;
    }

    // Fallback to empty array - the component should handle this
    throw error;
  }
}

/**
 * Get fallback models (hardcoded popular models) for when API fails
 */
export function getFallbackModels(): ModelCategory[] {
  return [
    {
      label: "🛡️ Privacy First (Zero Retention)",
      icon: "shield",
      models: [
        {
          id: "anthropic/claude-3.5-sonnet",
          name: "Claude 3.5 Sonnet",
          provider: "Anthropic",
          pricing: "$3.00 / $15.00",
          description: "Proven reliability for complex analytical tasks",
          privacyLevel: "privacy-first",
          dataRetention: "zero",
          trainsOnData: false,
          contextLength: 200000,
          originalData: {} as OpenRouterModel
        },
        {
          id: "deepseek/deepseek-chat",
          name: "DeepSeek Chat",
          provider: "DeepSeek",
          pricing: "$0.15 / $0.60",
          description: "Excellent reasoning at competitive price point",
          badge: "💎 Value",
          privacyLevel: "privacy-first",
          dataRetention: "zero",
          trainsOnData: false,
          contextLength: 128000,
          originalData: {} as OpenRouterModel
        }
      ]
    },
    {
      label: "⚠️ Privacy Warning (May Train on Data)",
      icon: "alert-triangle",
      models: [
        {
          id: "openai/gpt-4o",
          name: "GPT-4o",
          provider: "OpenAI",
          pricing: "$2.50 / $10.00",
          description: "OpenAI's multimodal flagship model",
          privacyLevel: "warning",
          dataRetention: "standard",
          trainsOnData: true,
          contextLength: 128000,
          originalData: {} as OpenRouterModel
        }
      ]
    }
  ];
}
