# Hedera AI Agent Bounty Submission Notes

This document is a judge-friendly map for the **Fun Basic Hedera Agent** bounty.

## Project

**Hedera VNX Paid Micro-Swarm**

VNX means **Verified Network Exchange**: a paid-agent workflow where agent decisions, HBAR settlement, and proof receipts can be independently verified.

## Short Description

The project demonstrates a basic Hedera agent workflow:

1. A task is submitted to a four-worker VNX agent swarm.
2. Workers vote with deterministic confidence scores.
3. The highest-score worker wins under a configurable HBAR cap.
4. The winning agent is paid in HBAR on Hedera mainnet.
5. The result is captured in a SHA-256 proof receipt.
6. The proof can be verified through HashScan, Hedera/Hiero mirror-node lookup, and local verifier agents.

## Why It Fits Week 1

| Week 1 expectation  | Project evidence                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Basic Hedera agent  | The swarm acts as an agent system that chooses a worker and executes a Hedera payment    |
| Uses Hedera network | Mainnet HBAR payment and mirror-node verification are included                           |
| Has a clear demo    | `npm run demo:plan`, `npm run e2e`, `npm run demo:render`                                |
| Verifiable result   | Receipt includes task hash, decision hash, transaction ID, HashScan URL, mirror-node URL |
| Public repo ready   | README, docs, visuals, tests, CI, npm package dry-run, security policy                   |

## Mainnet Proof

| Field       | Value                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| Account     | `0.0.10294360`                                                                                       |
| Transaction | `0.0.10294360@1778958335.880736678`                                                                  |
| HCS Topic   | `0.0.10416185`                                                                                       |
| HashScan    | `https://hashscan.io/mainnet/transaction/0.0.10294360%401778958335.880736678`                        |
| Mirror Node | `https://mainnet-public.mirrornode.hedera.com/api/v1/transactions/0.0.10294360-1778958335-880736678` |

## How To Run

Dry-run, no credentials:

```bash
npm install
npm run demo:plan
npm run e2e
```

Verify a saved proof:

```bash
npm run verify -- \
  --receipt data/receipt-example.json \
  --task "Predict the HBAR price direction and forecast the signal"
```

Render the live-data demo GIF:

```bash
npm run demo:render -- \
  --transaction-id 0.0.10294360@1778958335.880736678 \
  --hcs-topic 0.0.10416185 \
  --out assets/vnx-mainnet-demo.gif
```

Live mainnet run requires funded credentials:

```bash
export HEDERA_ACCOUNT_ID="0.0.x"
export HEDERA_PRIVATE_KEY="..."
export HEDERA_NETWORK="mainnet"

npm run demo:live -- \
  --recipient 0.0.RECIPIENT \
  --max-hbar 0.01
```

## Hedera Agent Kit Alignment

Hedera Agent Kit provides higher-level agent tooling for Hedera account, token, consensus, and transaction workflows. This repo currently keeps the payment path on the low-level Hedera SDK so the mainnet proof receipt remains compact and directly auditable.

Conceptual mapping:

| Hedera Agent Kit concept | VNX implementation                                         |
| ------------------------ | ---------------------------------------------------------- |
| Agent tool               | `PaidSwarmCoordinator.runTask()`                           |
| HBAR transfer action     | `HederaPaymentRail.transfer()`                             |
| Consensus / HCS action   | `HcsTopicPublisher.publish()`                              |
| Transaction lookup       | `verifySwarmProof()` and `HieroVerifyVnxAgent.verify()`    |
| Policy / guardrail       | `maxHbar`, `requireMainnet`, `assertMainnetProofReceipt()` |

Optional Agent Kit wrapper path:

1. Install the current JavaScript Agent Kit package from Hedera docs.
2. Wrap `PaidSwarmCoordinator.runTask()` as one custom agent tool.
3. Expose two user-facing actions:
   - `run_vnx_swarm_task`
   - `verify_vnx_swarm_receipt`
4. Keep this package as the deterministic execution engine underneath the Agent Kit agent.

That wrapper is intentionally not hardcoded into the main package yet because the JavaScript Agent Kit moved to the `@hashgraph` package structure in v4 during the bounty launch window. The current submission keeps the Hedera mainnet proof path stable while documenting the Agent Kit integration surface clearly.

## Suggested Submission Description

```text
VNX, Verified Network Exchange, is a fun paid Hedera agent swarm. Four deterministic workers vote on a task, the highest-score worker wins, and the winner is paid in HBAR on Hedera mainnet. The app produces a receipt with SHA-256 task/decision hashes, HashScan proof, mirror-node proof, and an HCS audit path. It includes a dry-run demo, live mainnet proof, verifier agent, and visual demo GIF.
```

## Review Checklist

- Public repo is available.
- README includes live proof links.
- Demo material is visible in README.
- `npm run demo:plan` runs without credentials.
- Mainnet credentials are not committed.
- The submitted social/demo link points to the README or live GIF.
