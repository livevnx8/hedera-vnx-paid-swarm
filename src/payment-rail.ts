/**
 * VNX Paid Micro-Swarm — Hedera Payment Rail
 * BIND HCS-RAIL-012: after identity resolves, mint a rail-passed token and
 * pass it as the 4th arg to transferHbar. 3-arg client calls stay fail-closed.
 * requireMainnet:false requires HEDERA_NETWORK=testnet (no implicit mainnet).
 */
import { PaymentRail, PaymentResult, CallerIdentity } from './types.js';
import {
  resolveCallerIdentity,
  identityBlocksPayment,
  ResolvedCallerIdentity,
} from './identity-gate.js';
import { issueRailPassedToken } from './hedera-client.js';

export interface PaymentRailConfig {
  requireMainnet: boolean;
  maxHbar: number;
}

type HederaClientType = any;

/**
 * High-level HBAR payment rail with validation, network lock,
 * identity_status gating, and normalized error handling.
 */
export class HederaPaymentRail implements PaymentRail {
  private _client: HederaClientType | null = null;

  constructor(private _config: PaymentRailConfig) {
    if (_config.requireMainnet) {
      const network = process.env['HEDERA_NETWORK'] ?? '';
      if (network !== 'mainnet') {
        throw new Error(
          `requireMainnet:true requires HEDERA_NETWORK=mainnet (no implicit mainnet default). Got: "${network || '(missing)'}"`,
        );
      }
    } else {
      const network = process.env['HEDERA_NETWORK'] ?? '';
      if (network !== 'testnet') {
        throw new Error(
          `requireMainnet:false requires HEDERA_NETWORK=testnet (no implicit mainnet default). Got: "${network || '(missing)'}"`,
        );
      }
    }
  }

  private async _init(): Promise<void> {
    if (this._client) return;
    const mod = await import('./hedera-client.js');
    const client = mod.HederaClient.fromEnv();
    if (!client) {
      const missing: string[] = [];
      if (!process.env['HEDERA_ACCOUNT_ID']) missing.push('HEDERA_ACCOUNT_ID');
      if (!process.env['HEDERA_PRIVATE_KEY']) missing.push('HEDERA_PRIVATE_KEY');
      throw new Error(
        `Missing Hedera credentials: ${missing.join(', ')}. ` +
          `Set them as environment variables or use --plan-only.`,
      );
    }
    this._client = client;
  }

  async transfer(
    toAccountId: string,
    amountHbar: number,
    memo?: string,
    identity?: CallerIdentity,
  ): Promise<PaymentResult> {
    const resolved = resolveCallerIdentity(identity);
    if (identityBlocksPayment(resolved)) {
      const error =
        resolved.identity_status === 'disagreement'
          ? 'CONSENSUS_LOCATION_DISAGREEMENT'
          : 'CONSENSUS_IDENTITY_UNRESOLVED';
      return this._fail(error, toAccountId, amountHbar, resolved);
    }

    if (amountHbar <= 0) {
      return this._fail('Amount must be positive', toAccountId, amountHbar, resolved);
    }
    if (amountHbar > this._config.maxHbar) {
      return this._fail(
        `Amount ${amountHbar} HBAR exceeds cap ${this._config.maxHbar} HBAR`,
        toAccountId,
        amountHbar,
        resolved,
      );
    }

    try {
      await this._init();
      const token = issueRailPassedToken(resolved);
      const result = await this._client.transferHbar(toAccountId, amountHbar, memo, token);
      return {
        status: 'success',
        transactionId: result.transactionId,
        network: process.env['HEDERA_NETWORK'] ?? 'unknown',
        amountHbar,
        recipient: toAccountId,
        consensusTimestampMs: result.consensusTimestampMs,
        identity_status: resolved.identity_status,
        caller_canonical_present: resolved.caller_canonical_present,
        manufactured: resolved.manufactured,
        mirror_bytes_match: resolved.mirror_bytes_match,
      };
    } catch (err) {
      return this._fail((err as Error).message, toAccountId, amountHbar, resolved);
    }
  }

  private _fail(
    error: string,
    recipient: string,
    amountHbar: number,
    resolved?: ResolvedCallerIdentity,
  ): PaymentResult {
    return {
      status: 'payment_failed',
      network: process.env['HEDERA_NETWORK'] ?? 'unknown',
      amountHbar,
      recipient,
      error,
      identity_status: resolved?.identity_status,
      caller_canonical_present: resolved?.caller_canonical_present,
      manufactured: resolved?.manufactured,
      mirror_bytes_match: resolved?.mirror_bytes_match,
    };
  }
}
