/**
 * VNX Paid Micro-Swarm — High-Level SDK Client
 */

import { SwarmReceipt } from './types.js';
import { PaidSwarmCoordinator } from './coordinator.js';
import { HederaPaymentRail } from './payment-rail.js';
import { VnxWorkerAgent, DEFAULT_WORKERS } from './workers.js';
import { AgentRegistry } from './agent-registry.js';
import { AgentLedger } from './agent-ledger.js';
import { SwarmError } from './errors.js';

export interface SdkConfig {
  accountId: string;
  privateKey: string;
  network?: 'mainnet' | 'testnet' | 'previewnet';
  maxHbar?: number;
  planOnly?: boolean;
  workers?: VnxWorkerAgent[];
  registry?: AgentRegistry;
}

export class VnxSwarmClient {
  private _coordinator: PaidSwarmCoordinator;
  private _ledger: AgentLedger;
  private _registry: AgentRegistry;
  private _initialized = false;

  constructor(private _config: SdkConfig) {
    this._registry = _config.registry ?? new AgentRegistry();
    this._ledger = new AgentLedger();

    const workers =
      _config.workers ?? (_config.registry ? _config.registry.toWorkerAgents() : DEFAULT_WORKERS);
    const rail = new HederaPaymentRail({ requireMainnet: false, maxHbar: _config.maxHbar ?? 0.01 });
    this._coordinator = new PaidSwarmCoordinator(
      workers,
      {
        maxHbar: _config.maxHbar ?? 0.01,
        planOnly: _config.planOnly ?? false,
      },
      rail,
    );
  }

  async init(_opts?: Record<string, unknown>): Promise<void> {
    if (!this._config.accountId || !this._config.privateKey) {
      throw new SwarmError(
        'Missing Hedera credentials. Set accountId and privateKey.',
        'CREDENTIALS_MISSING',
      );
    }
    process.env['HEDERA_ACCOUNT_ID'] = this._config.accountId;
    process.env['HEDERA_PRIVATE_KEY'] = this._config.privateKey;
    process.env['HEDERA_NETWORK'] = this._config.network ?? 'mainnet';
    this._initialized = true;
  }

  async runTask(
    taskDescription: string,
    _opts?: { maxHbar?: number; planOnly?: boolean },
  ): Promise<SwarmReceipt> {
    if (!this._initialized) await this.init();
    const receipt = await this._coordinator.run(taskDescription);
    this._ledger.recordTask(receipt);
    return receipt;
  }

  get registry(): AgentRegistry {
    return this._registry;
  }
  get ledger(): AgentLedger {
    return this._ledger;
  }

  leaderboard(limit?: number) {
    return this._ledger.leaderboard(limit);
  }
}
