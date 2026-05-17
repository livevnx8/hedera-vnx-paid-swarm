#!/usr/bin/env node
/**
 * Hiero HCS Verify Agent CLI
 *
 * Read an HCS message by topic ID and sequence number, then verify
 * it against the Hedera/Hiero mirror node.
 *
 * Usage:
 *   npx tsx scripts/hcs-verify-agent.ts --topic 0.0.10416185 --sequence 42
 *   npm run verify:hcs -- --topic 0.0.10416185 --sequence 42
 */

import { Command } from 'commander';
import { HieroHcsVerifyAgent } from '../src/hcs-verify-agent.js';

const program = new Command()
  .name('hcs-verify-agent')
  .description('Verify an HCS message against the Hedera/Hiero mirror node')
  .requiredOption('--topic <id>', 'HCS topic ID')
  .requiredOption('--sequence <n>', 'Message sequence number')
  .option('--mirror-url <url>', 'Override mirror node base URL')
  .option('--json', 'Output raw JSON')
  .option('--help', 'Show this help message');

async function main(): Promise<void> {
  program.parse(process.argv);
  const opts = program.opts();

  if (opts.help) {
    program.help();
  }

  const topicId = opts.topic;
  const sequenceNumber = parseInt(opts.sequence, 10);

  if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
    console.error('Error: --sequence must be a positive integer');
    process.exit(1);
  }

  console.log(`
╔════════════════════════════════════════════════════════════╗
║  Hiero HCS Verify Agent                                    ║
╚════════════════════════════════════════════════════════════╝
  Topic:      ${topicId}
  Sequence:   ${sequenceNumber}
  `);

  const agent = new HieroHcsVerifyAgent(opts.mirrorUrl);
  const report = await agent.verify({ topicId, sequenceNumber });

  console.log(`\n${report.agentName}`);
  console.log(`Agent ID:  ${report.agentId}`);
  console.log(`Specialty: ${report.specialty}`);
  console.log(`Verdict:   ${report.verdict.toUpperCase()}`);
  console.log(`Summary:   ${report.summary}\n`);

  for (const check of report.checks) {
    const label = check.name.replaceAll('_', ' ').toUpperCase().padEnd(24);
    console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${label} ${check.detail}`);
  }

  if (report.message) {
    console.log('\nDecoded Message:');
    console.log(`  Type:       ${report.message.type}`);
    console.log(`  Winner:     ${report.message.winner}`);
    console.log(`  Proof:      ${report.message.proofStatus}`);
    console.log(`  Task Hash:  ${report.message.taskHash.slice(0, 16)}...`);
    console.log(`  Decision:   ${report.message.decisionHash.slice(0, 16)}...`);
  }

  if (report.verdict !== 'accepted') {
    console.error('\nHiero HCS Verify Agent rejected this message.');
    process.exit(1);
  }

  console.log('\nHiero HCS Verify Agent accepted this message.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
