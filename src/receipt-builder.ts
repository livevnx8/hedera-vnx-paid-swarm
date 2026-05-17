/**
 * VNX Paid Micro-Swarm — Proof Receipt Builder
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
    const proofStatus =
      payment.status === 'success' && payment.network === 'mainnet' && !!payment.transactionId
        ? 'mainnet_confirmed'
        : 'not_mainnet_proof';

    return {
      version: '1.0',
      network: payment.network,
      timestamp,
      taskHash,
      votes: votes.map((v) => ({
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
      explorerUrl:
        proofStatus === 'mainnet_confirmed'
          ? toHashScanTransactionUrl(payment.transactionId!)
          : undefined,
      mirrorNodeUrl:
        proofStatus === 'mainnet_confirmed'
          ? toMirrorNodeTransactionUrl(payment.transactionId!)
          : undefined,
    };
  }

  private _sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}
