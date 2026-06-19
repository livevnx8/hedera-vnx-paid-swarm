/**
 * VNX Paid Micro-Swarm — Shared Specialty Keywords
 *
 * Single source of truth for domain-to-keyword mappings used by both
 * VnxWorkerAgent (confidence scoring) and PaidSwarmCoordinator (specialty matching).
 */

export const SPECIALTY_KEYWORDS: Record<string, readonly string[]> = {
  prediction: ['signal', 'predict', 'direction', 'price', 'risk', 'forecast', 'trend'],
  momentum: ['momentum', 'rsi', 'overbought', 'oversold', 'velocity', 'speed'],
  volatility: ['volatility', 'bollinger', 'bb', 'band', 'range', 'squeeze', 'expand'],
  trend: ['trend', 'sma', 'cross', 'moving average', 'ema', 'slope'],
} as const;

export const SPECIALTY_MATCH_WEIGHTS: Record<string, Record<string, number>> = {
  prediction: { prediction: 1.0, momentum: 0.5, volatility: 0.6, trend: 0.7 },
  momentum: { prediction: 0.5, momentum: 1.0, volatility: 0.7, trend: 0.6 },
  volatility: { prediction: 0.6, momentum: 0.7, volatility: 1.0, trend: 0.5 },
  trend: { prediction: 0.7, momentum: 0.6, volatility: 0.5, trend: 1.0 },
};

/**
 * Derive the best-matching task domain from keywords in a task description.
 * Returns the domain name with the most keyword hits (defaults to 'prediction').
 */
export function inferTaskDomain(task: string): string {
  const lower = task.toLowerCase();
  let bestDomain = 'prediction';
  let bestScore = 0;
  for (const [domain, keywords] of Object.entries(SPECIALTY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }
  return bestDomain;
}
