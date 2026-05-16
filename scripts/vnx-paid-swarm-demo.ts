#!/usr/bin/env node
/**
 * VNX Paid Micro-Swarm — CLI Demo
 *
 * Competition run (requires mainnet credentials):
 *   npx tsx scripts/vnx-paid-swarm-demo.ts \
 *     --task "Find the best HBAR risk signal for the next 5 minutes" \
 *     --recipient 0.0.123456 \
 *     --max-hbar 0.01
 *
 * Development planning mode (no payment):
 *   npx tsx scripts/vnx-paid-swarm-demo.ts --plan-only
 */

import { program } from 'commander';
import {
  DEFAULT_WORKERS,
  PaidSwarmCoordinator,
  HederaPaymentRail,
  assertMainnetProofReceipt,
} from '../src/index.js';

program
  .name('vnx-paid-swarm-demo')
  .description('VNX Paid Micro-Swarm — deterministic agent swarm with Hedera payment')
  .option('--task <string>', 'Task description for the swarm', 'Find the best HBAR risk signal for the next 5 minutes')
  .option('--recipient <string>', 'Hedera account ID to receive payment', '0.0.123456')
  .option('--max-hbar <number>', 'Maximum HBAR payment cap', '0.01')
  .option('--plan-only', 'Run in plan-only mode (no real payment)', false)
  .parse();

const opts = program.opts();

async function main() {
  const task = opts.task as string;
  const recipient = opts.recipient as string;
  const maxHbar = parseFloat(opts.maxHbar as string);
  const planOnly = opts.planOnly as boolean;

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  VNX Paid Micro-Swarm — Competition Demo                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`Task:       ${task}`);
  console.log(`Recipient:  ${recipient}`);
  console.log(`Max HBAR:   ${maxHbar}`);
  console.log(`Mode:       ${planOnly ? 'PLAN-ONLY (dev)' : 'LIVE MAINNET'}\n`);

  const paymentRail = new HederaPaymentRail({
    requireMainnet: !planOnly,
    maxHbar,
  });

  const coordinator = new PaidSwarmCoordinator(
    DEFAULT_WORKERS,
    { maxHbar, planOnly },
    paymentRail,
  );

  try {
    const receipt = await coordinator.run(task, recipient);

    console.log('─── WORKER VOTES ───');
    for (const v of receipt.votes) {
      const bar = '█'.repeat(Math.min(20, Math.round(v.confidence * 20)));
      console.log(`  ${v.name.padEnd(18)} | conf=${v.confidence.toFixed(3)} | price=${v.priceHbar.toFixed(4)} HBAR | score=${v.score.toFixed(2)} ${bar}`);
    }

    console.log('\n─── SELECTED WINNER ───');
    console.log(`  ${receipt.selected.name} (${receipt.selected.specialty})`);
    console.log(`  Price: ${receipt.selected.priceHbar.toFixed(4)} HBAR`);
    console.log(`  Score: ${receipt.selected.score.toFixed(2)}`);

    console.log('\n─── PAYMENT ───');
    console.log(`  Status:  ${receipt.payment.status}`);
    console.log(`  Network: ${receipt.payment.network}`);
    if (receipt.payment.transactionId) {
      console.log(`  Tx ID:   ${receipt.payment.transactionId}`);
    }
    if (receipt.payment.error) {
      console.log(`  Error:   ${receipt.payment.error}`);
    }

    console.log('\n─── RECEIPT ───');
    console.log(`  Task Hash:     ${receipt.taskHash}`);
    console.log(`  Decision Hash: ${receipt.decisionHash}`);
    console.log(`  Timestamp:     ${new Date(receipt.timestamp).toISOString()}`);

    console.log('\n─── FULL JSON RECEIPT ───');
    console.log(JSON.stringify(receipt, null, 2));

    if (planOnly) {
      console.log('\n✅ Plan-only preview complete. This is not mainnet proof and must not be used as a submission receipt.\n');
      return;
    }

    assertMainnetProofReceipt(receipt);
    console.log('\n✅ Confirmed mainnet proof complete. Paste the JSON receipt above into your competition submission.\n');
  } catch (err) {
    console.error('\n❌ FAILED:', (err as Error).message);
    if (!planOnly) {
      console.error('\nTip: Use --plan-only to preview the swarm without credentials.');
    }
    process.exit(1);
  }
}

main();
