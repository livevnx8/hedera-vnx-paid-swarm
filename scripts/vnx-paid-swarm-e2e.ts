/**
 * VNX Paid Micro-Swarm — End-to-End Mainnet Validation
 *
 * Usage:
 *   npx tsx scripts/vnx-paid-swarm-e2e.ts --dry-run    (no credentials needed)
 *   npx tsx scripts/vnx-paid-swarm-e2e.ts --live      (requires mainnet credentials + balance)
 */

import { Command } from 'commander';
import { PaidSwarmCoordinator, DEFAULT_WORKERS } from '../src/index.js';
import { HederaPaymentRail } from '../src/payment-rail.js';
import { assertMainnetProofReceipt } from '../src/proof-validation.js';

const program = new Command()
  .name('vnx-paid-swarm-e2e')
  .description('End-to-end mainnet validation for VNX paid micro-swarm')
  .option('--dry-run', 'Simulate full flow without any network calls', true)
  .option('--live', 'Run on Hedera mainnet with real HBAR transfer')
  .option('--task <text>', 'Task description', 'Predict the HBAR price direction and forecast the signal')
  .option('--recipient <id>', 'Hedera account ID', '0.0.123456')
  .option('--max-hbar <n>', 'Maximum HBAR cap', '0.01')
  .parse();

const opts = program.opts();

async function validateEnv(): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  const required = ['HEDERA_ACCOUNT_ID', 'HEDERA_PRIVATE_KEY', 'HEDERA_NETWORK'];
  for (const key of required) {
    if (!process.env[key]) errors.push(`Missing env var: ${key}`);
  }
  if (process.env.HEDERA_NETWORK !== 'mainnet') {
    errors.push(`HEDERA_NETWORK must be "mainnet" for live runs (got: ${process.env.HEDERA_NETWORK || 'undefined'})`);
  }
  return { ok: errors.length === 0, errors };
}

async function dryRunE2E() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  VNX Paid Micro-Swarm — E2E Dry Run                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const task = opts.task as string;
  const recipient = opts.recipient as string;
  const maxHbar = parseFloat(opts.maxHbar as string);

  // Step 1: Validate coordinator
  console.log('[1/5] Initializing coordinator with mock payment rail...');
  const mockRail = {
    async transfer(to: string, amount: number, memo?: string) {
      return {
        status: 'success' as const,
        transactionId: 'dry-run-mock-tx',
        network: 'dry-run',
        amountHbar: amount,
        recipient: to,
        consensusTimestampMs: Date.now(),
      };
    },
  };
  const coord = new PaidSwarmCoordinator(DEFAULT_WORKERS, { maxHbar, planOnly: false }, mockRail);
  console.log('      ✅ Coordinator initialized');

  // Step 2: Run swarm
  console.log('[2/5] Running swarm vote + selection...');
  const receipt = await coord.run(task, recipient);
  console.log(`      ✅ Winner: ${receipt.selected.name} (score=${receipt.selected.score.toFixed(2)})`);

  // Step 3: Validate receipt structure
  console.log('[3/5] Validating receipt structure...');
  const requiredFields = ['version', 'network', 'timestamp', 'taskHash', 'votes', 'selected', 'payment', 'decisionHash'];
  const missing = requiredFields.filter(f => !(f in receipt));
  if (missing.length) throw new Error(`Receipt missing fields: ${missing.join(', ')}`);
  if (receipt.votes.length !== 4) throw new Error(`Expected 4 votes, got ${receipt.votes.length}`);
  if (!receipt.taskHash.match(/^[a-f0-9]{64}$/)) throw new Error('taskHash is not valid SHA-256 hex');
  if (!receipt.decisionHash.match(/^[a-f0-9]{64}$/)) throw new Error('decisionHash is not valid SHA-256 hex');
  console.log('      ✅ Receipt structure valid');
  console.log(`      ✅ Task Hash:     ${receipt.taskHash}`);
  console.log(`      ✅ Decision Hash: ${receipt.decisionHash}`);

  // Step 4: Verify receipt hashes
  console.log('[4/5] Verifying receipt hashes...');
  if (!receipt.taskHash.match(/^[a-f0-9]{64}$/)) throw new Error('Invalid taskHash');
  if (!receipt.decisionHash.match(/^[a-f0-9]{64}$/)) throw new Error('Invalid decisionHash');
  console.log('      ✅ Receipt contains valid SHA-256 hashes');

  // Step 5: Validate mainnet readiness
  console.log('[5/5] Checking mainnet readiness...');
  const env = await validateEnv();
  if (!env.ok) {
    console.log('      ⚠️  Mainnet credentials missing (expected for dry-run):');
    for (const e of env.errors) console.log(`         - ${e}`);
  } else {
    console.log('      ✅ Mainnet credentials present');
  }

  // Summary
  console.log('\n─── E2E Dry Run Summary ───');
  console.log(`  Swarm Size:     4 agents`);
  console.log(`  Task:           "${task}"`);
  console.log(`  Winner:         ${receipt.selected.name} (${receipt.selected.specialty})`);
  console.log(`  Price:          ${receipt.selected.priceHbar} HBAR`);
  console.log(`  Max Cap:        ${maxHbar} HBAR`);
  console.log(`  Payment Status: ${receipt.payment.status}`);
  console.log(`  Proof Status:   ${receipt.proofStatus}`);
  console.log(`  Task Hash:      ${receipt.taskHash}`);
  console.log(`  Decision Hash:  ${receipt.decisionHash}`);
  console.log(`  Network:        ${receipt.payment.network}`);
  console.log(`\n  ✅ Dry-run E2E checks passed. This is structural evidence only, not mainnet proof.`);
  console.log(`\n  Next: Run with --live after setting env vars:`);
  console.log(`    export HEDERA_ACCOUNT_ID=0.0.xxx`);
  console.log(`    export HEDERA_PRIVATE_KEY=xxx`);
  console.log(`    export HEDERA_NETWORK=mainnet`);
}

async function liveE2E() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  VNX Paid Micro-Swarm — LIVE MAINNET RUN                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const env = await validateEnv();
  if (!env.ok) {
    console.error('❌ Environment validation failed:');
    for (const e of env.errors) console.error(`   - ${e}`);
    process.exit(1);
  }

  console.log('⚠️  WARNING: This will transfer REAL HBAR on mainnet.\n');
  console.log(`Account:    ${process.env.HEDERA_ACCOUNT_ID}`);
  console.log(`Recipient:  ${opts.recipient}`);
  console.log(`Max HBAR:   ${opts.maxHbar}`);
  console.log(`Task:       "${opts.task}"\n`);

  const paymentRail = new HederaPaymentRail({
    requireMainnet: true,
    maxHbar: parseFloat(opts.maxHbar as string),
  });

  const coordinator = new PaidSwarmCoordinator(
    DEFAULT_WORKERS,
    { maxHbar: parseFloat(opts.maxHbar as string), planOnly: false },
    paymentRail,
  );

  const receipt = await coordinator.run(opts.task as string, opts.recipient as string);
  assertMainnetProofReceipt(receipt);

  console.log('\n─── LIVE RECEIPT ───');
  console.log(JSON.stringify(receipt, null, 2));
  console.log('\n✅ Live mainnet run complete.');
  console.log(`   Verify on HashScan: ${receipt.explorerUrl}`);
  console.log(`   Verify on Mirror Node: ${receipt.mirrorNodeUrl}`);
}

async function main() {
  try {
    if (opts.live) {
      await liveE2E();
    } else {
      await dryRunE2E();
    }
  } catch (err) {
    console.error('\n❌ E2E FAILED:', (err as Error).message);
    process.exit(1);
  }
}

main();
