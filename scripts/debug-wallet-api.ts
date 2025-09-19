#!/usr/bin/env tsx
require('dotenv').config({ path: '.env.local' });
import { PrivyClient } from '@privy-io/server-auth';

async function debugWalletApi() {
  console.log('🔍 Debugging Privy Wallet API connection...\n');

  try {
    const privy = new PrivyClient(
      process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
      process.env.PRIVY_APP_SECRET!
    );

    console.log('✅ Privy client initialized');
    console.log(`   App ID: ${process.env.NEXT_PUBLIC_PRIVY_APP_ID}`);
    console.log(`   Treasury Wallet ID: ${process.env.TREASURY_WALLET_ID}\n`);

    // Try to list all wallets first
    console.log('📋 Listing all wallets...');
    const walletsResponse = await privy.walletApi.getWallets();
    
    console.log(`   Found ${walletsResponse.data.length} wallets:`);
    walletsResponse.data.forEach((wallet, index) => {
      console.log(`   ${index + 1}. ID: ${wallet.id}`);
      console.log(`      Address: ${wallet.address}`);
      console.log(`      Chain: ${wallet.chainType}`);
      console.log(`      Created: ${wallet.createdAt}`);
      console.log('');
    });

    // Check if our treasury wallet ID exists
    const treasuryWalletId = process.env.TREASURY_WALLET_ID;
    if (treasuryWalletId) {
      const treasuryWallet = walletsResponse.data.find(w => w.id === treasuryWalletId);
      if (treasuryWallet) {
        console.log('✅ Treasury wallet found in wallet list!');
        console.log(`   ID: ${treasuryWallet.id}`);
        console.log(`   Address: ${treasuryWallet.address}`);
        console.log(`   Chain: ${treasuryWallet.chainType}\n`);

        // Now try to get the specific wallet
        console.log('🎯 Testing getWallet() method...');
        const specificWallet = await privy.walletApi.getWallet({ id: treasuryWalletId });
        console.log('✅ getWallet() successful!');
        console.log(`   ID: ${specificWallet.id}`);
        console.log(`   Address: ${specificWallet.address}`);
        console.log(`   Chain: ${specificWallet.chainType}`);
      } else {
        console.log('❌ Treasury wallet ID not found in wallet list!');
        console.log('   Available wallet IDs:');
        walletsResponse.data.forEach(w => console.log(`     - ${w.id}`));
      }
    } else {
      console.log('❌ Treasury wallet ID not set in environment variables');
    }

  } catch (error) {
    console.error('💥 Debug failed:', error);
    
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      if (error.stack) {
        console.error('   Stack:', error.stack);
      }
    }
  }
}

debugWalletApi()
  .then(() => console.log('\n🏁 Debug completed'))
  .catch(error => {
    console.error('\n💥 Unhandled error:', error);
    process.exit(1);
  });