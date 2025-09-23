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
    if (!authenticated || !ready || !user) {
      setError("Wallet not connected");
      return;
    }

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
        account.type === 'wallet' && 
        account.chainType === 'solana' && 
        account.address.toLowerCase() === solanaWallet.address.toLowerCase()
    );

    if (!userSolanaWallet?.walletId) {
      setError("Wallet ID not found");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Determine the Solana chain (mainnet vs devnet)
      const network = process.env.NETWORK || "solana-devnet";
      const chain = network === "solana" ? "solana" : "solana"; // Privy API uses "solana" for both

      // Call Privy's balance API
      const response = await fetch(`/api/wallet-balance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletId: userSolanaWallet.walletId,
          asset: 'usdc',
          chain: chain,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch balance: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      // Extract USDC balance from the response
      const usdcBalance = data.balances?.find((balance: any) => 
        balance.asset.toLowerCase() === 'usdc'
      );

      if (usdcBalance) {
        // Use the display value in USDC units
        const balanceInUsdc = parseFloat(usdcBalance.display_values?.usdc || '0');
        setBalance(balanceInUsdc);
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