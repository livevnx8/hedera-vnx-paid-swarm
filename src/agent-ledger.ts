/**
 * VNX Paid Micro-Swarm — Agent Ledger (Reputation & Leaderboard)
 */

import { SwarmReceipt } from './types.js';

export interface AgentStats {
  id: string;
  name: string;
  tasksCompleted: number;
  tasksWon: number;
  totalPaymentsHbar: number;
  avgConfidence: number;
  totalConfidence: number;
  streak: number;
  lastActivity: number;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  reputation: number;
  tasksCompleted: number;
  tasksWon: number;
  totalPaymentsHbar: number;
  streak: number;
}

export class AgentLedger {
  private _stats: Map<string, AgentStats> = new Map();

  recordTask(receipt: SwarmReceipt): void {
    for (const vote of receipt.votes) {
      const s = this._touch(vote.workerId, vote.name);
      s.tasksCompleted++;
      s.totalConfidence += vote.confidence;
      s.avgConfidence = s.totalConfidence / s.tasksCompleted;
      s.lastActivity = Date.now();
    }
    const sel = receipt.selected;
    if (sel) {
      const s = this._touch(sel.workerId, sel.name);
      s.tasksWon++;
      s.totalPaymentsHbar += sel.priceHbar;
      s.streak++;
    }
    const winnerId = sel?.workerId;
    for (const vote of receipt.votes) {
      if (vote.workerId !== winnerId) {
        const s = this._stats.get(vote.workerId)!;
        s.streak = 0;
      }
    }
  }

  private _touch(id: string, name: string): AgentStats {
    let s = this._stats.get(id);
    if (!s) {
      s = {
        id, name,
        tasksCompleted: 0, tasksWon: 0,
        totalPaymentsHbar: 0, avgConfidence: 0,
        totalConfidence: 0, streak: 0, lastActivity: 0,
      };
      this._stats.set(id, s);
    }
    if (name) s.name = name;
    return s;
  }

  get(id: string): AgentStats | undefined {
    return this._stats.get(id);
  }

  leaderboard(limit = 10): LeaderboardEntry[] {
    const entries = Array.from(this._stats.values())
      .map(s => ({ ...s, reputation: this._reputation(s) }))
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, limit)
      .map((s, i) => ({
        rank: i + 1,
        id: s.id,
        name: s.name,
        reputation: s.reputation,
        tasksCompleted: s.tasksCompleted,
        tasksWon: s.tasksWon,
        totalPaymentsHbar: s.totalPaymentsHbar,
        streak: s.streak,
      }));
    return entries;
  }

  private _reputation(s: AgentStats): number {
    if (s.tasksCompleted === 0) return 0;
    const accuracy = s.tasksWon / s.tasksCompleted;
    const reliability = Math.min(s.tasksCompleted / 10, 1);
    const volume = Math.min(s.totalPaymentsHbar / 0.1, 1);
    const recency = s.lastActivity > 0 ? Math.min((Date.now() - s.lastActivity) / (7 * 24 * 60 * 60 * 1000), 1) : 0;
    return accuracy * 0.4 + reliability * 0.3 + volume * 0.2 + (1 - recency) * 0.1;
  }

  export(): Record<string, AgentStats> {
    const out: Record<string, AgentStats> = {};
    for (const [id, rec] of this._stats) out[id] = rec;
    return out;
  }

  import(data: Record<string, AgentStats>): void {
    this._stats = new Map(Object.entries(data));
  }
}
