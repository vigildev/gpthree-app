#!/usr/bin/env tsx
require('dotenv').config({ path: '.env.local' });
import { RefundService } from '../src/lib/refund-service';

async function testRefund() {
  console.log('🧪 Testing USDC refund functionality...\n');

  try {
    const refundService = new RefundService();

    // Get treasury wallet info
    console.log('📋 Treasury wallet info:');
    const treasuryInfo = await refundService.getTreasuryInfo();
    console.log(`   ID: ${treasuryInfo.id}`);
    console.log(`   Address: ${treasuryInfo.address}\n`);

    // Test wallet address (using treasury address as test - in practice this would be user's wallet)
    // You can replace this with any valid Solana wallet address for testing
    const testWalletAddress = treasuryInfo.address; // Self-transfer for testing
    
    // Test refund amount: 0.01 USDC ($0.01)
    const testUsdAmount = 0.01;
    const testMicroUsdc = RefundService.usdToMicroUsdc(testUsdAmount);
    
    console.log(`🎯 Test parameters:`);
    console.log(`   Target wallet: ${testWalletAddress}`);
    console.log(`   Amount: $${testUsdAmount} (${testMicroUsdc} micro-USDC)\n`);
    
    // Execute refund
    console.log('🚀 Executing test refund...');
    const result = await refundService.executeRefund(testWalletAddress, testMicroUsdc);
    
    if (result.success) {
      console.log('\n✅ Refund test successful!');
      console.log(`   Transaction hash: ${result.transactionHash}`);
      console.log(`   Explorer: https://explorer.solana.com/tx/${result.transactionHash}${process.env.NETWORK === 'solana' ? '' : '?cluster=devnet'}`);
    } else {
      console.log('\n❌ Refund test failed:');
      console.log(`   Error: ${result.error}`);
    }
    
  } catch (error) {
    console.error('\n💥 Test script failed:', error);
    
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      if (error.stack) {
        console.error('   Stack:', error.stack);
      }
    }
  }
}

// Run the test
testRefund()
  .then(() => {
    console.log('\n🏁 Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Unhandled error:', error);
    process.exit(1);
  });