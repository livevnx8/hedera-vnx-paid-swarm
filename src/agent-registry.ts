/**
 * VNX Paid Micro-Swarm — Dynamic Agent Registry
 */

import { VnxWorkerAgent } from './workers.js';

export interface AgentRecord {
  id: string;
  name: string;
  specialty: string;
  priceHbar: number;
  paymentAccount: string;
  endpoint?: string;
  metadata?: Record<string, unknown>;
  registeredAt: number;
}

export class AgentRegistry {
  private _agents: Map<string, AgentRecord> = new Map();

  register(record: Omit<AgentRecord, 'registeredAt'>): AgentRecord {
    if (this._agents.has(record.id)) {
      throw new Error(`Agent ${record.id} is already registered`);
    }
    const full: AgentRecord = { ...record, registeredAt: Date.now() };
    this._agents.set(record.id, full);
    return full;
  }

  deregister(id: string): boolean {
    return this._agents.delete(id);
  }

  get(id: string): AgentRecord | undefined {
    return this._agents.get(id);
  }

  list(): AgentRecord[] {
    return Array.from(this._agents.values()).sort((a, b) => a.registeredAt - b.registeredAt);
  }

  toWorkerAgents(): VnxWorkerAgent[] {
    return this.list().map(r => new VnxWorkerAgent(r.id, r.name, r.specialty, r.priceHbar, r.paymentAccount, r.metadata?.evidence as string ?? ''));
  }

  export(): Record<string, AgentRecord> {
    const out: Record<string, AgentRecord> = {};
    for (const [id, rec] of this._agents) out[id] = rec;
    return out;
  }

  import(data: Record<string, AgentRecord>): void {
    this._agents = new Map(Object.entries(data));
  }
}
