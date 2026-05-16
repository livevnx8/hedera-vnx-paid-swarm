/**
 * VNX Paid Micro-Swarm — Paid Swarm Coordinator
 */

import { WorkerVote, SwarmReceipt, PaymentRail } from './types.js';
import { VnxWorkerAgent } from './workers.js';
import { ProofReceiptBuilder } from './receipt-builder.js';

const SPECIALTY_MATCH_WEIGHTS: Record<string, Record<string, number>> = {
  prediction: { prediction: 1.0, momentum: 0.5, volatility: 0.6, trend: 0.7 },
  momentum: { prediction: 0.5, momentum: 1.0, volatility: 0.7, trend: 0.6 },
  volatility: { prediction: 0.6, momentum: 0.7, volatility: 1.0, trend: 0.5 },
  trend: { prediction: 0.7, momentum: 0.6, volatility: 0.5, trend: 1.0 },
};

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

  async run(taskDescription: string, recipient: string): Promise<SwarmReceipt> {
    const builder = new ProofReceiptBuilder();

    // 1. Dispatch task to all workers
    const rawVotes = this._workers.map(w => w.execute(taskDescription));

    // 2. Score each worker
    const scoredVotes: WorkerVote[] = rawVotes.map(r => {
      const matchWeight = this._specialtyMatch(taskDescription, r.specialty);
      const score = (r.confidence * matchWeight) / (r.priceHbar + 0.0001);
      return {
        workerId: r.workerId,
        name: r.name,
        specialty: r.specialty,
        recommendation: r.recommendation,
        confidence: r.confidence,
        priceHbar: r.priceHbar,
        evidence: r.evidence,
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
        recipient,
      };
      return builder.build(taskDescription, scoredVotes, winner, payment);
    }

    // 5. No eligible worker
    if (eligible.length === 0) {
      const payment = {
        status: 'payment_failed' as const,
        network: process.env['HEDERA_NETWORK'] ?? 'unknown',
        amountHbar: 0,
        recipient,
        error: 'No eligible worker: all quotes exceed max-hbar cap',
      };
      return builder.build(taskDescription, scoredVotes, scoredVotes[0], payment);
    }

    // 6. Select winner
    const winner = eligible.reduce((best, cur) => (cur.score! > best.score! ? cur : best));

    // 7. Execute payment
    const memo = `VNX-swarm:${winner.workerId}:${taskDescription.slice(0, 50)}`;
    const payment = await this._paymentRail.transfer(recipient, winner.priceHbar, memo);

    // 8. Build receipt
    return builder.build(taskDescription, scoredVotes, winner, payment);
  }

  private _specialtyMatch(task: string, workerSpecialty: string): number {
    const lower = task.toLowerCase();
    // Derive task domain from keywords
    let bestDomain = 'prediction';
    let bestScore = 0;
    for (const [domain, keywords] of Object.entries({
      prediction: ['signal', 'predict', 'direction', 'price', 'risk', 'forecast', 'trend'],
      momentum: ['momentum', 'rsi', 'overbought', 'oversold', 'velocity'],
      volatility: ['volatility', 'bollinger', 'band', 'range', 'squeeze'],
      trend: ['trend', 'sma', 'cross', 'moving average', 'ema'],
    })) {
      let score = 0;
      for (const kw of keywords) {
        if (lower.includes(kw)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestDomain = domain;
      }
    }
    const map = SPECIALTY_MATCH_WEIGHTS[bestDomain] ?? SPECIALTY_MATCH_WEIGHTS.prediction;
    return map[workerSpecialty] ?? 0.3;
  }
}
