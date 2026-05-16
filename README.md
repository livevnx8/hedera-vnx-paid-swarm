# Hedera VNX Paid Micro-Swarm

<p align="center">
  <img src="assets/badge-hedera.svg" alt="Verified on Hedera Mainnet"/>
  <img src="assets/badge-hiero.svg" alt="Hiero Compatible"/>
</p>

> Deterministic VNX agent swarm with Hedera mainnet HBAR payment and cryptographically verifiable proof receipts.

```
task → 4 VNX workers vote → highest-score winner selected → HBAR paid on mainnet → proof receipt
```

## Live Verification

| Field | Value |
|-------|-------|
| **HCS Topic** | `0.0.10416185` — Vera lattice audit trail |
| **Mirror Node** | `https://mainnet-public.mirrornode.hedera.com` |
| **HashScan** | `https://hashscan.io/mainnet` |

## Quick Start

### Plan-Only (no credentials)

```bash
npm install
npm run demo:plan
```

### Live Mainnet (requires credentials)

```bash
export HEDERA_ACCOUNT_ID="0.0.YOUR_ACCOUNT"
export HEDERA_PRIVATE_KEY="YOUR_ECDSA_KEY"
export HEDERA_NETWORK="mainnet"

npm run demo:live -- \
  --task "Predict the HBAR price direction and forecast the signal" \
  --recipient 0.0.RECIPIENT \
  --max-hbar 0.01
```

## Architecture

<p align="center">
  <img src="assets/architecture.svg" alt="Architecture Diagram" width="900"/>
</p>

| Component | File | Responsibility |
|-----------|------|----------------|
| `VnxWorkerAgent` | `src/workers.ts` | 4 deterministic agents with keyword confidence scoring |
| `PaidSwarmCoordinator` | `src/coordinator.ts` | Dispatches tasks, scores votes, selects winner, triggers payment |
| `HederaPaymentRail` | `src/payment-rail.ts` | Wraps `HederaClient`; enforces mainnet, validates amount cap |
| `ProofReceiptBuilder` | `src/receipt-builder.ts` | SHA-256 hashed JSON receipt with HashScan + mirror-node URLs |
| `ProofVerifier` | `src/proof-verifier.ts` | Recomputes hashes and verifies transactions via Hiero mirror node |

## Workers

| Name | Specialty | Price | Best For |
|------|-----------|-------|----------|
| BitLattice-ONNX | prediction | 0.005 HBAR | price signals, forecasts |
| RSI-Momentum | momentum | 0.003 HBAR | RSI, velocity tasks |
| BB-Volatility | volatility | 0.003 HBAR | Bollinger bands, range |
| SMA-Trend | trend | 0.002 HBAR | moving average, slope |

**Scoring:** `score = confidence × specialty_match / (price_hbar + 0.0001)`

## Receipt Schema

```json
{
  "version": "1.0",
  "network": "mainnet",
  "timestamp": 1778951290988,
  "taskHash": "sha256(task)",
  "votes": [
    { "workerId": "onnx-primary", "name": "BitLattice-ONNX", "specialty": "prediction", "confidence": 0.9, "priceHbar": 0.005, "score": 176.47 }
  ],
  "selected": { "workerId": "onnx-primary", "name": "BitLattice-ONNX", "specialty": "prediction", "priceHbar": 0.005, "score": 176.47 },
  "payment": {
    "status": "success",
    "transactionId": "0.0.1@...",
    "network": "mainnet",
    "amountHbar": 0.005,
    "recipient": "0.0.123456",
    "consensusTimestampMs": 1778951290988
  },
  "decisionHash": "sha256(workerId:score:txId:taskHash)",
  "proofStatus": "mainnet_confirmed",
  "explorerUrl": "https://hashscan.io/mainnet/transaction/...",
  "mirrorNodeUrl": "https://mainnet-public.mirrornode.hedera.com/api/v1/transactions/..."
}
```

## Proof Verification

Save a live receipt and verify it:

```bash
npm run verify -- \
  --receipt data/receipt-example.json \
  --task "Predict the HBAR price direction and forecast the signal"
```

Expected output:

```text
PASS  TASK HASH
PASS  DECISION HASH
PASS  MAINNET PROOF STATUS
PASS  HASHSCAN URL
PASS  MIRROR NODE TRANSACTION
```

For the full proof standard, see [docs/HIERO.md](docs/HIERO.md).

## Tests

```bash
npm test
```

**18 tests** covering: worker confidence, winner selection, cap filtering, plan-only mode, payment failure normalization, non-mainnet rejection, hash stability, proof status, URL generation, and Hiero mirror-node verification.

## Safety

- Default `--max-hbar` capped at `0.01`
- Rejects non-positive amounts
- `HEDERA_NETWORK=mainnet` enforced for competition runs
- Private keys only from env vars (never hardcoded)
- `--plan-only` clearly labeled as dev-only, never a submission run

## Files

```
src/
├── types.ts              # SwarmTask, WorkerVote, PaymentResult, SwarmReceipt, PaymentRail
├── workers.ts            # VnxWorkerAgent + 4 pre-configured agents
├── coordinator.ts        # PaidSwarmCoordinator
├── payment-rail.ts       # HederaPaymentRail — mainnet enforcement
├── receipt-builder.ts    # ProofReceiptBuilder — SHA-256 receipts
├── proof-validation.ts   # assertMainnetProofReceipt guards
├── proof-verifier.ts     # verifySwarmProof + Hiero mirror-node lookup
├── proof-urls.ts         # HashScan + mirror-node URL builders
├── hedera-client.ts      # Minimal HederaClient wrapper
└── index.ts              # Module exports

scripts/
├── vnx-paid-swarm-demo.ts      # CLI entrypoint
├── vnx-paid-swarm-e2e.ts       # End-to-end validation
└── vnx-paid-swarm-verify-proof.ts  # CLI verifier

tests/
└── vnx-paid-swarm.test.ts    # 18 passing tests

assets/
├── architecture.svg      # System architecture diagram
├── badge-hedera.svg      # Verified on Hedera Mainnet badge
└── badge-hiero.svg       # Hiero Compatible badge

docs/
└── HIERO.md              # Hiero compatibility & verification guide

data/
└── receipt-example.json   # Example receipt (sanitized)
```

## HCS Topic

**Topic ID:** `0.0.10416185`

This is the Vera lattice HCS topic used for audit trail anchoring. Future releases will publish swarm receipts to this topic for immutable settlement proof.

## License

MIT © Vera Lattice
