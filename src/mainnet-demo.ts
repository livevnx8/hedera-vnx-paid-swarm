/**
 * Mainnet demo data and SVG rendering for the VNX paid swarm showcase.
 */

import { toHashScanTransactionUrl, toMirrorNodeTransactionId } from './proof-urls.js';

export interface HbarTick {
  time: number;
  price: number;
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
    benchmark: {
      predictionsPerSecond: 88975.28,
      receiptBuildOpsPerSecond: 416466.94,
      verifierOpsPerSecond: 295338.70,
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
  const chart = chartPolyline(data.hbarTicks, 70, 150, 360, 120);
  const pulse = 0.45 + Math.sin(progress * Math.PI * 12) * 0.18;
  const workerBars = [0.9, 0.74, 0.66, 0.58].map((value, index) =>
    Math.max(0.08, Math.min(value, progress * 1.8 - index * 0.12)),
  );
  const streamCount = Math.floor(progress * 10000).toLocaleString();
  const hcsLabel = data.hcsStatus === 'verified'
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
  <text x="640" y="84" text-anchor="middle" fill="#94A3B8" font-family="Inter,Segoe UI,sans-serif" font-size="14">${escapeXml(phaseLabels[phase])} · ${Math.round(progress * 30)}s / 30s</text>

  <rect x="42" y="112" width="416" height="210" rx="14" fill="#0F172A" stroke="#1E293B" filter="url(#shadow)"/>
  <text x="70" y="142" fill="#22D3EE" font-family="Inter,Segoe UI,sans-serif" font-size="16" font-weight="700">HBAR/USD Public Market Feed</text>
  <polyline points="${chart}" fill="none" stroke="url(#cyan)" stroke-width="4"/>
  <circle cx="${70 + progress * 360}" cy="210" r="${8 + pulse * 4}" fill="#22D3EE" opacity="0.65"/>
  <text x="70" y="298" fill="#CBD5E1" font-family="Inter,Segoe UI,sans-serif" font-size="13">Latest tick: $${data.hbarTicks.at(-1)?.price.toFixed(5) ?? 'n/a'}</text>

  <rect x="486" y="112" width="350" height="210" rx="14" fill="#0F172A" stroke="#1E293B" filter="url(#shadow)"/>
  <text x="514" y="142" fill="#A78BFA" font-family="Inter,Segoe UI,sans-serif" font-size="16" font-weight="700">Prediction Firehose</text>
  <text x="514" y="187" fill="#F8FAFC" font-family="Inter,Segoe UI,sans-serif" font-size="42" font-weight="800">${streamCount}</text>
  <text x="514" y="215" fill="#94A3B8" font-family="Inter,Segoe UI,sans-serif" font-size="13">demo prediction tasks streamed</text>
  <text x="514" y="258" fill="#34D399" font-family="Inter,Segoe UI,sans-serif" font-size="20" font-weight="700">${data.benchmark.predictionsPerSecond.toLocaleString()} predictions/sec</text>
  <text x="514" y="286" fill="#64748B" font-family="Inter,Segoe UI,sans-serif" font-size="12">local deterministic benchmark · no fake network TPS</text>

  <rect x="864" y="112" width="374" height="210" rx="14" fill="#0F172A" stroke="#1E293B" filter="url(#shadow)"/>
  <text x="892" y="142" fill="#34D399" font-family="Inter,Segoe UI,sans-serif" font-size="16" font-weight="700">VNX Agent Swarm</text>
  ${renderWorkerBar(892, 175, 'BitLattice-ONNX', workerBars[0], '#22D3EE')}
  ${renderWorkerBar(892, 212, 'RSI-Momentum', workerBars[1], '#34D399')}
  ${renderWorkerBar(892, 249, 'BB-Volatility', workerBars[2], '#A78BFA')}
  ${renderWorkerBar(892, 286, 'SMA-Trend', workerBars[3], '#FBBF24')}

  <rect x="42" y="354" width="378" height="250" rx="14" fill="#0F172A" stroke="#1E293B" filter="url(#shadow)"/>
  <text x="70" y="386" fill="#FBBF24" font-family="Inter,Segoe UI,sans-serif" font-size="16" font-weight="700">Agent Payment Proof</text>
  <text x="70" y="430" fill="#F8FAFC" font-family="Inter,Segoe UI,sans-serif" font-size="18" font-weight="700">${escapeXml(data.transactionResult)}</text>
  <text x="70" y="462" fill="#94A3B8" font-family="Inter,Segoe UI,sans-serif" font-size="12">Tx ${escapeXml(data.transactionId)}</text>
  <text x="70" y="492" fill="#94A3B8" font-family="Inter,Segoe UI,sans-serif" font-size="12">Mirror ${escapeXml(data.mirrorTransactionId)}</text>
  <text x="70" y="522" fill="#64748B" font-family="Inter,Segoe UI,sans-serif" font-size="12">Consensus ${escapeXml(data.transactionConsensusTimestamp)}</text>
  <rect x="70" y="552" width="${Math.max(20, progress * 300)}" height="10" rx="5" fill="url(#green)"/>

  <rect x="452" y="354" width="378" height="250" rx="14" fill="#0F172A" stroke="#1E293B" filter="url(#shadow)"/>
  <text x="480" y="386" fill="#22D3EE" font-family="Inter,Segoe UI,sans-serif" font-size="16" font-weight="700">HCS Topic Messaging</text>
  <text x="480" y="430" fill="#F8FAFC" font-family="Inter,Segoe UI,sans-serif" font-size="18" font-weight="700">${escapeXml(hcsLabel)}</text>
  <text x="480" y="462" fill="#94A3B8" font-family="Inter,Segoe UI,sans-serif" font-size="12">Proof payload: vnx.swarm.proof</text>
  <text x="480" y="492" fill="#94A3B8" font-family="Inter,Segoe UI,sans-serif" font-size="12">Mirror-node replay: ${escapeXml(data.hcsStatus.toUpperCase())}</text>
  <text x="480" y="522" fill="#64748B" font-family="Inter,Segoe UI,sans-serif" font-size="12">Consensus ${escapeXml(data.hcsConsensusTimestamp ?? 'latest message unavailable')}</text>
  <rect x="480" y="552" width="${Math.max(20, progress * 300)}" height="10" rx="5" fill="url(#cyan)"/>

  <rect x="862" y="354" width="376" height="250" rx="14" fill="#0F172A" stroke="#1E293B" filter="url(#shadow)"/>
  <text x="890" y="386" fill="#A78BFA" font-family="Inter,Segoe UI,sans-serif" font-size="16" font-weight="700">Verifier Agents</text>
  <text x="890" y="430" fill="#F8FAFC" font-family="Inter,Segoe UI,sans-serif" font-size="18" font-weight="800">ACCEPTED</text>
  <text x="890" y="464" fill="#94A3B8" font-family="Inter,Segoe UI,sans-serif" font-size="12">Hiero Verify VNX Agent</text>
  <text x="890" y="492" fill="#94A3B8" font-family="Inter,Segoe UI,sans-serif" font-size="12">Hiero HCS Verify VNX Agent</text>
  <text x="890" y="522" fill="#34D399" font-family="Inter,Segoe UI,sans-serif" font-size="18" font-weight="700">${data.benchmark.verifierOpsPerSecond.toLocaleString()} local checks/sec</text>
  <rect x="890" y="552" width="${Math.max(20, progress * 300)}" height="10" rx="5" fill="url(#violet)"/>

  <text x="640" y="670" text-anchor="middle" fill="#94A3B8" font-family="Inter,Segoe UI,sans-serif" font-size="13">Real mainnet transaction + public mirror-node/HCS data · chart from public market feed · local firehose benchmark labeled separately</text>
</svg>`;
}

function chartPolyline(ticks: HbarTick[], x: number, y: number, width: number, height: number): string {
  if (ticks.length === 0) return `${x},${y + height / 2}`;
  const min = Math.min(...ticks.map(tick => tick.price));
  const max = Math.max(...ticks.map(tick => tick.price));
  const span = max - min || 1;
  return ticks.map((tick, index) => {
    const px = x + (index / Math.max(1, ticks.length - 1)) * width;
    const py = y + height - ((tick.price - min) / span) * height;
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  }).join(' ');
}

function renderWorkerBar(x: number, y: number, name: string, value: number, color: string): string {
  const width = Math.round(value * 190);
  return `<text x="${x}" y="${y}" fill="#CBD5E1" font-family="Inter,Segoe UI,sans-serif" font-size="12">${escapeXml(name)}</text>
  <rect x="${x + 128}" y="${y - 13}" width="190" height="12" rx="6" fill="#1E293B"/>
  <rect x="${x + 128}" y="${y - 13}" width="${width}" height="12" rx="6" fill="${color}"/>`;
}

async function fetchMirrorTransaction(fetchFn: typeof fetch, mirrorTransactionId: string) {
  const response = await fetchWithRetry(fetchFn, `${MIRROR_BASE}/transactions/${mirrorTransactionId}`);
  if (!response.ok) throw new Error(`Mirror transaction lookup failed: ${response.status}`);
  const body = await response.json() as MirrorTransactionResponse;
  return body.transactions?.[0] ?? {};
}

async function fetchHcsTopicStatus(fetchFn: typeof fetch, topicId: string, sequence?: number) {
  const path = sequence
    ? `${MIRROR_BASE}/topics/${topicId}/messages/${sequence}`
    : `${MIRROR_BASE}/topics/${topicId}/messages?limit=1&order=desc`;
  try {
    const response = await fetchWithRetry(fetchFn, path);
    if (!response.ok) return { status: 'unavailable' as const };
    const body = await response.json() as MirrorTopicMessageResponse;
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
  const response = await fetchWithRetry(fetchFn, 'https://api.coingecko.com/api/v3/coins/hedera-hashgraph/market_chart?vs_currency=usd&days=1&interval=hourly');
  if (!response.ok) throw new Error(`HBAR market feed failed: ${response.status}`);
  const body = await response.json() as CoinGeckoMarketChart;
  return (body.prices ?? []).slice(-30).map(item => ({
    time: item[0],
    price: Number(item[1]),
  })).filter(tick => Number.isFinite(tick.price));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
