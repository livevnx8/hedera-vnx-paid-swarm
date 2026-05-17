/**
 * VNX Paid Micro-Swarm — Leaderboard CLI
 */

import { Command } from 'commander';
import { AgentLedger } from '../src/agent-ledger.js';
import { readFileSync } from 'fs';

const program = new Command();

program
  .name('vnx-leaderboard')
  .description('Show VNX agent leaderboard')
  .option('-f, --file <path>', 'ledger JSON file', 'ledger.json')
  .option('-l, --limit <n>', 'max entries', '10')
  .action(opts => {
    const ledger = new AgentLedger();
    try {
      const data = JSON.parse(readFileSync(opts.file as string, 'utf-8'));
      ledger.import(data);
    } catch {
      // fresh ledger
    }
    const entries = ledger.leaderboard(parseInt(opts.limit as string, 10));
    if (entries.length === 0) {
      console.log('No recorded tasks yet.');
      return;
    }
    console.log(
      '\n  #  | ID                | Name                | Reputation | Tasks | Won | Paid (HBAR) | Streak',
    );
    console.log('  ' + '-'.repeat(110));
    for (const e of entries) {
      console.log(
        `  ${String(e.rank).padEnd(2)} | ${e.id.padEnd(17)} | ${e.name.padEnd(19)} | ${e.reputation.toFixed(3).padEnd(10)} | ${String(e.tasksCompleted).padEnd(5)} | ${String(e.tasksWon).padEnd(3)} | ${String(e.totalPaymentsHbar).padEnd(11)} | ${e.streak}`,
      );
    }
    console.log();
  });

program.parse();
