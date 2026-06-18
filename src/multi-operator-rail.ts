/**
 * VNX Paid Micro-Swarm — Multi-Operator Hedera Payment Rail
 *
 * A {@link PaymentRail} backed by a pool of Hedera operator accounts. Transfers
 * are round-robined across operators so concurrency can scale past a single
 * account's transaction rate and avoid single-account nonce/duplicate-transaction
 * contention. Built for heavy load/stress testing against testnet, where many
 * funded accounts are available.
 *
 * Each operator's HederaClient is lazily constructed on first use. Amount and
 * network guards mirror {@link HederaPaymentRail}, with an extra safety guard
 * that refuses mainnet unless explicitly allowed (load tests should not hammer
 * mainnet by accident).
 */

import { PaymentRail, PaymentResult } from './types.js';
import { HederaClient, HederaClientConfig } from './hedera-client.js';

export interface OperatorCredential {
  accountId: string;
  privateKey: string;
}

/** Minimal surface of HederaClient used by the rail (enables test injection). */
export interface HederaClientLike {
  transferHbar(
    toAccountId: string,
    amountHbar: number,
    memo?: string,
  ): Promise<{ transactionId: string; status: string; consensusTimestampMs: number }>;
  getBalance(accountId?: string): Promise<{ hbar: number }>;
  close(): void;
}

export interface MultiOperatorRailConfig {
  /** Pool of operator accounts that sign and pay for transfers. */
  operators: OperatorCredential[];
  /** Hedera network for all operators. */
  network: 'mainnet' | 'testnet' | 'previewnet';
  /** Maximum HBAR allowed per transfer. */
  maxHbar: number;
  /** When true, allow mainnet. Defaults to false so load tests stay off mainnet. */
  allowMainnet?: boolean;
  /** Factory override for constructing clients (used in tests to avoid the network). */
  clientFactory?: (config: HederaClientConfig) => HederaClientLike;
}

export interface OperatorBalance {
  accountId: string;
  hbar: number;
}

/**
 * Round-robin HBAR payment rail across a pool of operator accounts.
 *
 * @example
 * const rail = new MultiOperatorHederaRail({
 *   operators: [{ accountId: '0.0.1001', privateKey: '302e...' }],
 *   network: 'testnet',
 *   maxHbar: 0.01,
 * });
 * const result = await rail.transfer('0.0.1001', 0.001, 'memo');
 */
export class MultiOperatorHederaRail implements PaymentRail {
  private readonly _clients: Array<HederaClientLike | null>;
  private _cursor = 0;

  constructor(private readonly _config: MultiOperatorRailConfig) {
    if (!_config.operators || _config.operators.length === 0) {
      throw new Error('MultiOperatorHederaRail requires at least one operator account');
    }
    if (_config.network === 'mainnet' && !_config.allowMainnet) {
      throw new Error(
        'MultiOperatorHederaRail refuses to run on mainnet by default. ' +
          'Set allowMainnet=true to override (not recommended for load tests).',
      );
    }
    this._clients = new Array(_config.operators.length).fill(null);
  }

  /** Account IDs in the operator pool (usable as a recipient pool for self/peer transfers). */
  get accountIds(): string[] {
    return this._config.operators.map(o => o.accountId);
  }

  /** Number of operators in the pool. */
  get size(): number {
    return this._config.operators.length;
  }

  private _client(index: number): HederaClientLike {
    const existing = this._clients[index];
    if (existing) return existing;
    const op = this._config.operators[index];
    const config: HederaClientConfig = {
      accountId: op.accountId,
      privateKey: op.privateKey,
      network: this._config.network,
    };
    const client = this._config.clientFactory
      ? this._config.clientFactory(config)
      : (new HederaClient(config) as HederaClientLike);
    this._clients[index] = client;
    return client;
  }

  async transfer(toAccountId: string, amountHbar: number, memo?: string): Promise<PaymentResult> {
    if (amountHbar <= 0) {
      return this._fail('Amount must be positive', toAccountId, amountHbar);
    }
    if (amountHbar > this._config.maxHbar) {
      return this._fail(
        `Amount ${amountHbar} HBAR exceeds cap ${this._config.maxHbar} HBAR`,
        toAccountId,
        amountHbar,
      );
    }

    const n = this._config.operators.length;
    let index = this._cursor++ % n;
    // Never pay from an operator to itself: a net-zero self-transfer is rejected
    // by Hedera (ACCOUNT_REPEATED_IN_ACCOUNT_AMOUNTS). Advance to the next
    // operator, which is guaranteed distinct (account IDs are unique).
    if (n > 1 && this._config.operators[index].accountId === toAccountId) {
      index = this._cursor++ % n;
    }
    try {
      const client = this._client(index);
      const result = await client.transferHbar(toAccountId, amountHbar, memo);
      if (result.status !== 'success') {
        return this._fail(`Transfer status: ${result.status}`, toAccountId, amountHbar);
      }
      return {
        status: 'success',
        transactionId: result.transactionId,
        network: this._config.network,
        amountHbar,
        recipient: toAccountId,
        consensusTimestampMs: result.consensusTimestampMs,
      };
    } catch (err) {
      return this._fail((err as Error).message, toAccountId, amountHbar);
    }
  }

  /** Query the HBAR balance of every operator (pre-flight funding check). */
  async balances(): Promise<OperatorBalance[]> {
    const out: OperatorBalance[] = [];
    for (let i = 0; i < this._config.operators.length; i++) {
      const accountId = this._config.operators[i].accountId;
      try {
        const balance = await this._client(i).getBalance();
        out.push({ accountId, hbar: balance.hbar });
      } catch (err) {
        out.push({ accountId, hbar: Number.NaN });
        console.warn(
          `[MultiOperatorHederaRail] balance query failed for ${accountId}: ${(err as Error).message}`,
        );
      }
    }
    return out;
  }

  /** Close all initialized operator clients. */
  close(): void {
    for (const client of this._clients) {
      if (client) {
        try {
          client.close();
        } catch {
          /* ignore close errors */
        }
      }
    }
  }

  private _fail(error: string, recipient: string, amountHbar: number): PaymentResult {
    return {
      status: 'payment_failed',
      network: this._config.network,
      amountHbar,
      recipient,
      error,
    };
  }
}

/**
 * Parse a JSON array of operator credentials, e.g. the HEDERA_TESTNET_ACCOUNTS
 * env var. Accepts `accountId`/`privateKey` keys.
 *
 * @throws if the value is not a non-empty array of valid credentials.
 */
export function parseOperatorCredentials(json: string): OperatorCredential[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(`Invalid operator credentials JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Operator credentials must be a non-empty JSON array');
  }
  return parsed.map((entry, i) => {
    const rec = entry as Record<string, unknown>;
    const accountId = rec.accountId ?? rec.account_id ?? rec.id;
    const privateKey = rec.privateKey ?? rec.private_key ?? rec.key;
    if (typeof accountId !== 'string' || typeof privateKey !== 'string') {
      throw new Error(`Operator at index ${i} is missing a string accountId/privateKey`);
    }
    return { accountId, privateKey };
  });
}
