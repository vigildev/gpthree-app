import { z } from "zod";

// Extended network enum that includes Solana networks (from PR #283)
export const NetworkSchema = z.enum([
  "base-sepolia",
  "base", 
  "avalanche-fuji",
  "avalanche",
  "iotex",
  "sei",
  "sei-testnet",
  "solana-devnet", // Added from PR
  "solana"         // Added from PR
]);

export type Network = z.infer<typeof NetworkSchema>;

// Payment requirements schema with Solana support
// Note: x402Version is not part of individual payment requirements,
// it's part of the parent 402 response object
export const PaymentRequirementsSchema = z.object({
  scheme: z.literal("exact"),
  network: NetworkSchema,
  asset: z.string().optional(),
  maxAmountRequired: z.string(),
  payTo: z.string(),
  resource: z.string().optional(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  maxTimeoutSeconds: z.number().optional(),
  extra: z.record(z.unknown()).optional(),
  outputSchema: z.record(z.unknown()).nullable().optional()
});

export type PaymentRequirements = z.infer<typeof PaymentRequirementsSchema>;

// 402 Payment Required response schema
export const Payment402ResponseSchema = z.object({
  x402Version: z.number(),
  accepts: z.array(PaymentRequirementsSchema),
  error: z.string().optional()
});

export type Payment402Response = z.infer<typeof Payment402ResponseSchema>;

// Payment payload schemas for different networks
export const EVMPaymentPayloadSchema = z.object({
  transaction: z.string() // hex-encoded transaction
});

export const SolanaPaymentPayloadSchema = z.object({
  transaction: z.string() // base64-encoded transaction
});

export const PaymentPayloadSchema = z.union([
  EVMPaymentPayloadSchema,
  SolanaPaymentPayloadSchema
]);

export type PaymentPayload = z.infer<typeof PaymentPayloadSchema>;

// Full payment header schema
export const PaymentHeaderSchema = z.object({
  x402Version: z.number(),
  scheme: z.literal("exact"),
  network: NetworkSchema,
  payload: PaymentPayloadSchema
});

export type PaymentHeader = z.infer<typeof PaymentHeaderSchema>;

// Helper function to check if a network is Solana-based
export function isSolanaNetwork(network: string): network is "solana" | "solana-devnet" {
  return network === "solana" || network === "solana-devnet";
}

// Helper function to check if a network is EVM-based
export function isEVMNetwork(network: string): boolean {
  return !isSolanaNetwork(network);
}
