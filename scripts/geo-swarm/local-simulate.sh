#!/usr/bin/env bash
# Simulate 4 geo regions on ONE host (proves geo tagging + wallet split, not true latency).
# Use real VMs via coordinator-10k.sh for production 10K attempt.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
source "$ROOT/.env.testnet"
DURATION="${GEO_DURATION:-60}"
PROOF_DIR="$ROOT/../vnx-geo-proof-logs/local-sim-$(date -u +%Y-%m-%dT%H-%M-%S)"
mkdir -p "$PROOF_DIR"
TOPIC="${VNX_HCS_TOPIC_ID:-0.0.9227346}"
MIRROR="https://testnet.mirrornode.hedera.com"

launch_region() {
  local region="$1" wallets="$2"
  export GEO_REGION="$region" GEO_DURATION="$DURATION" GEO_WALLETS="$wallets"
  export GEO_BURST_CONCURRENCY="${GEO_BURST_CONCURRENCY:-400}"
  export GEO_BURSTS_PER_WALLET="${GEO_BURSTS_PER_WALLET:-3}"
  export VNX_ROOT="$ROOT" GEO_LOGDIR="$PROOF_DIR/$region"
  mkdir -p "$GEO_LOGDIR"
  bash "$(dirname "$0")/burst-worker.sh" >"$PROOF_DIR/${region}-coordinator.log" 2>&1 &
  echo "$region pid=$!"
}

SEQ_BEFORE=$(curl -sf "$MIRROR/api/v1/topics/$TOPIC/messages?limit=1&order=desc" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['messages'][0]['sequence_number'])")

echo "=== Local Geo Simulation (4 pseudo-regions) ==="
echo "seq before: $SEQ_BEFORE"

launch_region us-east-1 "${OPERATOR_9035798_ID}:${OPERATOR_9035798_KEY},${OPERATOR_9035171_ID}:${OPERATOR_9035171_KEY}"
launch_region us-west-2 "${OPERATOR_9032608_ID}:${OPERATOR_9032608_KEY},${OPERATOR_9034044_ID}:${OPERATOR_9034044_KEY}"
launch_region eu-west-1 "${OPERATOR_8834217_ID}:${OPERATOR_8834217_KEY},${OPERATOR_9034925_ID}:${OPERATOR_9034925_KEY}"
launch_region ap-south-1 "${OPERATOR_9035024_ID}:${OPERATOR_9035024_KEY}"

wait || true
sleep 3

SEQ_AFTER=$(curl -sf "$MIRROR/api/v1/topics/$TOPIC/messages?limit=1&order=desc" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['messages'][0]['sequence_number'])")

node "$(dirname "$0")/collect-proof.mjs" \
  --proof-dir "$PROOF_DIR" --topic "$TOPIC" --duration "$DURATION" \
  --seq-before "$SEQ_BEFORE" --seq-after "$SEQ_AFTER" \
  --nodes "$(dirname "$0")/nodes.example.json"

echo "Done — proof at $PROOF_DIR/PROOF-GEO-10K.md"