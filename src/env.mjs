// src/env.mjs
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /*
   * Serverside Environment variables, not available on the client.
   * Will throw if you access these variables on the client.
   */
  server: {
    // DATABASE_URL: z.string().url(),
    // OPEN_AI_API_KEY: z.string().min(1),
    PRIVY_APP_SECRET: z.string().min(1, "PRIVY_APP_SECRET is required"),
    OPENROUTER_API_KEY: z.string().default(""),
    TREASURY_WALLET_ADDRESS: z.string().default(""),
    TREASURY_PRIVATE_KEY: z.string().default(""),
    TREASURY_WALLET_ID: z.string().optional(),
    NEXT_PUBLIC_NETWORK: z.string().default("solana-devnet"),
    ASSET: z.string().default(""),
  },
  /*
   * Environment variables available on the client (and server).
   *
   * 💡 You'll get type errors if these are not prefixed with NEXT_PUBLIC_.
   */
  client: {
    NEXT_PUBLIC_PRIVY_APP_ID: z
      .string()
      .min(1, "NEXT_PUBLIC_PRIVY_APP_ID is required"),
    NEXT_PUBLIC_CONVEX_URL: z.string().url().or(z.literal("")).default(""),
    NEXT_PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
    NEXT_PUBLIC_SOLANA_RPC_MAINNET: z.string().url().optional(),
    NEXT_PUBLIC_SOLANA_RPC_DEVNET: z.string().url().optional(),
    NEXT_PUBLIC_NETWORK: z.string().default("solana-devnet"),
  },
  /*
   * Due to how Next.js bundles environment variables on Edge and Client,
   * we need to manually destructure them to make sure all are included in bundle.
   *
   * 💡 You'll get type errors if not all variables from `server` & `client` are included here.
   */
  runtimeEnv: {
    // DATABASE_URL: process.env.DATABASE_URL,
    // OPEN_AI_API_KEY: process.env.OPEN_AI_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_SOLANA_RPC_MAINNET: process.env.NEXT_PUBLIC_SOLANA_RPC_MAINNET,
    NEXT_PUBLIC_SOLANA_RPC_DEVNET: process.env.NEXT_PUBLIC_SOLANA_RPC_DEVNET,
    TREASURY_WALLET_ADDRESS: process.env.TREASURY_WALLET_ADDRESS,
    TREASURY_PRIVATE_KEY: process.env.TREASURY_PRIVATE_KEY,
    TREASURY_WALLET_ID: process.env.TREASURY_WALLET_ID,
    NEXT_PUBLIC_NETWORK: process.env.NEXT_PUBLIC_NETWORK,
    ASSET: process.env.ASSET,
  },
});
