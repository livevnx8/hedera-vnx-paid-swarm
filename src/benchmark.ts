/**
 * Reproducible local benchmarks for deterministic VNX swarm operations.
 *
 * These benchmarks intentionally avoid Hedera network calls. They measure the
 * local package surface: worker selection, receipt building, and proof
 * verification with an injected mirror-node result.
 */

import { performance } from 'perf_hooks';
import { DEFAULT_WORKERS } from './workers.js';
import { PaidSwarmCoordinator } from './coordinator.js';
import { ProofReceiptBuilder } from './receipt-builder.js';
import { HieroVerifyVnxAgent } from './hiero-verify-agent.js';
import { PaymentRail, PaymentResult, WorkerVote } from './types.js';

export interface BenchmarkCaseResult {
  name: string;
  runs: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  opsPerSecond: number;
}

export interface BenchmarkSummary {
  node: string;
  iterations: number;
  task: string;
  cases: BenchmarkCaseResult[];
}

export interface BenchmarkOptions {
  iterations?: number;
  task?: string;
}

const DEFAULT_TASK = 'Predict the HBAR price direction and forecast the signal';
const DEFAULT_ITERATIONS = 1000;

class BenchmarkPaymentRail implements PaymentRail {
  async transfer(toAccountId: string, amountHbar: number): Promise<PaymentResult> {
    return {
      status: 'success',
      transactionId: '0.0.10294360@1778958335.880736678',
      network: 'mainnet',
      amountHbar,
      recipient: toAccountId,
      consensusTimestampMs: 1778958345039,
    };
  }
}

export async function runLocalBenchmarks(
  options: BenchmarkOptions = {},
): Promise<BenchmarkSummary> {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const task = options.task ?? DEFAULT_TASK;

  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error('Benchmark iterations must be a positive integer');
  }

  const votes: WorkerVote[] = DEFAULT_WORKERS.map(worker => {
    const result = worker.execute(task);
    return {
      ...result,
      score: result.confidence / (result.priceHbar + 0.0001),
    };
  });
  const winner = votes[0];
  const payment: PaymentResult = {
    status: 'success',
    transactionId: '0.0.10294360@1778958335.880736678',
    network: 'mainnet',
    amountHbar: winner.priceHbar,
    recipient: '0.0.10294360',
    consensusTimestampMs: 1778958345039,
  };
  const receipt = new ProofReceiptBuilder().build(task, votes, winner, payment);
  const verifyAgent = new HieroVerifyVnxAgent({
    fetchMirrorTransaction: async transactionId => ({
      ok: true,
      transactionId,
      status: 'SUCCESS',
    }),
  });

  return {
    node: process.version,
    iterations,
    task,
    cases: [
      await measureCase('worker_selection_plan_only', iterations, async () => {
        const coordinator = new PaidSwarmCoordinator(
          DEFAULT_WORKERS,
          { maxHbar: 0.01, planOnly: true },
          new BenchmarkPaymentRail(),
        );
        await coordinator.run(task, '0.0.10294360');
      }),
      await measureCase('receipt_build_sha256', iterations, () => {
        new ProofReceiptBuilder().build(task, votes, winner, payment);
      }),
      await measureCase('hiero_verify_agent_local', iterations, async () => {
        await verifyAgent.verify(receipt, task);
      }),
    ],
  };
}

export function formatBenchmarkSummary(summary: BenchmarkSummary): string {
  const lines = [
    'VNX Paid Swarm Local Benchmarks',
    `Node: ${summary.node}`,
    `Iterations: ${summary.iterations}`,
    '',
    '| Case | Runs | Avg ms | Min ms | Max ms | Ops/sec |',
    '|------|------|--------|--------|--------|---------|',
  ];

  for (const item of summary.cases) {
    lines.push(
      `| ${item.name} | ${item.runs} | ${item.avgMs.toFixed(4)} | ${item.minMs.toFixed(4)} | ${item.maxMs.toFixed(4)} | ${item.opsPerSecond.toFixed(2)} |`,
    );
  }

  return lines.join('\n');
}

async function measureCase(
  name: string,
  runs: number,
  fn: () => void | Promise<void>,
): Promise<BenchmarkCaseResult> {
  const samples: number[] = [];

  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }

  const totalMs = samples.reduce((sum, value) => sum + value, 0);
  const avgMs = totalMs / runs;
  return {
    name,
    runs,
    totalMs,
    avgMs,
    minMs: Math.min(...samples),
    maxMs: Math.max(...samples),
    opsPerSecond: avgMs > 0 ? 1000 / avgMs : Number.POSITIVE_INFINITY,
  };
}
