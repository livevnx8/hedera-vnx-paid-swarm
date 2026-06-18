/**
 * VNX Paid Micro-Swarm — Paid Swarm Coordinator
 */

import { WorkerVote, SwarmReceipt, PaymentRail } from './types.js';
import { VnxWorkerAgent } from './workers.js';
import { ProofReceiptBuilder } from './receipt-builder.js';
import { SPECIALTY_MATCH_WEIGHTS, inferTaskDomain } from './specialty-keywords.js';

export interface CoordinatorConfig {
  maxHbar: number;
  planOnly: boolean;
}

export class PaidSwarmCoordinator {
  constructor(
    private _workers: VnxWorkerAgent[],
    private _config: CoordinatorConfig,
    private _paymentRail: PaymentRail,
  ) {}

  async run(taskDescription: string): Promise<SwarmReceipt> {
    const builder = new ProofReceiptBuilder();

    // 1. Dispatch task to all workers
    const rawVotes = this._workers.map(w => w.execute(taskDescription));

    // 2. Score each worker
    const scoredVotes: WorkerVote[] = rawVotes.map(r => {
      const matchWeight = this._specialtyMatch(taskDescription, r.specialty);
      const effectivePrice = Math.max(r.priceHbar, 0.001); // minimum floor prevents price=0 gaming
      const score = (r.confidence * matchWeight) / (effectivePrice + 0.0001);
      return {
        workerId: r.workerId,
        name: r.name,
        specialty: r.specialty,
        recommendation: r.recommendation,
        confidence: r.confidence,
        priceHbar: r.priceHbar,
        evidence: r.evidence,
        paymentAccount: r.paymentAccount,
        score,
      };
    });

    // 3. Filter by cap
    const eligible = scoredVotes.filter(v => v.priceHbar <= this._config.maxHbar);

    // 4. If plan-only, skip payment and return receipt with skipped status
    if (this._config.planOnly) {
      const winner =
        eligible.length > 0
          ? eligible.reduce((best, cur) => (cur.score! > best.score! ? cur : best))
          : scoredVotes[0]; // fallback if all over cap
      const payment = {
        status: 'skipped_plan_only' as const,
        network: 'plan-only',
        amountHbar: winner.priceHbar,
        recipient: winner.paymentAccount,
        consensusTimestampMs: 0,
      };
      return builder.build(taskDescription, scoredVotes, winner, payment);
    }

    // 5. No eligible worker
    if (eligible.length === 0) {
      const payment = {
        status: 'payment_failed' as const,
        network: process.env['HEDERA_NETWORK'] ?? 'unknown',
        amountHbar: 0,
        recipient: '',
        error: 'No eligible worker: all quotes exceed max-hbar cap',
      };
      return builder.build(taskDescription, scoredVotes, scoredVotes[0], payment);
    }

    // 6. Select winner
    const winner = eligible.reduce((best, cur) => (cur.score! > best.score! ? cur : best));

    // 7. Execute payment
    const memo = `VNX-swarm:${winner.workerId}:${taskDescription.slice(0, 50)}`;
    const payment = await this._paymentRail.transfer(winner.paymentAccount, winner.priceHbar, memo);

    // 8. Build receipt
    return builder.build(taskDescription, scoredVotes, winner, payment);
  }

  private _specialtyMatch(task: string, workerSpecialty: string): number {
    const domain = inferTaskDomain(task);
    const map = SPECIALTY_MATCH_WEIGHTS[domain] ?? SPECIALTY_MATCH_WEIGHTS.prediction;
    return map[workerSpecialty] ?? 0.3;
  }
}
