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
  private _id: string;
  private _name: string;
  private _specialty: string;
  private _priceHbar: number;
  private _paymentAccount: string;
  private _responseTemplate: string;

  get id() {
    return this._id;
  }
  get name() {
    return this._name;
  }
  get specialty() {
    return this._specialty;
  }
  get priceHbar() {
    return this._priceHbar;
  }
  get paymentAccount() {
    return this._paymentAccount;
  }

  constructor(
    id: string,
    name: string,
    specialty: string,
    priceHbar: number,
    paymentAccount: string,
    _responseTemplate: string,
  ) {
    this._id = id;
    this._name = name;
    this._specialty = specialty;
    this._priceHbar = priceHbar;
    this._paymentAccount = paymentAccount;
    this._responseTemplate = _responseTemplate;
  }

  /** Deterministic confidence based on task keyword match with specialty */
  private _computeConfidence(task: string): number {
    const lower = task.toLowerCase();
    const keywords = SPECIALTY_KEYWORDS[this._specialty] || [];
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
    const evidence = `Keyword match: ${this._specialty} domain | Deterministic confidence = ${confidence.toFixed(3)}`;
    return {
      workerId: this._id,
      name: this._name,
      specialty: this._specialty,
      recommendation: this._responseTemplate,
      confidence,
      priceHbar: this._priceHbar,
      paymentAccount: this._paymentAccount,
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
    '0.0.10294360',
    'ONNX inference: directional bias detected via quantized lattice model',
  ),
  new VnxWorkerAgent(
    'rsi-momentum',
    'RSI-Momentum',
    'momentum',
    0.003,
    '0.0.10294361',
    'RSI divergence suggests momentum exhaustion within 5m window',
  ),
  new VnxWorkerAgent(
    'bb-volatility',
    'BB-Volatility',
    'volatility',
    0.003,
    '0.0.10294362',
    'Bollinger Band squeeze expanding — volatility breakout likely',
  ),
  new VnxWorkerAgent(
    'sma-trend',
    'SMA-Trend',
    'trend',
    0.002,
    '0.0.10294363',
    'Short-term SMA crossing above long-term — early uptrend signal',
  ),
];
