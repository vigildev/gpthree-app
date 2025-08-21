# GPThree Setup Instructions

## Next Steps to Enable AI Chat

Since your terminal doesn't have package managers available, follow these steps:

### 1. Install the Agent Component Package

Run this in your terminal with a package manager:

```bash
npm install @convex-dev/agent
# or
yarn add @convex-dev/agent
# or
pnpm add @convex-dev/agent
```

### 2. Run Convex Dev

Start the Convex development server to generate types:

```bash
npx convex dev
# or
yarn convex dev
# or
pnpm dlx convex dev
```

### 3. Set Environment Variables

In your Convex dashboard, set these environment variables:

- `OPENAI_API_KEY` - Your OpenAI API key (starts with `sk-`)

### 4. Update the Frontend

Once Convex dev is running, update the dashboard to use the real API:

```typescript
// In src/components/dashboard.tsx, replace the placeholder with:
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

const createThread = useMutation(api.agents.createThread);
const continueThread = useMutation(api.agents.continueThread);

// Replace the setTimeout placeholder in handleSendMessage with:
try {
  let response;
  if (threadId) {
    response = await continueThread({ prompt: userMessage, threadId });
  } else {
    response = await createThread({ prompt: userMessage });
    setThreadId(response.threadId);
  }
  setChatHistory((prev) => [
    ...prev,
    { role: "assistant", content: response.text },
  ]);
} catch (error) {
  console.error("Error:", error);
  setChatHistory((prev) => [
    ...prev,
    { role: "assistant", content: "Sorry, I encountered an error." },
  ]);
} finally {
  setIsLoading(false);
}
```

## What's Already Set Up

✅ **GPThree Agent**: Configured for privacy-first crypto assistance  
✅ **Convex Config**: Ready for the agent component  
✅ **UI Components**: Chat interface with crypto-focused prompts  
✅ **Agent Instructions**: Specialized for Solana DeFi, privacy coins, and LLM aggregation

## Features Ready

- **Privacy-first crypto chat**: GPT-4o-mini with crypto expertise
- **Vector search**: For better context retrieval from chat history
- **Thread management**: Persistent conversations
- **Crypto tools**: Privacy analysis, DeFi strategies, LLM comparison

The agent will automatically handle all database tables and message management once running!
