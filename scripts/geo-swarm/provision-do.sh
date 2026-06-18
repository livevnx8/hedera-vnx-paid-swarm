#!/usr/bin/env bash
# Provision DigitalOcean droplets in 4 regions (requires DO_TOKEN).
# Usage: DO_TOKEN=xxx ./provision-do.sh
set -euo pipefail

TOKEN="${DO_TOKEN:?Set DO_TOKEN from https://cloud.digitalocean.com/account/api/tokens}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLOUD_INIT=$(python3 -c "import json; print(json.dumps(open('$SCRIPT_DIR/cloud-init.yaml').read()))")

# region slug → human name
REGIONS=(nyc3 sfo3 ams3 blr1)
NAMES=(us-east us-west eu-west ap-south)

OUT="$SCRIPT_DIR/nodes.provisioned.json"
echo '{"topicId":"0.0.9227346","network":"testnet","durationSec":60,"burstConcurrency":600,"burstsPerWallet":4,"nodes":[' >"$OUT"

for i in "${!REGIONS[@]}"; do
  slug="${REGIONS[$i]}"
  name="vnx-geo-${NAMES[$i]}"
  echo "Creating $name in $slug..."
  resp=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"name\":\"$name\",\"region\":\"$slug\",\"size\":\"s-2vcpu-4gb\",\"image\":\"ubuntu-24-04-x64\",\"user_data\":$CLOUD_INIT}" \
    "https://api.digitalocean.com/v2/droplets")
  ip=$(echo "$resp" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('droplet',{}).get('networks',{}).get('v4',[{}])[0].get('ip_address',''))" 2>/dev/null || echo "")
  echo "  IP: $ip (wait ~60s for cloud-init)"
  [[ $i -gt 0 ]] && echo "," >>"$OUT"
  cat >>"$OUT" <<EOF
  {"id":"${NAMES[$i]}","region":"$slug","provider":"digitalocean","host":"$ip","sshUser":"root","wallets":[]}
EOF
done

echo ']}' >>"$OUT"
echo "Wrote $OUT — assign wallets, then: ./remote-sync.sh nodes.provisioned.json"