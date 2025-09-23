import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";

const REQUIRED_BALANCE_USDC = 2.5; // $2.5 USDC required

export interface WalletBalanceInfo {
  balance: number; // Balance in USDC (not micro units)
  hasInsufficientFunds: boolean;
  isLoading: boolean;
  error: string | null;
  checkBalance: () => Promise<void>;
}

export function useWalletBalance(): WalletBalanceInfo {
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
        asset: "usdc",
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

      // Extract USDC balance from the response
      const usdcBalance = data.balances?.find(
        (balance: any) => balance.asset.toLowerCase() === "usdc"
      );

      console.log("💰 USDC Balance found:", usdcBalance);

      if (usdcBalance) {
        // Use the display value in USDC units
        const balanceInUsdc = parseFloat(
          usdcBalance.display_values?.usdc || "0"
        );
        console.log("💵 Parsed USDC balance:", balanceInUsdc);
        console.log("🚨 Insufficient funds check:", {
          balance: balanceInUsdc,
          required: REQUIRED_BALANCE_USDC,
          hasInsufficientFunds: balanceInUsdc < REQUIRED_BALANCE_USDC,
        });
        setBalance(balanceInUsdc);
      } else {
        console.log("❌ No USDC balance found in response");
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
        network === "mainnet"
          ? "https://api.mainnet-beta.solana.com"
          : "https://api.devnet.solana.com";

      console.log("🌐 Using RPC URL:", rpcUrl);

      // USDC token mint addresses
      const usdcMintAddress =
        network === "mainnet"
          ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC on mainnet
          : "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"; // USDC on devnet

      console.log("💰 Using USDC mint:", usdcMintAddress);

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
              mint: usdcMintAddress,
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
        // Sum up all USDC token account balances
        for (const account of data.result.value) {
          const balance =
            account.account.data.parsed.info.tokenAmount.uiAmount || 0;
          totalBalance += balance;
        }
      }

      console.log("💵 Total USDC balance from RPC:", totalBalance);
      console.log("🚨 Insufficient funds check (RPC):", {
        balance: totalBalance,
        required: REQUIRED_BALANCE_USDC,
        hasInsufficientFunds: totalBalance < REQUIRED_BALANCE_USDC,
      });

      setBalance(totalBalance);
      setError(null);
    } catch (err) {
      console.error("❌ Error checking external wallet balance:", err);
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

  const hasInsufficientFunds = balance < REQUIRED_BALANCE_USDC;

  return {
    balance,
    hasInsufficientFunds,
    isLoading,
    error,
    checkBalance,
  };
}
