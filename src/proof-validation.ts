/**
 * VNX Paid Micro-Swarm — Proof Validation
 *
 * Guards live submission paths from labeling mock or incomplete receipts as
 * confirmed Hedera mainnet proof.
 */

import { SwarmReceipt } from './types.js';

export function assertMainnetProofReceipt(receipt: SwarmReceipt): void {
  if (receipt.payment.status !== 'success') {
    const detail = receipt.payment.error ? ` (${receipt.payment.error})` : '';
    throw new Error(
      `Receipt is not confirmed mainnet proof: payment status is ${receipt.payment.status}${detail}`,
    );
  }

  if (receipt.network !== 'mainnet' || receipt.payment.network !== 'mainnet') {
    throw new Error(
      `Receipt is not confirmed mainnet proof: network is receipt=${receipt.network}, payment=${receipt.payment.network}`,
    );
  }

  if (!receipt.payment.transactionId) {
    throw new Error('Receipt is not confirmed mainnet proof: missing payment transaction ID');
  }

  if (receipt.proofStatus !== 'mainnet_confirmed') {
    throw new Error(
      `Receipt is not confirmed mainnet proof: proof status is ${receipt.proofStatus}`,
    );
  }

  if (!receipt.explorerUrl || !receipt.mirrorNodeUrl) {
    throw new Error('Receipt is not confirmed mainnet proof: missing explorer or mirror-node URL');
  }
}
