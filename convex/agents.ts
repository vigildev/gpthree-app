import { components } from "./_generated/api";
import { Agent, createThread as createAgentThread, deleteThreadAsync } from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { action, query } from "./_generated/server";
import { v } from "convex/values";
import { openai } from "@ai-sdk/openai";
import { getAuthUserId } from "@convex-dev/auth/server";

// Create OpenRouter instance
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

// Helper function to create GPThree agent with specified model
function createGPThreeAgent(modelId: string) {
  return new Agent(components.agent, {
    name: "GPThree Assistant",
    chat: openrouter.chat(modelId),
    instructions: `You are GPThree, a privacy-first AI assistant that helps users with any task while maintaining the highest standards of privacy and security.

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

You are knowledgeable about various AI models and can help users choose the best model for their specific tasks. You have access to multiple AI models through OpenRouter including Claude, GPT, Llama, and many others.`,

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
    const userId = await getAuthUserId(ctx);
    
    // Generate a title from the first few words of the prompt
    const title = prompt.length > 40 ? prompt.substring(0, 40) + "..." : prompt;
    
    const { threadId, thread } = await agent.createThread(ctx, {
      userId,
      title,
      summary: "New conversation with GPThree",
    });
    
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

// Create a new thread with user association
export const createNewThread = action({
  args: {
    title: v.optional(v.string()),
  },
  handler: async (ctx, { title }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User must be authenticated to create threads");
    }
    
    const threadId = await createAgentThread(ctx, components.agent, {
      userId,
      title: title || "New Conversation",
      summary: "A new conversation with GPThree",
    });
    
    return { threadId };
  },
});

// List user's threads
export const listUserThreads = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }
    
    const threads = await ctx.db
      .query("agent_threads")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
    
    return threads.map(thread => ({
      _id: thread._id,
      title: thread.title || "Untitled",
      summary: thread.summary,
      _creationTime: thread._creationTime,
    }));
  },
});

// Delete a thread
export const deleteThread = action({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, { threadId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User must be authenticated to delete threads");
    }
    
    // Verify thread belongs to user
    const thread = await ctx.db.get(threadId as any);
    if (!thread || thread.userId !== userId) {
      throw new Error("Thread not found or access denied");
    }
    
    await deleteThreadAsync(ctx, components.agent, { threadId });
  },
});

// List messages for a thread
export const listThreadMessages = query({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, { threadId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User must be authenticated to view messages");
    }
    
    // Verify thread belongs to user
    const thread = await ctx.db.get(threadId as any);
    if (!thread || thread.userId !== userId) {
      throw new Error("Thread not found or access denied");
    }
    
    const messages = await ctx.db
      .query("agent_messages")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .order("asc")
      .collect();
    
    return messages;
  },
});
