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
  return function runLimited<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) {
      return new Promise<T>((resolve, reject) => {
        waiting.push(() => {
          runLimited(fn).then(resolve).catch(reject);
        });
      });
    }
    active++;
    return fn().finally(() => {
      active--;
      const next = waiting.shift();
      if (next) next();
    });
  };
}

async function main() {
  const concurrency = Math.max(1, parseInt(process.env.HIGH_TPS_CONCURRENCY || '500', 10));
  const durationSec = Math.max(5, parseInt(process.env.HIGH_TPS_DURATION || '600', 10));
  const maxMode = process.env.BURST_MAX_MODE === '1';
  const network = (process.env.HEDERA_NETWORK || 'testnet') as 'testnet' | 'mainnet';
  const topicId = process.env.VNX_HCS_TOPIC_ID || '0.0.9227346';
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_PRIVATE_KEY;
  const label = process.env.BURST_DRIVER_LABEL || 'burst-1';
  const geoRegion = process.env.GEO_REGION || process.env.VNX_GEO_REGION || 'local';
  const geoHost = process.env.GEO_HOST || process.env.HOSTNAME || 'unknown';

  if (!accountId || !privateKey) {
    console.error('Missing HEDERA_ACCOUNT_ID / HEDERA_PRIVATE_KEY');
    process.exit(1);
  }

  const client = Client.forName(network);
  const key = privateKey.startsWith('0x')
    ? PrivateKey.fromStringECDSA(privateKey)
    : PrivateKey.fromString(privateKey);
  client.setOperator(AccountId.fromString(accountId), key);
  const topic = TopicId.fromString(topicId);

  console.log(`=== VNX HCS Burst Driver [${label}] ===`);
  console.log(`topic=${topicId} concurrency=${concurrency} duration=${durationSec}s maxMode=${maxMode} payer=${accountId}\n`);

  const limiter = createLimiter(concurrency);
  const start = Date.now();
  const end = start + durationSec * 1000;
  let submitted = 0;
  let executed = 0;
  let failed = 0;
  const pending = new Set<Promise<void>>();

  const stat = setInterval(() => {
    const elapsed = (Date.now() - start) / 1000;
    const tps = elapsed > 0 ? (executed / elapsed).toFixed(1) : '0';
    console.log(`[${label}] t=${elapsed.toFixed(0)}s submitted=${submitted} executed=${executed} fail=${failed} inflight=${pending.size} tps=${tps}`);
  }, 5000);

  const fire = (n: number) => {
    const body = JSON.stringify({
      type: 'vnx.swarm.proof.burst',
      burstId: `${label}-${n}`,
      ts: Date.now(),
      network,
      topicId,
      geo: { region: geoRegion, host: geoHost, payer: accountId },
    });
    const tx = new TopicMessageSubmitTransaction().setTopicId(topic).setMessage(body);
    const p = limiter(() =>
      tx.execute(client).then(
        () => { executed++; },
        () => { failed++; },
      ),
    ).finally(() => { pending.delete(p); });
    pending.add(p);
  };

  if (maxMode) {
    // Saturate limiter — never block the submit loop on batch drains
    while (Date.now() < end) {
      fire(++submitted);
      if (pending.size >= concurrency * 3) {
        await Promise.race(pending);
      }
    }
  } else {
    const batch: Promise<void>[] = [];
    while (Date.now() < end) {
      const n = ++submitted;
      const body = JSON.stringify({
        type: 'vnx.swarm.proof.burst',
        burstId: `${label}-${n}`,
        ts: Date.now(),
        network,
        topicId,
        geo: { region: geoRegion, host: geoHost, payer: accountId },
      });
      const tx = new TopicMessageSubmitTransaction().setTopicId(topic).setMessage(body);
      batch.push(
        limiter(() =>
          tx.execute(client).then(
            () => { executed++; },
            () => { failed++; },
          ),
        ),
      );
      if (batch.length >= concurrency) {
        await Promise.allSettled(batch.splice(0, concurrency));
      }
    }
    while (batch.length > 0) {
      await Promise.allSettled(batch.splice(0, concurrency));
    }
  }

  await Promise.allSettled([...pending]);
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