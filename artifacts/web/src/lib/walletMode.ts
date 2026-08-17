// Wallet-mode cache shared between the route gate (App.tsx) and the wallet
// setup flows. Avoids refetching /api/user/wallet-info on every route change;
// invalidated whenever wallet settings are saved or the session changes.

let cache: { token: string; mode: string } | null = null;

export function getCachedWalletMode(token: string): string | null {
  return cache?.token === token ? cache.mode : null;
}

export function setCachedWalletMode(token: string, mode: string): void {
  cache = { token, mode };
}

export function invalidateWalletModeCache(): void {
  cache = null;
}
