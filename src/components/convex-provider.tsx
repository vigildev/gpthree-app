"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { PrivyProvider } from "@privy-io/react-auth";
import { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConvexProvider client={convex}>
      <PrivyProvider
        appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
        config={{
          // Customize Privy's appearance in your app
          appearance: {
            theme: "light",
            accentColor: "#676FFF",
          },
        }}
      >
        {children}
      </PrivyProvider>
    </ConvexProvider>
  );
}
