const { VersionedTransaction } = require('@solana/web3.js');

// The transaction from the logs
const transactionBase64 = "ARUCOVazIJtS3s2ngO1dGTU5ZgnBV2lTp30ZzK2T6X7bzKduhs80VNYv3ZOYK+/tYLWMnjONnBnnQP53xtrscgqAAQACBKkpOG71PpDUNg/LTN32g2e20XOvYQYfq02WcoyvW4F+0PVvMdjdT/bSUgE6y9h6Rn0oW+ZfqGlIwuYc/MDNvq4DBkZv5SEXMv/srbpyw5vnvIzlu8X3EmssQ5s6QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAo6gWiaXkCVNk0fKjAAWYvaG5aiUOP7iOEWfQ3Ear8ZgDAgAFAuCTBAACAAkDAQAAAAAAAAADAgABDAIAAABAQg8AAAAAAAA=";

try {
  // Decode the base64 transaction
  const transactionBytes = Buffer.from(transactionBase64, 'base64');
  console.log('Transaction bytes length:', transactionBytes.length);
  
  // Deserialize the transaction
  const transaction = VersionedTransaction.deserialize(transactionBytes);
  
  console.log('\n=== TRANSACTION ANALYSIS ===');
  console.log('Message version:', transaction.version);
  
  const message = transaction.message;
  console.log('Static account keys:', message.staticAccountKeys.length);
  console.log('Required signatures:', message.header.numRequiredSignatures);
  console.log('Readonly signed accounts:', message.header.numReadonlySignedAccounts);
  console.log('Readonly unsigned accounts:', message.header.numReadonlyUnsignedAccounts);
  
  console.log('\n=== ACCOUNT KEYS ===');
  message.staticAccountKeys.forEach((key, index) => {
    console.log(`[${index}] ${key.toBase58()}`);
  });
  
  console.log('\n=== SIGNATURES ===');
  transaction.signatures.forEach((sig, index) => {
    const sigStr = sig ? Buffer.from(sig).toString('hex') : 'null/empty';
    console.log(`[${index}] ${sigStr}`);
  });
  
  console.log('\n=== INSTRUCTIONS ===');
  message.compiledInstructions.forEach((instruction, index) => {
    console.log(`Instruction ${index}:`);
    console.log(`  Program: ${message.staticAccountKeys[instruction.programIdIndex].toBase58()}`);
    console.log(`  Accounts: [${instruction.accountKeyIndexes.join(', ')}]`);
    console.log(`  Data length: ${instruction.data.length}`);
    console.log(`  Data (hex): ${Buffer.from(instruction.data).toString('hex')}`);
  });
  
  console.log('\n=== RECENT BLOCKHASH ===');
  console.log(message.recentBlockhash);
  
} catch (error) {
  console.error('Error analyzing transaction:', error);
}
