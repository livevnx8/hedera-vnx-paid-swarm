/**
 * VNX Paid Micro-Swarm — Proof Receipt Builder
 * BIND HCS-PAYMENT-RAIL-BIND-011: persist identity_status; never success-receipt on deny.
 */

import { createHash } from 'crypto';
import { SwarmReceipt, WorkerVote, PaymentResult } from './types.js';
import { toHashScanTransactionUrl, toMirrorNodeTransactionUrl } from './proof-urls.js';

export class ProofReceiptBuilder {
  build(
    taskDescription: string,
    votes: WorkerVote[],
    selected: WorkerVote,
    payment: PaymentResult,
  ): SwarmReceipt {
    const timestamp = Date.now();
    const taskHash = this._sha256(taskDescription);
    const decisionPayload = `${selected.workerId}:${selected.score}:${payment.transactionId ?? 'no-tx'}:${taskHash}`;
    const decisionHash = this._sha256(decisionPayload);
    const identityStatus = payment.identity_status;
    const blocked = identityStatus === 'unresolved' || identityStatus === 'disagreement' || !identityStatus;
    const proofStatus =
      !blocked &&
      payment.status === 'success' &&
      payment.network === 'mainnet' &&
      !!payment.transactionId
        ? 'mainnet_confirmed'
        : 'not_mainnet_proof';
    const sha256Success = proofStatus === 'mainnet_confirmed' && payment.status === 'success' && !blocked;

    return {
      version: '1.0',
      network: payment.network,
      timestamp,
      taskHash,
      votes: votes.map(v => ({
        workerId: v.workerId,
        name: v.name,
        specialty: v.specialty,
        confidence: v.confidence,
        priceHbar: v.priceHbar,
        paymentAccount: v.paymentAccount,
        score: v.score ?? 0,
      })),
      selected: {
        workerId: selected.workerId,
        name: selected.name,
        specialty: selected.specialty,
        priceHbar: selected.priceHbar,
        paymentAccount: selected.paymentAccount,
        score: selected.score ?? 0,
      },
      payment,
      decisionHash,
      proofStatus,
      explorerUrl: sha256Success ? toHashScanTransactionUrl(payment.transactionId!) : undefined,
      mirrorNodeUrl: sha256Success ? toMirrorNodeTransactionUrl(payment.transactionId!) : undefined,
      identity_status: identityStatus,
      caller_canonical_present: payment.caller_canonical_present,
      manufactured: payment.manufactured,
      mirror_bytes_match: payment.mirror_bytes_match,
    };
  }

  private _sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}
