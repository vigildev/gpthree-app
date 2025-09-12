"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { PrivyProvider } from "@privy-io/react-auth";
import { ReactNode } from "react";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        // Customize Privy's appearance in your app
        appearance: {
          theme: "light",
          accentColor: "#676FFF",
          walletChainType: "ethereum-and-solana"
        },
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors(),
          },
        },
      }}
    >
      <ConvexAuthProvider client={convex}>
        {children}
      </ConvexAuthProvider>
    </PrivyProvider>
  );
}
