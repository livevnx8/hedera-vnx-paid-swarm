/**
 * VNX Paid Micro-Swarm — Heavy Load / Stress Test harness tests
 *
 * All tests use mock rails — no Hedera network calls — so they run in CI.
 */

import {
  VnxSwarmLoadTester,
  formatLoadTestSummary,
  generateLoadTask,
  LoadTestResult,
} from '../src/load-test.js';
import {
  MultiOperatorHederaRail,
  HederaClientLike,
  parseOperatorCredentials,
} from '../src/multi-operator-rail.js';
import { PaymentRail, PaymentResult } from '../src/types.js';

/** Mock rail that succeeds after a tiny async delay and records calls. */
class RecordingRail implements PaymentRail {
  calls: Array<{ to: string; amount: number; memo?: string }> = [];
  inFlight = 0;
  peak = 0;

  constructor(private _delayMs = 2) {}

  async transfer(toAccountId: string, amountHbar: number, memo?: string): Promise<PaymentResult> {
    this.inFlight++;
    if (this.inFlight > this.peak) this.peak = this.inFlight;
    this.calls.push({ to: toAccountId, amount: amountHbar, memo });
    await new Promise(r => setTimeout(r, this._delayMs));
    this.inFlight--;
    return {
      status: 'success',
      transactionId: `0.0.1@${Date.now()}.${this.calls.length}`,
      network: 'testnet',
      amountHbar,
      recipient: toAccountId,
      consensusTimestampMs: Date.now(),
    };
  }
}

/** Mock rail that always fails with a configurable error. */
class FailingRail implements PaymentRail {
  constructor(private _error = 'INVALID_ACCOUNT_ID: bad recipient') {}
  async transfer(toAccountId: string, amountHbar: number): Promise<PaymentResult> {
    return {
      status: 'payment_failed',
      network: 'testnet',
      amountHbar,
      recipient: toAccountId,
      error: this._error,
    };
  }
}

describe('generateLoadTask', () => {
  it('rotates templates and includes the epoch index', () => {
    expect(generateLoadTask(0)).toContain('epoch 0');
    expect(generateLoadTask(0)).not.toBe(generateLoadTask(1));
    expect(generateLoadTask(0, 'PFX')).toMatch(/^PFX /);
  });
});

describe('VnxSwarmLoadTester — count mode', () => {
  it('runs exactly the configured number of cycles and tallies success', async () => {
    const rail = new RecordingRail(1);
    const tester = new VnxSwarmLoadTester(rail);
    const result = await tester.run({ tasks: 50, concurrency: 8, maxHbar: 0.1 });

    expect(result.mode).toBe('count');
    expect(result.totalCycles).toBe(50);
    expect(result.succeeded).toBe(50);
    expect(result.failed).toBe(0);
    expect(result.successRate).toBe(1);
    expect(rail.calls.length).toBe(50);
    // Winner distribution should sum to the number of cycles.
    const wins = Object.values(result.winnerDistribution).reduce((a, b) => a + b, 0);
    expect(wins).toBe(50);
    // Winners vary by task keyword, so just assert a positive aggregate spend
    // within the plausible per-cycle price range (0.002–0.005 HBAR).
    expect(result.totalHbarSpent).toBeGreaterThan(0);
    expect(result.totalHbarSpent).toBeLessThanOrEqual(50 * 0.005);
    expect(result.transactionSamples.length).toBeLessThanOrEqual(10);
    expect(result.transactionSamples.length).toBeGreaterThan(0);
  });

  it('respects the concurrency cap', async () => {
    const rail = new RecordingRail(5);
    const tester = new VnxSwarmLoadTester(rail);
    const result = await tester.run({ tasks: 40, concurrency: 6, maxHbar: 0.1 });

    expect(rail.peak).toBeLessThanOrEqual(6);
    expect(result.peakConcurrency).toBeLessThanOrEqual(6);
    // With 40 tasks and a 5ms delay, peak should reach the cap.
    expect(result.peakConcurrency).toBe(6);
  });

  it('computes sane latency percentiles', async () => {
    const tester = new VnxSwarmLoadTester(new RecordingRail(2));
    const result = await tester.run({ tasks: 30, concurrency: 4, maxHbar: 0.1 });
    const l = result.cycleLatency;
    expect(l.count).toBe(30);
    expect(l.minMs).toBeLessThanOrEqual(l.p50);
    expect(l.p50).toBeLessThanOrEqual(l.p95);
    expect(l.p95).toBeLessThanOrEqual(l.p99);
    expect(l.p99).toBeLessThanOrEqual(l.maxMs);
    expect(result.paymentLatency.count).toBe(30);
  });

  it('applies a string recipient override to every payment', async () => {
    const rail = new RecordingRail(1);
    const tester = new VnxSwarmLoadTester(rail);
    await tester.run({ tasks: 10, concurrency: 4, maxHbar: 0.1, recipientOverride: '0.0.9999' });
    expect(rail.calls.every(c => c.to === '0.0.9999')).toBe(true);
  });

  it('round-robins a function recipient override across a pool', async () => {
    const rail = new RecordingRail(1);
    const pool = ['0.0.1', '0.0.2', '0.0.3'];
    const tester = new VnxSwarmLoadTester(rail);
    await tester.run({
      tasks: 12,
      concurrency: 4,
      maxHbar: 0.1,
      recipientOverride: i => pool[i % pool.length],
    });
    // Each pool entry used exactly 4 times (12 / 3), regardless of order.
    const counts = pool.map(p => rail.calls.filter(c => c.to === p).length);
    expect(counts).toEqual([4, 4, 4]);
  });

  it('tallies payment failures into the error breakdown', async () => {
    const tester = new VnxSwarmLoadTester(new FailingRail('INVALID_ACCOUNT_ID: nope'));
    const result = await tester.run({ tasks: 20, concurrency: 5, maxHbar: 0.1 });
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(20);
    expect(result.errorBreakdown['invalid_account_id']).toBe(20);
    expect(result.totalHbarSpent).toBe(0);
  });
});

describe('VnxSwarmLoadTester — duration (soak) mode', () => {
  it('runs for approximately the requested duration', async () => {
    const tester = new VnxSwarmLoadTester(new RecordingRail(1));
    const start = Date.now();
    const result = await tester.run({ durationMs: 120, concurrency: 4, maxHbar: 0.1 });
    const elapsed = Date.now() - start;

    expect(result.mode).toBe('duration');
    expect(result.totalCycles).toBeGreaterThan(0);
    expect(elapsed).toBeGreaterThanOrEqual(110);
    // Should not run wildly past the deadline (allow scheduling slack).
    expect(elapsed).toBeLessThan(2000);
  });
});

describe('formatLoadTestSummary', () => {
  it('renders key metrics', async () => {
    const tester = new VnxSwarmLoadTester(new RecordingRail(1));
    const result: LoadTestResult = await tester.run({ tasks: 5, concurrency: 2, maxHbar: 0.1 });
    const text = formatLoadTestSummary(result);
    expect(text).toContain('Heavy Load / Stress Test');
    expect(text).toContain('Cycles/sec');
    expect(text).toContain('Payment latency');
    expect(text).toContain('Winner distribution');
  });
});

describe('MultiOperatorHederaRail', () => {
  function fakeClientFactory() {
    const transfers: Array<{ operator: string; to: string }> = [];
    const factory = (config: { accountId: string }): HederaClientLike => ({
      async transferHbar(to: string, _amount: number) {
        transfers.push({ operator: config.accountId, to });
        return {
          transactionId: `${config.accountId}@tx`,
          status: 'success',
          consensusTimestampMs: 1,
        };
      },
      async getBalance() {
        return { hbar: 100 };
      },
      close() {},
    });
    return { factory, transfers };
  }

  it('round-robins transfers across operators', async () => {
    const { factory, transfers } = fakeClientFactory();
    const rail = new MultiOperatorHederaRail({
      operators: [
        { accountId: '0.0.1', privateKey: 'k1' },
        { accountId: '0.0.2', privateKey: 'k2' },
      ],
      network: 'testnet',
      maxHbar: 0.01,
      clientFactory: factory,
    });
    await rail.transfer('0.0.9', 0.001);
    await rail.transfer('0.0.9', 0.001);
    await rail.transfer('0.0.9', 0.001);
    expect(transfers.map(t => t.operator)).toEqual(['0.0.1', '0.0.2', '0.0.1']);
  });

  it('never pays from an operator to itself', async () => {
    const { factory, transfers } = fakeClientFactory();
    const rail = new MultiOperatorHederaRail({
      operators: [
        { accountId: '0.0.1', privateKey: 'k1' },
        { accountId: '0.0.2', privateKey: 'k2' },
      ],
      network: 'testnet',
      maxHbar: 0.01,
      clientFactory: factory,
    });
    // First cursor pick would be operator 0.0.1; recipient is also 0.0.1, so
    // the rail must advance to 0.0.2 as the sender.
    await rail.transfer('0.0.1', 0.001);
    expect(transfers[0]).toEqual({ operator: '0.0.2', to: '0.0.1' });
  });

  it('enforces the max-hbar cap and positive amounts', async () => {
    const { factory } = fakeClientFactory();
    const rail = new MultiOperatorHederaRail({
      operators: [{ accountId: '0.0.1', privateKey: 'k1' }],
      network: 'testnet',
      maxHbar: 0.01,
      clientFactory: factory,
    });
    const over = await rail.transfer('0.0.9', 1);
    expect(over.status).toBe('payment_failed');
    expect(over.error).toContain('exceeds cap');
    const neg = await rail.transfer('0.0.9', -1);
    expect(neg.status).toBe('payment_failed');
  });

  it('refuses mainnet unless explicitly allowed', () => {
    expect(
      () =>
        new MultiOperatorHederaRail({
          operators: [{ accountId: '0.0.1', privateKey: 'k1' }],
          network: 'mainnet',
          maxHbar: 0.01,
        }),
    ).toThrow(/mainnet/i);
  });

  it('requires at least one operator', () => {
    expect(
      () => new MultiOperatorHederaRail({ operators: [], network: 'testnet', maxHbar: 0.01 }),
    ).toThrow(/at least one operator/);
  });

  it('reports operator balances', async () => {
    const { factory } = fakeClientFactory();
    const rail = new MultiOperatorHederaRail({
      operators: [
        { accountId: '0.0.1', privateKey: 'k1' },
        { accountId: '0.0.2', privateKey: 'k2' },
      ],
      network: 'testnet',
      maxHbar: 0.01,
      clientFactory: factory,
    });
    const balances = await rail.balances();
    expect(balances).toEqual([
      { accountId: '0.0.1', hbar: 100 },
      { accountId: '0.0.2', hbar: 100 },
    ]);
    expect(rail.size).toBe(2);
    expect(rail.accountIds).toEqual(['0.0.1', '0.0.2']);
  });
});

describe('parseOperatorCredentials', () => {
  it('parses a valid JSON array', () => {
    const creds = parseOperatorCredentials(
      '[{"accountId":"0.0.1","privateKey":"k1"},{"accountId":"0.0.2","privateKey":"k2"}]',
    );
    expect(creds).toHaveLength(2);
    expect(creds[0]).toEqual({ accountId: '0.0.1', privateKey: 'k1' });
  });

  it('accepts snake_case keys', () => {
    const creds = parseOperatorCredentials('[{"account_id":"0.0.1","private_key":"k1"}]');
    expect(creds[0]).toEqual({ accountId: '0.0.1', privateKey: 'k1' });
  });

  it('throws on invalid JSON', () => {
    expect(() => parseOperatorCredentials('not json')).toThrow(/Invalid operator credentials JSON/);
  });

  it('throws on a non-array or empty array', () => {
    expect(() => parseOperatorCredentials('{}')).toThrow(/non-empty JSON array/);
    expect(() => parseOperatorCredentials('[]')).toThrow(/non-empty JSON array/);
  });

  it('throws when an entry is missing credentials', () => {
    expect(() => parseOperatorCredentials('[{"accountId":"0.0.1"}]')).toThrow(/missing/);
  });
});
