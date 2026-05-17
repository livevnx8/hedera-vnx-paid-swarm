#!/usr/bin/env node
/**
 * HCS Topic Publisher CLI
 *
 * Publish compact swarm proof events to a Hedera Consensus Service topic.
 * Dry-run by default. Use --live to submit real HCS messages.
 *
 * Usage:
 *   npx tsx scripts/hcs-topic-publisher.ts --dry-run --messages 5
 *   npx tsx scripts/hcs-topic-publisher.ts --live --topic 0.0.10416185 --messages 3
 *   npm run demo:hcs -- --dry-run --messages 25
 */

import { Command } from 'commander';
import {
  HcsTopicPublisher,
  DryRunHcsPublisher,
} from '../src/hcs-publisher.js';
import { PaidSwarmCoordinator } from '../src/coordinator.js';
import { DEFAULT_WORKERS } from '../src/workers.js';

const program = new Command()
  .name('hcs-topic-publisher')
  .description('Publish swarm proof events to an HCS topic')
  .option('--live', 'Submit real HCS messages (requires credentials)', false)
  .option('--topic <id>', 'HCS topic ID', '0.0.10416185')
  .option('--messages <n>', 'Number of messages to publish', '1')
  .option('--max-messages <n>', 'Maximum messages allowed', '10')
  .option('--task <text>', 'Task description for proof message', 'Predict HBAR price direction')
  .option('--json', 'Output raw JSON')
  .option('--help', 'Show this help message');

async function main(): Promise<void> {
  program.parse(process.argv);
  const opts = program.opts();

  const isLive = opts.live === true || opts.live === 'true';
  const topicId = opts.topic;
  const messages = parseInt(opts.messages, 10);
  const maxMessages = parseInt(opts.maxMessages, 10);
  const task = opts.task;

  if (!Number.isInteger(messages) || messages < 1) {
    console.error('Error: --messages must be a positive integer');
    process.exit(1);
  }

  if (messages > maxMessages) {
    console.error(
      `Error: --messages (${messages}) exceeds --max-messages (${maxMessages}). Use --max-messages to override.`
    );
    process.exit(1);
  }

  console.log(`
╔════════════════════════════════════════════════════════════╗
║  HCS Topic Publisher — ${isLive ? 'LIVE HEDERA' : 'DRY RUN'}                          ║
╚════════════════════════════════════════════════════════════╝
  Topic:      ${topicId}
  Messages:   ${messages}
  Mode:       ${isLive ? 'LIVE (real HCS submit)' : 'DRY RUN (console only)'}
`);

  // Build a mock receipt to extract proof data
  const mockPaymentRail = {
    async transfer(_to: string, _amount: number, _memo?: string) {
      return {
        status: 'success' as const,
        transactionId: `0.0.10294360@${Date.now()}.0`,
        network: 'mainnet',
        amountHbar: _amount,
        recipient: _to,
        consensusTimestampMs: Date.now(),
      };
    },
  };
  const coordinator = new PaidSwarmCoordinator(DEFAULT_WORKERS, {
    maxHbar: 0.01,
    planOnly: true,
  }, mockPaymentRail);
  const receipt = await coordinator.run(task, '0.0.10294360');

  const publisher = isLive
    ? new HcsTopicPublisher({
        topicId,
        accountId: process.env.HEDERA_ACCOUNT_ID!,
        privateKey: process.env.HEDERA_PRIVATE_KEY!,
        network: process.env.HEDERA_NETWORK ?? 'mainnet',
      })
    : new DryRunHcsPublisher(topicId);

  const results = [];

  for (let i = 0; i < messages; i++) {
    const message = HcsTopicPublisher.buildMessage({
      taskHash: receipt.taskHash,
      decisionHash: receipt.decisionHash,
      winner: receipt.selected.workerId,
      proofStatus: receipt.proofStatus,
    });

    const result = await publisher.publish(message);
    results.push(result);

    if (result.status === 'success') {
      console.log(`  ✅ Message ${i + 1}/${messages} — Seq: ${result.sequenceNumber} — Tx: ${result.transactionId}`);
    } else {
      console.log(`  ❌ Message ${i + 1}/${messages} — Error: ${result.error}`);
    }
  }

  publisher.close();

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
  }

  console.log(`
${isLive ? 'HCS messages published to Hedera mainnet.' : 'Dry run complete. No network calls were made.'}
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
