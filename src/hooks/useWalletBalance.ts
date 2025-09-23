import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";

// Token configuration for different assets
export interface TokenConfig {
  symbol: string;
  mintAddresses: {
    mainnet: string;
    devnet: string;
  };
  requiredBalance: number;
}

// Predefined token configurations
export const TOKEN_CONFIGS: Record<string, TokenConfig> = {
  usdc: {
    symbol: "usdc",
    mintAddresses: {
      mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    },
    requiredBalance: 2.5,
  },
  sol: {
    symbol: "sol",
    mintAddresses: {
      mainnet: "So11111111111111111111111111111111111111112", // Wrapped SOL
      devnet: "So11111111111111111111111111111111111111112",
    },
    requiredBalance: 0.1,
  },
};

export interface WalletBalanceInfo {
  balance: number; // Balance in token units (not micro units)
  hasInsufficientFunds: boolean;
  isLoading: boolean;
  error: string | null;
  checkBalance: () => Promise<void>;
  tokenSymbol: string;
}

export interface UseWalletBalanceOptions {
  tokenConfig?: TokenConfig;
  asset?: keyof typeof TOKEN_CONFIGS;
}

export function useWalletBalance(
  options: UseWalletBalanceOptions = {}
): WalletBalanceInfo {
  // Default to USDC if no configuration provided
  const tokenConfig =
    options.tokenConfig ||
    (options.asset ? TOKEN_CONFIGS[options.asset] : TOKEN_CONFIGS.usdc);
  const { authenticated, ready, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const [balance, setBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const checkBalance = useCallback(async (): Promise<void> => {
    console.log("🔍 Starting balance check...");

    if (!authenticated || !ready || !user) {
      setError("Wallet not connected");
      return;
    }

    console.log("👤 User authenticated:", {
      userId: user.id,
      walletsCount: wallets.length,
    });

    // Find user's Solana wallet
    const solanaWallet = wallets.find(
      (wallet) =>
        wallet.walletClientType === "phantom" ||
        wallet.walletClientType === "solflare" ||
        wallet.walletClientType === "backpack" ||
        wallet.walletClientType === "privy" ||
        (wallet.address && wallet.address.length > 30)
    );

    if (!solanaWallet?.address) {
      setError("No Solana wallet found");
      return;
    }

    // For external wallets, we need the wallet ID from the user object
    // Find the Solana wallet in the user's linked accounts
    const userSolanaWallet = user.linkedAccounts.find(
      (account) =>
        account.type === "wallet" &&
        account.chainType === "solana" &&
        account.address.toLowerCase() === solanaWallet.address.toLowerCase()
    );

    console.log(
      "🔗 User linked accounts:",
      user.linkedAccounts.map((acc) => ({
        type: acc.type,
        chainType: acc.type === "wallet" ? acc.chainType : "N/A",
        address:
          acc.type === "wallet" || acc.type === "smart_wallet"
            ? acc.address
            : "N/A",
      }))
    );

    // Check if wallet has an ID (only embedded wallets have server IDs)
    if (!userSolanaWallet) {
      setError("Wallet not found in linked accounts");
      console.log("❌ Wallet not found in user's linked accounts");
      return;
    }

    console.log("✅ Found wallet in linked accounts:", {
      type: userSolanaWallet.type,
      address:
        userSolanaWallet.type === "wallet" ? userSolanaWallet.address : "N/A",
      hasId: "id" in userSolanaWallet,
    });

    // For embedded wallets, we need the wallet ID. For external wallets, we can use the address
    const walletId =
      userSolanaWallet.type === "wallet" && "id" in userSolanaWallet
        ? userSolanaWallet.id
        : null;

    if (!walletId) {
      console.log(
        "⚠️ No wallet ID available - trying alternative method for external wallet"
      );
      // Try alternative balance checking for external wallets
      await checkExternalWalletBalance(solanaWallet.address);
      return;
    }

    console.log("✅ Using wallet ID:", walletId);

    setIsLoading(true);
    setError(null);

    try {
      // Determine the Solana chain (mainnet vs devnet)
      const network = process.env.NETWORK || "solana-devnet";
      const chain = network === "solana" ? "solana" : "solana"; // Privy API uses "solana" for both

      const requestBody = {
        walletId: walletId,
        asset: tokenConfig.symbol,
        chain: chain,
      };

      // Call Privy's balance API
      const response = await fetch(`/api/wallet-balance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log(
        "📡 API Response status:",
        response.status,
        response.statusText
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.log("❌ API Error response:", errorText);
        throw new Error(`Failed to fetch balance: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("📦 API Response data:", JSON.stringify(data, null, 2));

      if (data.error) {
        console.log("❌ API returned error:", data.error);
        throw new Error(data.error);
      }

      // Extract token balance from the response
      const tokenBalance = data.balances?.find(
        (balance: any) =>
          balance.asset.toLowerCase() === tokenConfig.symbol.toLowerCase()
      );

      if (tokenBalance) {
        // Use the display value in token units
        const balanceInTokens = parseFloat(
          tokenBalance.display_values?.[tokenConfig.symbol] || "0"
        );
        setBalance(balanceInTokens);
      } else {
        setBalance(0);
      }
    } catch (err) {
      console.error("Error checking wallet balance:", err);
      setError(err instanceof Error ? err.message : "Failed to check balance");
      setBalance(0);
    } finally {
      setIsLoading(false);
    }
  }, [authenticated, ready, user, wallets]);

  // Alternative balance checking for external wallets using Solana RPC
  const checkExternalWalletBalance = async (walletAddress: string) => {
    console.log("🔄 Checking external wallet balance for:", walletAddress);

    try {
      // Use the public Solana RPC endpoint
      const network = process.env.NEXT_PUBLIC_NETWORK || "devnet";
      const rpcUrl =
        network === "solana"
          ? "https://api.mainnet-beta.solana.com"
          : "https://api.devnet.solana.com";

      console.log("🌐 Using RPC URL:", rpcUrl);

      // Get token mint address for the current network
      const mintAddress =
        network === "solana"
          ? tokenConfig.mintAddresses.mainnet
          : tokenConfig.mintAddresses.devnet;

      // Get token accounts for this wallet
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenAccountsByOwner",
          params: [
            walletAddress,
            {
              mint: mintAddress,
            },
            {
              encoding: "jsonParsed",
            },
          ],
        }),
      });

      const data = await response.json();
      console.log("📡 RPC Response:", JSON.stringify(data, null, 2));

      if (data.error) {
        throw new Error(`RPC Error: ${data.error.message}`);
      }

      let totalBalance = 0;

      if (data.result && data.result.value && data.result.value.length > 0) {
        // Sum up all token account balances
        for (const account of data.result.value) {
          const balance =
            account.account.data.parsed.info.tokenAmount.uiAmount || 0;
          totalBalance += balance;
        }
      }

      setBalance(totalBalance);
      setError(null);
    } catch (err) {
      console.error("Error checking external wallet balance:", err);
      setError(
        `Failed to check external wallet balance: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
      setBalance(0);
    }
  };

  // Auto-check balance when wallet is connected
  useEffect(() => {
    if (authenticated && ready && wallets.length > 0 && user) {
      checkBalance();
    }
  }, [authenticated, ready, wallets.length, user, checkBalance]);

  const hasInsufficientFunds = balance < tokenConfig.requiredBalance;

  return {
    balance,
    hasInsufficientFunds,
    isLoading,
    error,
    checkBalance,
    tokenSymbol: tokenConfig.symbol,
  };
}
