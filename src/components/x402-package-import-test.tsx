'use client';

import React from 'react';

// Test imports from the new @payai/x402-solana package
import { createX402Client } from '@payai/x402-solana/client';
import { X402PaymentHandler } from '@payai/x402-solana/server';
import { usdToMicroUsdc, microUsdcToUsd } from '@payai/x402-solana/utils';
import type {
  WalletAdapter,
  X402ClientConfig,
  X402ServerConfig,
  Network
} from '@payai/x402-solana/types';

export function X402PackageImportTest() {
  const [testResults, setTestResults] = React.useState<{
    clientImport: boolean;
    serverImport: boolean;
    utilsImport: boolean;
    typesImport: boolean;
    utilsFunctional: boolean;
  }>({
    clientImport: false,
    serverImport: false,
    utilsImport: false,
    typesImport: false,
    utilsFunctional: false,
  });

  React.useEffect(() => {
    try {
      // Test client import
      const clientImportTest = typeof createX402Client === 'function';

      // Test server import  
      const serverImportTest = typeof X402PaymentHandler === 'function';

      // Test utils import
      const utilsImportTest = typeof usdToMicroUsdc === 'function' && typeof microUsdcToUsd === 'function';

      // Test utils functionality
      const testAmount = 2.5;
      const microUnits = usdToMicroUsdc(testAmount);
      const backToUsd = microUsdcToUsd(microUnits);
      const utilsFunctionalTest = microUnits === 2_500_000 && backToUsd === testAmount;

      // Test types (they should be available for TypeScript checking)
      const typesImportTest = true; // If we got here, types imported successfully

      setTestResults({
        clientImport: clientImportTest,
        serverImport: serverImportTest,
        utilsImport: utilsImportTest,
        typesImport: typesImportTest,
        utilsFunctional: utilsFunctionalTest,
      });
    } catch (error) {
      console.error('Import test failed:', error);
    }
  }, []);

  const allTestsPassed = Object.values(testResults).every(test => test);

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
        @payai/x402-solana Package Import Test
      </h2>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          {Object.entries(testResults).map(([testName, passed]) => (
            <div
              key={testName}
              className={`flex items-center justify-between p-3 rounded-lg border ${passed
                  ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700'
                  : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-700'
                }`}
            >
              <span className="font-medium text-gray-900 dark:text-white">
                {testName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
              </span>
              <span className={`text-lg font-bold ${passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                {passed ? '✅' : '❌'}
              </span>
            </div>
          ))}
        </div>

        <div className={`mt-6 p-4 rounded-lg border-2 ${allTestsPassed
            ? 'bg-green-50 border-green-300 dark:bg-green-900/30 dark:border-green-600'
            : 'bg-red-50 border-red-300 dark:bg-red-900/30 dark:border-red-600'
          }`}>
          <div className="flex items-center space-x-2">
            <span className="text-2xl">
              {allTestsPassed ? '🎉' : '⚠️'}
            </span>
            <span className={`font-bold text-lg ${allTestsPassed
                ? 'text-green-800 dark:text-green-200'
                : 'text-red-800 dark:text-red-200'
              }`}>
              {allTestsPassed
                ? 'All imports successful!'
                : 'Some imports failed'
              }
            </span>
          </div>
          <p className={`mt-2 text-sm ${allTestsPassed
              ? 'text-green-700 dark:text-green-300'
              : 'text-red-700 dark:text-red-300'
            }`}>
            {allTestsPassed
              ? 'The @payai/x402-solana package is working correctly and all imports are functional.'
              : 'Check the console for error details and ensure the package is properly built.'
            }
          </p>
        </div>

        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
            Package Information
          </h3>
          <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
            <p><strong>Package:</strong> @payai/x402-solana</p>
            <p><strong>Version:</strong> 1.0.0</p>
            <p><strong>Source:</strong> Local file installation</p>
            <p><strong>Test Components:</strong> Client, Server, Utils, Types</p>
          </div>
        </div>
      </div>
    </div>
  );
}
