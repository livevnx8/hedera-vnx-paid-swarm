#!/usr/bin/env node
/**
 * Build PROOF-GEO-10K.md — TPS, geo tags, payer distribution, HashScan links.
 */
import { writeFileSync, readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) => {
    if (v.startsWith('--')) a[v.slice(2)] = arr[i + 2];
    return a;
  }, {}),
);

const proofDir = args['proof-dir'] || '.';
const topic = args.topic || '0.0.9227346';
const duration = Number(args.duration || 60);
const seqBefore = Number(args['seq-before'] || 0);
const seqAfter = Number(args['seq-after'] || 0);
const delta = seqAfter - seqBefore;
const tps = delta / duration;
const nodes = existsSync(args.nodes) ? JSON.parse(readFileSync(args.nodes, 'utf8')) : { nodes: [] };

const MIRROR = 'https://testnet.mirrornode.hedera.com';

async function fetchGeoSample() {
  const res = await fetch(`${MIRROR}/api/v1/topics/${topic}/messages?limit=50&order=desc`);
  const data = await res.json();
  const geoCounts = {};
  const payers = {};
  for (const m of data.messages || []) {
    try {
      const raw = Buffer.from(m.message, 'base64').toString('utf8');
      const j = JSON.parse(raw);
      const g = j.geo?.region || 'unknown';
      geoCounts[g] = (geoCounts[g] || 0) + 1;
      const p = j.geo?.payer || m.payer_account_id;
      payers[p] = (payers[p] || 0) + 1;
    } catch {
      /* chunked or non-json */
    }
  }
  return { geoCounts, payers };
}

function scanLogs(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) results.push(...scanLogs(p));
    else if (f.name.endsWith('.log')) {
      const txt = readFileSync(p, 'utf8');
      const ex = txt.match(/Executed: (\d+)/);
      const t = txt.match(/TPS: ([\d.]+)/);
      if (ex) results.push({ file: f.name, executed: Number(ex[1]), tps: t ? Number(t[1]) : 0 });
    }
  }
  return results;
}

const { geoCounts, payers } = await fetchGeoSample();
const logs = scanLogs(proofDir);

const lines = [
  '# VNX Geo Swarm — 10K+ Proof Report',
  '',
  `**Generated:** ${new Date().toISOString()}`,
  `**Topic:** [\`${topic}\`](https://hashscan.io/testnet/topic/${topic})`,
  `**Duration:** ${duration}s`,
  '',
  '## Throughput',
  '',
  '| Metric | Value |',
  '|--------|-------|',
  `| Seq before | ${seqBefore.toLocaleString()} |`,
  `| Seq after | ${seqAfter.toLocaleString()} |`,
  `| Delta | +${delta.toLocaleString()} |`,
  `| **Mirror TPS** | **${tps.toFixed(1)}** |`,
  `| Target | 10,000+ |`,
  `| Result | ${tps >= 10000 ? '✅ PASS' : '⚠️ Below target'} |`,
  '',
  '## Geo regions (last 50 msgs sample)',
  '',
  '| Region | Messages |',
  '|--------|----------|',
  ...Object.entries(geoCounts).map(([k, v]) => `| ${k} | ${v} |`),
  '',
  '## Payer distribution (sample)',
  '',
  '| Account | Messages |',
  '|---------|----------|',
  ...Object.entries(payers).map(([k, v]) => `| ${k} | ${v} |`),
  '',
  '## Nodes',
  '',
  '| ID | Region | Host | Wallets |',
  '|----|--------|------|---------|',
  ...nodes.nodes.map((n) => `| ${n.id} | ${n.region} | ${n.host} | ${(n.wallets || []).length} |`),
  '',
  '## What this proves',
  '',
  '1. **Geo-distributed submit** — burst messages carry `geo.region` + `geo.host` on HCS',
  '2. **Multi-payer scale** — independent operator accounts per region',
  '3. **Mirror-verifiable TPS** — sequence delta over coordinated time window',
  '4. **Independent audit** — [HashScan topic](https://hashscan.io/testnet/topic/' + topic + ')',
  '',
  '## Driver logs (local coordinator)',
  '',
  '```',
  ...logs.slice(0, 30).map((l) => `${l.file}: executed=${l.executed} tps=${l.tps}`),
  '```',
  '',
];

const out = join(proofDir, 'PROOF-GEO-10K.md');
writeFileSync(out, lines.join('\n'));
console.log(`Wrote ${out}`);