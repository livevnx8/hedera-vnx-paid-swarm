# Hedera Payment SDK

Standalone HBAR transfer utilities built on `@hashgraph/sdk` with safety guards, mainnet enforcement, and clean error normalization.

## Quick Start

```ts
import { HederaPaymentRail } from 'hedera-vnx-paid-swarm';

const rail = new HederaPaymentRail({
  requireMainnet: true,   // Enforce mainnet only
  maxHbar: 0.01,          // Safety cap per transfer
});

const result = await rail.transfer(
  '0.0.10294360',   // recipient
  0.005,            // HBAR amount
  'VNX swarm winner' // optional memo
);

console.log(result.status);        // 'success' | 'payment_failed'
console.log(result.transactionId);  // '0.0.12345@1234567890.000000001'
```

## Environment

```bash
export HEDERA_ACCOUNT_ID=0.0.YOUR_ACCOUNT
export HEDERA_PRIVATE_KEY=YOUR_ECDSA_KEY
export HEDERA_NETWORK=mainnet   # or testnet / previewnet
```

## CLI

```bash
# Send HBAR from command line
npx tsx scripts/send-hbar.ts --to 0.0.10294360 --amount 0.005 --memo "payment"

# Via npm script
npm run send -- --to 0.0.10294360 --amount 0.01
```

## Classes

### `HederaClient`

Low-level wrapper around `@hashgraph/sdk` `Client`.

| Method | Returns | Description |
|--------|---------|-------------|
| `transferHbar(to, amount, memo?)` | `{transactionId, status, consensusTimestampMs}` | Execute HBAR transfer |
| `getBalance(accountId?)` | `{hbar, tokens, timestamp}` | Query account balance |
| `close()` | `void` | Close client connection |
| `static fromEnv()` | `HederaClient \| null` | Build from `HEDERA_*` env vars |

### `HederaPaymentRail`

High-level guard rail with validation and error normalization.

| Config | Default | Description |
|--------|---------|-------------|
| `requireMainnet` | `true` | Throw if `HEDERA_NETWORK !== 'mainnet'` |
| `maxHbar` | `0.01` | Reject transfers above this cap |

| Method | Returns | Description |
|--------|---------|-------------|
| `transfer(to, amount, memo?)` | `PaymentResult` | Validate → init client → execute → normalize |

## PaymentResult

```ts
interface PaymentResult {
  status: 'success' | 'payment_failed';
  network: string;
  amountHbar: number;
  recipient: string;
  transactionId?: string;
  consensusTimestampMs?: number;
  error?: string;
}
```

## Safety Guarantees

- **Amount validation** — rejects zero or negative amounts
- **Cap enforcement** — configurable max HBAR per transfer
- **Mainnet lock** — optional strict mainnet requirement
- **Credential guard** — clear error if env vars missing
- **Lazy init** — `@hashgraph/sdk` loaded only when a real transfer is requested

## Examples

### Balance Check

```ts
import { HederaClient } from 'hedera-vnx-paid-swarm';

const client = HederaClient.fromEnv();
if (client) {
  const balance = await client.getBalance();
  console.log(`${balance.hbar} HBAR`);
  client.close();
}
```

### Dry-Run Validation (no credentials)

```ts
const rail = new HederaPaymentRail({ requireMainnet: false, maxHbar: 0.01 });
// This validates the amount and cap without hitting the network
const result = await rail.transfer('0.0.12345', 0.02);
console.log(result.status); // 'payment_failed' (exceeds cap)
```
