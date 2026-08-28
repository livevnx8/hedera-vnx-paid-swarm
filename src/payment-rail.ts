/**
 * VNX Paid Micro-Swarm — Hedera Payment Rail
 * Wraps HederaClient with mainnet enforcement, amount validation, and error normalization.
 * BIND HCS-PAYMENT-RAIL-BIND-011: identity_status gate before transferHbar.
 */

import { PaymentRail, PaymentResult, CallerIdentity } from './types.js';
import {
  resolveCallerIdentity,
  identityBlocksPayment,
  ResolvedCallerIdentity,
} from './identity-gate.js';

/** Configuration for HederaPaymentRail safety guards */
export interface PaymentRailConfig {
  /** If true, throws when HEDERA_NETWORK !== 'mainnet' */
  requireMainnet: boolean;
  /** Maximum HBAR allowed per transfer */
  maxHbar: number;
}

type HederaClientType = any;

/**
 * High-level HBAR payment rail with validation, mainnet enforcement,
 * identity_status gating, and normalized error handling. Lazily initializes
 * the HederaClient only when a real transfer is requested.
 *
 * @example
 * const rail = new HederaPaymentRail({ requireMainnet: true, maxHbar: 0.01 });
 * const result = await rail.transfer('0.0.12345', 0.005, 'memo', identity);
 */
export class HederaPaymentRail implements PaymentRail {
  private _client: HederaClientType | null = null;

  constructor(private _config: PaymentRailConfig) {
    const network = (process.env['HEDERA_NETWORK'] ?? 'mainnet') as string;

    if (_config.requireMainnet && network !== 'mainnet') {
      throw new Error(
        `Competition run requires HEDERA_NETWORK=mainnet. Got: "${network}". ` +
          `Use --plan-only for local development.`,
      );
    }
  }

  /** Lazy init: import HederaClient only when a real transfer is requested */
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

  /**
   * Transfer HBAR to a recipient with validation and error normalization.
   * UNRESOLVED / DISAGREEMENT: do not call transferHbar / client execute.
   * @param toAccountId Target Hedera account (e.g. '0.0.12345')
   * @param amountHbar Amount in HBAR (must be positive and ≤ maxHbar)
   * @param memo Optional transaction memo
   * @param identity Caller identity (missing/stripped/non-canonical → unresolved)
   * @returns Normalized PaymentResult with status, tx id, identity_status, and error info
   */
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
      const result = await this._client.transferHbar(toAccountId, amountHbar, memo);
      return {
        status: 'success',
        transactionId: result.transactionId,
        network: process.env['HEDERA_NETWORK'] ?? 'mainnet',
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
