# VNX Live Testnet Swarm

Ongoing multi-domain agent swarm on Hedera testnet with real API data, HIP v1.3.0 HCS messaging, and scale testing.

## Live resources

| Resource | Value |
|----------|-------|
| **HCS topic** | `0.0.9227346` |
| **HashScan** | https://hashscan.io/testnet/topic/0.0.9227346 |
| **Dashboard** | https://livevnx8.github.io/verlattice/dashboard/ |
| **Operator** | `0.0.9035798` (worker set 4) |
| **Worker payers** | `0.0.9035160`, `0.0.9035171`, `0.0.9035258` |
| **Network** | testnet |

## Quick start

```bash
cd hedera-vnx-paid-swarm

# Standard 5-domain live run (~80–150 TPS)
npm run live:testnet:keep

# 800+ TPS burst test (domain drivers + compact HCS burst)
npm run live:testnet:burst800

# Health check + TPS sample
npm run live:testnet:monitor

# Live API smoke (5 domains)
npm run live-data:smoke
```

Credentials live in `.env.testnet` (not committed). Worker set 4 has **four funded operators**:

| Account | Typical role | Balance (when funded) |
|---------|--------------|------------------------|
| `0.0.9035160` | ai-inference, supply-chain, burst-1 | ~1000 HBAR |
| `0.0.9035171` | rwa-claim, wv-carbon, burst-2 | ~1000 HBAR |
| `0.0.9035258` | water-biodiversity, burst-3 | ~1000 HBAR |
| `0.0.9035798` | legacy default / worker payments | drains fast if sole payer |

**Multi-wallet mode** (`npm run live:testnet:burst800`) assigns each driver its own payer so one wallet draining does not stop the whole swarm.

## Architecture

Five domain drivers run in parallel, each executing the full VNX pipeline:

1. Live data fetch (EIA, OpenFoodFacts, CoinGecko, etc.)
2. BitLattice verification
3. VNX swarm vote + HBAR micro-payment to workers
4. Two-stage HIP HCS publish (verification → attestation/retirement)

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ AI Inference    │  │ RWA Claim       │  │ Water/Biodiv    │
│ high-tps-driver │  │ high-tps-driver │  │ high-tps-driver │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
┌────────┴────────┐  ┌────────┴────────┐         │
│ Supply Chain    │  │ WV Carbon       │         │
│ high-tps-driver │  │ (6 EIA domains) │         │
└────────┬────────┘  └────────┬────────┘         │
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                    HCS Topic 0.0.9227346
                    (HIP v1.3.0-hip envelope)
```

### 800+ TPS burst mode

For scale tests, `launch-testnet-burst-800.sh` adds compact **HCS burst drivers** alongside domain drivers:

| Component | Script | Default concurrency | Role |
|-----------|--------|---------------------|------|
| Domain drivers (×5) | `scripts/high-tps-driver.ts` | 80 each | Full pipeline + 2-stage HIP |
| HCS burst (×3) | `scripts/hcs-burst-driver.ts` | 250 each (3 payers) | Single-chunk `vnx.swarm.proof.burst` msgs |

**Observed peak (2026-06-18):** 1,154 TPS over 15s wall clock (+17,314 sequences). Dashboard **Live TPS** uses mirror sequence delta / timestamp span.

Tune burst profile:

```bash
DOMAIN_TPS_CONCURRENCY=60 \
BURST_TPS_CONCURRENCY=350 \
BURST_DRIVER_COUNT=2 \
npm run live:testnet:burst800
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HEDERA_ACCOUNT_ID` | — | Operator / HCS payer |
| `HEDERA_PRIVATE_KEY` | — | ECDSA key for operator |
| `VNX_HCS_TOPIC_ID` | `0.0.9227346` | Shared testnet topic |
| `TESTNET_WORKER_SET` | `4` | Worker payer set (1–4) |
| `HIGH_TPS_CONCURRENCY` | `30` (keep) / `80` (burst domains) | Concurrent tasks per driver |
| `HIGH_TPS_DURATION` | `7200` | Driver run time (seconds) |
| `BURST_TPS_CONCURRENCY` | `450` | Per burst driver concurrency |
| `BURST_DRIVER_COUNT` | `2` | Number of burst processes |
| `USE_TOPIC_ORACLE` | `1` | Topic oracle in WV carbon orchestrator |
| `EIA_API_KEY` | — | Required for WV carbon live EIA data |

## Monitoring

```bash
# One-shot health + 10s TPS sample
npm run live:testnet:monitor

# Tail all driver logs from latest run
ls -td vnx-live-testnet-logs/burst-800-* vnx-live-testnet-logs/2026-* 2>/dev/null | head -1 | xargs -I{} tail -f {}/*.log

# Mirror sequence
curl -s "https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.9227346/messages?limit=1&order=desc" | jq '.messages[0].sequence_number'

# Operator balance
curl -s "https://testnet.mirrornode.hedera.com/api/v1/accounts/0.0.9035798" | jq '.balance.balance / 1e8'
```

Logs are written under `vnx-live-testnet-logs/` with timestamps. Burst runs use `burst-800-<timestamp>/`.

## Operator funding

High-TPS burst drains a single payer fast (~170 HBAR/min at 1,100 TPS). **Use multi-wallet launch** so load spreads across `9035160`, `9035171`, and `9035258`.

If a wallet drops below ~50 HBAR, relaunch (drivers pick up funded payers) or top up manually:

```bash
# From funded worker 0.0.9035258 (see vnx-hedera-agent wallet registry)
HEDERA_NETWORK=testnet \
HEDERA_ACCOUNT_ID=0.0.9035258 \
HEDERA_PRIVATE_KEY=<key> \
npx tsx scripts/send-hbar.ts --to 0.0.9035798 --amount 500 --max 700
```

Or use the helper:

```bash
npm run live:testnet:topup
```

## HIP messaging

All domain publishes go through `enrichHipMessage()` (`src/pipeline-messages.ts`):

- `schema: "vnx.hip/1.0"`, `version: "1.3.0-hip"`
- Fields: `topicId`, `network`, `payer`, `stageHash`, `messageId`, `domain`, `proof`, `liveData`
- Two-stage chain: `*.data.verified` → attestation with `previousStageHash`

Large HIP envelopes chunk to 2 HCS fragments (mirror shows 2× sequence numbers per logical message). Burst driver uses compact single-chunk payloads for raw throughput tests.

## Stopping drivers

```bash
pkill -f 'tsx scripts/high-tps-driver.ts'
pkill -f 'tsx scripts/hcs-burst-driver.ts'
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| TPS drops to 0 | Operator out of HBAR | `npm run live:testnet:topup` then relaunch |
| Dashboard shows 0 messages | HIP chunks need reassembly | Fixed in verlattice `reassembleChunkedMessages` |
| Supply chain smoke fails | OpenFoodFacts 429 | Transient; falls back but still publishes |
| `INSUFFICIENT_PAYER_BALANCE` in burst logs | Operator drained | Top up and restart |

## Related repos

| Repo | Domain |
|------|--------|
| `hedera-vnx-ai-inference-attestation` | AI inference attestation |
| `hedera-vnx-rwa-claim` | RWA claim verification |
| `hedera-vnx-water-biodiversity` | Water / biodiversity credits |
| `hedera-vnx-supply-chain-provenance` | Supply chain provenance |
| `hedera-vnx-wv-carbon-swarm` | WV energy → carbon retirement |
| `verlattice` | Live dashboard (GitHub Pages) |