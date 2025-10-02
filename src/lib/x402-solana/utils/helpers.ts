import { VersionedTransaction } from "@solana/web3.js";
import { PaymentRequirements } from "../types";

/**
 * Helper utilities for x402 payment processing
 */

/**
 * Create payment header from a signed transaction
 * Encodes transaction and payment details into base64 X-PAYMENT header
 */
export function createPaymentHeaderFromTransaction(
  transaction: VersionedTransaction,
  paymentRequirements: PaymentRequirements,
  x402Version: number
): string {
  // Serialize the signed transaction
  const serializedTransaction = Buffer.from(transaction.serialize()).toString("base64");

  // Create payment payload matching x402 spec
  const paymentPayload = {
    x402Version: x402Version,
    scheme: paymentRequirements.scheme,
    network: paymentRequirements.network,
    payload: {
      transaction: serializedTransaction,
    },
  };

  // Encode payment payload as base64 for X-PAYMENT header
  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

  return paymentHeader;
}

/**
 * Get default RPC URL for a given network
 */
export function getDefaultRpcUrl(network: "solana" | "solana-devnet"): string {
  return network === "solana"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
}

/**
 * Get default USDC mint address for a given network
 */
export function getDefaultUsdcMint(network: "solana" | "solana-devnet"): string {
  return network === "solana"
    ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // Mainnet USDC
    : "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"; // Devnet USDC
}

/**
 * Convert USDC amount from dollars to micro-units
 */
export function usdToMicroUsdc(usdAmount: number): number {
  return Math.floor(usdAmount * 1_000_000); // 6 decimals
}

/**
 * Convert USDC micro-units to dollar amount
 */
export function microUsdcToUsd(microUsdc: number): number {
  return microUsdc / 1_000_000; // 6 decimals
}

