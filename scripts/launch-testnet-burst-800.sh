#!/usr/bin/env bash
# Push 800+ TPS on testnet topic 0.0.9227346 — domain drivers + compact HCS burst.
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

# Domain drivers: full pipeline — moderate concurrency
export DOMAIN_TPS_CONCURRENCY="${DOMAIN_TPS_CONCURRENCY:-80}"
export HIGH_TPS_DURATION="${HIGH_TPS_DURATION:-7200}"

# Burst drivers: compact single-chunk HCS — primary throughput for 800+ target
export BURST_TPS_CONCURRENCY="${BURST_TPS_CONCURRENCY:-450}"
export BURST_DRIVER_COUNT="${BURST_DRIVER_COUNT:-2}"

echo "Stopping existing drivers..."
pkill -f 'tsx scripts/high-tps-driver.ts' 2>/dev/null || true
pkill -f 'tsx scripts/hcs-burst-driver.ts' 2>/dev/null || true
sleep 2

launch_domain() {
  local name="$1" dir="$2"
  local log="$LOGDIR/$name.log"
  echo "=== $name $(date -u -Iseconds) conc=$DOMAIN_TPS_CONCURRENCY ===" >"$log"
  (
    cd "$dir"
    export TESTNET_WORKER_SET=4
    export HIGH_TPS_CONCURRENCY="$DOMAIN_TPS_CONCURRENCY"
    exec npx tsx scripts/high-tps-driver.ts >>"$log" 2>&1
  ) &
  echo "$name pid=$! log=$log"
}

launch_burst() {
  local name="$1"
  local log="$LOGDIR/$name.log"
  echo "=== $name $(date -u -Iseconds) conc=$BURST_TPS_CONCURRENCY ===" >"$log"
  (
    cd "$ROOT/hedera-vnx-paid-swarm"
    export HIGH_TPS_CONCURRENCY="$BURST_TPS_CONCURRENCY"
    export BURST_DRIVER_LABEL="$name"
    exec npx tsx scripts/hcs-burst-driver.ts >>"$log" 2>&1
  ) &
  echo "$name pid=$! log=$log"
}

launch_domain ai-inference "$ROOT/hedera-vnx-ai-inference-attestation"
launch_domain rwa-claim "$ROOT/hedera-vnx-rwa-claim"
launch_domain water-biodiversity "$ROOT/hedera-vnx-water-biodiversity"
launch_domain supply-chain "$ROOT/hedera-vnx-supply-chain-provenance"

echo "=== wv-carbon $(date -u -Iseconds) conc=$DOMAIN_TPS_CONCURRENCY ===" >"$LOGDIR/wv-carbon.log"
(
  cd "$ROOT/hedera-vnx-wv-carbon-swarm"
  export TESTNET_WORKER_SET=4
  export HIGH_TPS_CONCURRENCY="$DOMAIN_TPS_CONCURRENCY"
  export DOMAINS=electricity,seds,co2-emissions,natural-gas,coal,total-energy
  export ORCHESTRATE=1
  exec npx tsx scripts/high-tps-driver.ts >>"$LOGDIR/wv-carbon.log" 2>&1
) &
echo "wv-carbon pid=$! log=$LOGDIR/wv-carbon.log"

for i in $(seq 1 "$BURST_DRIVER_COUNT"); do
  launch_burst "hcs-burst-$i"
done

echo ""
echo "LOGDIR=$LOGDIR"
echo "Domain concurrency: $DOMAIN_TPS_CONCURRENCY x 5 | Burst: $BURST_TPS_CONCURRENCY x $BURST_DRIVER_COUNT"
sleep 12
pgrep -af 'high-tps-driver|hcs-burst-driver' || true