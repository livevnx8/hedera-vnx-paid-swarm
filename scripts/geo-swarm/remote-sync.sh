#!/usr/bin/env bash
# Sync VNX repo + keys to geo worker VMs. Usage: ./remote-sync.sh nodes.json
set -euo pipefail

NODES_FILE="${1:-$(dirname "$0")/nodes.json}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KEYS_FILE="${GEO_KEYS_FILE:-$ROOT/.env.testnet}"

[[ -f "$NODES_FILE" ]] || { echo "Missing $NODES_FILE — copy nodes.example.json"; exit 1; }

resolve_key() {
  local env_name="$1"
  local var="${env_name#KEY_}"
  local id_var="OPERATOR_${var}_KEY"
  grep "^${id_var}=" "$KEYS_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' || true
}

echo "Syncing from $ROOT to geo nodes..."

python3 <<PY
import json, subprocess, os
nodes = json.load(open("$NODES_FILE"))
root = "$ROOT"
for n in nodes["nodes"]:
    host = n["host"]
    if host.startswith("YOUR_"):
        print(f"SKIP {n['id']} — set host in nodes.json")
        continue
    user = n.get("sshUser", "root")
    dest = f"{user}@{host}:/opt/vnx-geo/"
    print(f"→ {n['id']} ({n['region']}) {dest}")
    subprocess.run([
        "ssh", f"{user}@{host}", "mkdir", "-p", "/opt/vnx-geo/hedera-vnx-paid-swarm"
    ], check=False)
    subprocess.run([
        "rsync", "-az", "--delete",
        "--exclude", "node_modules",
        "--exclude", ".git",
        f"{root}/",
        f"{user}@{host}:/opt/vnx-geo/hedera-vnx-paid-swarm/"
    ], check=False)
    subprocess.run([
        "ssh", f"{user}@{host}",
        f"cd /opt/vnx-geo/hedera-vnx-paid-swarm && npm ci --omit=dev 2>/dev/null || npm install"
    ], check=False)
print("Sync complete")
PY