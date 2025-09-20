#!/usr/bin/env tsx

// Load environment variables from .env.local
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrivyClient } from "@privy-io/server-auth";

/**
 * One-time script to import treasury wallet into Privy
 * Run with: npx tsx scripts/import-treasury-wallet.ts
 */
async function importTreasuryWallet() {
  console.log("🏦 Importing treasury wallet into Privy...");

  // Initialize Privy client
  const privy = new PrivyClient(
    process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
    process.env.PRIVY_APP_SECRET!
  );

  // Treasury wallet details from environment
  const treasuryAddress = process.env.TREASURY_WALLET_ADDRESS;
  const treasuryPrivateKey = process.env.TREASURY_PRIVATE_KEY;

  if (!treasuryAddress || !treasuryPrivateKey) {
    console.error("❌ Missing treasury wallet credentials in environment");
    console.error("Required: TREASURY_WALLET_ADDRESS, TREASURY_PRIVATE_KEY");
    process.exit(1);
  }

  console.log(`📍 Treasury address: ${treasuryAddress}`);
  console.log(`🔑 Private key length: ${treasuryPrivateKey.length} characters`);

  try {
    // Import the wallet using Privy's server API
    const wallet = await privy.walletApi.importWallet({
      address: treasuryAddress,
      chainType: "solana",
      entropy: treasuryPrivateKey, // base58-encoded private key
      entropyType: "private-key",
    });

    console.log("✅ Treasury wallet imported successfully!");
    console.log(`📱 Wallet ID: ${wallet.id}`);
    console.log(`📍 Address: ${wallet.address}`);
    console.log(`⛓️  Chain: ${wallet.chainType}`);
    console.log("🏷️  Wallet imported as server-controlled treasury wallet");

    console.log("\n🔧 Next Steps:");
    console.log(`1. Add this to your .env.local file:`);
    console.log(`   TREASURY_WALLET_ID=${wallet.id}`);
    console.log(
      `2. The refund service will use this wallet ID for transactions`
    );
  } catch (error) {
    console.error("❌ Failed to import treasury wallet:", error);

    if (error instanceof Error) {
      console.error("Error details:", error.message);

      // Common error scenarios
      if (error.message.includes("already exists")) {
        console.log(
          "\n💡 The wallet may already be imported. Check your Privy dashboard."
        );
      } else if (error.message.includes("private key")) {
        console.log(
          "\n💡 Check that your TREASURY_PRIVATE_KEY is base58-encoded."
        );
      }
    }

    process.exit(1);
  }
}

// Run the script
importTreasuryWallet()
  .then(() => {
    console.log("\n🎉 Treasury wallet import completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Script failed:", error);
    process.exit(1);
  });
