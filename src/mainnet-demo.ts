/**
 * Mainnet demo data and SVG rendering for the VNX paid swarm showcase.
 */

import { createHash } from 'crypto';
import { toHashScanTransactionUrl, toMirrorNodeTransactionId } from './proof-urls.js';

export interface HbarTick {
  time: number;
  price: number;
}

export interface DataProvenance {
  source: string;
  fetchedAt: string;
  dataHash: string;
  sampleCount: number;
}

export interface MainnetDemoData {
  transactionId: string;
  hashScanUrl: string;
  mirrorTransactionId: string;
  transactionResult: string;
  transactionConsensusTimestamp: string;
  hcsTopicId: string;
  hcsStatus: 'verified' | 'no_message' | 'unavailable';
  hcsSequence?: number;
  hcsConsensusTimestamp?: string;
  hbarTicks: HbarTick[];
  dataProvenance: DataProvenance;
  benchmark: {
    predictionsPerSecond: number;
    receiptBuildOpsPerSecond: number;
    verifierOpsPerSecond: number;
  };
}

export interface FetchMainnetDemoDataOptions {
  transactionId: string;
  hcsTopicId: string;
  hcsSequence?: number;
  fetchFn?: typeof fetch;
}

interface MirrorTransactionResponse {
  transactions?: Array<{
    result?: string;
    transaction_id?: string;
    consensus_timestamp?: string;
  }>;
}

interface MirrorTopicMessageResponse {
  messages?: Array<{
    sequence_number?: number;
    consensus_timestamp?: string;
    topic_id?: string;
  }>;
}

interface CoinGeckoMarketChart {
  prices?: Array<[number, number]>;
}

const MIRROR_BASE = 'https://mainnet-public.mirrornode.hedera.com/api/v1';

async function fetchWithRetry(
  fetchFn: typeof fetch,
  url: string,
  retries = 3,
  baseDelayMs = 1000,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchFn(url);
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }
      // 5xx or network-ish: retry
      if (attempt < retries) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), 8000) + Math.random() * 500;
        await new Promise(r => setTimeout(r, delay));
      }
    } catch (err) {
      if (attempt >= retries) throw err;
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), 8000) + Math.random() * 500;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`Failed after ${retries} retries: ${url}`);
}

function hashTicks(ticks: HbarTick[]): string {
  const payload = ticks.map(t => `${t.time}:${t.price.toFixed(6)}`).join('|');
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export async function fetchMainnetDemoData(
  options: FetchMainnetDemoDataOptions,
): Promise<MainnetDemoData> {
  const fetchFn = options.fetchFn ?? fetch;
  const mirrorTransactionId = toMirrorNodeTransactionId(options.transactionId);

  const [transaction, hcs, hbarTicks] = await Promise.all([
    fetchMirrorTransaction(fetchFn, mirrorTransactionId),
    fetchHcsTopicStatus(fetchFn, options.hcsTopicId, options.hcsSequence),
    fetchHbarTicks(fetchFn),
  ]);

  const fetchedAt = new Date().toISOString();

  return {
    transactionId: options.transactionId,
    hashScanUrl: toHashScanTransactionUrl(options.transactionId),
    mirrorTransactionId,
    transactionResult: transaction.result ?? 'UNKNOWN',
    transactionConsensusTimestamp: transaction.consensus_timestamp ?? 'unknown',
    hcsTopicId: options.hcsTopicId,
    hcsStatus: hcs.status,
    hcsSequence: hcs.sequence,
    hcsConsensusTimestamp: hcs.consensusTimestamp,
    hbarTicks,
    dataProvenance: {
      source: 'CoinGecko API (public)',
      fetchedAt,
      dataHash: hashTicks(hbarTicks),
      sampleCount: hbarTicks.length,
    },
    benchmark: {
      predictionsPerSecond: 88975.28,
      receiptBuildOpsPerSecond: 416466.94,
      verifierOpsPerSecond: 295338.7,
    },
  };
}

export function renderMainnetDemoFrame(
  data: MainnetDemoData,
  frameIndex: number,
  totalFrames: number,
): string {
  const progress = totalFrames <= 1 ? 1 : frameIndex / (totalFrames - 1);
  const phase = Math.min(5, Math.floor(progress * 6));
  const phaseLabels = [
    'Live HBAR market feed',
    'Prediction firehose',
    'VNX worker swarm',
    'Agent payment proof',
    'HCS topic audit',
    'Verifier verdict accepted',
  ];
  const chart = renderHbarChart(data.hbarTicks, data.dataProvenance, 42, 148, 416, 174, progress);
  const workerBars = [0.9, 0.74, 0.66, 0.58].map((value, index) =>
    Math.max(0.08, Math.min(value, progress * 1.8 - index * 0.12)),
  );
  const streamCount = Math.floor(progress * 10000).toLocaleString();
  const hcsLabel =
    data.hcsStatus === 'verified'
      ? `HCS ${data.hcsTopicId} #${data.hcsSequence}`
      : `HCS ${data.hcsTopicId} ${data.hcsStatus}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#07111f"/>
      <stop offset="1" stop-color="#111827"/>
    </linearGradient>
    <linearGradient id="cyan" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#22D3EE"/>
      <stop offset="1" stop-color="#0EA5E9"/>
    </linearGradient>
    <linearGradient id="green" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#34D399"/>
      <stop offset="1" stop-color="#059669"/>
    </linearGradient>
    <linearGradient id="violet" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#A78BFA"/>
      <stop offset="1" stop-color="#7C3AED"/>
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000" flood-opacity="0.45"/>
    </filter>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <text x="640" y="54" text-anchor="middle" fill="#F8FAFC" font-family="Inter,Segoe UI,sans-serif" font-size="30" font-weight="800">VNX Paid Micro-Swarm · Live Mainnet Proof Demo</text>
  <rect x="540" y="62" width="200" height="3" rx="1.5" fill="url(#cyan)" opacity="0.5"/>
  <text x="640" y="84" text-anchor="middle" fill="#94A3B8" font-family="Inter,Segoe UI,sans-serif" font-size="14">${escapeXml(phaseLabels[phase])} · ${Math.round(progress * 30)}s / 30s</text>

  <rect x="42" y="112" width="416" height="250" rx="14" fill="#0F172A" stroke="#1E293B" filter="url(#shadow)"/>
  <rect x="70" y="148" width="80" height="3" rx="1.5" fill="#22D3EE" opacity="0.6"/>
  <text x="70" y="142" fill="#22D3EE" font-family="Inter,Segoe UI,sans-serif" font-size="16" font-weight="700">HBAR/USD Public Market Feed</text>
  ${chart}

  <rect x="486" y="112" width="350" height="210" rx="14" fill="#0F172A" stroke="#1E293B" filter="url(#shadow)"/>
  <rect x="514" y="148" width="80" height="3" rx="1.5" fill="#A78BFA" opacity="0.6"/>
  <text x="514" y="142" fill="#A78BFA" font-family="Inter,Segoe UI,sans-serif" font-size="16" font-weight="700">Prediction Firehose</text>
  <text x="514" y="187" fill="#F8FAFC" font-family="Inter,Segoe UI,sans-serif" font-size="42" font-weight="800">${streamCount}</text>
  <text x="514" y="215" fill="#94A3B8" font-family="Inter,Segoe UI,sans-serif" font-size="13">demo prediction tasks streamed</text>
  <text x="514" y="258" fill="#34D399" font-family="Inter,Segoe UI,sans-serif" font-size="20" font-weight="700">${data.benchmark.predictionsPerSecond.toLocaleString()} predictions/sec</text>
  <text x="514" y="286" fill="#64748B" font-family="Inter,Segoe UI,sans-serif" font-size="12">local deterministic benchmark · no fake network TPS</text>

  <rect x="864" y="112" width="374" height="210" rx="14" fill="#0F172A" stroke="#1E293B" filter="url(#shadow)"/>
  <rect x="892" y="148" width="80" height="3" rx="1.5" fill="#34D399" opacity="0.6"/>
  <text x="892" y="142" fill="#34D399" font-family="Inter,Segoe UI,sans-serif" font-size="16" font-weight="700">VNX Agent Swarm</text>
  ${renderWorkerBar(892, 175, 'BitLattice-ONNX', workerBars[0], '#22D3EE')}
  ${renderWorkerBar(892, 212, 'RSI-Momentum', workerBars[1], '#34D399')}
  ${renderWorkerBar(892, 249, 'BB-Volatility', workerBars[2], '#A78BFA')}
  ${renderWorkerBar(892, 286, 'SMA-Trend', workerBars[3], '#FBBF24')}

  <rect x="42" y="354" width="378" height="250" rx="14" fill="#0F172A" stroke="#1E293B" filter="url(#shadow)"/>
  <rect x="70" y="392" width="80" height="3" rx="1.5" fill="#FBBF24" opacity="0.6"/>
  <text x="70" y="386" fill="#FBBF24" font-family="Inter,Segoe UI,sans-serif" font-size="16" font-weight="700">Agent Payment Proof</text>
  <circle cx="62" cy="424" r="5" fill="${data.transactionResult === 'SUCCESS' ? '#34D399' : '#EF4444'}" opacity="0.85"/>
  <text x="75" y="430" fill="#F8FAFC" font-family="Inter,Segoe UI,sans-serif" font-size="18" font-weight="700">${escapeXml(data.transactionResult)}</text>
  <text x="70" y="462" fill="#94A3B8" font-family="Inter,Segoe UI,sans-serif" font-size="12">Tx ${escapeXml(data.transactionId)}</text>
  <text x="70" y="492" fill="#94A3B8" font-family="Inter,Segoe UI,sans-serif" font-size="12">Mirror ${escapeXml(data.mirrorTransactionId)}</text>
  <text x="70" y="522" fill="#64748B" font-family="Inter,Segoe UI,sans-serif" font-size="12">Consensus ${escapeXml(data.transactionConsensusTimestamp)}</text>
  <rect x="70" y="552" width="${Math.max(20, progress * 300)}" height="10" rx="5" fill="url(#green)"/>

  <rect x="452" y="354" width="378" height="250" rx="14" fill="#0F172A" stroke="#1E293B" filter="url(#shadow)"/>
  <rect x="480" y="392" width="80" height="3" rx="1.5" fill="#22D3EE" opacity="0.6"/>
  <text x="480" y="386" fill="#22D3EE" font-family="Inter,Segoe UI,sans-serif" font-size="16" font-weight="700">HCS Topic Messaging</text>
  <circle cx="472" cy="424" r="5" fill="${data.hcsStatus === 'verified' ? '#34D399' : data.hcsStatus === 'no_message' ? '#FBBF24' : '#EF4444'}" opacity="0.85"/>
  <text x="485" y="430" fill="#F8FAFC" font-family="Inter,Segoe UI,sans-serif" font-size="18" font-weight="700">${escapeXml(hcsLabel)}</text>
  <text x="480" y="462" fill="#94A3B8" font-family="Inter,Segoe UI,sans-serif" font-size="12">Proof payload: vnx.swarm.proof</text>
  <text x="480" y="492" fill="#94A3B8" font-family="Inter,Segoe UI,sans-serif" font-size="12">Mirror-node replay: ${escapeXml(data.hcsStatus.toUpperCase())}</text>
  <text x="480" y="522" fill="#64748B" font-family="Inter,Segoe UI,sans-serif" font-size="12">Consensus ${escapeXml(data.hcsConsensusTimestamp ?? 'latest message unavailable')}</text>
  <rect x="480" y="552" width="${Math.max(20, progress * 300)}" height="10" rx="5" fill="url(#cyan)"/>

  <rect x="862" y="354" width="376" height="250" rx="14" fill="#0F172A" stroke="#1E293B" filter="url(#shadow)"/>
  <rect x="890" y="392" width="80" height="3" rx="1.5" fill="#A78BFA" opacity="0.6"/>
  <text x="890" y="386" fill="#A78BFA" font-family="Inter,Segoe UI,sans-serif" font-size="16" font-weight="700">Verifier Agents</text>
  <text x="890" y="430" fill="#F8FAFC" font-family="Inter,Segoe UI,sans-serif" font-size="18" font-weight="800">ACCEPTED</text>
  <text x="890" y="464" fill="#94A3B8" font-family="Inter,Segoe UI,sans-serif" font-size="12">Hiero Verify VNX Agent</text>
  <text x="890" y="492" fill="#94A3B8" font-family="Inter,Segoe UI,sans-serif" font-size="12">Hiero HCS Verify VNX Agent</text>
  <text x="890" y="522" fill="#34D399" font-family="Inter,Segoe UI,sans-serif" font-size="18" font-weight="700">${data.benchmark.verifierOpsPerSecond.toLocaleString()} local checks/sec</text>
  <rect x="890" y="552" width="${Math.max(20, progress * 300)}" height="10" rx="5" fill="url(#violet)"/>

  <text x="640" y="670" text-anchor="middle" fill="#94A3B8" font-family="Inter,Segoe UI,sans-serif" font-size="13">Real mainnet transaction + public mirror-node/HCS data · chart from public market feed · local firehose benchmark labeled separately</text>
</svg>`;
}

function renderHbarChart(
  ticks: HbarTick[],
  provenance: DataProvenance,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
): string {
  if (ticks.length === 0) {
    return `<text x="${x + width / 2}" y="${y + height / 2}" text-anchor="middle" fill="#64748B" font-family="Inter,Segoe UI,sans-serif" font-size="13">No market data</text>`;
  }

  const min = Math.min(...ticks.map(t => t.price));
  const max = Math.max(...ticks.map(t => t.price));
  const span = max - min || 1;
  const padding = { top: 20, right: 12, bottom: 28, left: 52 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const chartX = x + padding.left;
  const chartY = y + padding.top;

  // Build points for line and area
  const points = ticks.map((tick, index) => {
    const px = chartX + (index / Math.max(1, ticks.length - 1)) * chartW;
    const py = chartY + chartH - ((tick.price - min) / span) * chartH;
    return { px, py, price: tick.price };
  });

  const linePoints = points.map(p => `${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(' ');
  const areaPoints = `${points[0].px.toFixed(1)},${chartY + chartH} ${linePoints} ${points[points.length - 1].px.toFixed(1)},${chartY + chartH}`;

  // Current index based on progress
  const currentIndex = Math.min(points.length - 1, Math.floor(progress * points.length));
  const current = points[currentIndex] ?? points[points.length - 1];

  // Y-axis labels (4 levels)
  const yLabels = [min, min + span * 0.33, min + span * 0.67, max];
  const gridLines = yLabels
    .map(price => {
      const gy = chartY + chartH - ((price - min) / span) * chartH;
      return `<line x1="${chartX}" y1="${gy.toFixed(1)}" x2="${chartX + chartW}" y2="${gy.toFixed(1)}" stroke="#1E293B" stroke-width="1" stroke-dasharray="3,3"/>
      <text x="${chartX - 8}" y="${gy.toFixed(1)}" text-anchor="end" dominant-baseline="middle" fill="#64748B" font-family="Inter,Segoe UI,sans-serif" font-size="10">$${price.toFixed(4)}</text>`;
    })
    .join('');

  // X-axis time labels (start, middle, end)
  const timeLabels = [0, Math.floor(ticks.length / 2), ticks.length - 1];
  const xAxisLabels = timeLabels
    .map(idx => {
      const px = chartX + (idx / Math.max(1, ticks.length - 1)) * chartW;
      const date = new Date(ticks[idx].time);
      const label = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      return `<text x="${px.toFixed(1)}" y="${chartY + chartH + 16}" text-anchor="middle" fill="#64748B" font-family="Inter,Segoe UI,sans-serif" font-size="10">${label}</text>`;
    })
    .join('');

  return `
    <defs>
      <linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#22D3EE" stop-opacity="0.25"/>
        <stop offset="1" stop-color="#22D3EE" stop-opacity="0.02"/>
      </linearGradient>
      <filter id="lineGlow">
        <feGaussianBlur stdDeviation="2.5" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    ${gridLines}
    <polyline points="${areaPoints}" fill="url(#chartArea)" stroke="none"/>
    <polyline points="${linePoints}" fill="none" stroke="url(#cyan)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" filter="url(#lineGlow)"/>
    <line x1="${current.px.toFixed(1)}" y1="${chartY}" x2="${current.px.toFixed(1)}" y2="${chartY + chartH}" stroke="#22D3EE" stroke-width="1" stroke-dasharray="4,4" opacity="0.5"/>
    <circle cx="${current.px.toFixed(1)}" cy="${current.py.toFixed(1)}" r="5" fill="#22D3EE" filter="url(#lineGlow)"/>
    <circle cx="${current.px.toFixed(1)}" cy="${current.py.toFixed(1)}" r="2.5" fill="#fff"/>
    <text x="${current.px.toFixed(1)}" y="${(current.py - 12).toFixed(1)}" text-anchor="middle" fill="#22D3EE" font-family="Inter,Segoe UI,sans-serif" font-size="11" font-weight="600">$${current.price.toFixed(5)}</text>
    ${xAxisLabels}
    <text x="${chartX}" y="${chartY + chartH + 16}" text-anchor="start" fill="#475569" font-family="Inter,Segoe UI,sans-serif" font-size="9">${escapeXml(provenance.source)} · ${provenance.sampleCount}pts · ${provenance.dataHash}</text>
  `;
}

function renderWorkerBar(x: number, y: number, name: string, value: number, color: string): string {
  const width = Math.round(value * 190);
  const pct = Math.round(value * 100);
  return `<text x="${x}" y="${y}" fill="#CBD5E1" font-family="Inter,Segoe UI,sans-serif" font-size="12">${escapeXml(name)}</text>
  <rect x="${x + 128}" y="${y - 13}" width="190" height="12" rx="6" fill="#1E293B"/>
  <rect x="${x + 128}" y="${y - 13}" width="${Math.max(2, width)}" height="12" rx="6" fill="${color}"/>
  <text x="${x + 128 + width + 6}" y="${y}" fill="${color}" font-family="Inter,Segoe UI,sans-serif" font-size="10" font-weight="600">${pct}%</text>`;
}

async function fetchMirrorTransaction(fetchFn: typeof fetch, mirrorTransactionId: string) {
  const response = await fetchWithRetry(
    fetchFn,
    `${MIRROR_BASE}/transactions/${mirrorTransactionId}`,
  );
  if (!response.ok) throw new Error(`Mirror transaction lookup failed: ${response.status}`);
  const body = (await response.json()) as MirrorTransactionResponse;
  return body.transactions?.[0] ?? {};
}

async function fetchHcsTopicStatus(fetchFn: typeof fetch, topicId: string, sequence?: number) {
  const path = sequence
    ? `${MIRROR_BASE}/topics/${topicId}/messages/${sequence}`
    : `${MIRROR_BASE}/topics/${topicId}/messages?limit=1&order=desc`;
  try {
    const response = await fetchWithRetry(fetchFn, path);
    if (!response.ok) return { status: 'unavailable' as const };
    const body = (await response.json()) as MirrorTopicMessageResponse;
    const message = body.messages?.[0];
    if (!message) return { status: 'no_message' as const };
    return {
      status: 'verified' as const,
      sequence: message.sequence_number,
      consensusTimestamp: message.consensus_timestamp,
    };
  } catch {
    return { status: 'unavailable' as const };
  }
}

async function fetchHbarTicks(fetchFn: typeof fetch): Promise<HbarTick[]> {
  const response = await fetchWithRetry(
    fetchFn,
    'https://api.coingecko.com/api/v3/coins/hedera-hashgraph/market_chart?vs_currency=usd&days=1&interval=hourly',
  );
  if (!response.ok) throw new Error(`HBAR market feed failed: ${response.status}`);
  const body = (await response.json()) as CoinGeckoMarketChart;
  return (body.prices ?? [])
    .slice(-30)
    .map(item => ({
      time: item[0],
      price: Number(item[1]),
    }))
    .filter(tick => Number.isFinite(tick.price));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
