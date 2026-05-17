/**
 * VNX Paid Micro-Swarm — Tests
 */

import {
  VnxWorkerAgent,
  DEFAULT_WORKERS,
  PaidSwarmCoordinator,
  ProofReceiptBuilder,
  HieroVerifyVnxAgent,
  runLocalBenchmarks,
  formatBenchmarkSummary,
} from '../src/index.js';
import { PaymentRail, PaymentResult, SwarmReceipt } from '../src/types.js';
import { assertMainnetProofReceipt } from '../src/proof-validation.js';
import { verifySwarmProof } from '../src/proof-verifier.js';

/** Mock payment rail for testing */
class MockPaymentRail implements PaymentRail {
  transfers: Array<{ to: string; amount: number; memo?: string }> = [];
  failNext = false;

  async transfer(toAccountId: string, amountHbar: number, memo?: string): Promise<PaymentResult> {
    this.transfers.push({ to: toAccountId, amount: amountHbar, memo });
    if (this.failNext) {
      return {
        status: 'payment_failed',
        network: 'mainnet',
        amountHbar: amountHbar,
        recipient: toAccountId,
        error: 'Mock transfer failure',
      };
    }
    return {
      status: 'success',
      transactionId: `0.0.1@${Date.now()}-mock`,
      network: 'mainnet',
      amountHbar: amountHbar,
      recipient: toAccountId,
      consensusTimestampMs: Date.now(),
    };
  }
}

describe('VnxWorkerAgent', () => {
  it('returns deterministic confidence for known keywords', () => {
    const w = new VnxWorkerAgent('test', 'Test', 'prediction', 0.01, 'rec');
    const r1 = w.execute('Find the best price signal');
    const r2 = w.execute('Find the best price signal');
    expect(r1.confidence).toBe(r2.confidence);
    expect(r1.confidence).toBeGreaterThan(0.5);
  });

  it('gives higher confidence for matching specialty keywords', () => {
    const pred = new VnxWorkerAgent('p', 'P', 'prediction', 0.01, 'r');
    const mom = new VnxWorkerAgent('m', 'M', 'momentum', 0.01, 'r');
    const task = 'RSI momentum divergence analysis';
    expect(mom.execute(task).confidence).toBeGreaterThan(pred.execute(task).confidence);
  });
});

describe('PaidSwarmCoordinator — Winner Selection', () => {
  it('selects highest-score worker', async () => {
    const rail = new MockPaymentRail();
    const coord = new PaidSwarmCoordinator(
      DEFAULT_WORKERS,
      { maxHbar: 0.1, planOnly: false },
      rail,
    );
    const receipt = await coord.run(
      'Predict the HBAR price direction and forecast the signal',
      '0.0.999',
    );

    expect(receipt.selected.score).toBeGreaterThan(0);
    // ONNX-primary should win on price-signal tasks (higher confidence + match weight)
    expect(receipt.selected.name).toBe('BitLattice-ONNX');
    expect(receipt.payment.status).toBe('success');
    expect(rail.transfers.length).toBe(1);
    expect(rail.transfers[0].amount).toBe(0.005);
  });

  it('filters workers above max-hbar cap', async () => {
    const rail = new MockPaymentRail();
    // Cap below all worker prices
    const coord = new PaidSwarmCoordinator(
      DEFAULT_WORKERS,
      { maxHbar: 0.001, planOnly: false },
      rail,
    );
    const receipt = await coord.run('Any task', '0.0.999');

    expect(receipt.payment.status).toBe('payment_failed');
    expect(receipt.payment.error).toContain('No eligible worker');
    expect(rail.transfers.length).toBe(0);
  });

  it('skips payment in plan-only mode', async () => {
    const rail = new MockPaymentRail();
    const coord = new PaidSwarmCoordinator(DEFAULT_WORKERS, { maxHbar: 0.1, planOnly: true }, rail);
    const receipt = await coord.run('Any task', '0.0.999');

    expect(receipt.payment.status).toBe('skipped_plan_only');
    expect(receipt.payment.network).toBe('plan-only');
    expect(rail.transfers.length).toBe(0);
  });

  it('normalizes payment failure', async () => {
    const rail = new MockPaymentRail();
    rail.failNext = true;
    const coord = new PaidSwarmCoordinator(
      DEFAULT_WORKERS,
      { maxHbar: 0.1, planOnly: false },
      rail,
    );
    const receipt = await coord.run('Any task', '0.0.999');

    expect(receipt.payment.status).toBe('payment_failed');
    expect(receipt.payment.error).toBe('Mock transfer failure');
  });
});

describe('HederaPaymentRail — Credential Validation', () => {
  it('throws on non-mainnet when requireMainnet=true', async () => {
    const oldNetwork = process.env['HEDERA_NETWORK'];
    process.env['HEDERA_NETWORK'] = 'testnet';

    await expect(
      (async () => {
        const mod = await import('../src/payment-rail.js');
        new mod.HederaPaymentRail({ requireMainnet: true, maxHbar: 0.01 });
      })(),
    ).rejects.toThrow(/mainnet/);

    process.env['HEDERA_NETWORK'] = oldNetwork ?? 'mainnet';
  });
});

describe('ProofReceiptBuilder', () => {
  it('produces stable hashes for identical inputs', () => {
    const builder = new ProofReceiptBuilder();
    const votes = [
      {
        workerId: 'a',
        name: 'A',
        specialty: 'x',
        recommendation: 'r',
        confidence: 0.7,
        priceHbar: 0.01,
        evidence: 'e',
        score: 10,
      },
    ];
    const payment: PaymentResult = {
      status: 'success',
      transactionId: 'tx-123',
      network: 'mainnet',
      amountHbar: 0.01,
      recipient: '0.0.1',
      consensusTimestampMs: 0,
    };

    const r1 = builder.build('task', votes, votes[0], payment);
    const r2 = builder.build('task', votes, votes[0], payment);
    expect(r1.taskHash).toBe(r2.taskHash);
    expect(r1.decisionHash).toBe(r2.decisionHash);
    expect(r1.version).toBe('1.0');
    expect(r1.network).toBe('mainnet');
  });

  it('marks successful mainnet receipts as confirmed proof with verification URLs', () => {
    const builder = new ProofReceiptBuilder();
    const votes = [
      {
        workerId: 'a',
        name: 'A',
        specialty: 'x',
        recommendation: 'r',
        confidence: 0.7,
        priceHbar: 0.01,
        evidence: 'e',
        score: 10,
      },
    ];
    const payment: PaymentResult = {
      status: 'success',
      transactionId: '0.0.123@1778951290.123456789',
      network: 'mainnet',
      amountHbar: 0.01,
      recipient: '0.0.1',
      consensusTimestampMs: 1778951290123,
    };

    const receipt = builder.build('task', votes, votes[0], payment);

    expect(receipt.proofStatus).toBe('mainnet_confirmed');
    expect(receipt.explorerUrl).toBe(
      'https://hashscan.io/mainnet/transaction/0.0.123%401778951290.123456789',
    );
    expect(receipt.mirrorNodeUrl).toBe(
      'https://mainnet-public.mirrornode.hedera.com/api/v1/transactions/0.0.123-1778951290-123456789',
    );
    expect(receipt.votes[0].workerId).toBe('a');
    expect(receipt.selected.workerId).toBe('a');
  });

  it('marks dry-run or mock receipts as not mainnet proof', () => {
    const builder = new ProofReceiptBuilder();
    const votes = [
      {
        workerId: 'a',
        name: 'A',
        specialty: 'x',
        recommendation: 'r',
        confidence: 0.7,
        priceHbar: 0.01,
        evidence: 'e',
        score: 10,
      },
    ];
    const payment: PaymentResult = {
      status: 'success',
      transactionId: 'dry-run-mock-tx',
      network: 'dry-run',
      amountHbar: 0.01,
      recipient: '0.0.1',
      consensusTimestampMs: 1778951290123,
    };

    const receipt = builder.build('task', votes, votes[0], payment);

    expect(receipt.proofStatus).toBe('not_mainnet_proof');
    expect(receipt.explorerUrl).toBeUndefined();
    expect(receipt.mirrorNodeUrl).toBeUndefined();
  });

  it('includes all vote details', () => {
    const builder = new ProofReceiptBuilder();
    const votes = DEFAULT_WORKERS.map(w => ({
      workerId: w.id,
      name: w.name,
      specialty: w.specialty,
      recommendation: 'r',
      confidence: 0.5,
      priceHbar: w.priceHbar,
      evidence: 'e',
      score: 1,
    }));
    const payment: PaymentResult = {
      status: 'skipped_plan_only',
      network: 'plan-only',
      amountHbar: 0,
      recipient: '0.0.1',
    };

    const receipt = builder.build('task', votes, votes[0], payment);
    expect(receipt.votes.length).toBe(4);
    expect(receipt.votes[0]).toHaveProperty('name');
    expect(receipt.votes[0]).toHaveProperty('specialty');
    expect(receipt.votes[0]).toHaveProperty('confidence');
    expect(receipt.votes[0]).toHaveProperty('priceHbar');
    expect(receipt.votes[0]).toHaveProperty('score');
  });
});

describe('Mainnet proof validation', () => {
  const baseReceipt: SwarmReceipt = {
    version: '1.0',
    network: 'mainnet',
    timestamp: 1778951290123,
    taskHash: 'a'.repeat(64),
    votes: [
      {
        workerId: 'a',
        name: 'A',
        specialty: 'prediction',
        confidence: 0.7,
        priceHbar: 0.01,
        score: 10,
      },
    ],
    selected: { workerId: 'a', name: 'A', specialty: 'prediction', priceHbar: 0.01, score: 10 },
    payment: {
      status: 'success',
      transactionId: '0.0.123@1778951290.123456789',
      network: 'mainnet',
      amountHbar: 0.01,
      recipient: '0.0.1',
      consensusTimestampMs: 1778951290123,
    },
    decisionHash: 'b'.repeat(64),
    proofStatus: 'mainnet_confirmed',
    explorerUrl: 'https://hashscan.io/mainnet/transaction/0.0.123%401778951290.123456789',
    mirrorNodeUrl:
      'https://mainnet-public.mirrornode.hedera.com/api/v1/transactions/0.0.123-1778951290-123456789',
  };

  it('accepts confirmed mainnet proof receipts', () => {
    expect(() => assertMainnetProofReceipt(baseReceipt)).not.toThrow();
  });

  it('rejects successful dry-run receipts', () => {
    expect(() =>
      assertMainnetProofReceipt({
        ...baseReceipt,
        network: 'dry-run',
        proofStatus: 'not_mainnet_proof',
        payment: {
          ...baseReceipt.payment,
          network: 'dry-run',
          transactionId: 'dry-run-mock-tx',
        },
        explorerUrl: undefined,
        mirrorNodeUrl: undefined,
      }),
    ).toThrow(/not confirmed mainnet proof/);
  });

  it('rejects mainnet receipts without transaction ids', () => {
    expect(() =>
      assertMainnetProofReceipt({
        ...baseReceipt,
        proofStatus: 'not_mainnet_proof',
        payment: {
          ...baseReceipt.payment,
          transactionId: undefined,
        },
        explorerUrl: undefined,
        mirrorNodeUrl: undefined,
      }),
    ).toThrow(/transaction ID/);
  });

  it('includes normalized payment errors when rejecting failed receipts', () => {
    expect(() =>
      assertMainnetProofReceipt({
        ...baseReceipt,
        proofStatus: 'not_mainnet_proof',
        payment: {
          ...baseReceipt.payment,
          status: 'payment_failed',
          transactionId: undefined,
          error: 'invalid private key',
        },
        explorerUrl: undefined,
        mirrorNodeUrl: undefined,
      }),
    ).toThrow(/invalid private key/);
  });
});

describe('Swarm proof verifier', () => {
  const task = 'Predict the HBAR price direction and forecast the signal';

  function buildConfirmedReceipt(): SwarmReceipt {
    const builder = new ProofReceiptBuilder();
    const votes = [
      {
        workerId: 'onnx-primary',
        name: 'BitLattice-ONNX',
        specialty: 'prediction',
        recommendation: 'Use ONNX primary signal',
        confidence: 0.9,
        priceHbar: 0.005,
        evidence: 'Matched prediction keywords',
        score: 176.47058823529412,
      },
    ];
    return builder.build(task, votes, votes[0], {
      status: 'success',
      transactionId: '0.0.10294360@1778958335.880736678',
      network: 'mainnet',
      amountHbar: 0.005,
      recipient: '0.0.10294360',
      consensusTimestampMs: 1778958345039,
    });
  }

  it('verifies task hash, decision hash, proof status, and mirror transaction', async () => {
    const receipt = buildConfirmedReceipt();
    const result = await verifySwarmProof(receipt, task, {
      fetchMirrorTransaction: async transactionId => ({
        ok: true,
        transactionId,
        status: 'SUCCESS',
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.checks.map(c => [c.name, c.ok])).toEqual([
      ['task_hash', true],
      ['decision_hash', true],
      ['mainnet_proof_status', true],
      ['hashscan_url', true],
      ['mirror_node_transaction', true],
    ]);
  });

  it('rejects receipts with tampered decision hashes', async () => {
    const receipt = buildConfirmedReceipt();
    const result = await verifySwarmProof(
      {
        ...receipt,
        decisionHash: '0'.repeat(64),
      },
      task,
      {
        fetchMirrorTransaction: async transactionId => ({
          ok: true,
          transactionId,
          status: 'SUCCESS',
        }),
      },
    );

    expect(result.ok).toBe(false);
    expect(result.checks.find(c => c.name === 'decision_hash')).toMatchObject({
      ok: false,
    });
  });

  it('rejects receipts when mirror-node lookup cannot confirm the transaction', async () => {
    const receipt = buildConfirmedReceipt();
    const result = await verifySwarmProof(receipt, task, {
      fetchMirrorTransaction: async transactionId => ({
        ok: false,
        transactionId,
        status: 'NOT_FOUND',
        error: '404 Not Found',
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.checks.find(c => c.name === 'mirror_node_transaction')).toMatchObject({
      ok: false,
      detail: '404 Not Found',
    });
  });
});

describe('HieroVerifyVnxAgent', () => {
  const task = 'Predict the HBAR price direction and forecast the signal';

  function buildConfirmedReceipt(): SwarmReceipt {
    const builder = new ProofReceiptBuilder();
    const votes = [
      {
        workerId: 'onnx-primary',
        name: 'BitLattice-ONNX',
        specialty: 'prediction',
        recommendation: 'Use ONNX primary signal',
        confidence: 0.9,
        priceHbar: 0.005,
        evidence: 'Matched prediction keywords',
        score: 176.47058823529412,
      },
    ];
    return builder.build(task, votes, votes[0], {
      status: 'success',
      transactionId: '0.0.10294360@1778958335.880736678',
      network: 'mainnet',
      amountHbar: 0.005,
      recipient: '0.0.10294360',
      consensusTimestampMs: 1778958345039,
    });
  }

  it('returns an agent-style accepted verdict for confirmed mainnet receipts', async () => {
    const agent = new HieroVerifyVnxAgent({
      fetchMirrorTransaction: async transactionId => ({
        ok: true,
        transactionId,
        status: 'SUCCESS',
      }),
    });

    const report = await agent.verify(buildConfirmedReceipt(), task);

    expect(report.agentId).toBe('hiero-verify-vnx');
    expect(report.agentName).toBe('Hiero Verify VNX Agent');
    expect(report.verdict).toBe('accepted');
    expect(report.summary).toContain('5/5 checks passed');
    expect(report.proof.transactionId).toBe('0.0.10294360@1778958335.880736678');
    expect(report.proof.hashScanUrl).toContain('hashscan.io/mainnet/transaction');
    expect(report.checks.every(check => check.ok)).toBe(true);
  });

  it('returns a rejected verdict when proof checks fail', async () => {
    const agent = new HieroVerifyVnxAgent({
      fetchMirrorTransaction: async transactionId => ({
        ok: true,
        transactionId,
        status: 'SUCCESS',
      }),
    });
    const receipt = {
      ...buildConfirmedReceipt(),
      decisionHash: '0'.repeat(64),
    };

    const report = await agent.verify(receipt, task);

    expect(report.verdict).toBe('rejected');
    expect(report.summary).toContain('4/5 checks passed');
    expect(report.checks.find(check => check.name === 'decision_hash')).toMatchObject({
      ok: false,
    });
  });
});

describe('Local benchmarks', () => {
  it('runs reproducible local benchmark cases with numeric timing fields', async () => {
    const summary = await runLocalBenchmarks({ iterations: 3 });

    expect(summary.iterations).toBe(3);
    expect(summary.cases.map(item => item.name)).toEqual([
      'worker_selection_plan_only',
      'receipt_build_sha256',
      'hiero_verify_agent_local',
    ]);
    for (const item of summary.cases) {
      expect(item.runs).toBe(3);
      expect(Number.isFinite(item.totalMs)).toBe(true);
      expect(Number.isFinite(item.avgMs)).toBe(true);
      expect(Number.isFinite(item.minMs)).toBe(true);
      expect(Number.isFinite(item.maxMs)).toBe(true);
      expect(item.opsPerSecond).toBeGreaterThan(0);
    }
  });

  it('formats benchmark results as a markdown table', async () => {
    const summary = await runLocalBenchmarks({ iterations: 2 });
    const output = formatBenchmarkSummary(summary);

    expect(output).toContain('VNX Paid Swarm Local Benchmarks');
    expect(output).toContain('| Case | Runs | Avg ms | Min ms | Max ms | Ops/sec |');
    expect(output).toContain('| worker_selection_plan_only | 2 |');
    expect(output).toContain('| receipt_build_sha256 | 2 |');
    expect(output).toContain('| hiero_verify_agent_local | 2 |');
  });

  it('rejects invalid iteration counts', async () => {
    await expect(runLocalBenchmarks({ iterations: 0 })).rejects.toThrow(/positive integer/);
  });
});
