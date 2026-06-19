/**
 * VNX Paid Micro-Swarm — End-to-End Lifecycle Tests
 *
 * Exercises the complete flow: task → worker voting → coordinator scoring →
 * payment → receipt → proof verification, verifying the full chain of data
 * integrity from input to cryptographic proof output.
 */

import { createHash } from 'crypto';
import {
  VnxWorkerAgent,
  DEFAULT_WORKERS,
  PaidSwarmCoordinator,
  ProofReceiptBuilder,
  SPECIALTY_KEYWORDS,
  SPECIALTY_MATCH_WEIGHTS,
  inferTaskDomain,
} from '../src/index.js';
import { PaymentRail, PaymentResult, SwarmReceipt, WorkerVote } from '../src/types.js';
import { verifySwarmProof, MirrorTransactionCheck } from '../src/proof-verifier.js';

/* ──────────────── Mock Payment Rail ──────────────── */

class E2EPaymentRail implements PaymentRail {
  log: Array<{ to: string; amount: number; memo?: string }> = [];

  async transfer(toAccountId: string, amountHbar: number, memo?: string): Promise<PaymentResult> {
    this.log.push({ to: toAccountId, amount: amountHbar, memo });
    return {
      status: 'success',
      transactionId: `0.0.10294360@${Math.floor(Date.now() / 1000)}.000000001`,
      network: 'mainnet',
      amountHbar,
      recipient: toAccountId,
      consensusTimestampMs: Date.now(),
    };
  }
}

/* ──────────────── Helpers ──────────────── */

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/* ──────────────── Tests ──────────────── */

describe('E2E: Full swarm lifecycle — mainnet-confirmed path', () => {
  const task = 'Predict HBAR price signal direction using RSI momentum analysis and trend forecast';
  let receipt: SwarmReceipt;
  let rail: E2EPaymentRail;

  beforeAll(async () => {
    rail = new E2EPaymentRail();
    const coordinator = new PaidSwarmCoordinator(
      DEFAULT_WORKERS,
      { maxHbar: 0.1, planOnly: false },
      rail,
    );
    receipt = await coordinator.run(task);
  });

  it('all 4 workers produce votes', () => {
    expect(receipt.votes.length).toBe(4);
    for (const vote of receipt.votes) {
      expect(vote.workerId).toBeTruthy();
      expect(vote.name).toBeTruthy();
      expect(vote.specialty).toBeTruthy();
      expect(vote.confidence).toBeGreaterThanOrEqual(0.5);
      expect(vote.confidence).toBeLessThanOrEqual(0.95);
      expect(vote.priceHbar).toBeGreaterThan(0);
      expect(vote.score).toBeGreaterThan(0);
    }
  });

  it('selected worker has the highest score', () => {
    const maxScore = Math.max(...receipt.votes.map(v => v.score));
    expect(receipt.selected.score).toBe(maxScore);
  });

  it('payment was executed exactly once with correct amount', () => {
    expect(rail.log.length).toBe(1);
    expect(rail.log[0].amount).toBe(receipt.selected.priceHbar);
    expect(rail.log[0].to).toBe(receipt.selected.paymentAccount);
  });

  it('payment memo contains worker ID and task prefix', () => {
    expect(rail.log[0].memo).toContain(receipt.selected.workerId);
    expect(rail.log[0].memo).toContain('VNX-swarm');
  });

  it('receipt has mainnet_confirmed proof status', () => {
    expect(receipt.payment.status).toBe('success');
    expect(receipt.payment.network).toBe('mainnet');
    expect(receipt.proofStatus).toBe('mainnet_confirmed');
  });

  it('receipt has valid HashScan explorer URL', () => {
    expect(receipt.explorerUrl).toMatch(/^https:\/\/hashscan\.io\/mainnet\/transaction\//);
    expect(receipt.explorerUrl).toContain(
      encodeURIComponent(receipt.payment.transactionId!.split('@')[1]),
    );
  });

  it('receipt has valid mirror-node URL', () => {
    expect(receipt.mirrorNodeUrl).toMatch(
      /^https:\/\/mainnet-public\.mirrornode\.hedera\.com\/api\/v1\/transactions\//,
    );
  });

  it('task hash is a valid SHA-256 of the task description', () => {
    expect(receipt.taskHash).toBe(sha256(task));
  });

  it('decision hash is deterministically derived from selected + payment', () => {
    const expectedPayload = `${receipt.selected.workerId}:${receipt.selected.score}:${receipt.payment.transactionId}:${receipt.taskHash}`;
    expect(receipt.decisionHash).toBe(sha256(expectedPayload));
  });

  it('proof verifier confirms task hash and decision hash', async () => {
    const mockMirrorFetch = async (transactionId: string): Promise<MirrorTransactionCheck> => ({
      ok: true,
      transactionId,
      status: 'SUCCESS',
    });

    const result = await verifySwarmProof(receipt, task, {
      fetchMirrorTransaction: mockMirrorFetch,
    });

    const taskCheck = result.checks.find(c => c.name === 'task_hash');
    expect(taskCheck?.ok).toBe(true);

    const decisionCheck = result.checks.find(c => c.name === 'decision_hash');
    expect(decisionCheck?.ok).toBe(true);

    const explorerCheck = result.checks.find(c => c.name === 'hashscan_url');
    expect(explorerCheck?.ok).toBe(true);

    const mirrorCheck = result.checks.find(c => c.name === 'mirror_node_transaction');
    expect(mirrorCheck?.ok).toBe(true);

    expect(result.ok).toBe(true);
  });
});

describe('E2E: Full swarm lifecycle — plan-only path', () => {
  const task = 'Analyze volatility squeeze pattern with Bollinger Band expansion';
  let receipt: SwarmReceipt;
  let rail: E2EPaymentRail;

  beforeAll(async () => {
    rail = new E2EPaymentRail();
    const coordinator = new PaidSwarmCoordinator(
      DEFAULT_WORKERS,
      { maxHbar: 0.1, planOnly: true },
      rail,
    );
    receipt = await coordinator.run(task);
  });

  it('all workers vote but no payment is executed', () => {
    expect(receipt.votes.length).toBe(4);
    expect(rail.log.length).toBe(0);
    expect(receipt.payment.status).toBe('skipped_plan_only');
  });

  it('volatility specialist is selected for volatility task', () => {
    expect(receipt.selected.specialty).toBe('volatility');
  });

  it('receipt has not_mainnet_proof status', () => {
    expect(receipt.proofStatus).toBe('not_mainnet_proof');
    expect(receipt.explorerUrl).toBeUndefined();
    expect(receipt.mirrorNodeUrl).toBeUndefined();
  });

  it('task hash is still valid', () => {
    expect(receipt.taskHash).toBe(sha256(task));
  });
});

describe('E2E: Full swarm lifecycle — cap-rejection path', () => {
  const task = 'Predict direction';
  let receipt: SwarmReceipt;
  let rail: E2EPaymentRail;

  beforeAll(async () => {
    rail = new E2EPaymentRail();
    const coordinator = new PaidSwarmCoordinator(
      DEFAULT_WORKERS,
      { maxHbar: 0.001, planOnly: false },
      rail,
    );
    receipt = await coordinator.run(task);
  });

  it('no payment is executed when all workers exceed cap', () => {
    expect(rail.log.length).toBe(0);
    expect(receipt.payment.status).toBe('payment_failed');
    expect(receipt.payment.error).toContain('No eligible worker');
  });

  it('receipt still contains all worker votes', () => {
    expect(receipt.votes.length).toBe(4);
    for (const vote of receipt.votes) {
      expect(vote.priceHbar).toBeGreaterThan(0.001);
    }
  });
});

describe('E2E: Specialty routing correctness', () => {
  const scenarios: Array<{ task: string; expectedDomain: string; expectedWorker: string }> = [
    {
      task: 'Predict the HBAR price direction and forecast the risk signal',
      expectedDomain: 'prediction',
      expectedWorker: 'BitLattice-ONNX',
    },
    {
      task: 'Analyze RSI momentum divergence and overbought velocity',
      expectedDomain: 'momentum',
      expectedWorker: 'RSI-Momentum',
    },
    {
      task: 'Detect Bollinger Band squeeze and volatility range expansion',
      expectedDomain: 'volatility',
      expectedWorker: 'BB-Volatility',
    },
    {
      task: 'Evaluate SMA cross moving average trend slope direction',
      expectedDomain: 'trend',
      expectedWorker: 'SMA-Trend',
    },
  ];

  for (const { task, expectedDomain, expectedWorker } of scenarios) {
    it(`routes "${expectedDomain}" task → ${expectedWorker}`, async () => {
      const rail = new E2EPaymentRail();
      const coordinator = new PaidSwarmCoordinator(
        DEFAULT_WORKERS,
        { maxHbar: 0.1, planOnly: true },
        rail,
      );
      const receipt = await coordinator.run(task);

      expect(inferTaskDomain(task)).toBe(expectedDomain);
      expect(receipt.selected.name).toBe(expectedWorker);
    });
  }
});

describe('E2E: Tamper detection', () => {
  it('proof verifier detects tampered task hash', async () => {
    const rail = new E2EPaymentRail();
    const coordinator = new PaidSwarmCoordinator(
      DEFAULT_WORKERS,
      { maxHbar: 0.1, planOnly: false },
      rail,
    );
    const receipt = await coordinator.run('Original task');

    const result = await verifySwarmProof(receipt, 'Tampered task description');
    const taskCheck = result.checks.find(c => c.name === 'task_hash');
    expect(taskCheck?.ok).toBe(false);
    expect(result.ok).toBe(false);
  });

  it('proof verifier detects tampered decision hash', async () => {
    const rail = new E2EPaymentRail();
    const coordinator = new PaidSwarmCoordinator(
      DEFAULT_WORKERS,
      { maxHbar: 0.1, planOnly: false },
      rail,
    );
    const receipt = await coordinator.run('Valid task');

    const tampered = { ...receipt, decisionHash: 'deadbeef'.repeat(8) };
    const result = await verifySwarmProof(tampered, 'Valid task');
    const decisionCheck = result.checks.find(c => c.name === 'decision_hash');
    expect(decisionCheck?.ok).toBe(false);
    expect(result.ok).toBe(false);
  });
});

describe('E2E: Multiple sequential runs produce independent receipts', () => {
  it('two runs with different tasks produce different hashes', async () => {
    const rail = new E2EPaymentRail();
    const coordinator = new PaidSwarmCoordinator(
      DEFAULT_WORKERS,
      { maxHbar: 0.1, planOnly: false },
      rail,
    );

    const r1 = await coordinator.run('Predict HBAR price signal');
    const r2 = await coordinator.run('Analyze RSI momentum divergence');

    expect(r1.taskHash).not.toBe(r2.taskHash);
    expect(r1.decisionHash).not.toBe(r2.decisionHash);
    expect(rail.log.length).toBe(2);
  });

  it('two runs with identical tasks produce same task hash and same winner', async () => {
    const rail = new E2EPaymentRail();
    const coordinator = new PaidSwarmCoordinator(
      DEFAULT_WORKERS,
      { maxHbar: 0.1, planOnly: true },
      rail,
    );

    const task = 'Same exact task description';
    const r1 = await coordinator.run(task);
    const r2 = await coordinator.run(task);

    expect(r1.taskHash).toBe(r2.taskHash);
    expect(r1.selected.workerId).toBe(r2.selected.workerId);
    expect(r1.selected.score).toBe(r2.selected.score);
  });
});
