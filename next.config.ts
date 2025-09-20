import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Add Solana externals as required by Privy for proper bundling
    config.externals = config.externals || {};
    config.externals["@solana/web3.js"] = "commonjs @solana/web3.js";
    config.externals["@solana/spl-token"] = "commonjs @solana/spl-token";
    config.externals["@solana/kit"] = "commonjs @solana/kit";
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `
              default-src 'self';
              script-src 'self' 'unsafe-inline' 'unsafe-eval' 
                https://cdn.privy.io 
                https://*.auth.privy.io 
                https://auth.privy.io 
                https://challenges.cloudflare.com
                https://telegram.org
                https://unpkg.com 
                https://cdn.jsdelivr.net 
                https://www.googletagmanager.com 
                https://*.google-analytics.com 
                https://www.google-analytics.com;
              style-src 'self' 'unsafe-inline' 
                https://cdn.privy.io 
                https://*.auth.privy.io 
                https://auth.privy.io;
              img-src 'self' data: blob: 
                https://*.auth.privy.io 
                https://auth.privy.io 
                https://*.privy.io 
                https://cdn.privy.io 
                https://www.googletagmanager.com
                https://867bw7rqa6.ufs.sh;
              font-src 'self' data: 
                https://cdn.privy.io 
                https://*.auth.privy.io 
                https://auth.privy.io;
              connect-src 'self' 
                https://*.auth.privy.io 
                https://auth.privy.io 
                https://*.privy.io 
                https://cdn.privy.io 
                wss://*.auth.privy.io 
                https://*.rpc.privy.systems
                wss://relay.walletconnect.com
                wss://relay.walletconnect.org
                wss://www.walletlink.org
                https://explorer-api.walletconnect.com
                https://openrouter.ai
                https://*.convex.cloud
                wss://*.convex.cloud
                https://api.relay.link
                https://api.testnets.relay.link
                https://api.mainnet-beta.solana.com
                https://api.devnet.solana.com
                https://api.testnet.solana.com
                https://*.solana.com 
                https://*.rpcpool.com 
                https://*.helius.com 
                https://*.quicknode.pro
                https://*.alchemy.com
                https://*.alchemyapi.io 
                https://*.walletconnect.com 
                wss://*.walletconnect.com 
                https://api.blocknative.com 
                https://www.googletagmanager.com 
                https://*.google-analytics.com 
                https://www.google-analytics.com 
                https://csp-report.browser-intake-datadoghq.com;
              child-src 
                https://auth.privy.io
                https://verify.walletconnect.com
                https://verify.walletconnect.org;
              frame-src 'self' 
                https://*.auth.privy.io 
                https://auth.privy.io 
                https://cdn.privy.io 
                https://verify.walletconnect.com
                https://verify.walletconnect.org
                https://challenges.cloudflare.com
                https://oauth.telegram.org
                https://www.googletagmanager.com;
              frame-ancestors 'self';
              object-src 'none';
              base-uri 'self';
              form-action 'self';
              worker-src 'self';
              manifest-src 'self';
              upgrade-insecure-requests;
            `
              .replace(/\s+/g, " ")
              .trim(),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
