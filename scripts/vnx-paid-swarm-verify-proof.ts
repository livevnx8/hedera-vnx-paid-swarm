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
import { HieroVerifyVnxAgent } from '../src/hiero-verify-agent.js';
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

  const agent = new HieroVerifyVnxAgent(
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
  const report = await agent.verify(receipt, opts.task);

  console.log(`\n${report.agentName}`);
  console.log(`Agent ID:  ${report.agentId}`);
  console.log(`Specialty: ${report.specialty}`);
  console.log(`Verdict:   ${report.verdict.toUpperCase()}`);
  console.log(`Summary:   ${report.summary}\n`);

  for (const check of report.checks) {
    const label = check.name.replaceAll('_', ' ').toUpperCase().padEnd(24);
    console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${label} ${check.detail}`);
  }

  console.log('\nReceipt:');
  console.log(`  Transaction ID: ${report.proof.transactionId ?? 'missing'}`);
  console.log(`  Proof Status:   ${report.proof.proofStatus}`);
  console.log(`  HashScan:       ${report.proof.hashScanUrl ?? 'missing'}`);
  console.log(`  Mirror Node:    ${report.proof.mirrorNodeUrl ?? 'missing'}`);

  if (report.verdict !== 'accepted') {
    console.error('\nHiero Verify VNX Agent rejected this proof.');
    process.exit(1);
  }

  console.log('\nHiero Verify VNX Agent accepted this proof.');
}

main().catch(err => {
  console.error('\nVerifier failed:', (err as Error).message);
  process.exit(1);
});
