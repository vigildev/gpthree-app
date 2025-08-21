import { components } from "./_generated/api";
import { Agent } from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { openai } from "@ai-sdk/openai";

// Create OpenRouter instance
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

// Helper function to create GPThree agent with specified model
function createGPThreeAgent(modelId: string) {
  return new Agent(components.agent, {
    name: "GPThree Assistant",
    chat: openrouter.chat(modelId),
    instructions: `You are GPThree, a privacy-first crypto-native LLM aggregator assistant.

You help users with:
- Solana DeFi operations and strategies
- Privacy-focused crypto transactions
- Multi-LLM model comparisons and recommendations
- Blockchain analysis and insights
- Token launches, NFTs, and DeFi protocols

Key principles:
- Always prioritize user privacy and security
- Provide accurate, up-to-date crypto information
- Explain complex concepts clearly
- Suggest privacy-preserving alternatives when possible
- Help users navigate the crypto ecosystem safely

You are knowledgeable about various LLM models and can help users choose the best model for their specific crypto-related tasks. You have access to multiple AI models through OpenRouter including Claude, GPT, Llama, and many others.`,

    // Use OpenAI directly for embeddings with correct model ID
    textEmbedding: openai.embedding("text-embedding-3-small"),
    maxSteps: 3, // Allow for multi-step reasoning with tool calls
  });
}

// Default model for backward compatibility
const defaultModelId = "anthropic/claude-3.5-sonnet";

export const createThread = action({
  args: {
    prompt: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, { prompt, model }) => {
    const modelId = model || defaultModelId;
    const agent = createGPThreeAgent(modelId);
    const { threadId, thread } = await agent.createThread(ctx);
    const result = await thread.generateText({ prompt });
    return { threadId, text: result.text };
  },
});

export const continueThread = action({
  args: {
    prompt: v.string(),
    threadId: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, { prompt, threadId, model }) => {
    const modelId = model || defaultModelId;
    const agent = createGPThreeAgent(modelId);
    const { thread } = await agent.continueThread(ctx, { threadId });
    const result = await thread.generateText({ prompt });
    return result.text;
  },
});
