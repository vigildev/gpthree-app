import { X402PackageImportTest } from '@/components/x402-package-import-test';
import { X402PackageFlowTest } from '@/components/x402-package-flow-test';

export default function PackageTestPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="container mx-auto px-4 space-y-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">@payai/x402-solana Package Testing</h1>
          <p className="text-muted-foreground">
            Comprehensive testing suite for the npm package
          </p>
        </div>
        
        <X402PackageImportTest />
        <X402PackageFlowTest />
      </div>
    </div>
  );
}
