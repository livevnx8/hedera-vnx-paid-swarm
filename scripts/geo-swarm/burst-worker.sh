#!/usr/bin/env bash
# Run on a geo VM — burst all assigned wallets for GEO_DURATION seconds.
set -euo pipefail

ROOT="${VNX_ROOT:-/opt/vnx-geo/hedera-vnx-paid-swarm}"
REGION="${GEO_REGION:?set GEO_REGION e.g. us-east-1}"
DURATION="${GEO_DURATION:-60}"
CONC="${GEO_BURST_CONCURRENCY:-600}"
PER_WALLET="${GEO_BURSTS_PER_WALLET:-4}"
TOPIC="${VNX_HCS_TOPIC_ID:-0.0.9227346}"
LOGDIR="${GEO_LOGDIR:-/opt/vnx-geo/logs/$(date -u +%Y-%m-%dT%H-%M-%S)}"
mkdir -p "$LOGDIR"

echo "=== VNX Geo Burst Worker ==="
echo "region=$REGION host=$(hostname) duration=${DURATION}s conc=$CONC"
echo "logdir=$LOGDIR"

# Wallets: GEO_WALLETS="accountId:privateKey,accountId:privateKey"
if [[ -z "${GEO_WALLETS:-}" ]]; then
  echo "GEO_WALLETS required: account:key,account:key"
  exit 1
fi

export HEDERA_NETWORK=testnet
export VNX_HCS_TOPIC_ID="$TOPIC"
export HIGH_TPS_DURATION="$DURATION"
export HIGH_TPS_CONCURRENCY="$CONC"
export BURST_MAX_MODE=1
export GEO_REGION="$REGION"
export GEO_HOST="$(hostname)"

launch() {
  local name="$1" acct="$2" key="$3"
  local log="$LOGDIR/$name.log"
  (
    cd "$ROOT"
    export HEDERA_ACCOUNT_ID="$acct"
    export HEDERA_PRIVATE_KEY="$key"
    export BURST_DRIVER_LABEL="$name"
    npx tsx scripts/hcs-burst-driver.ts >>"$log" 2>&1
  ) &
  echo "  $name payer=$acct pid=$!"
}

IFS=',' read -ra PAIRS <<<"$GEO_WALLETS"
idx=0
for pair in "${PAIRS[@]}"; do
  IFS=':' read -r acct key <<<"$pair"
  for i in $(seq 1 "$PER_WALLET"); do
    launch "burst-${REGION}-${idx}-$i" "$acct" "$key"
    idx=$((idx + 1))
  done
done

wait || true
echo "DONE region=$REGION logdir=$LOGDIR"