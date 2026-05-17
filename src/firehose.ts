/**
 * VNX Prediction Firehose — Deterministic local prediction throughput demo.
 *
 * Generates N prediction tasks, runs the worker swarm, builds receipts,
 * verifies with HieroVerifyVnxAgent, and reports throughput metrics.
 * No Hedera network calls. Pure local deterministic stack measurement.
 */

import { DEFAULT_WORKERS } from './workers.js';
import { PaidSwarmCoordinator } from './coordinator.js';
import { HieroVerifyVnxAgent } from './hiero-verify-agent.js';
import { SwarmReceipt, PaymentResult } from './types.js';

export interface FirehoseResult {
  taskCount: number;
  totalMs: number;
  predictionsPerSecond: number;
  receiptsPerSecond: number;
  verifierChecksPerSecond: number;
  topWorkers: Array<{ workerId: string; wins: number }>;
  totalSimulatedHbar: number;
}

function generateTask(index: number): string {
  const signals = [
    'Predict the HBAR price direction',
    'Forecast BTC volatility signal',
    'Score ETH momentum breakout',
    'Rank SOL sentiment shift',
    'Detect AVAX liquidity anomaly',
    'Measure DOT cross-chain flow',
    'Quantify MATIC staking yield',
    'Evaluate ARB sequencer health',
    'Gauge OP Bedrock upgrade impact',
    'Assess NEAR sharding throughput',
  ];
  const base = signals[index % signals.length];
  return `${base} for epoch ${index}`;
}

export class VnxPredictionFirehose {
  private _workers = DEFAULT_WORKERS;
  private _paymentRail = {
    async transfer(_to: string, _amount: number, _memo?: string): Promise<PaymentResult> {
      return {
        status: 'success',
        transactionId: `0.0.10294360@${Date.now()}.${Math.floor(Math.random() * 1e9)}`,
        network: 'mainnet',
        amountHbar: _amount,
        recipient: _to,
        consensusTimestampMs: Date.now(),
      };
    },
  };
  private _coordinator = new PaidSwarmCoordinator(
    this._workers,
    { maxHbar: 0.01, planOnly: false },
    this._paymentRail,
  );
  private _verifier = new HieroVerifyVnxAgent({
    fetchMirrorTransaction: async () => ({
      ok: true,
      transactionId: '0.0.10294360@0.0',
      status: 'SUCCESS',
    }),
  });

  async run(options: { tasks: number }): Promise<FirehoseResult> {
    const taskCount = options.tasks;
    if (!Number.isInteger(taskCount) || taskCount < 1) {
      throw new Error('tasks must be a positive integer');
    }

    const start = performance.now();
    const workerWins: Record<string, number> = {};
    let totalSimulatedHbar = 0;
    const receipts: SwarmReceipt[] = [];
    const taskDescriptions: string[] = [];

    for (let i = 0; i < taskCount; i++) {
      const task = generateTask(i);
      const receipt = await this._coordinator.run(task, '0.0.10294360');
      receipts.push(receipt);
      taskDescriptions.push(task);

      if (receipt.payment.status === 'success') {
        totalSimulatedHbar += receipt.payment.amountHbar;
        workerWins[receipt.selected.workerId] = (workerWins[receipt.selected.workerId] || 0) + 1;
      }
    }

    const receiptEnd = performance.now();
    const receiptMs = receiptEnd - start;

    // Verify all receipts
    for (let i = 0; i < receipts.length; i++) {
      await this._verifier.verify(receipts[i], taskDescriptions[i]);
    }

    const totalMs = performance.now() - start;
    const totalSec = totalMs / 1000;

    const topWorkers = Object.entries(workerWins)
      .map(([workerId, wins]) => ({ workerId, wins }))
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 5);

    return {
      taskCount,
      totalMs,
      predictionsPerSecond: taskCount / totalSec,
      receiptsPerSecond: receipts.length / (receiptMs / 1000),
      verifierChecksPerSecond: receipts.length / totalSec,
      topWorkers,
      totalSimulatedHbar,
    };
  }
}

export function formatFirehoseSummary(result: FirehoseResult): string {
  const lines: string[] = [];
  lines.push('╔════════════════════════════════════════════════════════════╗');
  lines.push('║  VNX Prediction Firehose — Local Throughput Demo           ║');
  lines.push('╚════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Tasks:              ${result.taskCount.toLocaleString()}`);
  lines.push(`Total Time:         ${result.totalMs.toFixed(2)} ms`);
  lines.push(`Predictions/sec:    ${result.predictionsPerSecond.toFixed(2)}`);
  lines.push(`Receipts/sec:       ${result.receiptsPerSecond.toFixed(2)}`);
  lines.push(`Verifier checks/s:  ${result.verifierChecksPerSecond.toFixed(2)}`);
  lines.push(`Simulated HBAR:     ${result.totalSimulatedHbar.toFixed(4)} ℏ`);
  lines.push('');
  lines.push('Top Workers:');
  for (const w of result.topWorkers) {
    lines.push(`  ${w.workerId.padEnd(24)} ${w.wins.toLocaleString().padStart(6)} wins`);
  }
  lines.push('');
  lines.push('No Hedera network calls were made in this local demo.');
  return lines.join('\n');
}
