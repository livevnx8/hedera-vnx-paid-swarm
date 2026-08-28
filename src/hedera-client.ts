/**
 * Hedera Client — Minimal wrapper for @hashgraph/sdk
 * Supports HBAR transfers, balance queries, and client setup from env vars.
 * BIND HCS-SIGN-ORDER-012: no signed CryptoTransfer bytes leave until identity
 * gate has already returned do-not-block. Order: resolve identity OR require a
 * rail-passed token → freezeWith → sign → execute. Raw transferHbar without
 * token/identity fails closed (cannot bypass rail).
 */

import {
  Client,
  AccountId,
  PrivateKey,
  AccountBalanceQuery,
  TransferTransaction,
  Hbar,
  HbarUnit,
  Status,
} from '@hashgraph/sdk';
import {
  CallerIdentity,
  resolveCallerIdentity,
  identityBlocksPayment,
  ResolvedCallerIdentity,
} from './identity-gate.js';

export interface HederaClientConfig {
  accountId: string;
  privateKey: string;
  network: 'mainnet' | 'testnet' | 'previewnet';
}

export interface HbarAccountBalance {
  hbar: number;
  tokens: Record<string, number>;
  timestamp: number;
}

export interface HbarTransferResult {
  transactionId: string;
  status: string;
  consensusTimestampMs: number;
}

/** Opaque token: only issueRailPassedToken() can mint one the client will accept. */
const RAIL_PASSED = new WeakSet<object>();

export interface RailPassedToken {
  readonly __railPassed: true;
  readonly identity_status: 'resolved';
}

export type TransferHbarAuth = CallerIdentity | RailPassedToken;

export function issueRailPassedToken(resolved: ResolvedCallerIdentity): RailPassedToken {
  if (resolved == null || resolved.identity_status !== 'resolved' || identityBlocksPayment(resolved)) {
    throw new Error(resolved?.reason || 'CONSENSUS_IDENTITY_UNRESOLVED');
  }
  const token: RailPassedToken = { __railPassed: true, identity_status: 'resolved' };
  RAIL_PASSED.add(token);
  return token;
}

export function isRailPassedToken(v: unknown): v is RailPassedToken {
  return typeof v === 'object' && v !== null && RAIL_PASSED.has(v);
}

/**
 * Gate before freeze/sign/execute. Missing auth, unresolved, disagreement,
 * non-canonical, publisher observation, or a forged token → throw. No freeze,
 * no sign, no execute, no signed CryptoTransfer bytes.
 */
export function authorizeSign(auth?: TransferHbarAuth | null): ResolvedCallerIdentity {
  if (isRailPassedToken(auth)) {
    return {
      identity_status: 'resolved',
      caller_canonical_present: true,
      manufactured: false,
      mirror_bytes_match: true,
      canonical: 'rail-passed',
      reason: null,
    };
  }
  if (auth == null) {
    throw new Error('CONSENSUS_IDENTITY_UNRESOLVED');
  }
  const resolved = resolveCallerIdentity(auth);
  if (identityBlocksPayment(resolved) || resolved.identity_status !== 'resolved') {
    throw new Error(resolved.reason || 'CONSENSUS_IDENTITY_UNRESOLVED');
  }
  return resolved;
}

/**
 * Low-level Hedera client wrapper for HBAR transfers and balance queries.
 * Handles SDK client setup, operator configuration, and connection cleanup.
 *
 * transferHbar requires identity (resolved canonical loc) or a rail-passed token.
 * The 3-arg bypass (fromEnv + transferHbar without auth) fails closed.
 *
 * @example
 * const client = HederaClient.fromEnv();
 * const result = await client?.transferHbar('0.0.12345', 0.01, 'memo', {
 *   sequence_number: 120,
 *   claimed_location: 120,
 * });
 * client?.close();
 */
export class HederaClient {
  private readonly _client: Client;
  private readonly _accountId: AccountId;
  private readonly _privateKey: PrivateKey;

  constructor(config: HederaClientConfig) {
    this._accountId = AccountId.fromString(config.accountId);
    this._privateKey = PrivateKey.fromStringECDSA(config.privateKey);

    switch (config.network) {
      case 'mainnet':
        this._client = Client.forMainnet();
        break;
      case 'testnet':
        this._client = Client.forTestnet();
        break;
      case 'previewnet':
        this._client = Client.forPreviewnet();
        break;
    }

    this._client.setOperator(this._accountId, this._privateKey);
    this._client.setDefaultMaxTransactionFee(new Hbar(2));
    this._client.setDefaultMaxQueryPayment(new Hbar(1));
  }

  /** Fetch HBAR balance for the configured account */
  async getBalance(accountId?: string): Promise<HbarAccountBalance> {
    const id = accountId ? AccountId.fromString(accountId) : this._accountId;
    const balance = await new AccountBalanceQuery().setAccountId(id).execute(this._client);

    const tokens: Record<string, number> = {};
    if (balance.tokens) {
      for (const [tokenId, amount] of balance.tokens) {
        tokens[tokenId.toString()] = amount.toNumber();
      }
    }

    return {
      hbar: balance.hbars.to(HbarUnit.Hbar).toNumber(),
      tokens,
      timestamp: Date.now(),
    };
  }

  /**
   * Transfer HBAR from operator account to a recipient.
   * BIND 012 order: (1) resolve identity OR require rail-passed token
   * (2) freezeWith (3) sign (4) execute. Unresolved/disagreement/missing auth:
   * throw before freeze, sign, or execute.
   */
  async transferHbar(
    toAccountId: string,
    amountHbar: number,
    memo?: string,
    auth?: TransferHbarAuth,
  ): Promise<HbarTransferResult> {
    // (1) Gate. No CryptoTransfer construction until do-not-block.
    authorizeSign(auth);

    const tx = new TransferTransaction()
      .addHbarTransfer(this._accountId, new Hbar(-amountHbar))
      .addHbarTransfer(AccountId.fromString(toAccountId), new Hbar(amountHbar));

    if (memo) tx.setTransactionMemo(memo);

    // (2) freeze / refuse — freezeWith operator client BEFORE sign
    const frozen = tx.freezeWith(this._client);
    // (3) only then sign
    const signedTx = await frozen.sign(this._privateKey);
    // (4) only then execute
    const response = await signedTx.execute(this._client);
    const receipt = await response.getReceipt(this._client);

    return {
      transactionId: response.transactionId.toString(),
      status: receipt.status === Status.Success ? 'success' : receipt.status.toString(),
      consensusTimestampMs: Date.now(),
    };
  }

  /** Close client connections */
  close(): void {
    this._client.close();
  }

  /** Build client from environment variables (returns null if vars missing) */
  static fromEnv(): HederaClient | null {
    const accountId = process.env['HEDERA_ACCOUNT_ID'];
    const privateKey = process.env['HEDERA_PRIVATE_KEY'];
    const network = (process.env['HEDERA_NETWORK'] ?? 'mainnet') as HederaClientConfig['network'];
    if (!accountId || !privateKey) return null;
    try {
      return new HederaClient({ accountId, privateKey, network });
    } catch (err) {
      console.warn(`[HederaClient] Failed to init: ${(err as Error).message}`);
      return null;
    }
  }
}
