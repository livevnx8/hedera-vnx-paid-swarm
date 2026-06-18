#!/usr/bin/env bash
# Push 800+ TPS on testnet — multi-wallet operators + domain drivers + HCS burst.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT/hedera-vnx-paid-swarm/.env.testnet"
LOGDIR="$ROOT/vnx-live-testnet-logs/burst-800-$(date -u +%Y-%m-%dT%H-%M-%S)"
mkdir -p "$LOGDIR"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

export USE_TOPIC_ORACLE=1
export VNX_HCS_TOPIC_ID=0.0.9227346
export HEDERA_NETWORK=testnet

export DOMAIN_TPS_CONCURRENCY="${DOMAIN_TPS_CONCURRENCY:-50}"
export HIGH_TPS_DURATION="${HIGH_TPS_DURATION:-7200}"
export BURST_TPS_CONCURRENCY="${BURST_TPS_CONCURRENCY:-250}"
export BURST_DRIVER_COUNT="${BURST_DRIVER_COUNT:-3}"

echo "Stopping existing drivers..."
pkill -f 'tsx scripts/high-tps-driver.ts' 2>/dev/null || true
pkill -f 'tsx scripts/hcs-burst-driver.ts' 2>/dev/null || true
sleep 2

launch_domain() {
  local name="$1" dir="$2" acct="$3" key="$4"
  shift 4
  local log="$LOGDIR/$name.log"
  echo "=== $name $(date -u -Iseconds) payer=$acct conc=$DOMAIN_TPS_CONCURRENCY ===" >"$log"
  (
    cd "$dir"
    export HEDERA_ACCOUNT_ID="$acct"
    export HEDERA_PRIVATE_KEY="$key"
    export TESTNET_WORKER_SET=4
    export HIGH_TPS_CONCURRENCY="$DOMAIN_TPS_CONCURRENCY"
    while [[ $# -gt 0 ]]; do export "$1"; shift; done
    exec npx tsx scripts/high-tps-driver.ts >>"$log" 2>&1
  ) &
  echo "$name pid=$! payer=$acct log=$log"
}

launch_burst() {
  local name="$1" acct="$2" key="$3"
  local log="$LOGDIR/$name.log"
  echo "=== $name $(date -u -Iseconds) payer=$acct conc=$BURST_TPS_CONCURRENCY ===" >"$log"
  (
    cd "$ROOT/hedera-vnx-paid-swarm"
    export HEDERA_ACCOUNT_ID="$acct"
    export HEDERA_PRIVATE_KEY="$key"
    export HIGH_TPS_CONCURRENCY="$BURST_TPS_CONCURRENCY"
    export BURST_DRIVER_LABEL="$name"
    exec npx tsx scripts/hcs-burst-driver.ts >>"$log" 2>&1
  ) &
  echo "$name pid=$! payer=$acct log=$log"
}

W5160="${OPERATOR_9035160_ID:?missing OPERATOR_9035160_ID}"
K5160="${OPERATOR_9035160_KEY:?missing OPERATOR_9035160_KEY}"
W5171="${OPERATOR_9035171_ID:?missing OPERATOR_9035171_ID}"
K5171="${OPERATOR_9035171_KEY:?missing OPERATOR_9035171_KEY}"
W5258="${OPERATOR_9035258_ID:?missing OPERATOR_9035258_ID}"
K5258="${OPERATOR_9035258_KEY:?missing OPERATOR_9035258_KEY}"

echo "Multi-wallet launch — 3 funded operators (~1000 HBAR each)"
echo "  $W5160 → ai-inference, supply-chain, hcs-burst-1"
echo "  $W5171 → rwa-claim, wv-carbon, hcs-burst-2"
echo "  $W5258 → water-biodiversity, hcs-burst-3"
echo ""

launch_domain ai-inference "$ROOT/hedera-vnx-ai-inference-attestation" "$W5160" "$K5160"
launch_domain rwa-claim "$ROOT/hedera-vnx-rwa-claim" "$W5171" "$K5171"
launch_domain water-biodiversity "$ROOT/hedera-vnx-water-biodiversity" "$W5258" "$K5258"
launch_domain supply-chain "$ROOT/hedera-vnx-supply-chain-provenance" "$W5160" "$K5160"
launch_domain wv-carbon "$ROOT/hedera-vnx-wv-carbon-swarm" "$W5171" "$K5171" \
  DOMAINS=electricity,seds,co2-emissions,natural-gas,coal,total-energy ORCHESTRATE=1

launch_burst hcs-burst-1 "$W5160" "$K5160"
launch_burst hcs-burst-2 "$W5171" "$K5171"
if [[ "$BURST_DRIVER_COUNT" -ge 3 ]]; then
  launch_burst hcs-burst-3 "$W5258" "$K5258"
fi

echo ""
echo "LOGDIR=$LOGDIR"
echo "Domain: $DOMAIN_TPS_CONCURRENCY x 5 | Burst: $BURST_TPS_CONCURRENCY x $BURST_DRIVER_COUNT | 3 payers"
sleep 12
pgrep -af 'high-tps-driver|hcs-burst-driver' || true