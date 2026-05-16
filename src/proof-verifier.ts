/**
 * VNX Paid Micro-Swarm — Proof Verifier
 *
 * Recomputes local receipt hashes and verifies the Hedera/Hiero mainnet
 * transaction through a mirror-node lookup.
 */

import { createHash } from 'crypto';
import { SwarmReceipt } from './types.js';
import { assertMainnetProofReceipt } from './proof-validation.js';
import { toHashScanTransactionUrl, toMirrorNodeTransactionUrl } from './proof-urls.js';

export type ProofCheckName =
  | 'task_hash'
  | 'decision_hash'
  | 'mainnet_proof_status'
  | 'hashscan_url'
  | 'mirror_node_transaction';

export interface ProofCheck {
  name: ProofCheckName;
  ok: boolean;
  detail: string;
}

export interface MirrorTransactionCheck {
  ok: boolean;
  transactionId: string;
  status?: string;
  error?: string;
}

export interface ProofVerifierOptions {
  fetchMirrorTransaction?: (transactionId: string, mirrorNodeUrl: string) => Promise<MirrorTransactionCheck>;
}

export interface ProofVerificationResult {
  ok: boolean;
  checks: ProofCheck[];
}

export async function verifySwarmProof(
  receipt: SwarmReceipt,
  taskDescription: string,
  options: ProofVerifierOptions = {},
): Promise<ProofVerificationResult> {
  const checks: ProofCheck[] = [];
  const expectedTaskHash = sha256(taskDescription);
  checks.push({
    name: 'task_hash',
    ok: receipt.taskHash === expectedTaskHash,
    detail: receipt.taskHash === expectedTaskHash
      ? expectedTaskHash
      : `expected ${expectedTaskHash}, got ${receipt.taskHash}`,
  });

  const expectedDecisionHash = sha256(
    `${receipt.selected.workerId}:${receipt.selected.score}:${receipt.payment.transactionId ?? 'no-tx'}:${receipt.taskHash}`
  );
  checks.push({
    name: 'decision_hash',
    ok: receipt.decisionHash === expectedDecisionHash,
    detail: receipt.decisionHash === expectedDecisionHash
      ? expectedDecisionHash
      : `expected ${expectedDecisionHash}, got ${receipt.decisionHash}`,
  });

  try {
    assertMainnetProofReceipt(receipt);
    checks.push({
      name: 'mainnet_proof_status',
      ok: true,
      detail: receipt.proofStatus,
    });
  } catch (err) {
    checks.push({
      name: 'mainnet_proof_status',
      ok: false,
      detail: (err as Error).message,
    });
  }

  const expectedExplorerUrl = receipt.payment.transactionId
    ? toHashScanTransactionUrl(receipt.payment.transactionId)
    : '';
  checks.push({
    name: 'hashscan_url',
    ok: !!receipt.explorerUrl && receipt.explorerUrl === expectedExplorerUrl,
    detail: receipt.explorerUrl && receipt.explorerUrl === expectedExplorerUrl
      ? receipt.explorerUrl
      : `expected ${expectedExplorerUrl || 'transaction id first'}, got ${receipt.explorerUrl ?? 'missing'}`,
  });

  const fetchMirrorTransaction = options.fetchMirrorTransaction ?? fetchMirrorTransactionFromHiero;
  const mirrorCheck = receipt.payment.transactionId
    ? await fetchMirrorTransaction(receipt.payment.transactionId, receipt.mirrorNodeUrl ?? '')
    : {
      ok: false,
      transactionId: 'missing',
      error: 'missing payment transaction ID',
    };
  checks.push({
    name: 'mirror_node_transaction',
    ok: mirrorCheck.ok,
    detail: mirrorCheck.ok
      ? `${mirrorCheck.transactionId} ${mirrorCheck.status ?? 'confirmed'}`
      : mirrorCheck.error ?? 'mirror-node transaction lookup failed',
  });

  return {
    ok: checks.every(check => check.ok),
    checks,
  };
}

export async function fetchMirrorTransactionFromHiero(
  transactionId: string,
  _mirrorNodeUrl: string,
): Promise<MirrorTransactionCheck> {
  const url = toMirrorNodeTransactionUrl(transactionId);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        ok: false,
        transactionId,
        status: String(response.status),
        error: `${response.status} ${response.statusText}`,
      };
    }

    const body = await response.json() as {
      transactions?: Array<{
        result?: string;
        transaction_id?: string;
      }>;
    };
    const transaction = body.transactions?.[0];
    if (!transaction) {
      return {
        ok: false,
        transactionId,
        error: 'mirror node returned no transactions',
      };
    }

    const status = transaction.result ?? 'UNKNOWN';
    return {
      ok: status === 'SUCCESS',
      transactionId: transaction.transaction_id ?? transactionId,
      status,
      error: status === 'SUCCESS' ? undefined : `mirror node result is ${status}`,
    };
  } catch (err) {
    return {
      ok: false,
      transactionId,
      error: (err as Error).message,
    };
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
