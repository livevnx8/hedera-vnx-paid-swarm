#!/usr/bin/env node
/**
 * VNX Paid Micro-Swarm — Testnet TPS Orchestrator
 *
 * The single-process max-TPS probe is bottlenecked by one Node thread's ECDSA
 * signing (~290 submission TPS) — not by Hedera testnet, which showed 0 BUSY at
 * that rate. This orchestrator spawns N worker processes (each signing on its
 * own core) of the max-TPS probe, aggregates their submission counts, and
 * reports combined TPS. A --sweep mode ramps the worker count to chart
 * aggregate TPS vs. parallelism and find this machine's ceiling.
 *
 * Examples:
 *   npm run tps -- --workers 8 --duration 12 --concurrency 150 --mode transfers
 *   npm run tps -- --sweep 1,2,4,8,12 --duration 10 --concurrency 150
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { performance } from 'perf_hooks';
import { Command } from 'commander';

const program = new Command()
  .name('vnx-testnet-tps-orchestrator')
  .description('Spawn N max-TPS worker processes and aggregate their submission throughput')
  .option('--workers <n>', 'Number of worker processes', '6')
  .option(
    '--sweep <list>',
    'Comma-separated worker counts to sweep (e.g. 1,2,4,8); overrides --workers',
  )
  .option('--duration <seconds>', 'Duration per worker', '12')
  .option('--concurrency <n>', 'In-flight submissions per worker', '150')
  .option('--mode <mode>', 'transfers | hcs | both', 'transfers')
  .option('--amount <hbar>', 'HBAR amount per transfer', '0.0001')
  .option('--network <name>', 'testnet | previewnet', 'testnet')
  .option('--min-balance <hbar>', 'Min wallet balance to be used as a sender', '1')
  .option('--shard', 'Give each worker a disjoint wallet shard (no shared payer accounts)')
  .parse();

const opts = program.opts();

interface WorkerSummary {
  submitted: number;
  throttled: number;
  failed: number;
  dispatched: number;
  elapsedSec: number;
  submissionTps: number;
  senders: number;
  topicId?: string;
  mirrorSequence?: number;
  errorBreakdown: Record<string, number>;
}

interface CohortResult {
  workers: number;
  totalSubmitted: number;
  totalThrottled: number;
  totalFailed: number;
  wallSec: number;
  aggregateTps: number;
  errorBreakdown: Record<string, number>;
}

const PROBE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vnx-testnet-max-tps.ts');

function runWorker(shardIndex: number, shardCount: number): Promise<WorkerSummary | null> {
  return new Promise(resolve => {
    const args = [
      'tsx',
      PROBE,
      '--json',
      '--duration',
      String(opts.duration),
      '--concurrency',
      String(opts.concurrency),
      '--mode',
      String(opts.mode),
      '--amount',
      String(opts.amount),
      '--network',
      String(opts.network),
      '--min-balance',
      String(opts.minBalance),
    ];
    if (opts.shard) {
      args.push('--shard-index', String(shardIndex), '--shard-count', String(shardCount));
    }
    const child = spawn('npx', args, { env: process.env, cwd: process.cwd() });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => (stdout += d.toString()));
    child.stderr.on('data', d => (stderr += d.toString()));
    child.on('close', () => {
      const line = stdout.trim().split('\n').filter(Boolean).pop();
      if (!line) {
        console.warn(`  [worker] no JSON output. stderr: ${stderr.slice(0, 200)}`);
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(line) as WorkerSummary);
      } catch {
        console.warn(`  [worker] unparseable output: ${line.slice(0, 200)}`);
        resolve(null);
      }
    });
  });
}

async function runCohort(workers: number): Promise<CohortResult> {
  const start = performance.now();
  const summaries = (
    await Promise.all(Array.from({ length: workers }, (_, i) => runWorker(i, workers)))
  ).filter((s): s is WorkerSummary => s !== null);
  const wallSec = (performance.now() - start) / 1000;

  const totalSubmitted = summaries.reduce((a, s) => a + s.submitted, 0);
  const totalThrottled = summaries.reduce((a, s) => a + s.throttled, 0);
  const totalFailed = summaries.reduce((a, s) => a + s.failed, 0);
  const errorBreakdown: Record<string, number> = {};
  for (const s of summaries) {
    for (const [k, v] of Object.entries(s.errorBreakdown)) {
      errorBreakdown[k] = (errorBreakdown[k] ?? 0) + v;
    }
  }
  // Workers run their fixed submission window concurrently (spawned together),
  // so the true aggregate concurrent rate is the sum of each worker's own TPS —
  // not total/wallclock, which would be deflated by tsx cold-start spawn overhead.
  const aggregateTps = summaries.reduce((a, s) => a + s.submissionTps, 0);

  return {
    workers,
    totalSubmitted,
    totalThrottled,
    totalFailed,
    wallSec,
    aggregateTps,
    errorBreakdown,
  };
}

function printCohort(r: CohortResult): void {
  console.log(`
  Workers:            ${r.workers}
  Total submitted:    ${r.totalSubmitted.toLocaleString()}
  Throttled (BUSY):   ${r.totalThrottled.toLocaleString()}
  Failed (other):     ${r.totalFailed.toLocaleString()}
  Aggregate TPS:      ${r.aggregateTps.toFixed(1)}`);
  const errors = Object.entries(r.errorBreakdown).sort((a, b) => b[1] - a[1]);
  if (errors.length > 0) {
    console.log('  Error/throttle breakdown:');
    for (const [bucket, count] of errors) {
      console.log(`    ${bucket.padEnd(36)} ${count.toLocaleString().padStart(8)}`);
    }
  }
}

async function main(): Promise<void> {
  const cohorts = opts.sweep
    ? String(opts.sweep)
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => n > 0)
    : [parseInt(String(opts.workers), 10)];

  console.log(`
╔════════════════════════════════════════════════════════════╗
║  VNX Swarm — Testnet TPS Orchestrator (multi-process)       ║
╚════════════════════════════════════════════════════════════╝
  Network:        ${opts.network}
  Mode:           ${opts.mode}
  Sharding:       ${opts.shard ? 'on (disjoint wallet slice per worker)' : 'off (shared pool)'}
  Per-worker:     ${opts.duration}s @ concurrency ${opts.concurrency}
  Worker cohorts: ${cohorts.join(', ')}`);

  const results: CohortResult[] = [];
  for (const w of cohorts) {
    console.log(`\n──────── Running cohort: ${w} worker(s) ────────`);
    const r = await runCohort(w);
    printCohort(r);
    results.push(r);
  }

  if (results.length > 1) {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  Sweep: aggregate TPS vs. worker count                      ║
╚════════════════════════════════════════════════════════════╝
  workers │ aggregate TPS │ submitted │ BUSY │ failed
  ────────┼───────────────┼───────────┼──────┼───────`);
    for (const r of results) {
      console.log(
        `  ${String(r.workers).padStart(7)} │ ${r.aggregateTps.toFixed(1).padStart(13)} │ ${r.totalSubmitted
          .toLocaleString()
          .padStart(
            9,
          )} │ ${String(r.totalThrottled).padStart(4)} │ ${String(r.totalFailed).padStart(6)}`,
      );
    }
    const best = results.reduce((a, b) => (b.aggregateTps > a.aggregateTps ? b : a));
    console.log(`\n  Peak: ${best.aggregateTps.toFixed(1)} TPS at ${best.workers} workers\n`);
  }
}

main().catch(err => {
  console.error('\nOrchestrator failed:', (err as Error).message);
  process.exit(1);
});
