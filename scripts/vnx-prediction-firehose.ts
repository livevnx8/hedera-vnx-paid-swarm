#!/usr/bin/env node
/**
 * VNX Prediction Firehose CLI
 *
 * Run thousands of deterministic prediction tasks locally.
 * Shows throughput, winner selection, receipt generation, and verifier checks.
 * No Hedera network calls in this demo.
 *
 * Usage:
 *   npx tsx scripts/vnx-prediction-firehose.ts --tasks 1000
 *   npm run demo:firehose -- --tasks 10000
 */

import { Command } from 'commander';
import { VnxPredictionFirehose, formatFirehoseSummary } from '../src/firehose.js';

const program = new Command()
  .name('vnx-prediction-firehose')
  .description('Run N deterministic prediction tasks locally and report throughput')
  .option('--tasks <n>', 'Number of prediction tasks to run', '1000')
  .option('--json', 'Output raw JSON instead of formatted summary')
  .option('--help', 'Show this help message');

async function main(): Promise<void> {
  program.parse(process.argv);
  const opts = program.opts();

  if (opts.help) {
    program.help();
  }

  const tasks = parseInt(opts.tasks, 10);
  if (!Number.isInteger(tasks) || tasks < 1 || tasks > 100000) {
    console.error('Error: --tasks must be a positive integer between 1 and 100,000');
    process.exit(1);
  }

  console.log(`
╔════════════════════════════════════════════════════════════╗
║  VNX Prediction Firehose — Local Throughput Demo         ║
╚════════════════════════════════════════════════════════════╝
  Tasks:    ${tasks.toLocaleString()}
  Status:   Starting...
`);

  const firehose = new VnxPredictionFirehose();
  const start = performance.now();
  const result = await firehose.run({ tasks });
  const totalMs = performance.now() - start;

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatFirehoseSummary(result));
    console.log(`
  Actual runtime: ${totalMs.toFixed(2)} ms
  `);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
