#!/usr/bin/env node
/**
 * VNX Paid Micro-Swarm — Hiero/Hedera Proof Verifier
 *
 * Usage:
 *   npx tsx scripts/vnx-paid-swarm-verify-proof.ts \
 *     --receipt docs/proofs/live-receipt.json \
 *     --task "Predict the HBAR price direction and forecast the signal"
 */

import { readFile } from 'fs/promises';
import { Command } from 'commander';
import { verifySwarmProof } from '../src/proof-verifier.js';
import { SwarmReceipt } from '../src/types.js';

const program = new Command()
  .name('vnx-paid-swarm-verify-proof')
  .description('Verify VNX paid swarm hashes and Hedera/Hiero mainnet transaction proof')
  .requiredOption('--receipt <path>', 'Path to the live JSON receipt')
  .requiredOption('--task <text>', 'Original task text used to create the receipt')
  .option(
    '--skip-mirror',
    'Skip live mirror-node lookup and verify local hashes/status only',
    false,
  )
  .parse();

const opts = program.opts<{
  receipt: string;
  task: string;
  skipMirror: boolean;
}>();

async function main() {
  const raw = await readFile(opts.receipt, 'utf8');
  const receipt = JSON.parse(raw) as SwarmReceipt;

  const result = await verifySwarmProof(
    receipt,
    opts.task,
    opts.skipMirror
      ? {
          fetchMirrorTransaction: async transactionId => ({
            ok: true,
            transactionId,
            status: 'SKIPPED',
          }),
        }
      : undefined,
  );

  console.log('\nVNX Paid Swarm Proof Verification\n');
  for (const check of result.checks) {
    const label = check.name.replaceAll('_', ' ').toUpperCase().padEnd(24);
    console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${label} ${check.detail}`);
  }

  console.log('\nReceipt:');
  console.log(`  Transaction ID: ${receipt.payment.transactionId ?? 'missing'}`);
  console.log(`  Proof Status:   ${receipt.proofStatus}`);
  console.log(`  HashScan:       ${receipt.explorerUrl ?? 'missing'}`);
  console.log(`  Mirror Node:    ${receipt.mirrorNodeUrl ?? 'missing'}`);

  if (!result.ok) {
    console.error('\nProof verification failed.');
    process.exit(1);
  }

  console.log('\nProof verification passed.');
}

main().catch(err => {
  console.error('\nVerifier failed:', (err as Error).message);
  process.exit(1);
});
