import { components } from "./_generated/api";
import { internal } from "./_generated/api";
import { Agent } from "@convex-dev/agent";
import {
  createThread as createAgentThread,
  listMessages,
} from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { action, query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { openai } from "@ai-sdk/openai";
// Simple auth function for Privy integration
const getAuthUserId = async (ctx: any) => {
  // For now, we'll use a simple approach - get user from the action args
  // In production, you'd validate the Privy token here
  return ctx.auth?.userId || null;
};

// Create OpenRouter instance
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
  compatibility: 'strict', // Use strict mode for full OpenRouter features
});

// Helper function to create GPThree agent with specified model and optional system enhancement
function createGPThreeAgent(modelId: string, systemEnhancement?: string) {
  const baseInstructions = `You are GPThree, a privacy-first AI assistant that helps users with any task while maintaining the highest standards of privacy and security.

You help users with:
- Code review, debugging, and software development
- Data analysis and visualization
- Research assistance with proper citations
- Professional writing and content creation
- Problem-solving and analytical thinking
- Learning new concepts and skills

Key principles:
- Always prioritize user privacy and data security
- Provide accurate, well-researched information
- Explain complex concepts in clear, accessible language
- Offer multiple perspectives and approaches when appropriate
- Maintain a helpful, professional, and friendly tone
- Respect user confidentiality and never share or reference previous conversations
- If you don't know something say you don't know without making anything up

You are knowledgeable about various AI models and can help users choose the best model for their specific tasks. You have access to multiple AI models through OpenRouter including Claude, GPT, Llama, and many others.`;

  const instructions = systemEnhancement
    ? `${baseInstructions}\n\n--- SPECIALIZED MODE ---\n\n${systemEnhancement}`
    : baseInstructions;

  return new Agent(components.agent, {
    name: "GPThree Assistant",
    chat: openrouter.chat(modelId, {
      usage: { include: true }, // Enable usage accounting
    }),
    instructions,

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
    userId: v.string(),
    systemEnhancement: v.optional(v.string()),
  },
  handler: async (ctx, { prompt, model, userId, systemEnhancement }) => {
    if (!userId) {
      throw new Error("User must be authenticated to create threads");
    }

    const modelId = model || defaultModelId;
    const agent = createGPThreeAgent(modelId, systemEnhancement);

    // Generate a title from the first few words of the prompt
    const title = prompt.length > 40 ? prompt.substring(0, 40) + "..." : prompt;

    const { threadId, thread } = await agent.createThread(ctx, {
      userId,
      title,
      summary: "New conversation with GPThree",
    });

    const result = await thread.generateText({ prompt });
    
    // Extract usage data from provider metadata
    let usage = null;
    if (result.providerMetadata?.openrouter?.usage) {
      const openrouterUsage = result.providerMetadata.openrouter.usage as any;
      // Type assertion since provider metadata is loosely typed
      if (typeof openrouterUsage === 'object' && openrouterUsage !== null) {
        usage = {
          promptTokens: openrouterUsage.promptTokens || 0,
          completionTokens: openrouterUsage.completionTokens || 0,
          totalTokens: openrouterUsage.totalTokens || 0,
          cost: openrouterUsage.cost || 0, // This is the key field we need for refunds
        };
        console.log('Extracted OpenRouter usage data:', usage);
      }
    } else {
      console.log('No OpenRouter usage data found in provider metadata');
      console.log('Available keys in result:', Object.keys(result));
    }
    
    return { 
      threadId, 
      text: result.text,
      usage: usage
    };
  },
});

export const continueThread = action({
  args: {
    prompt: v.string(),
    threadId: v.string(),
    model: v.optional(v.string()),
    systemEnhancement: v.optional(v.string()),
  },
  handler: async (ctx, { prompt, threadId, model, systemEnhancement }) => {
    const modelId = model || defaultModelId;
    const agent = createGPThreeAgent(modelId, systemEnhancement);
    const { thread } = await agent.continueThread(ctx, { threadId });
    const result = await thread.generateText({ prompt });

    // Extract usage data from provider metadata
    let usage = null;
    if (result.providerMetadata?.openrouter?.usage) {
      const openrouterUsage = result.providerMetadata.openrouter.usage as any;
      // Type assertion since provider metadata is loosely typed
      if (typeof openrouterUsage === 'object' && openrouterUsage !== null) {
        usage = {
          promptTokens: openrouterUsage.promptTokens || 0,
          completionTokens: openrouterUsage.completionTokens || 0,
          totalTokens: openrouterUsage.totalTokens || 0,
          cost: openrouterUsage.cost || 0,
        };
        console.log('Extracted OpenRouter usage data (continueThread):', usage);
      }
    } else {
      console.log('No OpenRouter usage data found in provider metadata (continueThread)');
    }

    // Return both text and usage data for refund processing
    return {
      text: result.text,
      usage: usage
    };
  },
});

// Create a new thread with user association
export const createNewThread = action({
  args: {
    title: v.optional(v.string()),
    userId: v.string(),
  },
  handler: async (ctx, { title, userId }) => {
    if (!userId) {
      throw new Error("User must be authenticated to create threads");
    }

    const agent = createGPThreeAgent(defaultModelId);
    const { threadId } = await agent.createThread(ctx, {
      userId,
      title: title || "New Conversation",
      summary: "A new conversation with GPThree",
    });

    return { threadId };
  },
});

// List user's threads using Convex Agent API
export const listUserThreads = query({
  args: {
    userId: v.string(),
  },
  handler: async (
    ctx,
    { userId }
  ): Promise<
    Array<{
      _id: string;
      title: string;
      summary: string;
      _creationTime: number;
    }>
  > => {
    try {
      const threads = await ctx.runQuery(
        components.agent.threads.listThreadsByUserId,
        {
          userId,
          paginationOpts: { cursor: null, numItems: 50 },
        }
      );

      return threads.page.map((thread: any) => ({
        _id: thread._id,
        title: thread.title || "Untitled",
        summary: thread.summary || "No summary",
        _creationTime: thread._creationTime,
      }));
    } catch (error) {
      console.log("Failed to fetch threads:", error);
      return [];
    }
  },
});

// Delete a thread using Convex Agent API
export const deleteThread = action({
  args: {
    threadId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, { threadId, userId }) => {
    if (!userId) {
      throw new Error("User must be authenticated to delete threads");
    }

    try {
      const agent = createGPThreeAgent(defaultModelId);
      await agent.deleteThreadAsync(ctx, { threadId });
      return { success: true };
    } catch (error) {
      console.error("Failed to delete thread:", error);
      throw new Error("Failed to delete thread");
    }
  },
});

// List messages for a thread using Convex Agent API
export const listThreadMessages = query({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, { threadId }) => {
    try {
      const messages = await listMessages(ctx, components.agent, {
        threadId,
        excludeToolMessages: true,
        paginationOpts: {
          cursor: null,
          numItems: 100,
        },
      });

      return messages.page;
    } catch (error) {
      console.log("Failed to fetch messages:", error);
      return [];
    }
  },
});
