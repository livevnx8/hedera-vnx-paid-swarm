/**
 * VNX Paid Micro-Swarm — Deterministic Worker Agents
 */

import { WorkerResult } from './types.js';

const SPECIALTY_KEYWORDS: Record<string, string[]> = {
  prediction: ['signal', 'predict', 'direction', 'price', 'risk', 'forecast', 'trend'],
  momentum: ['momentum', 'rsi', 'overbought', 'oversold', 'velocity', 'speed'],
  volatility: ['volatility', 'bollinger', 'bb', 'band', 'range', 'squeeze', 'expand'],
  trend: ['trend', 'sma', 'cross', 'moving average', 'ema', 'slope'],
};

export class VnxWorkerAgent {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly specialty: string,
    public readonly priceHbar: number,
    private readonly _responseTemplate: string,
  ) {}

  /** Deterministic confidence based on task keyword match with specialty */
  private _computeConfidence(task: string): number {
    const lower = task.toLowerCase();
    const keywords = SPECIALTY_KEYWORDS[this.specialty] || [];
    let matches = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) matches++;
    }
    // Base confidence 0.5, +0.08 per keyword match, cap at 0.95
    const base = 0.5;
    const perMatch = 0.08;
    const cap = 0.95;
    return Math.min(cap, base + matches * perMatch);
  }

  execute(task: string): WorkerResult {
    const confidence = this._computeConfidence(task);
    const evidence = `Keyword match: ${this.specialty} domain | Deterministic confidence = ${confidence.toFixed(3)}`;
    return {
      workerId: this.id,
      name: this.name,
      specialty: this.specialty,
      recommendation: this._responseTemplate,
      confidence,
      priceHbar: this.priceHbar,
      evidence,
    };
  }
}

/** Pre-configured deterministic workers */
export const DEFAULT_WORKERS: VnxWorkerAgent[] = [
  new VnxWorkerAgent(
    'onnx-primary',
    'BitLattice-ONNX',
    'prediction',
    0.005,
    'ONNX inference: directional bias detected via quantized lattice model',
  ),
  new VnxWorkerAgent(
    'rsi-momentum',
    'RSI-Momentum',
    'momentum',
    0.003,
    'RSI divergence suggests momentum exhaustion within 5m window',
  ),
  new VnxWorkerAgent(
    'bb-volatility',
    'BB-Volatility',
    'volatility',
    0.003,
    'Bollinger Band squeeze expanding — volatility breakout likely',
  ),
  new VnxWorkerAgent(
    'sma-trend',
    'SMA-Trend',
    'trend',
    0.002,
    'Short-term SMA crossing above long-term — early uptrend signal',
  ),
];
