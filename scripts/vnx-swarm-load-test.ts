#!/usr/bin/env node
/**
 * VNX Paid Micro-Swarm — Heavy Load / Stress Test CLI
 *
 * Drives many concurrent swarm cycles (score → select → pay → receipt). In
 * --dry-run (default) it uses a local mock rail (no network). In --live it
 * submits real HBAR transfers, defaulting to Hedera testnet and round-robining
 * across a pool of operator accounts.
 *
 * Examples:
 *   # Local dry run (no credentials, no network)
 *   npm run loadtest -- --tasks 1000 --concurrency 32
 *
 *   # Live heavy run on testnet using a pool of accounts
 *   export HEDERA_TESTNET_ACCOUNTS='[{"accountId":"0.0.1001","privateKey":"302e..."}]'
 *   npm run loadtest:live -- --tasks 500 --concurrency 16 --max-hbar 0.01
 *
 *   # Soak test for 60 seconds
 *   npm run loadtest:live -- --duration 60 --concurrency 16
 */

import { Command } from 'commander';
import { PaymentRail, PaymentResult } from '../src/types.js';
import { VnxSwarmLoadTester, formatLoadTestSummary, LoadTestConfig } from '../src/load-test.js';
import {
  MultiOperatorHederaRail,
  OperatorCredential,
  parseOperatorCredentials,
} from '../src/multi-operator-rail.js';

const program = new Command()
  .name('vnx-swarm-load-test')
  .description('Heavy load / stress test for the VNX paid swarm')
  .option('--tasks <n>', 'Total swarm cycles to run', '100')
  .option('--concurrency <n>', 'Max simultaneous in-flight cycles', '10')
  .option('--duration <seconds>', 'Soak mode: run for N seconds (overrides --tasks)')
  .option('--max-hbar <n>', 'Maximum HBAR cap per payment', '0.01')
  .option('--network <name>', 'Hedera network (testnet|previewnet|mainnet)', 'testnet')
  .option('--recipient <id>', 'Override payment recipient (default: round-robin across pool)')
  .option('--dry-run', 'Use a local mock rail (no network)', true)
  .option('--live', 'Submit real HBAR transfers')
  .option('--allow-mainnet', 'Permit --live runs against mainnet (dangerous)', false)
  .option('--json', 'Output raw JSON instead of a formatted summary', false)
  .parse();

const opts = program.opts();

/** Local mock rail: simulates a small, jittered settlement latency, no network. */
class MockLoadRail implements PaymentRail {
  async transfer(toAccountId: string, amountHbar: number): Promise<PaymentResult> {
    await new Promise(resolve => setTimeout(resolve, 1 + Math.random() * 4));
    return {
      status: 'success',
      transactionId: `0.0.1@${Date.now()}.${Math.floor(Math.random() * 1e9)}`,
      network: 'mock',
      amountHbar,
      recipient: toAccountId,
      consensusTimestampMs: Date.now(),
    };
  }
}

function loadOperators(): OperatorCredential[] {
  const poolJson = process.env['HEDERA_TESTNET_ACCOUNTS'] ?? process.env['HEDERA_ACCOUNTS'];
  if (poolJson) {
    return parseOperatorCredentials(poolJson);
  }
  const accountId = process.env['HEDERA_ACCOUNT_ID'];
  const privateKey = process.env['HEDERA_PRIVATE_KEY'];
  if (accountId && privateKey) {
    return [{ accountId, privateKey }];
  }
  throw new Error(
    'No operator credentials found. Set HEDERA_TESTNET_ACCOUNTS (JSON array) ' +
      'or HEDERA_ACCOUNT_ID + HEDERA_PRIVATE_KEY.',
  );
}

async function main(): Promise<void> {
  const tasks = parseInt(opts.tasks as string, 10);
  const concurrency = parseInt(opts.concurrency as string, 10);
  const maxHbar = parseFloat(opts.maxHbar as string);
  const durationMs = opts.duration ? parseFloat(opts.duration as string) * 1000 : undefined;
  const network = opts.network as 'mainnet' | 'testnet' | 'previewnet';
  const live = Boolean(opts.live);

  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 256) {
    console.error('Error: --concurrency must be an integer between 1 and 256');
    process.exit(1);
  }
  if (!durationMs && (!Number.isInteger(tasks) || tasks < 1)) {
    console.error('Error: --tasks must be a positive integer');
    process.exit(1);
  }

  console.log(`
╔════════════════════════════════════════════════════════════╗
║  VNX Paid Swarm — Heavy Load / Stress Test                 ║
╚════════════════════════════════════════════════════════════╝
  Mode:         ${live ? `LIVE (${network})` : 'DRY-RUN (mock rail, no network)'}
  Workload:     ${durationMs ? `${durationMs / 1000}s soak` : `${tasks} cycles`}
  Concurrency:  ${concurrency}
  Max HBAR:     ${maxHbar}
`);

  let rail: PaymentRail;
  let recipientOverride: LoadTestConfig['recipientOverride'];
  let multiRail: MultiOperatorHederaRail | undefined;

  if (live) {
    const operators = loadOperators();
    multiRail = new MultiOperatorHederaRail({
      operators,
      network,
      maxHbar,
      allowMainnet: Boolean(opts.allowMainnet),
    });
    rail = multiRail;

    console.log(`  Operator pool: ${multiRail.size} account(s)`);
    console.log('  Pre-flight balance check...');
    const balances = await multiRail.balances();
    for (const b of balances) {
      console.log(
        `    ${b.accountId.padEnd(16)} ${Number.isNaN(b.hbar) ? 'unavailable' : `${b.hbar} ℏ`}`,
      );
    }
    const funded = balances.filter(b => !Number.isNaN(b.hbar) && b.hbar > 0);
    if (funded.length === 0) {
      console.error(
        '\nError: no funded operator accounts available. Fund via the Hedera portal faucet.',
      );
      process.exit(1);
    }

    // Default recipient pool = operator accounts (valid + funded on this network).
    const pool = opts.recipient ? [opts.recipient as string] : multiRail.accountIds;
    recipientOverride = (i: number) => pool[i % pool.length];
    console.log('');
  } else {
    rail = new MockLoadRail();
    recipientOverride = opts.recipient as string | undefined;
  }

  const tester = new VnxSwarmLoadTester(rail);
  const result = await tester.run({
    tasks,
    durationMs,
    concurrency,
    maxHbar,
    recipientOverride,
    onProgress: (completed, total) => {
      if (total && (completed % Math.max(1, Math.floor(total / 10)) === 0 || completed === total)) {
        process.stdout.write(`\r  Progress: ${completed}/${total} cycles`);
      } else if (!total && completed % 50 === 0) {
        process.stdout.write(`\r  Progress: ${completed} cycles`);
      }
    },
  });

  if (multiRail) multiRail.close();

  process.stdout.write('\r');
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatLoadTestSummary(result));
    if (result.transactionSamples.length > 0 && live && network !== 'mainnet') {
      console.log(`Verify on HashScan: https://hashscan.io/${network}/transaction/<tx-id>`);
    }
  }

  if (result.failed > 0 && result.succeeded === 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nLoad test failed:', (err as Error).message);
  process.exit(1);
});
