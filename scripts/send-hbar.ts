#!/usr/bin/env node
/**
 * Standalone HBAR Transfer CLI
 * Send HBAR on Hedera mainnet with optional memo. No swarm logic required.
 *
 * Usage:
 *   npx tsx scripts/send-hbar.ts --to 0.0.12345 --amount 0.005 --memo "payment for work"
 *   npm run send -- --to 0.0.12345 --amount 0.01
 */

import { HederaPaymentRail } from '../src/payment-rail.js';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith('--')) {
      const val = argv[i + 1];
      if (val && !val.startsWith('--')) {
        args[key.replace(/^--/, '')] = val;
        i++;
      } else {
        args[key.replace(/^--/, '')] = 'true';
      }
    }
  }
  return args;
}

function showHelp(): void {
  console.log(`
Usage: npx tsx scripts/send-hbar.ts [options]

Options:
  --to      <account-id>   Recipient Hedera account (e.g. 0.0.12345)
  --amount  <hbar>         Amount in HBAR (e.g. 0.01)
  --memo    <string>       Optional transaction memo
  --max     <hbar>         Override max cap (default: 0.01)
  --help                   Show this message

Environment:
  HEDERA_ACCOUNT_ID      Sender account
  HEDERA_PRIVATE_KEY     Sender private key (ECDSA)
  HEDERA_NETWORK         mainnet | testnet | previewnet (default: mainnet)

Examples:
  npx tsx scripts/send-hbar.ts --to 0.0.10294360 --amount 0.005 --memo "VNX swarm winner"
  npx tsx scripts/send-hbar.ts --to 0.0.10294360 --amount 0.002
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args['help'] || (!args['to'] && !args['amount'])) {
    showHelp();
    process.exit(0);
  }

  const to = args['to'];
  const amount = parseFloat(args['amount'] ?? '0');
  const memo = args['memo'];
  const maxHbar = parseFloat(args['max'] ?? '0.01');

  if (!to || to.split('.').length !== 3) {
    console.error('Error: --to must be a valid Hedera account ID (e.g. 0.0.12345)');
    process.exit(1);
  }
  if (Number.isNaN(amount) || amount <= 0) {
    console.error('Error: --amount must be a positive number');
    process.exit(1);
  }

  console.log(`
╔════════════════════════════════════════════════════════════╗
║  HBAR Transfer — Hedera Payment SDK                       ║
╚════════════════════════════════════════════════════════════╝
  To:        ${to}
  Amount:    ${amount} HBAR
  Max Cap:   ${maxHbar} HBAR
  Memo:      ${memo ?? '(none)'}
  Network:   ${process.env['HEDERA_NETWORK'] ?? 'mainnet'}
`);

  const rail = new HederaPaymentRail({ requireMainnet: false, maxHbar });
  const result = await rail.transfer(to, amount, memo);

  if (result.status === 'success') {
    console.log(`  Status:    ✅ SUCCESS`);
    console.log(`  Tx ID:     ${result.transactionId}`);
    console.log(
      `  Explorer:  https://hashscan.io/${result.network}/transaction/${result.transactionId?.replace(/@/, '-')}`,
    );
    if (result.consensusTimestampMs) {
      console.log(`  Consensus: ${new Date(result.consensusTimestampMs).toISOString()}`);
    }
  } else {
    console.log(`  Status:    ❌ FAILED`);
    console.log(`  Error:     ${result.error}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
