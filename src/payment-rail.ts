/**
 * VNX Paid Micro-Swarm — Hedera Payment Rail
 * Wraps HederaClient with mainnet enforcement, amount validation, and error normalization.
 */

import { PaymentRail, PaymentResult } from './types.js';

export interface PaymentRailConfig {
  requireMainnet: boolean;
  maxHbar: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HederaClientType = any;

export class HederaPaymentRail implements PaymentRail {
  private _client: HederaClientType | null = null;

  constructor(private _config: PaymentRailConfig) {
    const network = (process.env['HEDERA_NETWORK'] ?? 'mainnet') as string;

    if (_config.requireMainnet && network !== 'mainnet') {
      throw new Error(
        `Competition run requires HEDERA_NETWORK=mainnet. Got: "${network}". ` +
        `Use --plan-only for local development.`
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
        `Set them as environment variables or use --plan-only.`
      );
    }
    this._client = client;
  }

  async transfer(toAccountId: string, amountHbar: number, memo?: string): Promise<PaymentResult> {
    if (amountHbar <= 0) {
      return this._fail('Amount must be positive', toAccountId, amountHbar);
    }
    if (amountHbar > this._config.maxHbar) {
      return this._fail(
        `Amount ${amountHbar} HBAR exceeds cap ${this._config.maxHbar} HBAR`,
        toAccountId,
        amountHbar
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
      };
    } catch (err) {
      return this._fail((err as Error).message, toAccountId, amountHbar);
    }
  }

  private _fail(error: string, recipient: string, amountHbar: number): PaymentResult {
    return {
      status: 'payment_failed',
      network: process.env['HEDERA_NETWORK'] ?? 'unknown',
      amountHbar,
      recipient,
      error,
    };
  }
}
