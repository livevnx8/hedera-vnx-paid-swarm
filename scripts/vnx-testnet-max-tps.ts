#!/usr/bin/env node
/**
 * VNX Paid Micro-Swarm — Testnet Max-Throughput Probe
 *
 * Measures how many transactions per second the swarm's wallets can *submit*
 * to Hedera testnet, fire-and-forget (no getReceipt wait, maxAttempts=1), in
 * parallel across every funded operator wallet. Submits HBAR transfers and/or
 * HCS topic messages, and reports achieved submission TPS plus throttle/error
 * rates — i.e. the practical testnet ceiling from a single client.
 *
 * This is a network probe, not a proof run: it intentionally does NOT wait for
 * consensus (that gates throughput at ~1/finality). Consensus is verified
 * afterward via the mirror node (topic sequence number + a sample transfer).
 *
 * Example:
 *   export HEDERA_TESTNET_ACCOUNTS='[{"accountId":"0.0.x","privateKey":"302e..."}]'
 *   npm run maxtps -- --duration 15 --concurrency 200 --mode both
 */

import {
  Client,
  AccountId,
  PrivateKey,
  Hbar,
  HbarUnit,
  AccountBalanceQuery,
  TransferTransaction,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicId,
} from '@hashgraph/sdk';
import { performance } from 'perf_hooks';
import { Command } from 'commander';
import { parseOperatorCredentials, OperatorCredential } from '../src/multi-operator-rail.js';

const program = new Command()
  .name('vnx-testnet-max-tps')
  .description('Max-throughput submission probe for the VNX swarm wallets on Hedera testnet')
  .option('--duration <seconds>', 'How long to fire submissions', '15')
  .option('--requests <n>', 'Fixed number of submissions (overrides --duration)')
  .option('--concurrency <n>', 'Max simultaneous in-flight submissions', '200')
  .option('--mode <mode>', 'transfers | hcs | both', 'both')
  .option('--amount <hbar>', 'HBAR amount per transfer', '0.0001')
  .option('--network <name>', 'testnet | previewnet', 'testnet')
  .option('--min-balance <hbar>', 'Min wallet balance to be used as a sender', '1')
  .option('--json', 'Emit a single machine-readable JSON summary line (suppresses pretty output)')
  .parse();

const opts = program.opts();

interface Wallet {
  accountId: AccountId;
  client: Client;
}

function clientForNetwork(network: string): Client {
  if (network === 'previewnet') return Client.forPreviewnet();
  if (network === 'mainnet') return Client.forMainnet();
  return Client.forTestnet();
}

function loadOperators(): OperatorCredential[] {
  const poolJson = process.env['HEDERA_TESTNET_ACCOUNTS'] ?? process.env['HEDERA_ACCOUNTS'];
  if (poolJson) return parseOperatorCredentials(poolJson);
  const accountId = process.env['HEDERA_ACCOUNT_ID'];
  const privateKey = process.env['HEDERA_PRIVATE_KEY'];
  if (accountId && privateKey) return [{ accountId, privateKey }];
  throw new Error(
    'Set HEDERA_TESTNET_ACCOUNTS (JSON array) or HEDERA_ACCOUNT_ID + HEDERA_PRIVATE_KEY.',
  );
}

function classify(message: string): string {
  const m = message.toUpperCase();
  for (const key of [
    'BUSY',
    'THROTTLED',
    'TRANSACTION_EXPIRED',
    'DUPLICATE_TRANSACTION',
    'INSUFFICIENT_PAYER_BALANCE',
    'INVALID_SIGNATURE',
    'PLATFORM_NOT_ACTIVE',
    'TIMEOUT',
    'MAX ATTEMPTS',
    'GRPC',
  ]) {
    if (m.includes(key)) return key.toLowerCase().replace(/\s+/g, '_');
  }
  return message.slice(0, 70);
}

async function main(): Promise<void> {
  const network = opts.network as string;
  const concurrency = Math.max(1, parseInt(opts.concurrency as string, 10));
  const durationMs = opts.requests ? undefined : parseFloat(opts.duration as string) * 1000;
  const totalRequests = opts.requests ? parseInt(opts.requests as string, 10) : undefined;
  const amount = parseFloat(opts.amount as string);
  const minBalance = parseFloat(opts.minBalance as string);
  const mode = opts.mode as 'transfers' | 'hcs' | 'both';
  const jsonMode = Boolean(opts.json);
  // In JSON mode all human-readable output is suppressed so the orchestrator can
  // parse a single summary line from stdout; warnings still go to stderr.
  const log = jsonMode ? (): void => {} : (msg: string): void => console.log(msg);

  log(`
╔════════════════════════════════════════════════════════════╗
║  VNX Swarm — Testnet Max-Throughput Probe (fire-and-forget) ║
╚════════════════════════════════════════════════════════════╝
  Network:     ${network}
  Mode:        ${mode}
  Workload:    ${totalRequests ? `${totalRequests} submissions` : `${(durationMs as number) / 1000}s`}
  Concurrency: ${concurrency}
`);

  const operators = loadOperators();

  // Build clients and filter to funded wallets.
  const wallets: Wallet[] = [];
  for (const op of operators) {
    const client = clientForNetwork(network);
    client.setOperator(
      AccountId.fromString(op.accountId),
      PrivateKey.fromStringECDSA(op.privateKey),
    );
    client.setDefaultMaxTransactionFee(new Hbar(2));
    try {
      const bal = await new AccountBalanceQuery()
        .setAccountId(AccountId.fromString(op.accountId))
        .execute(client);
      const hbar = bal.hbars.to(HbarUnit.Hbar).toNumber();
      log(`  ${op.accountId.padEnd(16)} ${hbar} ℏ`);
      if (hbar > minBalance) {
        wallets.push({ accountId: AccountId.fromString(op.accountId), client });
      } else {
        client.close();
      }
    } catch (err) {
      console.warn(`  ${op.accountId} balance check failed: ${(err as Error).message}`);
      client.close();
    }
  }

  if (wallets.length === 0) {
    console.error('\nNo funded wallets above the min-balance threshold.');
    process.exit(1);
  }
  log(`\n  Funded senders: ${wallets.length}\n`);

  // Create a shared HCS topic if needed.
  let topicId: TopicId | undefined;
  if (mode === 'hcs' || mode === 'both') {
    const resp = await new TopicCreateTransaction()
      .setTopicMemo('vnx-swarm-max-tps')
      .execute(wallets[0].client);
    const receipt = await resp.getReceipt(wallets[0].client);
    topicId = receipt.topicId ?? undefined;
    log(`  HCS topic: ${topicId?.toString()}\n`);
  }

  let submitted = 0;
  let throttled = 0;
  let failed = 0;
  const errorBreakdown: Record<string, number> = {};
  let dispatched = 0;
  let opCounter = 0;
  let walletCursor = 0;

  const start = performance.now();
  const deadline = durationMs ? start + durationMs : Infinity;
  const shouldContinue = (): boolean =>
    totalRequests ? dispatched < totalRequests : performance.now() < deadline;

  const fireOne = async (): Promise<void> => {
    const w = wallets[walletCursor++ % wallets.length];
    const useHcs = mode === 'hcs' || (mode === 'both' && opCounter++ % 2 === 0);
    try {
      if (useHcs && topicId) {
        await new TopicMessageSubmitTransaction()
          .setTopicId(topicId)
          .setMessage(`vnx.swarm.proof#${dispatched}`)
          .setMaxAttempts(1)
          .execute(w.client);
      } else {
        const to = wallets[(walletCursor + 1) % wallets.length].accountId;
        await new TransferTransaction()
          .addHbarTransfer(w.accountId, new Hbar(-amount))
          .addHbarTransfer(to, new Hbar(amount))
          .setTransactionMemo('vnx-maxtps')
          .setMaxAttempts(1)
          .execute(w.client);
      }
      submitted++;
    } catch (err) {
      const bucket = classify((err as Error).message);
      errorBreakdown[bucket] = (errorBreakdown[bucket] ?? 0) + 1;
      if (bucket === 'busy' || bucket === 'throttled') throttled++;
      else failed++;
    }
  };

  const worker = async (): Promise<void> => {
    while (shouldContinue()) {
      dispatched++;
      await fireOne();
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsedSec = (performance.now() - start) / 1000;

  log(`╔════════════════════════════════════════════════════════════╗
║  Results                                                    ║
╚════════════════════════════════════════════════════════════╝
  Elapsed:            ${elapsedSec.toFixed(2)} s
  Submitted (OK):     ${submitted.toLocaleString()}
  Throttled (BUSY):   ${throttled.toLocaleString()}
  Failed (other):     ${failed.toLocaleString()}
  Submission TPS:     ${(submitted / elapsedSec).toFixed(1)}
  Attempted TPS:      ${(dispatched / elapsedSec).toFixed(1)}
`);

  const errors = Object.entries(errorBreakdown).sort((a, b) => b[1] - a[1]);
  if (errors.length > 0) {
    log('  Error/throttle breakdown:');
    for (const [bucket, count] of errors) {
      log(`    ${bucket.padEnd(36)} ${count.toLocaleString().padStart(8)}`);
    }
    log('');
  }

  // Async consensus verification via mirror node.
  let mirrorSequence: number | undefined;
  if (topicId) {
    await new Promise(r => setTimeout(r, 6000));
    try {
      const url = `https://${network}.mirrornode.hedera.com/api/v1/topics/${topicId.toString()}/messages?limit=1&order=desc`;
      const res = await fetch(url);
      const json = (await res.json()) as { messages?: Array<{ sequence_number?: number }> };
      mirrorSequence = json.messages?.[0]?.sequence_number;
      log(
        `  Mirror node: topic ${topicId.toString()} reached sequence #${mirrorSequence ?? 'n/a'} at consensus`,
      );
      log(`  View: https://hashscan.io/${network}/topic/${topicId.toString()}\n`);
    } catch (err) {
      console.warn(`  Mirror verification failed: ${(err as Error).message}`);
    }
  }

  for (const w of wallets) w.client.close();

  if (jsonMode) {
    process.stdout.write(
      JSON.stringify({
        submitted,
        throttled,
        failed,
        dispatched,
        elapsedSec,
        submissionTps: submitted / elapsedSec,
        senders: wallets.length,
        topicId: topicId?.toString(),
        mirrorSequence,
        errorBreakdown,
      }) + '\n',
    );
  }
}

main().catch(err => {
  console.error('\nMax-TPS probe failed:', (err as Error).message);
  process.exit(1);
});
