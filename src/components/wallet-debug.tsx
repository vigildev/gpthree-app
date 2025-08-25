"use client";

import { usePrivy } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';
import { Button } from '@/components/ui/button';

export function WalletDebug() {
  const { ready, authenticated, user, login, logout, createWallet } = usePrivy();
  const { wallets: solanaWallets } = useSolanaWallets();

  if (!ready) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-4 border rounded-lg bg-card text-card-foreground">
      <h3 className="text-lg font-semibold mb-4">Wallet Debug Info</h3>
      
      <div className="space-y-2 mb-4">
        <p><strong>Authenticated:</strong> {authenticated ? 'Yes' : 'No'}</p>
        <p><strong>User ID:</strong> {user?.id || 'None'}</p>
        <p><strong>Solana Wallets Count:</strong> {solanaWallets.length}</p>
      </div>

      <div className="space-x-2 mb-4">
        {!authenticated && (
          <Button onClick={login}>Login</Button>
        )}
        {authenticated && (
          <>
            <Button onClick={logout}>Logout</Button>
            <Button onClick={createWallet}>Create Wallet</Button>
          </>
        )}
      </div>

      {solanaWallets.length > 0 && (
        <div className="mt-4">
          <h4 className="font-semibold mb-2">Available Solana Wallets:</h4>
          <div className="space-y-2">
            {solanaWallets.map((wallet, index) => (
              <div key={index} className="p-2 bg-muted rounded text-sm">
                <p><strong>Type:</strong> {wallet.walletClientType}</p>
                <p><strong>Address:</strong> {wallet.address}</p>
                {wallet.meta && (
                  <p><strong>Meta:</strong> {JSON.stringify(wallet.meta)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
