# NVIDIA + Hedera Bare-Metal VNX Stack

This document explains how NVIDIA acceleration, Hedera proof services, and the VNX paid micro-swarm fit together on Linux bare metal.

<p align="center">
  <picture>
    <source srcset="../assets/nvidia-hedera-stack.svg" type="image/svg+xml"/>
    <img src="../assets/nvidia-hedera-stack.png" alt="NVIDIA and Hedera bare-metal VNX stack" width="1000"/>
  </picture>
</p>

## Executive Summary

NVIDIA and Hedera solve different parts of the same commercial AI workflow. NVIDIA gives the system local high-throughput intelligence; Hedera gives the system public settlement, ordering, and proof; VNX turns both into a repeatable paid-agent business process.

NVIDIA handles the heavy compute path: model inference, prediction fan-out, simulation, scoring, and high-throughput agent endpoints. Hedera handles the proof path: HBAR settlement, HCS audit messages, consensus timestamps, and mirror-node replay. VNX connects them by turning GPU-produced intelligence into deterministic agent decisions with payment and verification receipts.

The clean positioning is:

```text
NVIDIA = fast private intelligence
VNX    = deterministic paid agent coordination
Hedera = public settlement and audit proof
Linux  = bare-metal operational control
```

Nothing here requires putting private model inputs, raw market data, or proprietary model outputs directly on-chain. The on-chain and HCS layer receives compact proofs: hashes, transaction IDs, selected-worker metadata, and consensus-timestamped messages.

## Board-Level Value

| Business requirement    | Stack answer                                                           | Why buyers care                                                    |
| ----------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Fast AI workflows       | NVIDIA GPUs, CUDA, Triton, and NIM run inference close to the data     | Lower latency and stronger control than remote-only model APIs     |
| Private model execution | Bare-metal Linux keeps prompts, signals, and model outputs local       | Sensitive data does not need to be published on-chain              |
| Pay-for-work agents     | VNX selects a winner and pays through the Hedera payment rail          | Agent work becomes measurable and economically enforceable         |
| Auditability            | Receipts, hashes, HCS messages, HashScan links, and mirror-node replay | Customers can verify outcomes without trusting a private dashboard |
| Repeatable operations   | CI, package builds, deterministic benchmarks, and receipt schemas      | The system can be shipped, tested, and integrated professionally   |

## What We Can Build With It

This stack supports more than a demo. It is a template for paid, auditable AI execution.

| Product direction         | What NVIDIA does                                                 | What Hedera does                                 | What VNX adds                                                  |
| ------------------------- | ---------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| GPU prediction desk       | Runs models, ensembles, simulations, and backtests               | Proves paid decisions and anchors receipts       | Worker competition, caps, receipts, verifier agents            |
| Enterprise AI audit trail | Keeps model execution local to the customer environment          | Adds consensus timestamp and ordered proof trail | Hashes task/decision data and makes verification repeatable    |
| Agent marketplace         | Serves many specialized AI agents with GPU-backed endpoints      | Settles agent compensation in HBAR               | Ranks, selects, pays, and records worker reputation            |
| Regulated workflow proof  | Accelerates private scoring while limiting data exposure         | Gives third-party-verifiable proof metadata      | Separates private data from public proof artifacts             |
| Bare-metal AI appliance   | Runs GPU services, VNX, logs, and secrets on one controlled host | Publishes compact proof to public infrastructure | A packaged operator workflow for demos or customer deployments |

## Why Linux Bare Metal

Linux bare metal is the best operating posture for this stack because it keeps latency-sensitive GPU inference close to the operating system, drivers, and local services.

| Bare-metal concern | Stack decision                                                          |
| ------------------ | ----------------------------------------------------------------------- |
| GPU driver control | Install and pin NVIDIA drivers/CUDA for the exact GPU fleet             |
| Runtime control    | Run Node.js VNX services, Triton/NIM containers, and monitoring locally |
| Data locality      | Keep private signals and model inputs on the server                     |
| Determinism        | Version-lock models, agent configs, receipts, and benchmark runs        |
| Security           | Load Hedera keys from environment or secret manager, not source files   |
| Operations         | Use systemd, Docker, or Kubernetes depending on deployment size         |

NVIDIA’s CUDA Linux documentation supports multiple Linux installation paths and post-install verification flows. That makes it the practical base layer for GPU-accelerated agent infrastructure.

## Reference Architecture

```text
┌──────────────────────────────── Linux Bare Metal ────────────────────────────────┐
│                                                                                  │
│  NVIDIA Driver + CUDA                                                            │
│        │                                                                         │
│        ▼                                                                         │
│  Triton / NIM / ONNX Runtime  ──HTTP/gRPC──►  VNX Worker Agents                  │
│        │                                      │                                  │
│        │                                      ▼                                  │
│        │                                PaidSwarmCoordinator                     │
│        │                                      │                                  │
│        └──────────── private model data ◄─────┘                                  │
│                                               │                                  │
└───────────────────────────────────────────────┼──────────────────────────────────┘
                                                │ compact proof metadata only
                                                ▼
┌────────────────────────────── Hedera Mainnet / HCS ──────────────────────────────┐
│  HBAR payment  │  transaction ID  │  HCS topic message  │  mirror-node replay   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## NVIDIA Role

NVIDIA is the acceleration layer.

In a production VNX deployment, NVIDIA infrastructure can run:

- Tensor and ONNX model inference
- LLM, embedding, vision, speech, or multimodal agent endpoints
- Triton Inference Server for HTTP/gRPC model serving
- NVIDIA NIM microservices for optimized, containerized inference
- Batch prediction firehoses and parallel worker scoring
- Local simulation and strategy evaluation before payment

Official NVIDIA positioning supports this architecture:

- CUDA is the Linux GPU compute foundation.
- Triton provides an inference service over HTTP/gRPC for managed models.
- NIM packages optimized inference microservices for NVIDIA-accelerated infrastructure.

NVIDIA’s published NIM benchmark example lists Llama 3.1 8B Instruct on 1x H100 SXM at 200 concurrent requests, with NIM ON at 1201 tokens/sec and NIM OFF at 613 tokens/sec. That number is NVIDIA’s example, not a VNX repo benchmark.

## Performance Model

Use three separate performance categories when presenting the stack:

| Category               | Example metric                                                          | Meaning                              | Boundary                                                    |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| Model inference        | NVIDIA NIM example: 1201 tokens/sec on a stated H100 configuration      | GPU serving throughput               | Depends on model, GPU, precision, batching, and engine      |
| VNX local coordination | 88,975.28 deterministic prediction tasks/sec                            | Local agent routing/scoring speed    | Not a Hedera network TPS claim                              |
| Proof and settlement   | HBAR transaction ID, HCS sequence, consensus timestamp, mirror-node URL | Public verification and auditability | Throughput depends on Hedera network and mirror-node limits |

This separation is important. It makes the business case stronger because each layer is measured by the thing it actually controls.

## Hedera Role

Hedera is the settlement and proof layer.

In a VNX paid-swarm deployment, Hedera provides:

- HBAR payment to the selected worker or recipient account
- Public transaction IDs for settlement proof
- HashScan links for human-readable verification
- HCS topic messages for audit trail anchoring
- Consensus timestamps and message ordering
- Mirror-node replay for independent verification

Hedera describes HCS as a decentralized notary for verifiable and immutable timestamps. That maps directly to the VNX receipt model: VNX does not need Hedera to run the model. VNX needs Hedera to prove when a decision/payment/proof message happened and to make that result independently auditable.

## VNX Role

VNX is the coordination layer.

The VNX paid micro-swarm:

1. Receives a task.
2. Routes it to worker agents.
3. Scores predictions using deterministic rules.
4. Selects the highest-score worker under the HBAR cap.
5. Pays the selected worker or recipient on Hedera mainnet.
6. Builds a SHA-256 receipt.
7. Publishes or verifies proof artifacts through HCS and mirror-node APIs.
8. Produces a machine-readable and human-readable verification trail.

This turns AI output into a commercial workflow: agents can earn, operators can audit, and customers can verify.

## Data Flow

```text
Market/task input
  -> Linux bare-metal VNX service
  -> NVIDIA accelerated inference endpoint
  -> VNX worker votes and scores
  -> PaidSwarmCoordinator selects winner
  -> HederaPaymentRail sends HBAR
  -> ProofReceiptBuilder hashes task and decision
  -> HCS publisher anchors proof message
  -> Hiero verifier replays mirror-node evidence
```

## Data Classes

| Data class        | Example                                            | Location                                | Public?  |
| ----------------- | -------------------------------------------------- | --------------------------------------- | -------- |
| Private input     | Raw market features, prompts, customer data        | Bare-metal host / model service         | No       |
| Agent output      | Prediction score, model response, worker vote      | VNX local process and receipt store     | Optional |
| Proof hash        | Task hash, decision hash                           | Receipt, HCS message                    | Yes      |
| Settlement data   | HBAR transaction ID, recipient, amount             | Hedera mainnet / HashScan / mirror node | Yes      |
| Audit replay data | HCS topic ID, sequence number, consensus timestamp | Mirror node                             | Yes      |

## Business Use Cases

| Use case                | NVIDIA side                          | Hedera side                           | VNX value                                            |
| ----------------------- | ------------------------------------ | ------------------------------------- | ---------------------------------------------------- |
| Paid prediction markets | GPU model inference and simulation   | Payment and receipt proof             | Pay only selected/verifiable agents                  |
| Enterprise model audit  | Local private inference              | HCS proof anchoring                   | Prove decision lineage without exposing private data |
| Agent marketplaces      | Fast worker endpoints                | HBAR settlement                       | Metered agent compensation                           |
| Compliance evidence     | Reproducible model/version metadata  | Consensus timestamp and mirror replay | Customer-verifiable audit trail                      |
| Throughput demos        | Firehose task generation and scoring | Sample anchored proof                 | Show compute scale and settlement proof separately   |

## Metrics and Proof Boundaries

The stack should keep performance claims separated:

| Metric type          | Correct interpretation                                                  |
| -------------------- | ----------------------------------------------------------------------- |
| NVIDIA NIM token/sec | Published NVIDIA inference example for a specific model/hardware/config |
| VNX local tasks/sec  | Local deterministic package benchmark, not Hedera network throughput    |
| HBAR payment proof   | Real mainnet transaction proof                                          |
| HCS topic message    | Public consensus-timestamped audit message                              |
| Mirror-node lookup   | Verification API read path, subject to public endpoint limits           |

Do not claim that Hedera executes model inference. Do not claim local benchmark throughput as Hedera TPS. Do not claim NVIDIA verifies payments. The professional architecture is stronger because each layer has a clear job.

## Operator Blueprint

For one bare-metal server:

```text
Ubuntu / Debian / RHEL-compatible Linux
  NVIDIA driver + CUDA toolkit
  Optional: Docker + NVIDIA Container Toolkit
  Optional: Triton Inference Server or NVIDIA NIM container
  Node.js 20+
  hedera-vnx-paid-swarm service
  Environment secrets:
    HEDERA_ACCOUNT_ID
    HEDERA_PRIVATE_KEY
    HEDERA_NETWORK=mainnet
  Logs:
    local structured logs
    receipt JSON
    HCS topic message IDs
    HashScan and mirror-node URLs
```

For production:

- Pin GPU driver/CUDA versions.
- Keep Hedera keys in a secret manager.
- Separate dry-run, testnet, and mainnet environments.
- Add health checks for GPU service, VNX API, Hedera client, and mirror-node reads.
- Publish only hashes and proof metadata, not private model inputs.
- Store full receipts in durable storage.

## Investor / Customer Narrative

VNX is not trying to make a blockchain run AI inference. It uses the right layer for each job. NVIDIA does the expensive intelligence work on hardware designed for it. Hedera records the proof that a paid, deterministic decision happened. VNX is the connective tissue: it makes AI agents compete, pays the selected worker, and leaves behind a receipt that can be checked by an outside party.

That is the commercial wedge: **fast private AI with public proof of payment and decision integrity.**

## Source References

- NVIDIA CUDA Installation Guide for Linux: https://docs.nvidia.com/cuda/cuda-installation-guide-linux/index.html
- NVIDIA Triton Inference Server docs: https://docs.nvidia.com/triton-inference-server/index.html
- NVIDIA NIM microservices and published benchmark example: https://www.nvidia.com/en-us/ai-data-science/products/nim-microservices/
- Hedera Consensus Service overview: https://hedera.com/service/consensus-service/
- Hedera HCS API and mirror-node notes: https://docs.hedera.com/hedera/sdks-and-apis/hedera-consensus-service-api
