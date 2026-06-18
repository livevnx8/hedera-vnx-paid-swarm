#!/usr/bin/env bash
# One-shot health check for live testnet swarm drivers.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.testnet"
[[ -f "$ENV_FILE" ]] && source "$ENV_FILE"

TOPIC="${VNX_HCS_TOPIC_ID:-0.0.9227346}"
MIRROR="https://testnet.mirrornode.hedera.com"

echo "=== VNX Testnet Swarm Monitor ==="
echo "Time:    $(date -u -Iseconds)"
echo "Topic:   $TOPIC"
echo ""

drivers=$(pgrep -f '/high-tps-driver\.ts$' 2>/dev/null | wc -l | tr -d ' ')
bursts=$(pgrep -f '/hcs-burst-driver\.ts$' 2>/dev/null | wc -l | tr -d ' ')
echo "Drivers: $drivers high-tps | $bursts hcs-burst"
echo ""
echo "Wallet balances:"

low=0
for acct in \
  "${OPERATOR_9035160_ID:-0.0.9035160}" \
  "${OPERATOR_9035171_ID:-0.0.9035171}" \
  "${OPERATOR_9035258_ID:-0.0.9035258}" \
  "${OPERATOR_9035798_ID:-0.0.9035798}"; do
  bal=$(curl -sf "$MIRROR/api/v1/accounts/$acct" | python3 -c "import json,sys; print(f\"{json.load(sys.stdin)['balance']['balance']/1e8:.2f}\")" 2>/dev/null || echo "?")
  echo "  $acct  ${bal} HBAR"
  if python3 -c "exit(0 if float('${bal:-0}') >= 50 else 1)" 2>/dev/null; then :; else low=$((low + 1)); fi
done

seq1=$(curl -sf "$MIRROR/api/v1/topics/$TOPIC/messages?limit=1&order=desc" | python3 -c "import json,sys; print(json.load(sys.stdin)['messages'][0]['sequence_number'])" 2>/dev/null || echo 0)
sleep 10
seq2=$(curl -sf "$MIRROR/api/v1/topics/$TOPIC/messages?limit=1&order=desc" | python3 -c "import json,sys; print(json.load(sys.stdin)['messages'][0]['sequence_number'])" 2>/dev/null || echo 0)

delta=$((seq2 - seq1))
tps=$(python3 -c "print(f'{$delta / 10:.1f}')")

echo ""
echo "Sequence: $seq1 -> $seq2 (+$delta in 10s)"
echo "Live TPS: $tps"
echo "Dashboard: https://livevnx8.github.io/verlattice/dashboard/"
echo "HashScan:  https://hashscan.io/testnet/topic/$TOPIC"

latest_log=$(ls -td "$ROOT/../vnx-live-testnet-logs"/*/ 2>/dev/null | head -1 || true)
if [[ -n "$latest_log" ]]; then
  echo "Latest logs: $latest_log"
fi

if [[ "$low" -gt 0 ]]; then
  echo ""
  echo "⚠️  $low wallet(s) below 50 HBAR — multi-wallet mode should rotate payers automatically on relaunch"
fi

if [[ "$delta" -eq 0 && "$drivers" -gt 0 ]]; then
  echo "⚠️  Drivers running but 0 TPS — check wallet balances and logs"
fi