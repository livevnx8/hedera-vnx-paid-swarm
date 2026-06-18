#!/usr/bin/env bash
# Geo coordinator — fire 60s burst on all nodes, measure mirror TPS, collect proof.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
NODES_FILE="${1:-$SCRIPT_DIR/nodes.json}"
KEYS_FILE="${GEO_KEYS_FILE:-$ROOT/.env.testnet}"
DURATION="${GEO_DURATION:-60}"
TOPIC="${VNX_HCS_TOPIC_ID:-0.0.9227346}"
MIRROR="https://testnet.mirrornode.hedera.com"
PROOF_DIR="$ROOT/../vnx-geo-proof-logs/$(date -u +%Y-%m-%dT%H-%M-%S)"
mkdir -p "$PROOF_DIR"

[[ -f "$NODES_FILE" ]] || { echo "Copy nodes.example.json → nodes.json and set IPs"; exit 1; }

# Build wallet strings per node from .env.testnet
build_wallets() {
  python3 <<PY
import json, re
nodes = json.load(open("$NODES_FILE"))
keys = open("$KEYS_FILE").read()
def get_key(account):
    suffix = account.replace("0.0.", "")
    m = re.search(rf"^OPERATOR_{suffix}_KEY=(.+)$", keys, re.M)
    return m.group(1).strip() if m else ""

for n in nodes["nodes"]:
    pairs = []
    for w in n.get("wallets", []):
        acct = w["accountId"]
        key = get_key(acct)
        if key:
            pairs.append(f"{acct}:{key}")
    n["geo_wallets"] = ",".join(pairs)
    print(f"{n['id']}|{n['region']}|{n['host']}|{n.get('sshUser','root')}|{n['geo_wallets']}")
PY
}

echo "=== VNX Geo 10K Coordinator ==="
echo "Proof dir: $PROOF_DIR"
echo "Duration: ${DURATION}s | Topic: $TOPIC"
echo ""

SEQ_BEFORE=$(curl -sf "$MIRROR/api/v1/topics/$TOPIC/messages?limit=1&order=desc" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['messages'][0]['sequence_number'])")

echo "Seq before: $SEQ_BEFORE"
echo "Launching remote workers..."

CONC=$(python3 -c "import json; print(json.load(open('$NODES_FILE')).get('burstConcurrency',600))")
PER=$(python3 -c "import json; print(json.load(open('$NODES_FILE')).get('burstsPerWallet',4))")

while IFS='|' read -r id region host user wallets; do
  [[ "$host" == YOUR_* ]] && { echo "SKIP $id — set host"; continue; }
  [[ -z "$wallets" ]] && { echo "SKIP $id — no wallet keys"; continue; }
  echo "→ $id ($region) @ $host"
  ssh -o StrictHostKeyChecking=accept-new "$user@$host" \
    "GEO_REGION='$region' GEO_DURATION='$DURATION' GEO_BURST_CONCURRENCY='$CONC' \
     GEO_BURSTS_PER_WALLET='$PER' GEO_WALLETS='$wallets' \
     VNX_ROOT=/opt/vnx-geo/hedera-vnx-paid-swarm GEO_LOGDIR=/opt/vnx-geo/logs/run-$(date -u +%H%M%S) \
     bash /opt/vnx-geo/hedera-vnx-paid-swarm/scripts/geo-swarm/burst-worker.sh" \
    >"$PROOF_DIR/${id}.log" 2>&1 &
done < <(build_wallets)

echo "Waiting ${DURATION}s + 15s drain..."
sleep $((DURATION + 15))

SEQ_AFTER=$(curl -sf "$MIRROR/api/v1/topics/$TOPIC/messages?limit=1&order=desc" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['messages'][0]['sequence_number'])")
DELTA=$((SEQ_AFTER - SEQ_BEFORE))
TPS=$(python3 -c "print(f'{$DELTA / $DURATION:.1f}')")

# Pull remote logs
while IFS='|' read -r id region host user wallets; do
  [[ "$host" == YOUR_* ]] && continue
  scp -r "$user@$host:/opt/vnx-geo/logs/" "$PROOF_DIR/remote-$id/" 2>/dev/null || true
done < <(build_wallets)

node "$SCRIPT_DIR/collect-proof.mjs" \
  --proof-dir "$PROOF_DIR" \
  --topic "$TOPIC" \
  --duration "$DURATION" \
  --seq-before "$SEQ_BEFORE" \
  --seq-after "$SEQ_AFTER" \
  --nodes "$NODES_FILE"

echo ""
echo "=== GEO RUN: +$DELTA seq = $TPS TPS (target 10,000+) ==="
echo "Proof: $PROOF_DIR/PROOF-GEO-10K.md"