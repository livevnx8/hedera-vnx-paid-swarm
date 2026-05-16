/**
 * URL helpers for Hedera/Hiero proof links.
 */

const MIRROR_NODE_MAINNET = 'https://mainnet-public.mirrornode.hedera.com/api/v1';

export function toHashScanTransactionUrl(transactionId: string): string {
  return `https://hashscan.io/mainnet/transaction/${encodeURIComponent(transactionId)}`;
}

export function toMirrorNodeTransactionId(transactionId: string): string {
  const match = transactionId.match(/^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/);
  if (!match) return transactionId;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function toMirrorNodeTransactionUrl(transactionId: string): string {
  return `${MIRROR_NODE_MAINNET}/transactions/${toMirrorNodeTransactionId(transactionId)}`;
}
