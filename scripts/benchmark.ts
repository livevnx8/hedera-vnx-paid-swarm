#!/usr/bin/env node
/**
 * VNX Paid Micro-Swarm — Local Benchmark Runner
 */

import { Command } from 'commander';
import { formatBenchmarkSummary, runLocalBenchmarks } from '../src/benchmark.js';

const program = new Command()
  .name('vnx-swarm-benchmark')
  .description('Run reproducible local benchmarks for deterministic VNX swarm operations')
  .option('--iterations <n>', 'Number of iterations per benchmark case', '1000')
  .parse();

const opts = program.opts<{ iterations: string }>();

async function main() {
  const iterations = Number.parseInt(opts.iterations, 10);
  const summary = await runLocalBenchmarks({ iterations });
  console.log(formatBenchmarkSummary(summary));
  console.log('\nNote: local benchmarks exclude live Hedera network settlement latency.');
}

main().catch(err => {
  console.error('Benchmark failed:', (err as Error).message);
  process.exit(1);
});
