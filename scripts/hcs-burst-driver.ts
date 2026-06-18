#!/usr/bin/env tsx
/**
 * Compact HCS burst driver — pushes raw topic sequence throughput for scale tests.
 * Single-chunk messages, fire-and-forget execute (no receipt wait on hot path).
 */

import {
  Client,
  TopicMessageSubmitTransaction,
  TopicId,
  AccountId,
  PrivateKey,
} from '@hashgraph/sdk';

function createLimiter(maxConcurrent: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function runLimited<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      const next = waiting.shift();
      if (next) next();
    }
  };
}

async function main() {
  const concurrency = Math.max(1, parseInt(process.env.HIGH_TPS_CONCURRENCY || '500', 10));
  const durationSec = Math.max(10, parseInt(process.env.HIGH_TPS_DURATION || '600', 10));
  const network = (process.env.HEDERA_NETWORK || 'testnet') as 'testnet' | 'mainnet';
  const topicId = process.env.VNX_HCS_TOPIC_ID || '0.0.9227346';
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_PRIVATE_KEY;
  const label = process.env.BURST_DRIVER_LABEL || 'burst-1';

  if (!accountId || !privateKey) {
    console.error('Missing HEDERA_ACCOUNT_ID / HEDERA_PRIVATE_KEY');
    process.exit(1);
  }

  const client = Client.forName(network);
  client.setOperator(AccountId.fromString(accountId), PrivateKey.fromStringECDSA(privateKey));
  const topic = TopicId.fromString(topicId);

  console.log(`=== VNX HCS Burst Driver [${label}] ===`);
  console.log(`topic=${topicId} concurrency=${concurrency} duration=${durationSec}s payer=${accountId}\n`);

  const limiter = createLimiter(concurrency);
  const start = Date.now();
  const end = start + durationSec * 1000;
  let submitted = 0;
  let executed = 0;
  let failed = 0;
  const pending: Promise<void>[] = [];

  const stat = setInterval(() => {
    const elapsed = (Date.now() - start) / 1000;
    const tps = elapsed > 0 ? (executed / elapsed).toFixed(1) : '0';
    console.log(`[${label}] t=${elapsed.toFixed(0)}s submitted=${submitted} executed=${executed} fail=${failed} tps=${tps}`);
  }, 10000);

  while (Date.now() < end) {
    const n = ++submitted;
    pending.push(
      limiter(async () => {
        try {
          const body = JSON.stringify({
            type: 'vnx.swarm.proof.burst',
            burstId: `${label}-${n}`,
            ts: Date.now(),
            network,
            topicId,
          });
          const tx = new TopicMessageSubmitTransaction().setTopicId(topic).setMessage(body);
          await tx.execute(client);
          executed++;
        } catch {
          failed++;
        }
      }),
    );
    if (pending.length >= concurrency) {
      await Promise.allSettled(pending.splice(0, concurrency));
    }
  }

  while (pending.length > 0) {
    await Promise.allSettled(pending.splice(0, concurrency));
  }

  clearInterval(stat);
  const wall = (Date.now() - start) / 1000;
  console.log(`\n=== ${label} RESULTS ===`);
  console.log(`Executed: ${executed} | Failed: ${failed} | Wall: ${wall.toFixed(1)}s`);
  console.log(`TPS: ${(executed / wall).toFixed(2)}`);
  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});