# VNX Geo-Distributed Swarm — 10K+ TPS Proof

Run the VNX burst swarm across **geo-located VMs**, each with dedicated testnet payer wallets, to push **10,000+ TPS** and produce an auditable proof package.

## Why geo VMs?

Single-host tests cap at **~2,000–2,700 TPS** (CPU, outbound bandwidth, SDK process limits). Hedera testnet allows **~800 TPS per payer account**. Spreading wallets across **4+ geographic regions** removes the single-machine bottleneck:

```
                    ┌──────────────────┐
                    │  Coordinator VM   │  Fairmont WV (or laptop)
                    │  coordinator-10k  │
                    └────────┬─────────┘
         ┌──────────┬────────┴────────┬──────────┐
         ▼          ▼                 ▼          ▼
    us-east-1   us-west-2        eu-west-1   ap-south-1
    2 wallets   2 wallets        2 wallets   1 wallet
    ~2K TPS     ~2K TPS          ~2K TPS     ~1K TPS
         └──────────┴────────┬────────┴──────────┘
                             ▼
                  HCS Topic 0.0.9227346
                  (geo-tagged burst messages)
```

**Target:** 4 regions × ~2,500 TPS ≈ **10,000+ mirror TPS** over a 60-second window.

## What gets proved

| Proof point           | How                                         |
| --------------------- | ------------------------------------------- |
| **10K+ TPS**          | Mirror sequence delta / 60s wall clock      |
| **Geo distribution**  | `geo.region` + `geo.host` in burst HCS JSON |
| **Multi-payer**       | Distinct `geo.payer` per region on HashScan |
| **Independent audit** | HashScan topic + mirror node replay         |
| **Reproducible**      | `PROOF-GEO-10K.md` + per-VM logs            |

## Wallet assignment (7 × ~1000 HBAR)

| Region     | Wallets                      |
| ---------- | ---------------------------- |
| us-east-1  | `0.0.9035798`, `0.0.9035171` |
| us-west-2  | `0.0.9032608`, `0.0.9034044` |
| eu-west-1  | `0.0.8834217`, `0.0.9034925` |
| ap-south-1 | `0.0.9035024`                |

Keys live in `.env.testnet` on the coordinator (never commit).

## Quick start

### Option A — DigitalOcean (4 VMs)

```bash
cd hedera-vnx-paid-swarm/scripts/geo-swarm

# 1. Provision 4 droplets (NYC, SFO, AMS, Bangalore)
DO_TOKEN=your_token ./provision-do.sh

# 2. Copy and edit node config
cp nodes.example.json nodes.json
# Paste IPs from nodes.provisioned.json into nodes.json

# 3. Sync repo + npm install to each VM
./remote-sync.sh nodes.json

# 4. Run 60s coordinated burst + proof
./coordinator-10k.sh nodes.json
```

### Option B — Manual VMs (any provider)

1. Spin up **4 Ubuntu 24.04** VMs in different regions (2 vCPU / 4GB min).
2. Use `cloud-init.yaml` as user-data (installs Node 22).
3. Copy `nodes.example.json` → `nodes.json`, set `host` IPs.
4. Run `remote-sync.sh` then `coordinator-10k.sh`.

### Option C — Local simulation (geo tags only)

Tests wallet split + `geo` HCS fields on **one machine** — won't hit 10K but validates proof pipeline:

```bash
npm run live:testnet:geo-sim
```

## npm scripts

```bash
npm run live:testnet:geo-sim      # local 4-region simulation
npm run live:testnet:geo-sync     # rsync to nodes.json hosts
npm run live:testnet:geo-10k      # coordinator 60s burst (needs nodes.json)
```

## VM requirements

| Spec     | Minimum                                               |
| -------- | ----------------------------------------------------- |
| OS       | Ubuntu 24.04                                          |
| CPU      | 2 vCPU                                                |
| RAM      | 4 GB                                                  |
| Network  | Low-latency egress to `testnet.mirrornode.hedera.com` |
| Software | Node 22+, git, rsync, ssh                             |

## Burst message format

```json
{
  "type": "vnx.swarm.proof.burst",
  "burstId": "burst-us-east-1-0-42",
  "geo": {
    "region": "us-east-1",
    "host": "vnx-geo-us-east",
    "payer": "0.0.9035798"
  }
}
```

## Proof output

After `coordinator-10k.sh`:

```
vnx-geo-proof-logs/<timestamp>/
  PROOF-GEO-10K.md      # summary report
  us-east.log           # SSH coordinator output
  remote-us-east/       # pulled VM burst logs
  ...
```

## Tuning for 10K+

```bash
# In nodes.json:
"burstConcurrency": 800,
"burstsPerWallet": 5,
"durationSec": 60

# Add a 5th region with another funded wallet → ~10K more headroom
```

## Current host

Coordinator default: **Fairmont, West Virginia, US** — use as `us-east-1` node or run coordinator-only while workers are in other regions.

## Related

- [TESTNET_SWARM.md](./TESTNET_SWARM.md) — single-host multi-wallet runs
- Dashboard: https://livevnx8.github.io/verlattice/dashboard/
