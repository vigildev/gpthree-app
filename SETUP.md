# GPThree Setup Instructions

## Environment Variables Setup (REQUIRED FIRST!)

Create a `.env.local` file in the root directory with these required variables:

```bash
# === REQUIRED: Privy Authentication ===
# Get these from your Privy dashboard: https://dashboard.privy.io/
NEXT_PUBLIC_PRIVY_APP_ID=clxxxxxxxxxxxxxxxxxx
PRIVY_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# === REQUIRED: Convex Database ===
# Get this from your Convex dashboard: https://dashboard.convex.dev/
NEXT_PUBLIC_CONVEX_URL=https://xxxxx.convex.cloud

# === REQUIRED: OpenRouter API ===
# Get this from OpenRouter: https://openrouter.ai/keys
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# === OPTIONAL: Solana Configuration ===
NEXT_PUBLIC_NETWORK=solana-devnet
NEXT_PUBLIC_SOLANA_RPC_MAINNET=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_SOLANA_RPC_DEVNET=https://api.devnet.solana.com
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

**⚠️ Important:** Without proper environment variables, you'll get "Invalid Privy app id" errors and the app won't work.

### USDC Configuration

The app automatically selects the correct USDC mint address based on your `NEXT_PUBLIC_NETWORK` setting:

- **Solana Devnet** (`NEXT_PUBLIC_NETWORK=solana-devnet`): Uses mainnet USDC for compatibility
- **Mainnet** (`NEXT_PUBLIC_NETWORK=solana`): Uses `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

You can override this by setting `ASSET=<mint_address>` in your `.env.local` file if needed.

## Next Steps to Enable AI Chat

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
