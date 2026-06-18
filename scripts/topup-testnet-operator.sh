#!/usr/bin/env bash
# Top up testnet operator 0.0.9035798 from funded worker 0.0.9035258.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AMOUNT="${TOPUP_AMOUNT:-500}"
OPERATOR="${HEDERA_ACCOUNT_ID:-0.0.9035798}"
WORKER_ID="${TOPUP_FROM_ACCOUNT:-0.0.9035258}"
WORKER_KEY="${TOPUP_FROM_KEY:-0xed1adcfab0b7154397adb45cec142d03a0b4dc6077d516f71421a9d361ce8afa}"

echo "Topping up $OPERATOR with $AMOUNT HBAR from $WORKER_ID..."
cd "$ROOT"
HEDERA_NETWORK=testnet \
HEDERA_ACCOUNT_ID="$WORKER_ID" \
HEDERA_PRIVATE_KEY="$WORKER_KEY" \
npx tsx scripts/send-hbar.ts --to "$OPERATOR" --amount "$AMOUNT" --memo "operator top-up" --max 1100