/** Human-readable chain name for the connected chain id. */
export function chainNameFor(id: number): string {
  if (id === 31337) return "Anvil (local)";
  if (id === 421614) return "Arbitrum Sepolia";
  if (id === 42161) return "Arbitrum One";
  if (id === 46630) return "Robinhood Chain";
  return `Chain ${id}`;
}

/** Block-explorer base URL for a chain id (null when there's no explorer). */
export function explorerBase(id: number): string | null {
  if (id === 421614) return "https://sepolia.arbiscan.io";
  if (id === 42161) return "https://arbiscan.io";
  if (id === 46630) return "https://explorer.testnet.chain.robinhood.com";
  return null;
}

/** Block-explorer tx URL for the connected chain (null when there's no explorer). */
export function explorerTxUrl(id: number, hash: `0x${string}`): string | null {
  const base = explorerBase(id);
  return base ? `${base}/tx/${hash}` : null;
}
