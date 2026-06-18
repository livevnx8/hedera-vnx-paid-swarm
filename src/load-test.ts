/**
 * VNX Paid Micro-Swarm — Heavy Load / Stress Test Harness
 *
 * Drives many full swarm cycles (dispatch → score → select → pay → receipt)
 * through a bounded concurrency pool, against an injected {@link PaymentRail}.
 * With a real {@link MultiOperatorHederaRail} this exercises the swarm under
 * sustained concurrent load on Hedera testnet; with a mock rail it runs locally
 * for deterministic unit tests.
 *
 * Reports throughput, end-to-end and payment latency percentiles, success/error
 * breakdown, total HBAR spent, and winner distribution.
 */

import { performance } from 'perf_hooks';
import { PaidSwarmCoordinator } from './coordinator.js';
import { DEFAULT_WORKERS, VnxWorkerAgent } from './workers.js';
import { PaymentRail, PaymentResult, SwarmReceipt } from './types.js';

const TASK_TEMPLATES = [
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

export function generateLoadTask(index: number, prefix?: string): string {
  const base = TASK_TEMPLATES[index % TASK_TEMPLATES.length];
  return `${prefix ? `${prefix} ` : ''}${base} for epoch ${index}`;
}

export interface LoadTestConfig {
  /** Total swarm cycles to run. Ignored when `durationMs` is set. Default 100. */
  tasks?: number;
  /** Soak mode: run cycles until this many ms have elapsed (overrides `tasks`). */
  durationMs?: number;
  /** Maximum simultaneous in-flight cycles. Default 10. */
  concurrency?: number;
  /** Maximum HBAR cap passed to the coordinator. Default 0.01. */
  maxHbar?: number;
  /**
   * Redirect every payment to this recipient instead of the winning worker's
   * payout account. Useful on testnet, where the default worker payout accounts
   * (mainnet IDs) do not exist. Pass a function — invoked with a monotonically
   * increasing per-transfer index — to round-robin across a pool.
   */
  recipientOverride?: string | ((transferIndex: number) => string);
  /** Prefix prepended to generated task descriptions. */
  taskPrefix?: string;
  /** Optional progress callback invoked after each completed cycle. */
  onProgress?: (completed: number, total: number | undefined) => void;
  /** Worker set to use. Defaults to DEFAULT_WORKERS. */
  workers?: VnxWorkerAgent[];
}

export interface LatencyStats {
  count: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface LoadTestResult {
  mode: 'count' | 'duration';
  configuredConcurrency: number;
  peakConcurrency: number;
  totalCycles: number;
  succeeded: number;
  failed: number;
  successRate: number;
  totalMs: number;
  cyclesPerSecond: number;
  paymentsPerSecond: number;
  cycleLatency: LatencyStats;
  paymentLatency: LatencyStats;
  totalHbarSpent: number;
  errorBreakdown: Record<string, number>;
  winnerDistribution: Record<string, number>;
  transactionSamples: string[];
}

const MAX_TX_SAMPLES = 10;

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const weight = rank - lo;
  return sortedAsc[lo] * (1 - weight) + sortedAsc[hi] * weight;
}

function summarizeLatency(samples: number[]): LatencyStats {
  if (samples.length === 0) {
    return { count: 0, minMs: 0, maxMs: 0, avgMs: 0, p50: 0, p90: 0, p95: 0, p99: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const total = sorted.reduce((sum, v) => sum + v, 0);
  return {
    count: sorted.length,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    avgMs: total / sorted.length,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

/** Normalize an error message into a coarse bucket for the breakdown table. */
function classifyError(message: string | undefined): string {
  if (!message) return 'unknown_error';
  const m = message.toUpperCase();
  const known = [
    'INSUFFICIENT_PAYER_BALANCE',
    'INSUFFICIENT_ACCOUNT_BALANCE',
    'INVALID_ACCOUNT_ID',
    'DUPLICATE_TRANSACTION',
    'TRANSACTION_EXPIRED',
    'PAYER_ACCOUNT_NOT_FOUND',
    'INVALID_SIGNATURE',
    'BUSY',
    'PLATFORM_NOT_ACTIVE',
    'TIMEOUT',
    'EXCEEDS CAP',
    'MUST BE POSITIVE',
  ];
  for (const key of known) {
    if (m.includes(key)) return key.toLowerCase().replace(/\s+/g, '_');
  }
  return message.slice(0, 60);
}

/**
 * Wraps a PaymentRail to (a) optionally redirect recipients and (b) time each
 * transfer call so we can report payment-level latency separately from the
 * full swarm cycle latency.
 */
class InstrumentedRail implements PaymentRail {
  paymentSamplesMs: number[] = [];
  private _transferCount = 0;

  constructor(
    private readonly _inner: PaymentRail,
    private readonly _recipientOverride?: string | ((transferIndex: number) => string),
  ) {}

  async transfer(toAccountId: string, amountHbar: number, memo?: string): Promise<PaymentResult> {
    let recipient = toAccountId;
    if (typeof this._recipientOverride === 'function') {
      // Use a per-transfer counter (not a shared cycle index) so recipient
      // selection is correct under concurrency.
      recipient = this._recipientOverride(this._transferCount++);
    } else if (typeof this._recipientOverride === 'string') {
      recipient = this._recipientOverride;
    }
    const start = performance.now();
    const result = await this._inner.transfer(recipient, amountHbar, memo);
    this.paymentSamplesMs.push(performance.now() - start);
    return result;
  }
}

/**
 * Heavy load / stress test harness for the VNX paid swarm.
 *
 * @example
 * const tester = new VnxSwarmLoadTester(rail);
 * const result = await tester.run({ tasks: 500, concurrency: 16 });
 * console.log(formatLoadTestSummary(result));
 */
export class VnxSwarmLoadTester {
  constructor(private readonly _rail: PaymentRail) {}

  async run(config: LoadTestConfig): Promise<LoadTestResult> {
    const concurrency = Math.max(1, Math.floor(config.concurrency ?? 10));
    const maxHbar = config.maxHbar ?? 0.01;
    const workers = config.workers ?? DEFAULT_WORKERS;
    const durationMs = config.durationMs;
    const mode: 'count' | 'duration' = durationMs && durationMs > 0 ? 'duration' : 'count';
    const totalTasks = mode === 'count' ? Math.max(1, Math.floor(config.tasks ?? 100)) : undefined;

    const instrumented = new InstrumentedRail(this._rail, config.recipientOverride);
    const coordinator = new PaidSwarmCoordinator(
      workers,
      { maxHbar, planOnly: false },
      instrumented,
    );

    const cycleSamplesMs: number[] = [];
    const errorBreakdown: Record<string, number> = {};
    const winnerDistribution: Record<string, number> = {};
    const transactionSamples: string[] = [];
    let succeeded = 0;
    let failed = 0;
    let totalHbarSpent = 0;
    let completed = 0;
    let dispatched = 0;
    let inFlight = 0;
    let peakConcurrency = 0;

    const start = performance.now();
    const deadline = mode === 'duration' ? start + (durationMs as number) : Infinity;

    const shouldDispatchMore = (): boolean => {
      if (mode === 'count') return dispatched < (totalTasks as number);
      return performance.now() < deadline;
    };

    const runCycle = async (cycleIndex: number): Promise<void> => {
      inFlight++;
      if (inFlight > peakConcurrency) peakConcurrency = inFlight;
      const cycleStart = performance.now();
      try {
        const task = generateLoadTask(cycleIndex, config.taskPrefix);
        const receipt: SwarmReceipt = await coordinator.run(task);
        cycleSamplesMs.push(performance.now() - cycleStart);

        winnerDistribution[receipt.selected.workerId] =
          (winnerDistribution[receipt.selected.workerId] ?? 0) + 1;

        if (receipt.payment.status === 'success') {
          succeeded++;
          totalHbarSpent += receipt.payment.amountHbar;
          if (receipt.payment.transactionId && transactionSamples.length < MAX_TX_SAMPLES) {
            transactionSamples.push(receipt.payment.transactionId);
          }
        } else {
          failed++;
          const bucket = classifyError(receipt.payment.error);
          errorBreakdown[bucket] = (errorBreakdown[bucket] ?? 0) + 1;
        }
      } catch (err) {
        cycleSamplesMs.push(performance.now() - cycleStart);
        failed++;
        const bucket = classifyError((err as Error).message);
        errorBreakdown[bucket] = (errorBreakdown[bucket] ?? 0) + 1;
      } finally {
        inFlight--;
        completed++;
        config.onProgress?.(completed, totalTasks);
      }
    };

    const worker = async (): Promise<void> => {
      while (shouldDispatchMore()) {
        const cycleIndex = dispatched++;
        await runCycle(cycleIndex);
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    const totalMs = performance.now() - start;
    const totalSec = totalMs / 1000;
    const totalCycles = completed;

    return {
      mode,
      configuredConcurrency: concurrency,
      peakConcurrency,
      totalCycles,
      succeeded,
      failed,
      successRate: totalCycles > 0 ? succeeded / totalCycles : 0,
      totalMs,
      cyclesPerSecond: totalSec > 0 ? totalCycles / totalSec : 0,
      paymentsPerSecond: totalSec > 0 ? succeeded / totalSec : 0,
      cycleLatency: summarizeLatency(cycleSamplesMs),
      paymentLatency: summarizeLatency(instrumented.paymentSamplesMs),
      totalHbarSpent,
      errorBreakdown,
      winnerDistribution,
      transactionSamples,
    };
  }
}

export function formatLoadTestSummary(result: LoadTestResult): string {
  const lines: string[] = [];
  lines.push('╔════════════════════════════════════════════════════════════╗');
  lines.push('║  VNX Paid Swarm — Heavy Load / Stress Test                 ║');
  lines.push('╚════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Mode:                 ${result.mode}`);
  lines.push(
    `Concurrency:          ${result.configuredConcurrency} (peak ${result.peakConcurrency})`,
  );
  lines.push(`Total cycles:         ${result.totalCycles.toLocaleString()}`);
  lines.push(
    `Succeeded / Failed:   ${result.succeeded.toLocaleString()} / ${result.failed.toLocaleString()}`,
  );
  lines.push(`Success rate:         ${(result.successRate * 100).toFixed(2)}%`);
  lines.push(`Total time:           ${result.totalMs.toFixed(2)} ms`);
  lines.push(`Cycles/sec:           ${result.cyclesPerSecond.toFixed(2)}`);
  lines.push(`Payments/sec:         ${result.paymentsPerSecond.toFixed(2)}`);
  lines.push(`Total HBAR spent:     ${result.totalHbarSpent.toFixed(6)} ℏ`);
  lines.push('');
  lines.push('Cycle latency (ms):   ' + formatLatency(result.cycleLatency));
  lines.push('Payment latency (ms): ' + formatLatency(result.paymentLatency));
  lines.push('');

  const errors = Object.entries(result.errorBreakdown).sort((a, b) => b[1] - a[1]);
  if (errors.length > 0) {
    lines.push('Error breakdown:');
    for (const [bucket, count] of errors) {
      lines.push(`  ${bucket.padEnd(34)} ${count.toLocaleString().padStart(8)}`);
    }
    lines.push('');
  }

  const winners = Object.entries(result.winnerDistribution).sort((a, b) => b[1] - a[1]);
  if (winners.length > 0) {
    lines.push('Winner distribution:');
    for (const [workerId, wins] of winners) {
      lines.push(`  ${workerId.padEnd(24)} ${wins.toLocaleString().padStart(8)} wins`);
    }
    lines.push('');
  }

  if (result.transactionSamples.length > 0) {
    lines.push('Sample transaction IDs:');
    for (const tx of result.transactionSamples) {
      lines.push(`  ${tx}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatLatency(stats: LatencyStats): string {
  return (
    `avg=${stats.avgMs.toFixed(2)} ` +
    `min=${stats.minMs.toFixed(2)} ` +
    `p50=${stats.p50.toFixed(2)} ` +
    `p90=${stats.p90.toFixed(2)} ` +
    `p95=${stats.p95.toFixed(2)} ` +
    `p99=${stats.p99.toFixed(2)} ` +
    `max=${stats.maxMs.toFixed(2)}`
  );
}
