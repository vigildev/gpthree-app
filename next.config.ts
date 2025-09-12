import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Add Solana externals as required by Privy for proper bundling
    config.externals = config.externals || {};
    config.externals['@solana/web3.js'] = 'commonjs @solana/web3.js';
    config.externals['@solana/spl-token'] = 'commonjs @solana/spl-token';
    config.externals['@solana/kit'] = 'commonjs @solana/kit';
    return config;
  },
  /* config options here */
};

export default nextConfig;
