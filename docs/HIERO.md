# Hiero/Hedera Proof Verification

This document describes how `hedera-vnx-paid-swarm` uses the Hiero ecosystem for verifiable mainnet proof through the **Hiero Verify VNX Agent**.

## Hiero Verify VNX Agent

The verifier is exposed as a first-class VNX agent:

| Field      | Value                    |
| ---------- | ------------------------ |
| Agent ID   | `hiero-verify-vnx`       |
| Agent Name | `Hiero Verify VNX Agent` |
| Specialty  | `hiero-mainnet-proof`    |
| Verdicts   | `accepted` or `rejected` |

The agent wraps the deterministic `verifySwarmProof()` function and returns an agent-style report with:

- verifier identity
- accepted/rejected verdict
- pass/fail check list
- HashScan proof URL
- mirror-node proof URL
- transaction ID and proof status

## Mirror Node API

The proof verifier queries the **Hedera mainnet public mirror node**:

```
https://mainnet-public.mirrornode.hedera.com/api/v1
```

This is a Hiero-compatible REST endpoint that serves validated consensus data.

## Transaction ID Normalization

Hedera SDK uses `@` format: `0.0.123@1234567890.123456789`

Mirror node API uses `-` format: `0.0.123-1234567890-123456789`

The `toMirrorNodeTransactionId()` helper in `src/proof-urls.ts` converts between formats:

```typescript
import { toMirrorNodeTransactionId } from 'hedera-vnx-paid-swarm';

const txId = '0.0.10294360@1778958335.880736678';
const normalized = toMirrorNodeTransactionId(txId);
// → '0.0.10294360-1778958335-880736678'
```

## Verification Checklist

A receipt is accepted as mainnet proof only when all fields below are present:

- `proofStatus: "mainnet_confirmed"`
- `network: "mainnet"`
- `payment.status: "success"`
- `payment.network: "mainnet"`
- `payment.transactionId` is present
- `explorerUrl` points to HashScan mainnet
- `mirrorNodeUrl` points to the Hedera mainnet mirror-node transaction endpoint

## API Usage

### HieroVerifyVnxAgent

```typescript
import { HieroVerifyVnxAgent } from 'hedera-vnx-paid-swarm';

const agent = new HieroVerifyVnxAgent();
const report = await agent.verify(receipt, taskDescription);

console.log(report.agentName); // "Hiero Verify VNX Agent"
console.log(report.verdict); // "accepted" | "rejected"
console.log(report.summary); // "5/5 checks passed for transaction ..."
```

### verifySwarmProof()

```typescript
import { verifySwarmProof } from 'hedera-vnx-paid-swarm';

const result = await verifySwarmProof(receipt, taskDescription);
// result.ok: boolean
// result.checks: Array<{ name, ok, detail }>
```

Checks performed:

1. **task_hash** — SHA-256 of task description matches receipt
2. **decision_hash** — SHA-256 of `workerId:score:txId:taskHash` matches receipt
3. **mainnet_proof_status** — `proofStatus === "mainnet_confirmed"`
4. **hashscan_url** — `explorerUrl` correctly derived from transaction ID
5. **mirror_node_transaction** — Live lookup to `mainnet-public.mirrornode.hedera.com` confirms SUCCESS

The agent uses these same checks and converts the result into a VNX-agent verdict.

### fetchMirrorTransactionFromHiero()

```typescript
import { fetchMirrorTransactionFromHiero } from 'hedera-vnx-paid-swarm';

const check = await fetchMirrorTransactionFromHiero(transactionId, mirrorNodeUrl);
// check.ok: boolean
// check.status: 'SUCCESS' | string
// check.error?: string
```

## Skipping Mirror Lookup

If the mirror node is temporarily unavailable, use `--skip-mirror` on the CLI:

```bash
npx tsx scripts/vnx-paid-swarm-verify-proof.ts \
  --receipt data/receipt-example.json \
  --task "..." \
  --skip-mirror
```

This verifies local hashes and status only. It is **not** full public settlement proof.

## HCS Anchoring (Future)

After the core loop works, swarm receipts can be anchored to HCS topic `0.0.10416185` for immutable audit trails.

## Links

- [Hiero Mirror Node REST API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api)
- [HashScan Mainnet Explorer](https://hashscan.io/mainnet)
- [Hedera Documentation](https://docs.hedera.com)
